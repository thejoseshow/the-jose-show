import { supabase } from "./supabase";
import { getAppSetting } from "./settings";
import type { Platform } from "./types";

interface PostTimeSlot {
  platform: Platform;
  dayOfWeek: number; // 0=Sun..6=Sat
  hour: number;
  avgEngagement: number;
  sampleSize: number;
}

interface PreferredTimes {
  [platform: string]: { hour: number; minute: number };
}

/**
 * Analyze last 30 days of published content + analytics to find
 * the best posting times per platform.
 */
export async function getOptimalPostingTimes(): Promise<PostTimeSlot[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get published content with analytics
  const { data: content } = await supabase
    .from("content")
    .select("id, platforms, published_at")
    .eq("status", "published")
    .not("published_at", "is", null)
    .gte("published_at", thirtyDaysAgo.toISOString());

  if (!content || content.length === 0) {
    return getFallbackTimes();
  }

  const contentIds = content.map((c) => c.id);

  const { data: snapshots } = await supabase
    .from("analytics_snapshots")
    .select("content_id, platform, views, likes, comments, shares")
    .in("content_id", contentIds);

  if (!snapshots || snapshots.length === 0) {
    return getFallbackTimes();
  }

  // Build engagement map: platform+dayOfWeek+hour → engagement values
  const buckets: Record<string, { totalEngagement: number; count: number }> = {};

  for (const snap of snapshots) {
    const contentItem = content.find((c) => c.id === snap.content_id);
    if (!contentItem?.published_at) continue;

    const publishedDate = new Date(contentItem.published_at);
    const dayOfWeek = publishedDate.getUTCDay();
    const hour = publishedDate.getUTCHours();
    const views = snap.views || 1;
    const engagement = ((snap.likes + snap.comments + snap.shares) / views) * 100;

    const key = `${snap.platform}:${dayOfWeek}:${hour}`;
    if (!buckets[key]) buckets[key] = { totalEngagement: 0, count: 0 };
    buckets[key].totalEngagement += engagement;
    buckets[key].count += 1;
  }

  // Find best slot per platform
  const platforms: Platform[] = ["youtube", "facebook", "instagram", "tiktok"];
  const results: PostTimeSlot[] = [];

  for (const platform of platforms) {
    let bestSlot: PostTimeSlot | null = null;

    for (const [key, bucket] of Object.entries(buckets)) {
      const [p, day, hr] = key.split(":");
      if (p !== platform) continue;

      const avgEng = bucket.totalEngagement / bucket.count;
      if (!bestSlot || avgEng > bestSlot.avgEngagement) {
        bestSlot = {
          platform,
          dayOfWeek: parseInt(day),
          hour: parseInt(hr),
          avgEngagement: Math.round(avgEng * 100) / 100,
          sampleSize: bucket.count,
        };
      }
    }

    if (bestSlot && bestSlot.sampleSize >= 5) {
      results.push(bestSlot);
    }
  }

  // Fill missing platforms with fallbacks
  if (results.length < platforms.length) {
    const fallbacks = await getFallbackTimes();
    for (const fb of fallbacks) {
      if (!results.find((r) => r.platform === fb.platform)) {
        results.push(fb);
      }
    }
  }

  return results;
}

/**
 * Find the next optimal time slot for scheduling content.
 * Returns a Date at least 2 hours in the future with no scheduling collision.
 */
export async function getNextOptimalSlot(
  platforms: Platform[]
): Promise<Date> {
  const optimalTimes = await getOptimalPostingTimes();
  const now = new Date();
  const minTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours out

  // Get existing scheduled content to avoid collisions
  const { data: scheduled } = await supabase
    .from("content")
    .select("scheduled_at")
    .eq("status", "approved")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", now.toISOString());

  const scheduledTimes = new Set(
    (scheduled || []).map((s) => {
      const d = new Date(s.scheduled_at);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
    })
  );

  // Find the best time for the primary platform
  const primaryPlatform = platforms[0] || "instagram";
  const optimal = optimalTimes.find((t) => t.platform === primaryPlatform);
  const targetHour = optimal?.hour ?? 14;

  // Try the next 7 days
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const candidate = new Date(minTime);
    candidate.setDate(candidate.getDate() + dayOffset);
    candidate.setUTCHours(targetHour, 0, 0, 0);

    if (candidate <= minTime) continue;

    const key = `${candidate.getFullYear()}-${candidate.getMonth()}-${candidate.getDate()}-${candidate.getHours()}`;
    if (!scheduledTimes.has(key)) {
      return candidate;
    }
  }

  // Fallback: just schedule 3 hours from now
  return new Date(now.getTime() + 3 * 60 * 60 * 1000);
}

async function getFallbackTimes(): Promise<PostTimeSlot[]> {
  const preferred = await getAppSetting<PreferredTimes>("preferred_post_times");
  const defaults: PreferredTimes = {
    youtube: { hour: 14, minute: 0 },
    facebook: { hour: 11, minute: 0 },
    instagram: { hour: 18, minute: 0 },
    tiktok: { hour: 19, minute: 0 },
  };
  const times = preferred || defaults;

  return (Object.entries(times) as [Platform, { hour: number; minute: number }][]).map(
    ([platform, { hour }]) => ({
      platform,
      dayOfWeek: 3, // Wednesday default
      hour,
      avgEngagement: 0,
      sampleSize: 0,
    })
  );
}
