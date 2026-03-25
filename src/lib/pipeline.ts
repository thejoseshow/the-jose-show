// ============================================================
// The Jose Show - Import Pipeline
// ============================================================
//
// Legacy import pipeline — direct clip imports have been replaced
// by Opus Clip API scheduling (see /api/opus-clip/schedule).
// Retained for Drive scanning and status helpers.

import { google } from "googleapis";
import { supabase } from "./supabase";
import { getAuthenticatedClient } from "./google-drive";
import { getAppSetting } from "./settings";
import type { Video } from "./types";

// --- Types ---

export interface ImportResult {
  status: "imported" | "ready" | "failed";
  clipId?: string;
  contentId?: string;
  error?: string;
}

export interface ImportClipOptions {
  /** File buffer (for direct uploads) */
  buffer?: Buffer;
  /** Original filename */
  filename?: string;
  /** MIME type */
  mimeType?: string;
  /** Optional parent source video ID */
  sourceVideoId?: string;
  /** Whether to auto-generate AI copy after import */
  generateCopy?: boolean;
}

/**
 * Import a single clip from a direct upload.
 * Stores the file in Supabase Storage and creates a video record.
 *
 * Note: Drive-based imports and Opus Clip scheduling are now handled
 * via /api/opus-clip/schedule — this function is for manual uploads only.
 */
export async function importClip(
  options: ImportClipOptions
): Promise<ImportResult> {
  const { buffer, filename, mimeType, sourceVideoId } = options;

  if (!buffer || !filename) {
    throw new Error("Must provide buffer + filename for upload import");
  }

  try {
    const storagePath = `clips/${Date.now()}-${filename}`;
    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(storagePath, buffer, {
        contentType: mimeType || "video/mp4",
        upsert: false,
      });

    if (uploadError) {
      return { status: "failed", error: uploadError.message };
    }

    const { data: video, error: insertError } = await supabase
      .from("videos")
      .insert({
        filename,
        mime_type: mimeType || "video/mp4",
        size_bytes: buffer.length,
        storage_path: storagePath,
        source_video_id: sourceVideoId || null,
        source_type: "manual_upload",
        status: "imported",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !video) {
      return { status: "failed", error: insertError?.message || "Insert failed" };
    }

    return { status: "imported", clipId: video.id };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "Import failed",
    };
  }
}

// --- Drive Scanning ---

export interface DriveClipFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
}

/**
 * Scan the Opus Clip Drive folder for new clip files.
 * Uses the `opus_clip_drive_folder` app setting for the folder ID.
 * Returns files not yet imported (checks existing videos by Drive file ID).
 */
export async function scanDriveForClips(): Promise<DriveClipFile[]> {
  // Get folder ID from app settings
  const folderId = await getAppSetting<string>("opus_clip_drive_folder");
  if (!folderId) {
    console.log("No opus_clip_drive_folder configured in app_settings");
    return [];
  }

  const auth = await getAuthenticatedClient();
  const drive = google.drive({ version: "v3", auth });

  // Get already-imported Drive file IDs
  const { data: existingVideos } = await supabase
    .from("videos")
    .select("google_drive_file_id");
  const existingIds = new Set(
    (existingVideos || []).map((v: { google_drive_file_id: string }) => v.google_drive_file_id)
  );

  // List video files in the Opus Clip folder
  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'video/' and trashed=false`,
    fields: "files(id,name,mimeType,size,createdTime)",
    orderBy: "createdTime desc",
    pageSize: 50,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  const files = (response.data.files || []) as DriveClipFile[];

  // Filter out already-imported files
  return files.filter((f) => !existingIds.has(f.id));
}

// --- Status Helpers ---

async function updateStatus(videoId: string, status: Video["status"], errorMessage?: string) {
  await supabase
    .from("videos")
    .update({
      status,
      ...(errorMessage !== undefined ? { error_message: errorMessage } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId);
}

export { updateStatus };
