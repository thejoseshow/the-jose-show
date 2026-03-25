// ============================================================
// The Jose Show - Opus Clip Import Module
// ============================================================
//
// Handles importing pre-edited clips from Opus Clip via Google Drive
// or direct upload. No FFmpeg or Whisper needed — Opus Clip already
// handles clipping, captions, and face tracking.

import { supabase } from "./supabase";
import { downloadFile, getFileMetadata } from "./google-drive";
import { uploadClip } from "./storage";
import { generatePlatformCopy } from "./claude";
import { getAppSetting } from "./settings";
import type { Platform, ImportSource } from "./types";

// --- Filename Parsing ---

export interface OpusClipMeta {
  viralityScore: number | null;
  title: string | null;
  hasCaptions: boolean;
  hasFaceTracking: boolean;
  raw: string;
}

/**
 * Parse metadata from an Opus Clip export filename.
 *
 * Opus Clip names files in patterns like:
 *   "85_Working on my footwork today_captions.mp4"
 *   "92 - Best bachata practice session.mp4"
 *   "clip_75_Dominican style footwork.mp4"
 *
 * We extract: virality score (leading number), title, and flag markers.
 */
export function parseOpusClipExport(filename: string): OpusClipMeta {
  const raw = filename;

  // Strip extension
  const name = filename.replace(/\.[^.]+$/, "");

  // Detect feature flags from filename
  const hasCaptions =
    /captions|subtitles|cc/i.test(name);
  const hasFaceTracking =
    /facetrack|face.?track|speaker/i.test(name);

  // Try to extract virality score and title
  // Pattern 1: "85_Title here" or "85 - Title here" or "85 Title here"
  const scoreMatch = name.match(
    /^(?:clip[_\s-]*)?(\d{1,3})[_\s-]+(.+)/i
  );

  if (scoreMatch) {
    const score = parseInt(scoreMatch[1], 10);
    let title = scoreMatch[2]
      .replace(/[_-]+/g, " ")
      .replace(/(captions|subtitles|cc|facetrack|face.?track|speaker)/gi, "")
      .trim();

    return {
      viralityScore: score <= 100 ? score : null,
      title: title || null,
      hasCaptions,
      hasFaceTracking,
      raw,
    };
  }

  // No score found — use cleaned filename as title
  const cleanTitle = name
    .replace(/[_-]+/g, " ")
    .replace(/(captions|subtitles|cc|facetrack|face.?track|speaker)/gi, "")
    .trim();

  return {
    viralityScore: null,
    title: cleanTitle || null,
    hasCaptions,
    hasFaceTracking,
    raw,
  };
}

// --- Import from Google Drive ---

export interface ImportResult {
  videoId: string;
  clipId: string;
  contentId: string | null;
  title: string;
  status: "imported" | "ready" | "failed";
  error?: string;
}

/**
 * Import a single clip from Google Drive.
 * Downloads the file, uploads to Supabase Storage, creates DB records.
 */
export async function importClipFromDrive(
  driveFileId: string,
  sourceVideoId?: string
): Promise<ImportResult> {
  // 1. Get file metadata from Drive
  const meta = await getFileMetadata(driveFileId);
  const filename = meta.name || "unknown_clip.mp4";
  const mimeType = meta.mimeType || "video/mp4";
  const sizeBytes = parseInt(meta.size || "0", 10);
  const durationSeconds = meta.videoMediaMetadata?.durationMillis
    ? Math.round(parseInt(meta.videoMediaMetadata.durationMillis as string, 10) / 1000)
    : null;

  // 2. Parse Opus Clip metadata from filename
  const opusMeta = parseOpusClipExport(filename);

  // 3. Download file from Drive
  const buffer = await downloadFile(driveFileId);

  // 4. Upload to Supabase Storage
  return importClipFromBuffer(
    buffer,
    filename,
    mimeType,
    sizeBytes || buffer.length,
    durationSeconds,
    driveFileId,
    opusMeta,
    sourceVideoId
  );
}

/**
 * Import a single clip from a direct upload (Buffer).
 */
export async function importClipFromUpload(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  sourceVideoId?: string
): Promise<ImportResult> {
  const opusMeta = parseOpusClipExport(filename);

  return importClipFromBuffer(
    buffer,
    filename,
    mimeType,
    buffer.length,
    null,
    null,
    opusMeta,
    sourceVideoId
  );
}

/**
 * Internal: shared import logic for both Drive and upload paths.
 */
