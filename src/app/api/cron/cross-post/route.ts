import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { withCronLog } from "@/lib/cron-logger";
import type { Platform } from "@/lib/types";

const ALL_PLATFORMS: Platform[] = ["youtube", "facebook", "instagram", "tiktok"];
const ENGAGEMENT_THRESHOLD = 5; // % engagement rate to trigger cross-post
const MIN_VIEWS = 100; // Minimum views before evaluating

export const maxDuration = 300;

// Check recently published content for high engagement and suggest cross-posts
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronLog("cross-post", async () => {
      // Find content published in the last 3 days
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

      const { data: publishedContent } = await supabase
        .from("content")
        .select("id, title, platforms, media_url, type, youtube_title, youtube_description, youtube_tags, facebook_text, instagram_caption, tiktok_caption")
        .eq("status", "published")
        .gte("published_at", threeDaysAgo)
        .not("media_url", "is", null);

      if (!publishedContent?.length) return { evaluated: 0, cross_posted: 0 };

      let crossPosted = 0;

      for (const content of publishedContent) {
        // Get latest analytics for this content
        const { data: analytics } = await supabase
          .from("analytics_snapshots")
          .select("platform, views, likes, comments, shares")
          .eq("content_id", content.id)
          .order("snapshot_date", { ascending: false });

        if (!analytics?.length) continue;

        // Check if any platform has high engagement
        const highPerformers = analytics.filter((a) => {
          if (a.views < MIN_VIEWS) return false;
          const engagementRate = ((a.likes + a.comments + a.shares) / a.views) * 100;
          return engagementRate >= ENGAGEMENT_THRESHOLD;
        });

        if (highPerformers.length === 0) continue;

        // Find platforms content hasn't been posted to yet
        const currentPlatforms = content.platforms as Platform[];
        const videoPlatforms = content.type === "photo_post"
          ? (["facebook", "instagram"] as Platform[])
          : ALL_PLATFORMS;
        const missingPlatforms = videoPlatforms.filter((p) => !currentPlatforms.includes(p));

        if (missingPlatforms.length === 0) continue;

        // Create a new content entry for cross-posting (status=review so Jose can approve)
        await supabase.from("content").insert({
          type: content.type,
          status: "review",
          title: `[Cross-post] ${content.title}`,
          description: `Auto-suggested cross-post — original performed well (${highPerformers.map((h) => `${h.platform}: ${h.views} views`).join(", ")})`,
          youtube_title: content.youtube_title,
          youtube_description: content.youtube_description,
          youtube_tags: content.youtube_tags,
          facebook_text: content.facebook_text,
          instagram_caption: content.instagram_caption,
          tiktok_caption: content.tiktok_caption,
          media_url: content.media_url,
          platforms: missingPlatforms,
        });

        crossPosted++;
      }

      return { evaluated: publishedContent.length, cross_posted: crossPosted };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
