import { supabase } from "./supabase";
import { getAppSetting, setAppSetting } from "./settings";

interface TopContent {
  title: string;
  platforms: string[];
  youtube_title: string | null;
  youtube_tags: string[];
  facebook_text: string | null;
  instagram_caption: string | null;
  tiktok_caption: string | null;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  engagement_rate: number;
}

/**
 * Query top-performing content by engagement rate.
 * Joins content with analytics_snapshots, aggregates across platforms,
 * filters out content with < 50 views, ranks by engagement rate.
 */
export async function getTopPerformingContent(limit = 5): Promise<TopContent[]> {
  // Fetch published content with analytics
  const { data: content } = await supabase
    .from("content")
    .select("id, title, platforms, youtube_title, youtube_tags, facebook_text, instagram_caption, tiktok_caption")
    .eq("status", "published")
    .not("published_at", "is", null);

  if (!content || content.length === 0) return [];

  const contentIds = content.map((c) => c.id);

  // Get latest analytics for each content piece
  const { data: snapshots } = await supabase
    .from("analytics_snapshots")
    .select("content_id, views, likes, comments, shares")
    .in("content_id", contentIds);

  if (!snapshots || snapshots.length === 0) return [];

  // Aggregate metrics per content_id
  const metricsMap = new Map<string, { views: number; likes: number; comments: number; shares: number }>();
  for (const snap of snapshots) {
    const existing = metricsMap.get(snap.content_id) || { views: 0, likes: 0, comments: 0, shares: 0 };
    existing.views += snap.views || 0;
    existing.likes += snap.likes || 0;
    existing.comments += snap.comments || 0;
    existing.shares += snap.shares || 0;
    metricsMap.set(snap.content_id, existing);
  }

  // Build ranked list
  const ranked: TopContent[] = [];
  for (const c of content) {
    const metrics = metricsMap.get(c.id);
    if (!metrics || metrics.views < 50) continue;

    const engagementRate = ((metrics.likes + metrics.comments + metrics.shares) / metrics.views) * 100;
    ranked.push({
      title: c.title,
      platforms: c.platforms || [],
      youtube_title: c.youtube_title,
      youtube_tags: c.youtube_tags || [],
      facebook_text: c.facebook_text,
      instagram_caption: c.instagram_caption,
      tiktok_caption: c.tiktok_caption,
      total_views: metrics.views,
      total_likes: metrics.likes,
      total_comments: metrics.comments,
      total_shares: metrics.shares,
      engagement_rate: Math.round(engagementRate * 100) / 100,
    });
  }

  ranked.sort((a, b) => b.engagement_rate - a.engagement_rate);
  return ranked.slice(0, limit);
}

/**
 * Format top performers into a prompt block for Claude.
 */
export function buildLearningContext(topContent: TopContent[]): string {
  if (topContent.length === 0) return "";

  const examples = topContent.map((c, i) => {
    const lines = [`Example ${i + 1}: "${c.title}" (${c.engagement_rate}% engagement, ${c.total_views} views)`];
    if (c.youtube_title) lines.push(`  YouTube title: "${c.youtube_title}"`);
    if (c.instagram_caption) lines.push(`  Instagram: "${c.instagram_caption.slice(0, 120)}..."`);
    if (c.tiktok_caption) lines.push(`  TikTok: "${c.tiktok_caption}"`);
    if (c.youtube_tags.length > 0) lines.push(`  Tags: ${c.youtube_tags.slice(0, 8).join(", ")}`);
    return lines.join("\n");
  });

  return `TOP PERFORMING CONTENT (use these as style inspiration — these titles and captions drove the highest engagement):
${examples.join("\n\n")}

Study what made these successful and apply similar patterns to the new content below.`;
}

/**
 * Get cached learning context from app_settings, or build fresh if missing.
 */
export async function getLearningContext(): Promise<string> {
  const cached = await getAppSetting<string>("copy_learning_context");
  if (cached) return cached;

  // Build fresh if no cache exists
  const topContent = await getTopPerformingContent();
  if (topContent.length === 0) return "";

  const context = buildLearningContext(topContent);
  await setAppSetting("copy_learning_context", context);
  return context;
}

/**
 * Rebuild and cache the learning context from latest analytics.
 * Called by the weekly-digest cron to keep examples fresh.
 */
export async function refreshLearningContext(): Promise<string> {
  const topContent = await getTopPerformingContent();
  const context = buildLearningContext(topContent);
  await setAppSetting("copy_learning_context", context);
  return context;
}
