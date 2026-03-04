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

  // Aggregate analytics with optional date range
  const range = request.nextUrl.searchParams.get("range") || "all";

  const { data: published } = await supabase
    .from("content")
    .select("id, title, platforms, youtube_video_id, facebook_post_id, instagram_media_id, tiktok_publish_id, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(50);

  const publishedIds = (published || []).map((c) => c.id);

  if (!publishedIds.length) {
    return NextResponse.json({
      success: true,
      data: {
        summary: { total_views: 0, total_likes: 0, total_comments: 0, total_shares: 0, total_published: 0 },
        content: [],
        trends: null,
      },
    });
  }

  // Determine date boundaries for current and previous periods
  const now = new Date();
  let rangeStart: string | null = null;
  let prevRangeStart: string | null = null;
  let prevRangeEnd: string | null = null;

  if (range === "7d") {
    rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    prevRangeStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    prevRangeEnd = rangeStart;
  } else if (range === "30d") {
    rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    prevRangeStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    prevRangeEnd = rangeStart;
  }

  // Batch query: get latest snapshots for all published content
  let snapshotQuery = supabase
    .from("analytics_snapshots")
    .select("*")
    .in("content_id", publishedIds)
    .order("snapshot_date", { ascending: false });

  if (rangeStart) {
    snapshotQuery = snapshotQuery.gte("snapshot_date", rangeStart);
  }

  const { data: allSnapshots } = await snapshotQuery;

  // Group snapshots by content_id, keeping only latest per platform
  const snapshotsByContent = new Map<string, typeof allSnapshots>();
  for (const snap of allSnapshots || []) {
    const existing = snapshotsByContent.get(snap.content_id) || [];
    existing.push(snap);
    snapshotsByContent.set(snap.content_id, existing);
  }

  const analytics = [];
  for (const content of published || []) {
    const contentSnaps = snapshotsByContent.get(content.id) || [];

    // Dedupe: keep only latest snapshot per platform
    const latestByPlatform = new Map<string, (typeof contentSnaps)[0]>();
    for (const snap of contentSnaps) {
      if (!latestByPlatform.has(snap.platform)) {
        latestByPlatform.set(snap.platform, snap);
      }
    }
    const latest = Array.from(latestByPlatform.values());

    const totals = { views: 0, likes: 0, comments: 0, shares: 0 };
    for (const snap of latest) {
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
      snapshots: latest,
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

  // Calculate trends by comparing with previous period
  let trends: Record<string, number> | null = null;

  if (prevRangeStart && prevRangeEnd) {
    const { data: prevSnapshots } = await supabase
      .from("analytics_snapshots")
      .select("*")
      .in("content_id", publishedIds)
      .gte("snapshot_date", prevRangeStart)
      .lt("snapshot_date", prevRangeEnd);

    // Dedupe previous period: latest per content+platform
    const prevByKey = new Map<string, (typeof prevSnapshots extends (infer T)[] | null ? T : never)>();
    for (const snap of prevSnapshots || []) {
      const key = `${snap.content_id}:${snap.platform}`;
      const existing = prevByKey.get(key);
      if (!existing || snap.snapshot_date > existing.snapshot_date) {
        prevByKey.set(key, snap);
      }
    }

    const prevTotals = { views: 0, likes: 0, comments: 0, shares: 0 };
    for (const snap of prevByKey.values()) {
      prevTotals.views += snap.views;
      prevTotals.likes += snap.likes;
      prevTotals.comments += snap.comments;
      prevTotals.shares += snap.shares;
    }

    function pctChange(current: number, previous: number): number {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    }

    trends = {
      views_trend: pctChange(summary.total_views, prevTotals.views),
      likes_trend: pctChange(summary.total_likes, prevTotals.likes),
      comments_trend: pctChange(summary.total_comments, prevTotals.comments),
      shares_trend: pctChange(summary.total_shares, prevTotals.shares),
    };
  }

  return NextResponse.json({
    success: true,
    data: { summary, content: analytics, trends },
  });
}
