import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { uploadToYouTube } from "@/lib/youtube";
import { postToFacebook, postToInstagram } from "@/lib/meta";
import { postToTikTok } from "@/lib/tiktok";
import { notifyPublishSuccess } from "@/lib/notifications";
import { publishSchema, validateMediaUrl, sanitizeError, validateBody } from "@/lib/validation";
import type { Platform } from "@/lib/types";

// POST /api/content/[id]/publish - Publish content to selected platforms
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate request body
  const body = await request.json().catch(() => ({}));
  const parsed = validateBody(publishSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error },
      { status: 400 }
    );
  }

  // Atomic status transition: only publish if currently "approved"
  // This prevents double-publish race conditions
  const { data: content, error: lockError } = await supabase
    .from("content")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "approved")
    .select("*")
    .maybeSingle();

  if (lockError) {
    sanitizeError(lockError, "publish:lock");
    return NextResponse.json(
      { success: false, error: "Failed to start publishing" },
      { status: 500 }
    );
  }

  if (!content) {
    return NextResponse.json(
      { success: false, error: "Content not found or not in approved status" },
      { status: 409 }
    );
  }

  // SSRF protection: validate media URLs
  if (content.media_url && !validateMediaUrl(content.media_url)) {
    await supabase.from("content").update({ status: "approved" }).eq("id", id);
    return NextResponse.json(
      { success: false, error: "Invalid media URL" },
      { status: 400 }
    );
  }
  if (content.thumbnail_url && !validateMediaUrl(content.thumbnail_url)) {
    await supabase.from("content").update({ status: "approved" }).eq("id", id);
    return NextResponse.json(
      { success: false, error: "Invalid thumbnail URL" },
      { status: 400 }
    );
  }

  const platforms: Platform[] = parsed.data.platforms || content.platforms;
  if (!platforms?.length) {
    await supabase.from("content").update({ status: "approved" }).eq("id", id);
    return NextResponse.json(
      { success: false, error: "No platforms selected" },
      { status: 400 }
    );
  }

  const results: Record<string, { success: boolean; id?: string; error?: string }> = {};

  for (const platform of platforms) {
    try {
      const logEntry = {
        content_id: id,
        platform,
        status: "pending" as const,
      };
      const { data: log } = await supabase
        .from("publish_log")
        .insert(logEntry)
        .select()
        .single();

      let platformPostId: string | null = null;

      switch (platform) {
        case "youtube": {
          if (!content.media_url) throw new Error("No media URL");
          const videoRes = await fetch(content.media_url);
          const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

          let thumbnailBuffer: Buffer | undefined;
          if (content.thumbnail_url) {
            const thumbRes = await fetch(content.thumbnail_url);
            thumbnailBuffer = Buffer.from(await thumbRes.arrayBuffer());
          }

          platformPostId = await uploadToYouTube({
            title: content.youtube_title || content.title,
            description: content.youtube_description || content.description || "",
            tags: content.youtube_tags || [],
            videoBuffer,
            thumbnailBuffer,
          });

          await supabase
            .from("content")
            .update({ youtube_video_id: platformPostId })
            .eq("id", id);
          break;
        }

        case "facebook": {
          if (!content.media_url) throw new Error("No media URL");
          platformPostId = await postToFacebook({
            videoUrl: content.media_url,
            description: content.facebook_text || content.title,
          });
          await supabase
            .from("content")
            .update({ facebook_post_id: platformPostId })
            .eq("id", id);
          break;
        }

        case "instagram": {
          if (!content.media_url) throw new Error("No media URL");
          platformPostId = await postToInstagram({
            videoUrl: content.media_url,
            caption: content.instagram_caption || content.title,
          });
          await supabase
            .from("content")
            .update({ instagram_media_id: platformPostId })
            .eq("id", id);
          break;
        }

        case "tiktok": {
          if (!content.media_url) throw new Error("No media URL");
          platformPostId = await postToTikTok({
            videoUrl: content.media_url,
            caption: content.tiktok_caption || content.title,
          });
          await supabase
            .from("content")
            .update({ tiktok_publish_id: platformPostId })
            .eq("id", id);
          break;
        }
      }

      // Update publish log
      if (log) {
        await supabase
          .from("publish_log")
          .update({
            status: "success",
            platform_post_id: platformPostId,
            published_at: new Date().toISOString(),
          })
          .eq("id", log.id);
      }

      results[platform] = { success: true, id: platformPostId || undefined };
    } catch (err) {
      const errorMsg = sanitizeError(err, `publish:${platform}`);
      results[platform] = { success: false, error: errorMsg };

      await supabase
        .from("publish_log")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Unknown error",
        })
        .eq("content_id", id)
        .eq("platform", platform)
        .eq("status", "pending");
    }
  }

  // Determine final status
  const anySuccess = Object.values(results).some((r) => r.success);
  const allSuccess = Object.values(results).every((r) => r.success);
  const finalStatus = allSuccess ? "published" : anySuccess ? "published" : "failed";

  await supabase
    .from("content")
    .update({
      status: finalStatus,
      published_at: anySuccess ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (anySuccess) {
    const successPlatforms = Object.entries(results)
      .filter(([, r]) => r.success)
      .map(([p]) => p);
    await notifyPublishSuccess(content.title, successPlatforms).catch(console.error);
  }

  return NextResponse.json({ success: true, data: results });
}
