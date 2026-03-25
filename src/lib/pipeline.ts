// ============================================================
// The Jose Show - Import Pipeline
// ============================================================
//
// Clean import-oriented pipeline for Opus Clip workflow.
// No FFmpeg or Whisper — clips arrive pre-edited from Opus Clip.

import { google } from "googleapis";
import { supabase } from "./supabase";
import { getAuthenticatedClient } from "./google-drive";
import { getAppSetting } from "./settings";
import {
  importClipFromDrive,
  importClipFromUpload,
  generateCopyForClip,
  type ImportResult,
} from "./opus-clip";
import type { Video } from "./types";

// --- Main Entry Point ---

export interface ImportClipOptions {
  /** Google Drive file ID (for Drive imports) */
  driveFileId?: string;
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
 * Import a single clip from either Google Drive or a direct upload.
 * Optionally generates AI copy after import.
 */
export async function importClip(
  options: ImportClipOptions
): Promise<ImportResult> {
  const { driveFileId, buffer, filename, mimeType, sourceVideoId, generateCopy = true } = options;

  let result: ImportResult;

  if (driveFileId) {
    result = await importClipFromDrive(driveFileId, sourceVideoId);
  } else if (buffer && filename) {
    result = await importClipFromUpload(
      buffer,
      filename,
      mimeType || "video/mp4",
      sourceVideoId
    );
  } else {
    throw new Error("Must provide either driveFileId or buffer + filename");
  }

  // Generate AI copy if import succeeded
  if (generateCopy && result.status === "imported" && result.clipId) {
    try {
      const contentId = await generateCopyForClip(result.clipId);
      result.contentId = contentId;
      result.status = "ready";
    } catch (err) {
      console.error(`Copy generation failed for clip ${result.clipId}:`, err);
      // Import still succeeded — content can be generated later
    }
  }

  return result;
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
