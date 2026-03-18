import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listNewFiles } from "@/lib/google-drive";
import { supabase } from "@/lib/supabase";
import { processVideo, processPhoto } from "@/lib/pipeline";
import { MAX_VIDEO_SIZE_BYTES, MAX_PHOTO_SIZE_BYTES, PIPELINE_CONCURRENCY, LARGE_VIDEO_THRESHOLD_MB } from "@/lib/constants";
import type { Video } from "@/lib/types";

export const maxDuration = 800;

// POST /api/pipeline/process - Manual trigger (same logic as cron)
export async function POST() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Step 1: Detect new files in Google Drive
    const newFiles = await listNewFiles();
    let newRecords = 0;

    for (const file of newFiles) {
      const fileSize = parseInt(file.size, 10);
      const sizeLimit = file.isPhoto ? MAX_PHOTO_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
      if (fileSize > sizeLimit) continue;

      const { error } = await supabase.from("videos").insert({
        google_drive_file_id: file.id,
        filename: file.name,
        mime_type: file.mimeType,
        size_bytes: fileSize,
        is_photo: file.isPhoto,
        status: "new",
      });

      if (!error) newRecords++;
    }

    // Step 2: Process pending videos (up to 5 for manual trigger)
    const { data: pendingVideos } = await supabase
      .from("videos")
      .select("*")
      .in("status", ["new", "downloaded", "transcribed"])
      .order("created_at", { ascending: true })
      .limit(5);

    let processed = 0;
    const errors: string[] = [];

    // Process videos in parallel batches (single concurrency for large files)
    const pending = (pendingVideos || []) as Video[];
    const hasLargeFile = pending.some((v) => v.size_bytes > LARGE_VIDEO_THRESHOLD_MB * 1024 * 1024);
    const concurrency = hasLargeFile ? 1 : PIPELINE_CONCURRENCY;
    for (let i = 0; i < pending.length; i += concurrency) {
      const batch = pending.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map((v) => (v.is_photo ? processPhoto(v) : processVideo(v)))
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "fulfilled") {
          processed++;
        } else {
          const reason = (results[j] as PromiseRejectedResult).reason;
          errors.push(`${batch[j].filename}: ${reason instanceof Error ? reason.message : "Unknown error"}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      new_files_detected: newRecords,
      processed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
