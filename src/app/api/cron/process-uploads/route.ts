import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { withCronLog } from "@/lib/cron-logger";
import { processClipsFromDrive, getPendingProjects } from "@/lib/opus-clip";
import { autoApproveContent, autoScheduleContent } from "@/lib/auto-scheduler";
import { getAppSetting, setAppSetting } from "@/lib/settings";
import { getAuthenticatedClient } from "@/lib/google-drive";
import { google } from "googleapis";

export const maxDuration = 300; // 5 min

/**
 * GET /api/cron/process-uploads
 *
 * Runs every 15 minutes. Two responsibilities:
 *
 * 1. DRIVE SCAN (Path B): Check the Opus Clip export folder in Google Drive
 *    for new clip files. Import them into our system (download, store, generate
 *    copy, create content records for review).
 *
 * 2. AUTO-FLOW: Run auto-approve and auto-schedule on any content in
 *    "review" or "approved" status that meets the criteria.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronLog("process-uploads", async () => {
      let driveClipsImported = 0;
      let autoApproved = 0;
      let autoScheduled = 0;
      const errors: string[] = [];

      // --- Step 1: Scan Google Drive for Opus Clip exports ---
      const driveMonitorEnabled = await getAppSetting<boolean>("drive_monitor_enabled");
      if (driveMonitorEnabled) {
        try {
          const driveResult = await scanDriveForClips();
          driveClipsImported = driveResult.imported;
          if (driveResult.errors.length > 0) {
            errors.push(...driveResult.errors);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Drive scan error: ${msg}`);
          console.error("[process-uploads] Drive scan error:", msg);
        }
      }

      // --- Step 2: Auto-approve content that meets threshold ---
      try {
        autoApproved = await autoApproveContent();
        if (autoApproved > 0) {
          console.log(`[process-uploads] Auto-approved ${autoApproved} content items`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Auto-approve error: ${msg}`);
      }

      // --- Step 3: Auto-schedule approved content ---
      try {
        const scheduleResults = await autoScheduleContent();
        autoScheduled = scheduleResults.length;
        if (autoScheduled > 0) {
          console.log(`[process-uploads] Auto-scheduled ${autoScheduled} content items`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Auto-schedule error: ${msg}`);
      }

      // --- Report ---
      const pending = await getPendingProjects();
      const pendingCount = pending.filter((p) => p.status === "pending").length;

      return {
        message: [
          driveClipsImported > 0 ? `Imported ${driveClipsImported} clips from Drive` : null,
          autoApproved > 0 ? `Auto-approved ${autoApproved}` : null,
          autoScheduled > 0 ? `Auto-scheduled ${autoScheduled}` : null,
          pendingCount > 0 ? `${pendingCount} videos pending in Opus Clip` : null,
        ]
          .filter(Boolean)
          .join(", ") || "No new activity",
        driveClipsImported,
        autoApproved,
        autoScheduled,
        pendingInOpusClip: pendingCount,
        errors,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("process-uploads cron error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Cron failed",
      },
      { status: 500 }
    );
  }
}

// --- Drive Scan Helper ---

async function scanDriveForClips(): Promise<{
  imported: number;
  errors: string[];
}> {
  const folderName =
    (await getAppSetting<string>("drive_opus_folder")) || "opus-clips";

  const auth = await getAuthenticatedClient();
  const drive = google.drive({ version: "v3", auth });

  // Find the folder by name
  const folderRes = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });

  const folder = folderRes.data.files?.[0];
  if (!folder?.id) {
    return { imported: 0, errors: [] }; // Folder doesn't exist yet, not an error
  }

  // Get processed file IDs to avoid re-importing
  const processedFileIds =
    (await getAppSetting<string[]>("opus_drive_processed_files")) || [];

  // List video files in the folder
  const filesRes = await drive.files.list({
    q: `'${folder.id}' in parents and trashed=false and mimeType contains 'video/'`,
    fields: "files(id,name,mimeType,size)",
    orderBy: "createdTime desc",
    pageSize: 20,
  });

  const files = filesRes.data.files || [];
  const newFiles = files.filter((f) => f.id && !processedFileIds.includes(f.id));

  if (newFiles.length === 0) {
    return { imported: 0, errors: [] };
  }

  console.log(`[process-uploads] Found ${newFiles.length} new clip(s) in Drive folder "${folderName}"`);

  // Build download URLs and process
  const driveFiles = [];
  for (const file of newFiles) {
    if (!file.id || !file.name) continue;

    // Get direct download URL
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;

    driveFiles.push({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType || "video/mp4",
      downloadUrl,
      size: file.size ? parseInt(file.size) : undefined,
    });
  }

  // We need to pass auth headers for Drive downloads.
  // Override the download by using the Drive API directly.
  const driveFilesWithAuth = [];
  for (const file of driveFiles) {
    try {
      const res = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { responseType: "arraybuffer" }
      );

      // Create a blob URL is not possible server-side; instead we'll pass the buffer directly
      // But processClipsFromDrive expects download URLs. Let's handle this differently:
      // Upload the Drive file content to a temp Supabase location, then use that URL.
      const { supabase } = await import("@/lib/supabase");
      const tempPath = `temp/drive-import/${file.id}.mp4`;
      const buffer = Buffer.from(res.data as ArrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from("clips")
        .upload(tempPath, buffer, { contentType: file.mimeType, upsert: true });

      if (uploadError) {
        console.error(`[process-uploads] Failed to upload ${file.name} to temp storage: ${uploadError.message}`);
        continue;
      }

      const { data: urlData } = supabase.storage.from("clips").getPublicUrl(tempPath);

      driveFilesWithAuth.push({
        ...file,
        downloadUrl: urlData.publicUrl,
      });
    } catch (err) {
      console.error(`[process-uploads] Failed to download ${file.name} from Drive:`, err);
    }
  }

  if (driveFilesWithAuth.length === 0) {
    return { imported: 0, errors: ["Failed to download any files from Drive"] };
  }

  const result = await processClipsFromDrive(driveFilesWithAuth);

  // Mark files as processed
  const allProcessed = [
    ...processedFileIds,
    ...newFiles.map((f) => f.id!),
  ].slice(-200); // Keep last 200
  await setAppSetting("opus_drive_processed_files", allProcessed);

  return {
    imported: result.totalScheduled,
    errors: result.errors,
  };
}
