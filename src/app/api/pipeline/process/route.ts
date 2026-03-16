import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listNewFiles } from "@/lib/google-drive";
import { supabase } from "@/lib/supabase";
import { processVideo } from "@/lib/pipeline";
import { MAX_VIDEO_SIZE_BYTES } from "@/lib/constants";
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
      if (fileSize > MAX_VIDEO_SIZE_BYTES) continue;

      const { error } = await supabase.from("videos").insert({
        google_drive_file_id: file.id,
        filename: file.name,
        mime_type: file.mimeType,
        size_bytes: fileSize,
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

    for (const videoRow of pendingVideos || []) {
      try {
        await processVideo(videoRow as Video);
        processed++;
      } catch (err) {
        errors.push(`${videoRow.filename}: ${err instanceof Error ? err.message : "Unknown error"}`);
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
