import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getVideoAnalytics } from "@/lib/youtube";
import { getFacebookVideoInsights, getInstagramMediaInsights } from "@/lib/meta";
import { getTikTokVideoInsights } from "@/lib/tiktok";
import { withCronLog } from "@/lib/cron-logger";

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronLog("sync-analytics", async () => {
  const today = new Date().toISOString().split("T")[0];

  // Get all published content
  const { data: published } = await supabase
    .from("content")
    .select("id, youtube_video_id, facebook_post_id, instagram_media_id, tiktok_publish_id")
    .eq("status", "published");

  let synced = 0;
  const errors: string[] = [];

  for (const content of published || []) {
    // YouTube
    if (content.youtube_video_id) {
      try {
        const stats = await getVideoAnalytics(content.youtube_video_id);
        if (stats) {
          await supabase.from("analytics_snapshots").upsert(
            {
              content_id: content.id,
              platform: "youtube",
              views: stats.views,
              likes: stats.likes,
              comments: stats.comments,
              shares: stats.shares,
              watch_time_seconds: stats.durationSeconds ? stats.views * stats.durationSeconds : null,
              reach: 0,
              impressions: 0,
              snapshot_date: today,
            },
            { onConflict: "content_id,platform,snapshot_date" }
          );
          synced++;
        }
      } catch (err) {
        errors.push(`YT ${content.youtube_video_id}: ${(err as Error).message}`);
      }
    }

    // Facebook
    if (content.facebook_post_id) {
      try {
        const stats = await getFacebookVideoInsights(content.facebook_post_id);
        await supabase.from("analytics_snapshots").upsert(
          {
            content_id: content.id,
            platform: "facebook",
            views: stats.views,
            likes: stats.likes,
            comments: stats.comments,
            shares: stats.shares,
            reach: stats.reach,
            impressions: stats.impressions,
            snapshot_date: today,
          },
          { onConflict: "content_id,platform,snapshot_date" }
        );
        synced++;
      } catch (err) {
        errors.push(`FB ${content.facebook_post_id}: ${(err as Error).message}`);
      }
    }

    // Instagram
    if (content.instagram_media_id) {
      try {
        const stats = await getInstagramMediaInsights(content.instagram_media_id);
        await supabase.from("analytics_snapshots").upsert(
          {
            content_id: content.id,
            platform: "instagram",
            views: stats.views,
            likes: stats.likes,
            comments: stats.comments,
            shares: stats.shares,
            reach: stats.reach,
            impressions: stats.impressions,
            snapshot_date: today,
          },
          { onConflict: "content_id,platform,snapshot_date" }
        );
        synced++;
      } catch (err) {
        errors.push(`IG ${content.instagram_media_id}: ${(err as Error).message}`);
      }
    }

    // TikTok
    if (content.tiktok_publish_id) {
      try {
        const stats = await getTikTokVideoInsights(content.tiktok_publish_id);
        if (stats) {
          await supabase.from("analytics_snapshots").upsert(
            {
              content_id: content.id,
              platform: "tiktok",
              views: stats.views,
              likes: stats.likes,
              comments: stats.comments,
              shares: stats.shares,
              reach: 0,
              impressions: 0,
              snapshot_date: today,
            },
            { onConflict: "content_id,platform,snapshot_date" }
          );
          synced++;
        }
      } catch (err) {
        errors.push(`TT ${content.tiktok_publish_id}: ${(err as Error).message}`);
      }
    }
  }

  return {
    synced,
    total_content: published?.length || 0,
    errors: errors.length > 0 ? errors : undefined,
  };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
