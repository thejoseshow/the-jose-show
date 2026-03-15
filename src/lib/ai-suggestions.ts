import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import { BRAND_VOICE } from "./constants";
import type { Platform } from "./types";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export interface PostingTimeRecommendation {
  platform: Platform;
  best_day: string;
  best_hour: number;
  avg_engagement: number;
  sample_size: number;
}

export interface ContentSuggestion {
  idea: string;
  type: string;
  platforms: Platform[];
  reasoning: string;
}

/**
 * Analyze analytics data to find the best posting times per platform.
 */
export async function getBestPostingTimes(): Promise<PostingTimeRecommendation[]> {
  // Get published content with analytics
  const { data: content } = await supabase
    .from("content")
    .select("id, platforms, published_at")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(100);

  if (!content || content.length === 0) return getDefaultTimes();

  const contentIds = content.map((c) => c.id);

  const { data: snapshots } = await supabase
    .from("analytics_snapshots")
    .select("content_id, platform, views, likes, comments, shares")
    .in("content_id", contentIds);

  if (!snapshots || snapshots.length === 0) return getDefaultTimes();

  // Build a map of content_id -> published_at
  const publishedAtMap = new Map<string, string>();
  for (const c of content) {
    if (c.published_at) publishedAtMap.set(c.id, c.published_at);
  }

  // Aggregate engagement by platform + day + hour
  const buckets = new Map<string, { total_engagement: number; count: number; platform: Platform; day: number; hour: number }>();

  for (const snap of snapshots) {
    const publishedAt = publishedAtMap.get(snap.content_id);
    if (!publishedAt) continue;

    const date = new Date(publishedAt);
    const day = date.getUTCDay(); // 0-6
    const hour = date.getUTCHours();
    const key = `${snap.platform}-${day}-${hour}`;
    const engagement = (snap.views || 0) + (snap.likes || 0) * 3 + (snap.comments || 0) * 5 + (snap.shares || 0) * 4;

    const bucket = buckets.get(key) || { total_engagement: 0, count: 0, platform: snap.platform, day, hour };
    bucket.total_engagement += engagement;
    bucket.count++;
    buckets.set(key, bucket);
  }

  // Find best bucket per platform
  const platforms: Platform[] = ["youtube", "facebook", "instagram", "tiktok"];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const results: PostingTimeRecommendation[] = [];

  for (const platform of platforms) {
    let best: { day: number; hour: number; avg: number; count: number } | null = null;

    for (const bucket of buckets.values()) {
      if (bucket.platform !== platform) continue;
      const avg = bucket.total_engagement / bucket.count;
      if (!best || avg > best.avg) {
        best = { day: bucket.day, hour: bucket.hour, avg, count: bucket.count };
      }
    }

    if (best && best.count >= 2) {
      results.push({
        platform,
        best_day: dayNames[best.day],
        best_hour: best.hour,
        avg_engagement: Math.round(best.avg),
        sample_size: best.count,
      });
    }
  }

  return results.length > 0 ? results : getDefaultTimes();
}

/**
 * Ask Claude to suggest content ideas based on recent performance and upcoming events.
 */
export async function getContentSuggestions(): Promise<ContentSuggestion[]> {
  // Get recent published content for context
  const { data: recentContent } = await supabase
    .from("content")
    .select("title, type, platforms, status")
    .order("created_at", { ascending: false })
    .limit(10);

  // Get upcoming events
  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("name, type, start_date, description")
    .gte("start_date", new Date().toISOString())
    .order("start_date", { ascending: true })
    .limit(5);

  const client = getClient();

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a social media strategist for "${BRAND_VOICE.showName}" by ${BRAND_VOICE.name}.

Jose is: ${BRAND_VOICE.bio}

RECENT CONTENT (last 10 pieces):
${(recentContent || []).map((c) => `- ${c.title} (${c.type}, ${c.platforms?.join("/") || "none"}, ${c.status})`).join("\n") || "No recent content"}

UPCOMING EVENTS:
${(upcomingEvents || []).map((e) => `- ${e.name} (${e.type}) on ${new Date(e.start_date).toLocaleDateString()}: ${e.description || "No description"}`).join("\n") || "No upcoming events"}

Suggest 3 content ideas for this week. Consider:
- Content gaps (what hasn't been posted recently)
- Upcoming events to promote
- Trending content types for dance/culture creators
- Mix of platforms

Respond ONLY with a JSON array:
[{"idea": "short description", "type": "video_clip|event_promo|story|reel", "platforms": ["facebook", "instagram"], "reasoning": "why this would perform well"}]`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text || "[]";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    return JSON.parse(jsonMatch[0]) as ContentSuggestion[];
  } catch {
    return [];
  }
}

function getDefaultTimes(): PostingTimeRecommendation[] {
  return [
    { platform: "youtube", best_day: "Wednesday", best_hour: 14, avg_engagement: 0, sample_size: 0 },
    { platform: "facebook", best_day: "Tuesday", best_hour: 11, avg_engagement: 0, sample_size: 0 },
    { platform: "instagram", best_day: "Thursday", best_hour: 18, avg_engagement: 0, sample_size: 0 },
    { platform: "tiktok", best_day: "Friday", best_hour: 19, avg_engagement: 0, sample_size: 0 },
  ];
}
