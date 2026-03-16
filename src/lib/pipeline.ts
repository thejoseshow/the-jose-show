import { supabase } from "./supabase";
import { downloadFile, getFileMetadata } from "./google-drive";
import { transcribeVideo, generateSRT, getSegmentsInRange } from "./whisper";
import { extractClip, getVideoDuration, extractThumbnail, extractFrames, convertHeicToJpeg } from "./ffmpeg";
import { analyzeTranscriptForClips, analyzeVideoFrames, generatePlatformCopy, generateThumbnailPrompt, analyzePhotoContent } from "./claude";
import { generateThumbnail } from "./thumbnails";
import { uploadClip, uploadThumbnail } from "./storage";
import { notifyContentReady, notifyPipelineError } from "./notifications";
import { withRetry } from "./retry";
import { MAX_VIDEO_SIZE_BYTES, MAX_PHOTO_SIZE_BYTES } from "./constants";
import { getAppSetting } from "./settings";
import type { Video, Platform } from "./types";

const MAX_RETRIES = 3;

/**
 * Full pipeline: process a single video from Google Drive.
 * Stages: download → transcribe → analyze → clip → caption → generate copy → thumbnail → review
 */
export async function processVideo(video: Video): Promise<void> {
  const videoId = video.id;
  let isSpanish = false;

  try {
    // ----- Stage 1: Download (if not already downloaded) -----
    let videoBuffer: Buffer;
    let storagePath = video.storage_path;

    if (video.status === "new" || video.status === "downloading") {
      await updateStatus(videoId, "downloading");

      // Check file size
      const metadata = await getFileMetadata(video.google_drive_file_id);
      const fileSize = parseInt(metadata.size as string, 10);
      if (fileSize > MAX_VIDEO_SIZE_BYTES) {
        throw new Error(`File too large: ${(fileSize / 1024 / 1024).toFixed(0)}MB exceeds ${MAX_VIDEO_SIZE_BYTES / 1024 / 1024}MB limit`);
      }

      videoBuffer = await withRetry(() => downloadFile(video.google_drive_file_id), { label: "Drive download" });
      storagePath = `raw/${videoId}/${video.filename}`;

      // Skip raw upload to Supabase Storage (free tier has 50MB limit).
      // The buffer stays in memory for processing; only processed clips get uploaded.

      // Get duration
      const duration = await getVideoDuration(videoBuffer, video.filename).catch(() => null);

      await supabase
        .from("videos")
        .update({
          storage_path: storagePath,
          duration_seconds: duration,
          status: "downloaded",
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId);

      // Update local object to match DB
      video = { ...video, storage_path: storagePath, duration_seconds: duration, status: "downloaded" };
    } else {
      // Already downloaded in a previous run - re-download from Drive
      videoBuffer = await withRetry(() => downloadFile(video.google_drive_file_id), { label: "Drive re-download" });
    }

    // ----- Stage 2: Transcribe (if not already transcribed) -----
    if (!video.transcript) {
      await updateStatus(videoId, "transcribing");

      const transcription = await withRetry(() => transcribeVideo(videoBuffer, video.filename), { label: "Whisper transcription" });

      await supabase
        .from("videos")
        .update({
          transcript: transcription.text,
          transcript_segments: transcription.segments,
          duration_seconds: transcription.duration || video.duration_seconds,
          language: transcription.language,
          status: "transcribed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId);

      // Reload video data
      video = {
        ...video,
        transcript: transcription.text,
        transcript_segments: transcription.segments,
        duration_seconds: transcription.duration || video.duration_seconds,
        status: "transcribed",
      };
      // Track language detection for bilingual content
      isSpanish = transcription.isSpanish;
    }

    // ----- Stage 3: Analyze + Clip + Generate -----
    await updateStatus(videoId, "clipping");

    const segments = video.transcript_segments || [];
    const duration = video.duration_seconds || 0;

    // Extract frames for visual analysis
    let visualContext = "";
    try {
      const frames = await extractFrames(videoBuffer, video.filename, duration, 4);
      if (frames.length > 0) {
        visualContext = await withRetry(() => analyzeVideoFrames(frames, video.transcript || ""), { label: "Visual analysis" });
      }
    } catch (err) {
      console.error("Visual analysis failed (non-critical):", err);
    }

    // Ask Claude to recommend clips (now with visual context)
    let recommendations = await withRetry(() => analyzeTranscriptForClips(
      video.transcript || "",
      segments,
      duration,
      visualContext
    ), { label: "Claude clip analysis" });

    // For short videos (<90s), limit to 1 clip to stay within Vercel timeout
    if (duration < 90 && recommendations.length > 1) {
      recommendations = [recommendations.sort((a, b) => b.score - a.score)[0]];
    }

    // Check if auto-approve is enabled
    const autoApprove = await getAppSetting<boolean>("auto_approve_pipeline");
    const contentStatus = autoApprove === true ? "approved" : "review";

    if (recommendations.length === 0) {
      // If no clips recommended, create a single content item from the full video
      await createFullVideoContent(video, videoBuffer, isSpanish, contentStatus, visualContext);
      await updateStatus(videoId, "clipped");
      return;
    }

    let contentCreated = 0;

    for (const rec of recommendations) {
      try {
        // Get clip-specific captions
        const clipSegments = getSegmentsInRange(segments, rec.start_time, rec.end_time);
        const clipSRT = generateSRT(clipSegments);
        const clipTranscript = clipSegments.map((s) => s.text).join(" ");

        // Determine if this is a YouTube full-length or short-form clip
        const clipDuration = rec.end_time - rec.start_time;
        const isYouTube = rec.platforms.includes("youtube") && clipDuration > 60;

        // Extract clip with FFmpeg
        const clipResult = await extractClip(videoBuffer, video.filename, {
          startTime: rec.start_time,
          endTime: rec.end_time,
          aspectRatio: isYouTube ? "16:9" : "9:16",
          srtContent: isYouTube ? undefined : clipSRT, // Burn captions for short-form only
          maxDuration: isYouTube ? 480 : 60, // 8min YouTube, 60s others
        });

        // Upload clip to storage
        const clipStoragePath = `clips/${videoId}/${Date.now()}_${rec.suggested_title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40)}.mp4`;
        const clipUrl = await withRetry(() => uploadClip(clipStoragePath, clipResult.buffer, "video/mp4"), { label: "clip upload" });

        // Save clip record
        const { data: clipRecord } = await supabase
          .from("clips")
          .insert({
            video_id: videoId,
            storage_path: clipStoragePath,
            start_time: rec.start_time,
            end_time: rec.end_time,
            duration_seconds: clipResult.duration,
            aspect_ratio: clipResult.aspectRatio,
            srt_captions: clipSRT,
            ai_score: rec.score,
            ai_reasoning: rec.reasoning,
          })
          .select()
          .single();

        // Generate platform copy (bilingual if video is in Spanish, with visual context)
        const copy = await withRetry(() => generatePlatformCopy(
          clipTranscript,
          rec.suggested_title,
          rec.platforms,
          isSpanish,
          visualContext
        ), { label: "Claude copy generation" });

        // Generate thumbnail for YouTube clips
        let thumbnailUrl: string | null = null;
        if (rec.platforms.includes("youtube")) {
          try {
            const thumbPrompt = await generateThumbnailPrompt(
              rec.suggested_title,
              clipTranscript
            );
            const thumbBuffer = await generateThumbnail(thumbPrompt);
            const thumbPath = `thumbnails/${videoId}/${Date.now()}.png`;
            thumbnailUrl = await uploadThumbnail(thumbPath, thumbBuffer);
          } catch (err) {
            // Thumbnail gen failure is non-critical - fall back to video frame
            console.error("Thumbnail generation failed:", err);
            try {
              const frameBuffer = await extractThumbnail(
                videoBuffer,
                video.filename,
                rec.start_time + (clipResult.duration / 2)
              );
              const thumbPath = `thumbnails/${videoId}/${Date.now()}_frame.png`;
              thumbnailUrl = await uploadThumbnail(thumbPath, frameBuffer);
            } catch {
              // Skip thumbnail entirely
            }
          }
        }

        // Create content record
        await supabase.from("content").insert({
          clip_id: clipRecord?.id || null,
          type: "video_clip",
          status: contentStatus,
          title: rec.suggested_title,
          description: rec.reasoning,
          youtube_title: copy.youtube_title,
          youtube_description: copy.youtube_description,
          youtube_tags: copy.youtube_tags,
          facebook_text: copy.facebook_text,
          instagram_caption: copy.instagram_caption,
          tiktok_caption: copy.tiktok_caption,
          media_url: clipUrl,
          thumbnail_url: thumbnailUrl,
          platforms: rec.platforms,
        });

        contentCreated++;
      } catch (clipErr) {
        console.error(`Failed to process clip "${rec.suggested_title}":`, clipErr);
        // Continue with other clips
      }
    }

    await updateStatus(videoId, "clipped");

    // Notify Jose that content is ready for review
    if (contentCreated > 0) {
      await notifyContentReady(contentCreated).catch(console.error);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown pipeline error";
    const retryCount = (video.retry_count || 0) + 1;
    console.error(`Pipeline failed for video ${videoId} (attempt ${retryCount}/${MAX_RETRIES}):`, errorMsg);

    if (retryCount >= MAX_RETRIES) {
      // Exhausted retries — mark as permanently failed
      await supabase
        .from("videos")
        .update({
          status: "failed",
          error_message: errorMsg,
          retry_count: retryCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId);

      await notifyPipelineError(video.filename, `Failed after ${MAX_RETRIES} attempts: ${errorMsg}`).catch(console.error);
    } else {
      // Increment retry_count but leave status as-is so the next cron run picks it up
      await supabase
        .from("videos")
        .update({
          error_message: `Attempt ${retryCount}: ${errorMsg}`,
          retry_count: retryCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId);
    }

    throw err;
  }
}

/**
 * Create a content item from the full video (no clip extraction).
 * Used when Claude doesn't find specific clip-worthy moments,
 * or the video is short enough to post as-is.
 */
async function createFullVideoContent(video: Video, videoBuffer: Buffer, isSpanish = false, contentStatus = "review", visualContext = "") {
  const transcript = video.transcript || "";
  const duration = video.duration_seconds || 0;

  // Extract full video as compressed clip (fits under storage limits)
  const clipResult = await extractClip(videoBuffer, video.filename, {
    startTime: 0,
    endTime: duration,
    aspectRatio: "9:16",
    maxDuration: 480,
  });

  // Upload compressed clip to storage
  const clipStoragePath = `clips/${video.id}/${Date.now()}_full.mp4`;
  const clipUrl = await uploadClip(clipStoragePath, clipResult.buffer, "video/mp4");

  // Derive a readable title hint from transcript (not the ugly filename)
  const titleHint = transcript.length > 10
    ? transcript.slice(0, 80).replace(/\s+/g, " ").trim()
    : "Untitled Video";

  const platforms: Platform[] = ["youtube", "facebook", "instagram", "tiktok"];
  const copy = await generatePlatformCopy(
    transcript.slice(0, 1000),
    titleHint,
    platforms,
    isSpanish,
    visualContext
  );

  const title = copy.youtube_title || titleHint;

  await supabase.from("content").insert({
    type: "video_clip",
    status: contentStatus,
    title,
    description: copy.youtube_description || "Full video",
    youtube_title: copy.youtube_title,
    youtube_description: copy.youtube_description,
    youtube_tags: copy.youtube_tags,
    facebook_text: copy.facebook_text,
    instagram_caption: copy.instagram_caption,
    tiktok_caption: copy.tiktok_caption,
    media_url: clipUrl,
    platforms,
  });
}

/**
 * Full pipeline: process a single photo from Google Drive.
 * Stages: download → convert HEIC if needed → upload → AI analyze → generate copy → review
 */
export async function processPhoto(video: Video): Promise<void> {
  const videoId = video.id;

  try {
    // ----- Stage 1: Download -----
    let photoBuffer: Buffer;

    if (video.status === "new" || video.status === "downloading") {
      await updateStatus(videoId, "downloading");

      const metadata = await getFileMetadata(video.google_drive_file_id);
      const fileSize = parseInt(metadata.size as string, 10);
      if (fileSize > MAX_PHOTO_SIZE_BYTES) {
        throw new Error(`Photo too large: ${(fileSize / 1024 / 1024).toFixed(0)}MB exceeds ${MAX_PHOTO_SIZE_BYTES / 1024 / 1024}MB limit`);
      }

      photoBuffer = await withRetry(() => downloadFile(video.google_drive_file_id), { label: "Drive download (photo)" });

      await supabase
        .from("videos")
        .update({
          storage_path: `photos/${videoId}/${video.filename}`,
          status: "downloaded",
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId);

      video = { ...video, storage_path: `photos/${videoId}/${video.filename}`, status: "downloaded" };
    } else {
      photoBuffer = await withRetry(() => downloadFile(video.google_drive_file_id), { label: "Drive re-download (photo)" });
    }

    // ----- Stage 2: Convert HEIC → JPEG if needed -----
    let mimeType = video.mime_type;
    if (mimeType === "image/heic" || mimeType === "image/heif") {
      photoBuffer = await convertHeicToJpeg(photoBuffer, video.filename);
      mimeType = "image/jpeg";
    }

    // ----- Stage 3: Upload to Supabase Storage -----
    await updateStatus(videoId, "clipping"); // reuse status for "processing"

    const ext = mimeType === "image/png" ? "png" : "jpg";
    const storagePath = `photos/${videoId}/${Date.now()}.${ext}`;
    const photoUrl = await withRetry(
      () => uploadClip(storagePath, photoBuffer, mimeType),
      { label: "photo upload" }
    );

    // ----- Stage 4: AI Analysis -----
    const { title, visualContext } = await withRetry(
      () => analyzePhotoContent(photoBuffer, mimeType),
      { label: "Claude photo analysis" }
    );

    // ----- Stage 5: Generate platform copy (skip YouTube — no photo support) -----
    const platforms: Platform[] = ["facebook", "instagram"];
    const copy = await withRetry(
      () => generatePlatformCopy(
        visualContext, // use visual context as the "transcript" since there's no audio
        title,
        platforms,
        false,
        visualContext
      ),
      { label: "Claude copy generation (photo)" }
    );

    // ----- Stage 6: Create content record -----
    const autoApprove = await getAppSetting<boolean>("auto_approve_pipeline");
    const contentStatus = autoApprove === true ? "approved" : "review";

    await supabase.from("content").insert({
      type: "photo_post",
      status: contentStatus,
      title,
      description: visualContext,
      facebook_text: copy.facebook_text,
      instagram_caption: copy.instagram_caption,
      tiktok_caption: copy.tiktok_caption,
      media_url: photoUrl,
      thumbnail_url: photoUrl,
      platforms,
    });

    await updateStatus(videoId, "clipped");
    await notifyContentReady(1).catch(console.error);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown pipeline error";
    const retryCount = (video.retry_count || 0) + 1;
    console.error(`Photo pipeline failed for ${videoId} (attempt ${retryCount}/${MAX_RETRIES}):`, errorMsg);

    if (retryCount >= MAX_RETRIES) {
      await supabase
        .from("videos")
        .update({
          status: "failed",
          error_message: errorMsg,
          retry_count: retryCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId);

      await notifyPipelineError(video.filename, `Failed after ${MAX_RETRIES} attempts: ${errorMsg}`).catch(console.error);
    } else {
      await supabase
        .from("videos")
        .update({
          error_message: `Attempt ${retryCount}: ${errorMsg}`,
          retry_count: retryCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId);
    }

    throw err;
  }
}

async function updateStatus(videoId: string, status: Video["status"]) {
  await supabase
    .from("videos")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", videoId);
}