async function importClipFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  durationSeconds: number | null,
  driveFileId: string | null,
  opusMeta: OpusClipMeta,
  sourceVideoId?: string
): Promise<ImportResult> {
  const title = opusMeta.title || filename.replace(/\.[^.]+$/, "");
  const sourceType: ImportSource = "opus_clip";
  const now = new Date().toISOString();

  // Create video record first (status: importing)
  const { data: video, error: videoErr } = await supabase
    .from("videos")
    .insert({
      google_drive_file_id: driveFileId || `upload_${Date.now()}`,
      filename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      duration_seconds: durationSeconds,
      status: "importing",
      is_photo: false,
      retry_count: 0,
      source_type: sourceType,
      source_video_id: sourceVideoId || null,
      opus_clip_score: opusMeta.viralityScore,
      opus_clip_metadata: {
        title: opusMeta.title,
        hasCaptions: opusMeta.hasCaptions,
        hasFaceTracking: opusMeta.hasFaceTracking,
        rawFilename: opusMeta.raw,
      },
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (videoErr || !video) {
    throw new Error(`Failed to create video record: ${videoErr?.message}`);
  }

  const videoId = video.id;

  try {
    // Upload to Supabase Storage
    const storagePath = `${videoId}/${filename}`;
    const publicUrl = await uploadClip(storagePath, buffer, mimeType);

    // Update video with storage path and mark as imported
    await supabase
      .from("videos")
      .update({
        storage_path: storagePath,
        status: "imported",
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    // Create clip record
    const { data: clip, error: clipErr } = await supabase
      .from("clips")
      .insert({
        video_id: videoId,
        storage_path: storagePath,
        start_time: 0,
        end_time: durationSeconds || 0,
        duration_seconds: durationSeconds || 0,
        aspect_ratio: "9:16",
        source_video_id: sourceVideoId || null,
        opus_clip_score: opusMeta.viralityScore,
        opus_clip_title: opusMeta.title,
        has_captions: opusMeta.hasCaptions,
        has_face_tracking: opusMeta.hasFaceTracking,
        created_at: now,
      })
      .select("id")
      .single();

    if (clipErr || !clip) {
      throw new Error(`Failed to create clip record: ${clipErr?.message}`);
    }

    return {
      videoId,
      clipId: clip.id,
      contentId: null,
      title,
      status: "imported",
    };
  } catch (err) {
    // Mark video as failed
    await supabase
      .from("videos")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    return {
      videoId,
      clipId: "",
      contentId: null,
      title,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// --- AI Copy Generation ---

/**
 * Generate platform-specific copy for an imported clip.
 * Creates a content record in 'review' status.
 */
export async function generateCopyForClip(
  clipId: string
): Promise<string | null> {
  // Fetch clip + video data
  const { data: clip } = await supabase
    .from("clips")
    .select("*, videos(*)")
    .eq("id", clipId)
    .single();

  if (!clip) throw new Error(`Clip not found: ${clipId}`);

  const video = clip.videos;
  const title =
    clip.opus_clip_title ||
    video?.filename?.replace(/\.[^.]+$/, "") ||
    "Untitled Clip";

  // Update video status to generating
  if (video?.id) {
    await supabase
      .from("videos")
      .update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", video.id);
  }

  try {
    // Use transcript if available, otherwise use the title as context
    const transcript = video?.transcript || title;
    const platforms: Platform[] = [
      "youtube",
      "facebook",
      "instagram",
      "tiktok",
    ];
    const isShort =
      clip.duration_seconds != null && clip.duration_seconds <= 60;

    const copy = await generatePlatformCopy(
      transcript,
      title,
      platforms,
      false, // isSpanish
      undefined, // visualContext
      isShort
    );

    // Get clip's public URL for media_url
    const { data: urlData } = supabase.storage
      .from("clips")
      .getPublicUrl(clip.storage_path);

    const now = new Date().toISOString();

    // Determine initial status: fast-track hot clips to 'approved'
    let initialStatus: "review" | "approved" = "review";
    const autoApproveEnabled = await getAppSetting<boolean>("auto_approve_pipeline");
    if (autoApproveEnabled && clip.opus_clip_score != null) {
      const thresholdSetting = (await getAppSetting<number>("auto_approve_threshold")) ?? 7;
      const minScore = thresholdSetting * 10; // 1-10 scale -> 0-100
      if (clip.opus_clip_score >= minScore) {
        initialStatus = "approved";
      }
    }

    // Create content record
    const { data: content, error: contentErr } = await supabase
      .from("content")
      .insert({
        clip_id: clipId,
        type: "video_clip",
        status: initialStatus,
        title: copy.youtube_title || title,
        description: copy.youtube_description || null,
        youtube_title: copy.youtube_title,
        youtube_description: copy.youtube_description,
        youtube_tags: copy.youtube_tags,
        facebook_text: copy.facebook_text,
        instagram_caption: copy.instagram_caption,
        tiktok_caption: copy.tiktok_caption,
        media_url: urlData?.publicUrl || null,
        platforms,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (contentErr || !content) {
      throw new Error(
        `Failed to create content record: ${contentErr?.message}`
      );
    }

    // Update video status to ready
    if (video?.id) {
      await supabase
        .from("videos")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", video.id);
    }

    return content.id;
  } catch (err) {
    // Mark video as failed
    if (video?.id) {
      await supabase
        .from("videos")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : String(err),
          updated_at: new Date().toISOString(),
        })
        .eq("id", video.id);
    }
    throw err;
  }
}

// --- Batch Import ---

/**
 * Import multiple clips from Google Drive in sequence.
 * Returns results for each file.
 */
export async function processImportBatch(
  driveFileIds: string[],
  sourceVideoId?: string
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];

  for (const fileId of driveFileIds) {
    try {
      const result = await importClipFromDrive(fileId, sourceVideoId);
      results.push(result);

      // If import succeeded, generate copy
      if (result.status === "imported" && result.clipId) {
        try {
          const contentId = await generateCopyForClip(result.clipId);
          result.contentId = contentId;
          result.status = "ready";
        } catch (err) {
          console.error(
            `Copy generation failed for clip ${result.clipId}:`,
            err
          );
          // Import succeeded but copy gen failed — still usable
        }
      }
    } catch (err) {
      results.push({
        videoId: "",
        clipId: "",
        contentId: null,
        title: fileId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
