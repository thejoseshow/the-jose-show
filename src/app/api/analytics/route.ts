import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getVideoAnalytics } from "@/lib/youtube";
import { getFacebookVideoInsights, getInstagramMediaInsights } from "@/lib/meta";
import type { Platform } from "@/lib/types";

// GET /api/analytics - Get analytics overview, per-content stats, or platform health
export async function GET(request: NextRequest) {
  const health = request.nextUrl.searchParams.get("health");

  if (health === "true") {
    const platforms = ["google", "facebook", "tiktok"] as const;
    const data = [];

    for (const platform of platforms) {
      const { data: token } = await supabase
        .from("platform_tokens")
        .select("expires_at, updated_at")
        .eq("platform", platform)
        .single();

      const connected = !!token;
      let daysUntilExpiry: number | null = null;

      if (token?.expires_at) {
        const diff = new Date(token.expires_at).getTime() - Date.now();
        daysUntilExpiry = Math.floor(diff / (1000 * 60 * 60 * 24));
      }

      data.push({
        platform,
        connected,
        expires_at: token?.expires_at || null,
        days_until_expiry: daysUntilExpiry,
      });
    }

    return NextResponse.json({ success: true, data });
  }

  const contentId = request.nextUrl.searchParams.get("content_id");

  if (contentId) {
    // Per-content analytics
    const { data: snapshots } = await supabase
      .from("analytics_snapshots")
      .select("*")
      .eq("content_id", contentId)
      .order("snapshot_date", { ascending: true });

    return NextResponse.json({ success: true, data: snapshots || [] });
  }

  // Aggregate analytics
  const { data: published } = await supabase
    .from("content")
    .select("id, title, platforms, youtube_video_id, facebook_post_id, instagram_media_id, tiktok_publish_id, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(50);

  // Get latest snapshot for each published content
  const analytics = [];
  for (const content of published || []) {
    const { data: latest } = await supabase
      .from("analytics_snapshots")
      .select("*")
      .eq("content_id", content.id)
      .order("snapshot_date", { ascending: false })
      .limit(4); // One per platform max

    const totals = {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    };

    for (const snap of latest || []) {
      totals.views += snap.views;
      totals.likes += snap.likes;
      totals.comments += snap.comments;
      totals.shares += snap.shares;
    }

    analytics.push({
      content_id: content.id,
      title: content.title,
      platforms: content.platforms,
      published_at: content.published_at,
      ...totals,
      snapshots: latest || [],
    });
  }

  // Summary totals
  const summary = analytics.reduce(
    (acc, item) => ({
      total_views: acc.total_views + item.views,
      total_likes: acc.total_likes + item.likes,
      total_comments: acc.total_comments + item.comments,
      total_shares: acc.total_shares + item.shares,
      total_published: acc.total_published + 1,
    }),
    { total_views: 0, total_likes: 0, total_comments: 0, total_shares: 0, total_published: 0 }
  );

  return NextResponse.json({
    success: true,
    data: { summary, content: analytics },
  });
}
