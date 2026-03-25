import { supabase } from "./supabase";
import { uploadToYouTube } from "./youtube";
import { postToFacebook, postToInstagram, postPhotoToFacebook, postPhotoToInstagram } from "./meta";
import { postToTikTok } from "./tiktok";
import { notifyPublishSuccess, notifyPublishPartialFailure } from "./notifications";
import { validateMediaUrl, sanitizeError } from "./validation";
import { PLATFORM_LIMITS } from "./constants";
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

  // Wrap the entire publish pipeline in try/catch so we ALWAYS resolve the
  // final status even when an unexpected error occurs.  Without this, an
  // unhandled throw leaves the row stuck in "publishing" forever.
  try {
    return await _doPublish(contentId, content, platforms);
  } catch (outerErr) {
    // Safety net: revert to "approved" so the item can be retried later
    console.error(`publishContent unexpected error for ${contentId}:`, outerErr);
    await supabase
      .from("content")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", contentId);
    throw outerErr;
  }
}

/**
 * Internal implementation — separated so the outer function can guarantee
 * the status is always resolved (never left as "publishing").
 */
async function _doPublish(
  contentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any,
  platforms?: Platform[]
): Promise<{ success: boolean; data: Record<string, { success: boolean; id?: string; error?: string }> }> {
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

  // Fetch clip duration for platform limit checks
  let clipDuration: number | null = null;
  if (content.clip_id) {
    const { data: clipData } = await supabase
      .from("clips")
      .select("duration_seconds")
      .eq("id", content.clip_id)
      .single();
    clipDuration = clipData?.duration_seconds ?? null;
  }

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

    // Skip platforms where clip exceeds max duration
    const platformLimit = PLATFORM_LIMITS[platform];
    const maxDuration = "maxDuration" in platformLimit ? platformLimit.maxDuration : null;
    if (clipDuration != null && maxDuration != null && clipDuration > maxDuration) {
      results[platform] = {
        success: false,
        error: `Video duration (${Math.round(clipDuration)}s) exceeds ${platform} max (${maxDuration}s)`,
        skipped: true,
      };
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
          if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`);
          const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

          let thumbnailBuffer: Buffer | undefined;
          if (content.thumbnail_url) {
            try {
              const thumbRes = await fetch(content.thumbnail_url);
              if (thumbRes.ok) {
                thumbnailBuffer = Buffer.from(await thumbRes.arrayBuffer());
              }
            } catch {
              console.error("Thumbnail fetch failed (non-critical)");
            }
          }

          // Fetch SRT captions for long-form content (short-form has burned-in captions)
          let captionContent: string | undefined;
          if (content.clip_id && clipDuration != null && clipDuration > 60) {
            try {
              const { data: captionData } = await supabase
                .from("clips")
                .select("srt_captions")
                .eq("id", content.clip_id)
                .single();
              if (captionData?.srt_captions) {
                captionContent = captionData.srt_captions;
              }
            } catch {
              console.error("SRT caption fetch failed (non-critical)");
            }
          }

          // Safety-net: ensure #Shorts tag for short clips (<= 60s)
          let ytTags: string[] = content.youtube_tags || [];
          if (clipDuration != null && clipDuration <= 60) {
            if (!ytTags.some((t: string) => t.toLowerCase() === "#shorts")) {
              ytTags = ["#Shorts", ...ytTags];
            }
          }

          platformPostId = await uploadToYouTube({
            title: content.youtube_title || content.title,
            description: content.youtube_description || content.description || "",
            tags: ytTags,
            videoBuffer,
            thumbnailBuffer,
            captionContent,
            language: content.language || "en",
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
              title: content.youtube_title || content.title,
              thumbnailUrl: content.thumbnail_url || undefined,
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

  // Also count previously-succeeded platforms (skipped because they already have a post ID)
  const previouslySucceeded = Object.entries(results).filter(
    ([, r]) => r.skipped && r.success
  );

  // "published" if all attempted platforms succeeded OR if there were no platforms
  // to attempt (all skipped) and at least some previously succeeded
  const allAttemptedSuccess = attempted.length > 0
    ? attempted.every(([, r]) => r.success)
    : previouslySucceeded.length > 0;

  // If every attempted platform failed and nothing previously succeeded, revert to "approved"
  // so the cron can pick it up again. Otherwise mark as "published" or "partially_published".
  let finalStatus: string;
  if (allAttemptedSuccess) {
    finalStatus = "published";
  } else if (anyNewSuccess || previouslySucceeded.length > 0) {
    // At least one platform has been published to — mark published
    // (failed platforms are logged and can be retried manually)
    finalStatus = "published";
  } else {
    // Everything failed, nothing previously succeeded — revert so it can be retried
    finalStatus = "approved";
  }

  await supabase
    .from("content")
    .update({
      status: finalStatus,
      published_at: (anyNewSuccess || previouslySucceeded.length > 0)
        ? new Date().toISOString()
        : (content.published_at as string | null),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contentId);

  if (finalStatus === "published") {
    const successPlatforms = Object.entries(results)
      .filter(([, r]) => r.success)
      .map(([p]) => p);
    await notifyPublishSuccess(content.title as string, successPlatforms).catch(console.error);
  }
  if (anyFailure) {
    const failedPlatforms = attempted
      .filter(([, r]) => !r.success)
      .map(([p]) => p);
    if (failedPlatforms.length > 0) {
      await notifyPublishPartialFailure(content.title as string, failedPlatforms).catch(console.error);
    }
  }

  return { success: true, data: results };
}
