import { supabase } from "./supabase";
import { uploadToYouTube } from "./youtube";
import { postToFacebook, postToInstagram, postPhotoToFacebook, postPhotoToInstagram } from "./meta";
import { postToTikTok } from "./tiktok";
import { notifyPublishSuccess, notifyPublishPartialFailure } from "./notifications";
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
  // Atomic status transition: accept "approved" or "partially_published" (for retry)
  // Try approved first, then partially_published
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let content: any = null;

  for (const fromStatus of ["approved", "partially_published"] as const) {
    const { data, error: lockError } = await supabase
      .from("content")
      .update({ status: "publishing", updated_at: new Date().toISOString() })
      .eq("id", contentId)
      .eq("status", fromStatus)
      .select("*")
      .maybeSingle();

    if (lockError) {
      sanitizeError(lockError, "publish:lock");
      throw new Error("Failed to start publishing");
    }
    if (data) {
      content = data;
      break;
    }
  }

  if (!content) {
    throw new Error("Content not found or not in publishable status");
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

  const results: Record<string, { success: boolean; id?: string; error?: string; skipped?: boolean }> = {};

  // Map of platform → existing post ID field
  const platformPostIdFields: Record<Platform, string> = {
    youtube: "youtube_video_id",
    facebook: "facebook_post_id",
    instagram: "instagram_media_id",
    tiktok: "tiktok_publish_id",
  };

  // Pre-check: skip TikTok if no token exists (avoid crashing the whole publish)
  const { data: tiktokToken } = await supabase
    .from("platform_tokens")
    .select("id")
    .eq("platform", "tiktok")
    .maybeSingle();

  for (const platform of targetPlatforms) {
    // Skip platforms that already succeeded (have a post ID)
    const existingPostId = content[platformPostIdFields[platform]];
    if (existingPostId) {
      results[platform] = { success: true, id: existingPostId as string, skipped: true };
      continue;
    }

    // Skip TikTok if not connected
    if (platform === "tiktok" && !tiktokToken) {
      results[platform] = { success: false, error: "TikTok not connected", skipped: true };
      continue;
    }

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

      const isPhotoPost = content.type === "photo_post";

      switch (platform) {
        case "youtube": {
          if (isPhotoPost) throw new Error("YouTube does not support photo posts");
          if (!content.media_url) throw new Error("No media URL");
          const videoRes = await fetch(content.media_url);
          const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

          let thumbnailBuffer: Buffer | undefined;
          if (content.thumbnail_url) {
            const thumbRes = await fetch(content.thumbnail_url);
            thumbnailBuffer = Buffer.from(await thumbRes.arrayBuffer());
          }

          // Safety-net: ensure #Shorts tag for short clips (<= 60s)
          let ytTags: string[] = content.youtube_tags || [];
          if (content.clip_id) {
            const { data: clip } = await supabase
              .from("clips")
              .select("duration_seconds")
              .eq("id", content.clip_id)
              .single();

            if (clip?.duration_seconds && clip.duration_seconds <= 60) {
              if (!ytTags.some((t: string) => t.toLowerCase() === "#shorts")) {
                ytTags = ["#Shorts", ...ytTags];
              }
            }
          }

          platformPostId = await uploadToYouTube({
            title: content.youtube_title || content.title,
            description: content.youtube_description || content.description || "",
            tags: ytTags,
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
          if (isPhotoPost) {
            platformPostId = await postPhotoToFacebook({
              imageUrl: content.media_url,
              message: content.facebook_text || content.title,
            });
          } else {
            platformPostId = await postToFacebook({
              videoUrl: content.media_url,
              description: content.facebook_text || content.title,
            });
          }
          await supabase
            .from("content")
            .update({ facebook_post_id: platformPostId })
            .eq("id", contentId);
          break;
        }

        case "instagram": {
          if (!content.media_url) throw new Error("No media URL");
          if (isPhotoPost) {
            platformPostId = await postPhotoToInstagram({
              imageUrl: content.media_url,
              caption: content.instagram_caption || content.title,
            });
          } else {
            platformPostId = await postToInstagram({
              videoUrl: content.media_url,
              caption: content.instagram_caption || content.title,
            });
          }
          await supabase
            .from("content")
            .update({ instagram_media_id: platformPostId })
            .eq("id", contentId);
          break;
        }

        case "tiktok": {
          if (isPhotoPost) throw new Error("TikTok photo publishing not yet supported");
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

  // Determine final status — only count platforms that were actually attempted (not skipped)
  const attempted = Object.entries(results).filter(([, r]) => !r.skipped);
  const anyNewSuccess = attempted.some(([, r]) => r.success);
  const anyFailure = attempted.some(([, r]) => !r.success);
  // "published" if all attempted platforms succeeded (skip disconnected platforms)
  const allAttemptedSuccess = attempted.length > 0 && attempted.every(([, r]) => r.success);
  const finalStatus = allAttemptedSuccess ? "published" : anyNewSuccess ? "partially_published" : "approved";

  await supabase
    .from("content")
    .update({
      status: finalStatus,
      published_at: anyNewSuccess ? new Date().toISOString() : (content.published_at as string | null),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contentId);

  if (allAttemptedSuccess) {
    const successPlatforms = Object.entries(results)
      .filter(([, r]) => r.success)
      .map(([p]) => p);
    await notifyPublishSuccess(content.title as string, successPlatforms).catch(console.error);
  } else if (anyNewSuccess && anyFailure) {
    const failedPlatforms = attempted
      .filter(([, r]) => !r.success)
      .map(([p]) => p);
    await notifyPublishPartialFailure(content.title as string, failedPlatforms).catch(console.error);
  }

  return { success: true, data: results };
}
