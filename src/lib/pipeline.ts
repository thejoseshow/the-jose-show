import { supabase } from "./supabase";
import { downloadFile, getFileMetadata } from "./google-drive";
import { transcribeVideo, generateSRT, getSegmentsInRange, getWordsInRange } from "./whisper";
import { extractClip, getVideoDuration, extractThumbnail, extractFrames, convertHeicToJpeg } from "./ffmpeg";
import { analyzeTranscriptForClips, analyzeVideoFrames, generatePlatformCopy, generatePlatformCopyVariants, generateThumbnailPrompt, analyzePhotoContent } from "./claude";
import { generateThumbnail } from "./thumbnails";
import { uploadClip, uploadThumbnail, uploadRawVideo, downloadRawVideo } from "./storage";
import { notifyContentReady, notifyPipelineError } from "./notifications";
import { withRetry } from "./retry";
import { withQuota } from "./api-quota";
import { MAX_VIDEO_SIZE_BYTES, MAX_PHOTO_SIZE_BYTES, LONG_FORM_THRESHOLD_SECONDS } from "./constants";
import { getAppSetting } from "./settings";
import { getNextOptimalSlot } from "./optimal-times";
import { getLearningContext } from "./copy-learner";
import type { Video, Platform, Content } from "./types";

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

      // Archive raw video to Supabase Storage (best-effort, non-blocking)
      const rawPath = await uploadRawVideo(storagePath, videoBuffer, video.mime_type || "video/mp4");
      if (rawPath) {
        console.log(`Raw video archived: ${rawPath}`);
      } else {
        console.warn(`Raw video archive failed for ${videoId} (non-critical)`);
      }

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
      // Already downloaded in a previous run — try Supabase Storage first, fall back to Drive
      const supabaseBuf = video.storage_path ? await downloadRawVideo(video.storage_path) : null;
      if (supabaseBuf) {
        console.log(`Re-downloaded from Supabase Storage: ${video.storage_path}`);
        videoBuffer = supabaseBuf;
      } else {
        videoBuffer = await withRetry(() => downloadFile(video.google_drive_file_id), { label: "Drive re-download" });
      }
    }

    // ----- Stage 2: Transcribe (if not already transcribed) -----
    if (!video.transcript) {
      await updateStatus(videoId, "transcribing");

      const transcription = await withQuota("whisper", () =>
        withRetry(() => transcribeVideo(videoBuffer, video.filename), { label: "Whisper transcription" })
      );

      await supabase
        .from("videos")
        .update({
          transcript: transcription.text,
          transcript_segments: transcription.segments,
          word_timestamps: transcription.words,
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
        word_timestamps: transcription.words,
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
    let recommendations = await withQuota("claude", () =>
      withRetry(() => analyzeTranscriptForClips(
        video.transcript || "",
        segments,
        duration,
        visualContext
      ), { label: "Claude clip analysis" })
    );

    // Check auto-approve settings
    const autoApprove = await getAppSetting<boolean>("auto_approve_pipeline");
    const autoApproveThreshold = await getAppSetting<number>("auto_approve_threshold") ?? 7;
    const autoScheduleEnabled = await getAppSetting<boolean>("auto_schedule_enabled");
    const abTestingEnabled = await getAppSetting<string>("ab_testing_enabled") === "true";
    const defaultContentStatus = autoApprove === true ? "approved" : "review";

    // Fetch learning context (top-performing content examples for Claude)
    const learningContext = await getLearningContext().catch(() => "");

    if (recommendations.length === 0) {
      // If no clips recommended, create a single content item from the full video
      await createFullVideoContent(video, videoBuffer, isSpanish, defaultContentStatus, visualContext, learningContext);
      await updateStatus(videoId, "clipped");
      return;
    }

    let contentCreated = 0;

    const videoWords = video.word_timestamps || [];

    for (const rec of recommendations) {
      try {
        // Get clip-specific captions
        const clipSegments = getSegmentsInRange(segments, rec.start_time, rec.end_time);
        const clipSRT = generateSRT(clipSegments);
        const clipTranscript = clipSegments.map((s) => s.text).join(" ");
        const clipWords = getWordsInRange(videoWords, rec.start_time, rec.end_time);

        // Determine if this is a YouTube full-length or short-form clip
        const clipDuration = rec.end_time - rec.start_time;
        const isShort = clipDuration <= 60;
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
            word_timestamps: clipWords.length > 0 ? clipWords : null,
            ai_score: rec.score,
            ai_reasoning: rec.reasoning,
          })
          .select()
          .single();

        // Generate platform copy — check A/B testing first
        const useAB = abTestingEnabled && !isSpanish; // A/B only for EN content
        let enCopy;
        let abVariantB;
        if (useAB) {
          const variants = await withRetry(() => generatePlatformCopyVariants(
            clipTranscript,
            rec.suggested_title,
            rec.platforms,
            false,
            visualContext,
            isShort,
            learningContext
          ), { label: "Claude A/B copy generation" });
          enCopy = variants.variantA;
          abVariantB = variants.variantB;
        } else {
          enCopy = await withRetry(() => generatePlatformCopy(
            clipTranscript,
            rec.suggested_title,
            rec.platforms,
            false, // EN copy
            visualContext,
            isShort,
            learningContext
          ), { label: "Claude copy generation (EN)" });
        }

        // Generate thumbnail for YouTube and Facebook clips (with retry + quota)
        let thumbnailUrl: string | null = null;
        if (rec.platforms.includes("youtube") || rec.platforms.includes("facebook")) {
          try {
            const thumbPrompt = await generateThumbnailPrompt(
              rec.suggested_title,
              clipTranscript
            );
            const thumbBuffer = await withQuota("replicate", () =>
              withRetry(() => generateThumbnail(thumbPrompt), { label: "Flux thumbnail", attempts: 2, baseDelayMs: 2000 })
            );
            const thumbPath = `thumbnails/${videoId}/${Date.now()}.png`;
            thumbnailUrl = await uploadThumbnail(thumbPath, thumbBuffer);
          } catch (err) {
            // Thumbnail gen failure is non-critical - fall back to video frame
            console.error("Thumbnail generation failed (Flux + retry exhausted):", err);
            try {
              const frameBuffer = await extractThumbnail(
                videoBuffer,
                video.filename,
                rec.start_time + (clipResult.duration / 2)
              );
              const thumbPath = `thumbnails/${videoId}/${Date.now()}_frame.png`;
              thumbnailUrl = await uploadThumbnail(thumbPath, frameBuffer);
            } catch (frameErr) {
              console.error("Frame extraction fallback also failed:", frameErr);
            }
          }
        }

        // Threshold-based auto-approve: only auto-approve if score meets threshold
        const meetsThreshold = autoApprove === true && rec.score >= autoApproveThreshold;
        const contentStatus = meetsThreshold ? "approved" : defaultContentStatus === "approved" ? "approved" : "review";

        // Auto-schedule if enabled and content is approved
        let scheduledAt: string | null = null;
        if (meetsThreshold && autoScheduleEnabled === true) {
          const slot = await getNextOptimalSlot(rec.platforms).catch(() => null);
          if (slot) scheduledAt = slot.toISOString();
        }

        // Create EN content record (variant A if A/B testing)
        const abGroupId = useAB ? crypto.randomUUID() : null;
        const { data: enRecord } = await supabase.from("content").insert({
          clip_id: clipRecord?.id || null,
          type: "video_clip",
          status: contentStatus,
          title: rec.suggested_title,
          description: rec.reasoning,
          youtube_title: enCopy.youtube_title,
          youtube_description: enCopy.youtube_description,
          youtube_tags: enCopy.youtube_tags,
          facebook_text: enCopy.facebook_text,
          instagram_caption: enCopy.instagram_caption,
          tiktok_caption: enCopy.tiktok_caption,
          media_url: clipUrl,
          thumbnail_url: thumbnailUrl,
          platforms: rec.platforms,
          scheduled_at: scheduledAt,
          language: "en",
          variant: useAB ? "A" : null,
          ab_group_id: abGroupId,
        }).select("id").single();

        // Create A/B variant B if enabled
        if (useAB && abVariantB && enRecord) {
          await supabase.from("content").insert({
            clip_id: clipRecord?.id || null,
            type: "video_clip",
            status: "review", // B variant always goes to review
            title: rec.suggested_title,
            description: rec.reasoning,
            youtube_title: abVariantB.youtube_title,
            youtube_description: abVariantB.youtube_description,
            youtube_tags: abVariantB.youtube_tags,
            facebook_text: abVariantB.facebook_text,
            instagram_caption: abVariantB.instagram_caption,
            tiktok_caption: abVariantB.tiktok_caption,
            media_url: clipUrl,
            thumbnail_url: thumbnailUrl,
            platforms: rec.platforms,
            language: "en",
            variant: "B",
            ab_group_id: abGroupId,
          });
        }

        // If Spanish video, create ES version linked to the EN parent
        if (isSpanish && enRecord) {
          try {
            const esCopy = await withRetry(() => generatePlatformCopy(
              clipTranscript,
              rec.suggested_title,
              rec.platforms,
              true, // ES copy
              visualContext,
              isShort,
              learningContext
            ), { label: "Claude copy generation (ES)" });

            await supabase.from("content").insert({
              clip_id: clipRecord?.id || null,
              type: "video_clip",
              status: "review",
              title: rec.suggested_title,
              description: rec.reasoning,
              youtube_title: esCopy.youtube_title,
              youtube_description: esCopy.youtube_description,
              youtube_tags: esCopy.youtube_tags,
              facebook_text: esCopy.facebook_text,
              instagram_caption: esCopy.instagram_caption,
              tiktok_caption: esCopy.tiktok_caption,
              media_url: clipUrl,
              thumbnail_url: thumbnailUrl,
              platforms: rec.platforms,
              language: "es",
              parent_content_id: enRecord.id,
            });
          } catch (esErr) {
            console.error("Failed to generate ES copy for clip:", esErr);
          }
        }

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
async function createFullVideoContent(video: Video, videoBuffer: Buffer, isSpanish = false, contentStatus = "review", visualContext = "", learningContext = "") {
  const transcript = video.transcript || "";
  const duration = video.duration_seconds || 0;
  const isLongForm = duration > LONG_FORM_THRESHOLD_SECONDS;

  // Long-form (>5 min): 16:9, full duration, YouTube + Facebook only
  // Short-form: 9:16, capped at 480s, all platforms
  const clipResult = await extractClip(videoBuffer, video.filename, {
    startTime: 0,
    endTime: duration,
    aspectRatio: isLongForm ? "16:9" : "9:16",
    ...(isLongForm ? {} : { maxDuration: 480 }),
  });

  // Free memory after extraction (~500MB savings for large files)
  videoBuffer = null as unknown as Buffer;

  // Upload compressed clip to storage
  const clipStoragePath = `clips/${video.id}/${Date.now()}_full.mp4`;
  const clipUrl = await uploadClip(clipStoragePath, clipResult.buffer, "video/mp4");

  // Derive a readable title hint from transcript (not the ugly filename)
  const titleHint = transcript.length > 10
    ? transcript.slice(0, 80).replace(/\s+/g, " ").trim()
    : "Untitled Video";

  // Long-form goes to YouTube + Facebook only (IG/TikTok don't support long videos well)
  const platforms: Platform[] = isLongForm
    ? ["youtube", "facebook"]
    : ["youtube", "facebook", "instagram", "tiktok"];
  const isShort = duration <= 60;

  // Generate thumbnail for long-form videos
  let thumbnailUrl: string | null = null;
  if (isLongForm) {
    try {
      const thumbPrompt = await generateThumbnailPrompt(titleHint, transcript.slice(0, 500));
      const thumbBuffer = await withQuota("replicate", () =>
        withRetry(() => generateThumbnail(thumbPrompt), { label: "Flux thumbnail (full video)", attempts: 2, baseDelayMs: 2000 })
      );
      const thumbPath = `thumbnails/${video.id}/${Date.now()}.png`;
      thumbnailUrl = await uploadThumbnail(thumbPath, thumbBuffer);
    } catch (err) {
      console.error("Thumbnail generation failed for long-form video:", err);
      // Fallback: extract a frame from the middle of the video
      // Note: videoBuffer was freed, so we use clipResult.buffer instead
      try {
        const frameBuffer = await extractThumbnail(
          clipResult.buffer,
          "clip.mp4",
          Math.min(duration / 2, 30)
        );
        const thumbPath = `thumbnails/${video.id}/${Date.now()}_frame.png`;
        thumbnailUrl = await uploadThumbnail(thumbPath, frameBuffer);
      } catch (frameErr) {
        console.error("Frame extraction fallback also failed:", frameErr);
      }
    }
  }

  // Generate EN copy
  const enCopy = await generatePlatformCopy(
    transcript.slice(0, 1000),
    titleHint,
    platforms,
    false,
    visualContext,
    isShort,
    learningContext
  );

  const title = enCopy.youtube_title || titleHint;

  const { data: enRecord } = await supabase.from("content").insert({
    type: "video_clip",
    status: contentStatus,
    title,
    description: enCopy.youtube_description || "Full video",
    youtube_title: enCopy.youtube_title,
    youtube_description: enCopy.youtube_description,
    youtube_tags: enCopy.youtube_tags,
    facebook_text: enCopy.facebook_text,
    instagram_caption: enCopy.instagram_caption,
    tiktok_caption: enCopy.tiktok_caption,
    media_url: clipUrl,
    thumbnail_url: thumbnailUrl,
    platforms,
    language: "en",
  }).select("id").single();

  // If Spanish, create ES version
  if (isSpanish && enRecord) {
    try {
      const esCopy = await generatePlatformCopy(
        transcript.slice(0, 1000),
        titleHint,
        platforms,
        true,
        visualContext,
        isShort,
        learningContext
      );

      await supabase.from("content").insert({
        type: "video_clip",
        status: "review",
        title: esCopy.youtube_title || title,
        description: esCopy.youtube_description || "Full video (ES)",
        youtube_title: esCopy.youtube_title,
        youtube_description: esCopy.youtube_description,
        youtube_tags: esCopy.youtube_tags,
        facebook_text: esCopy.facebook_text,
        instagram_caption: esCopy.instagram_caption,
        tiktok_caption: esCopy.tiktok_caption,
        media_url: clipUrl,
        thumbnail_url: thumbnailUrl,
        platforms,
        language: "es",
        parent_content_id: enRecord.id,
      });
    } catch (esErr) {
      console.error("Failed to generate ES copy for full video:", esErr);
    }
  }
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

/**
 * Reprocess a video from Supabase Storage.
 * Deletes existing clips + content, resets video status, and re-runs the full pipeline.
 */
export async function reprocessVideo(videoId: string): Promise<void> {
  // Fetch video record
  const { data: video, error } = await supabase
    .from("videos")
    .select("*")
    .eq("id", videoId)
    .single();

  if (error || !video) {
    throw new Error(`Video not found: ${videoId}`);
  }

  const v = video as Video;

  if (!v.storage_path) {
    throw new Error(`No storage_path for video ${videoId} — cannot reprocess without archived raw video`);
  }

  if (v.status === "downloading" || v.status === "transcribing" || v.status === "clipping") {
    throw new Error(`Video ${videoId} is currently in-progress (status: ${v.status})`);
  }

  // Download raw video from Supabase Storage
  const rawBuffer = await downloadRawVideo(v.storage_path);
  if (!rawBuffer) {
    throw new Error(`Failed to download raw video from Supabase Storage: ${v.storage_path}`);
  }

  // Delete existing clips and their content
  const { data: existingClips } = await supabase
    .from("clips")
    .select("id")
    .eq("video_id", videoId);

  if (existingClips && existingClips.length > 0) {
    const clipIds = existingClips.map((c) => c.id);
    await supabase.from("content").delete().in("clip_id", clipIds);
    await supabase.from("clips").delete().eq("video_id", videoId);
  }

  // Also delete any content directly tied to the video (full-video content with no clip)
  await supabase.from("content").delete().is("clip_id", null).eq("type", "video_clip");

  // Reset video status to "downloaded" so pipeline picks up from transcription
  await supabase
    .from("videos")
    .update({
      status: "downloaded",
      transcript: null,
      transcript_segments: null,
      word_timestamps: null,
      error_message: null,
      retry_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId);

  // Re-run the full pipeline with the raw buffer in memory
  const refreshed = { ...v, status: "downloaded" as const, transcript: null, transcript_segments: null, word_timestamps: null };
  // Temporarily override downloadFile by setting status to "downloaded" — processVideo will re-download
  // But we already have the buffer, so we call processVideo which will try Supabase Storage first
  await processVideo(refreshed);
}

async function updateStatus(videoId: string, status: Video["status"]) {
  await supabase
    .from("videos")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", videoId);
}
