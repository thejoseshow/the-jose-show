import { supabase } from "./supabase";
import { uploadToYouTube } from "./youtube";
import { postToFacebook, postToInstagram } from "./meta";
import { postToTikTok } from "./tiktok";
import { notifyPublishSuccess } from "./notifications";
import { validateMediaUrl, sanitizeError } from "./validation";
import type { Platform } from "./types";

/**
 * Core publish logic: publishes content to the specified platforms.
 * Used by both the publish API route and the publish-scheduled cron.
 */
export async function publishContent(
  contentId: string,
  platforms?: Platform[]
): Promise<{ success: boolean; data: Record<string, { success: boolean; id?: string; error?: string }> }> {
  // Atomic status transition: only publish if currently "approved"
  const { data: content, error: lockError } = await supabase
    .from("content")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", contentId)
    .eq("status", "approved")
    .select("*")
    .maybeSingle();

  if (lockError) {
    sanitizeError(lockError, "publish:lock");
    throw new Error("Failed to start publishing");
  }

  if (!content) {
    throw new Error("Content not found or not in approved status");
  }

  // SSRF protection: validate media URLs
  if (content.media_url && !validateMediaUrl(content.media_url)) {
    await supabase.from("content").update({ status: "approved" }).eq("id", contentId);
    throw new Error("Invalid media URL");
  }
  if (content.thumbnail_url && !validateMediaUrl(content.thumbnail_url)) {
    await supabase.from("content").update({ status: "approved" }).eq("id", contentId);
    throw new Error("Invalid thumbnail URL");
  }

  const targetPlatforms: Platform[] = platforms || content.platforms;
  if (!targetPlatforms?.length) {
    await supabase.from("content").update({ status: "approved" }).eq("id", contentId);
    throw new Error("No platforms selected");
  }

  const results: Record<string, { success: boolean; id?: string; error?: string }> = {};

  for (const platform of targetPlatforms) {
    try {
      const logEntry = {
        content_id: contentId,
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
            .eq("id", contentId);
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
            .eq("id", contentId);
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
            .eq("id", contentId);
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
            .eq("id", contentId);
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
        .eq("content_id", contentId)
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
    .eq("id", contentId);

  if (anySuccess) {
    const successPlatforms = Object.entries(results)
      .filter(([, r]) => r.success)
      .map(([p]) => p);
    await notifyPublishSuccess(content.title, successPlatforms).catch(console.error);
  }

  return { success: true, data: results };
}
