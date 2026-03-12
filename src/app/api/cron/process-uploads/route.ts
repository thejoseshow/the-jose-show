import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { listNewFiles } from "@/lib/google-drive";
import { supabase } from "@/lib/supabase";
import { processVideo } from "@/lib/pipeline";
import { notifyPipelineError } from "@/lib/notifications";
import { MAX_VIDEO_SIZE_BYTES } from "@/lib/constants";
import type { Video } from "@/lib/types";

export const maxDuration = 900; // 15 min (Vercel Pro max)

// GET /api/cron/process-uploads - Poll Drive + run full AI pipeline
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ----- Step 1: Detect new files in Google Drive -----
    const newFiles = await listNewFiles();
    let newRecords = 0;

    for (const file of newFiles) {
      const fileSize = parseInt(file.size, 10);
      if (fileSize > MAX_VIDEO_SIZE_BYTES) {
        console.warn(`Skipping ${file.name}: ${(fileSize / 1024 / 1024).toFixed(0)}MB exceeds limit`);
        continue;
      }

      const { error } = await supabase.from("videos").insert({
        google_drive_file_id: file.id,
        filename: file.name,
        mime_type: file.mimeType,
        size_bytes: fileSize,
        status: "new",
      });

      if (!error) newRecords++;
    }

    // ----- Step 2: Process unfinished videos -----
    const { data: pendingVideos } = await supabase
      .from("videos")
      .select("*")
      .in("status", ["new", "downloaded", "transcribed"])
      .order("created_at", { ascending: true })
      .limit(2); // Process max 2 per cron run to stay within timeout

    let processed = 0;
    const errors: string[] = [];

    for (const videoRow of pendingVideos || []) {
      try {
        await processVideo(videoRow as Video);
        processed++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${videoRow.filename}: ${errorMsg}`);
      }
    }

    return NextResponse.json({
      success: true,
      new_files_detected: newRecords,
      processed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Process uploads error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
