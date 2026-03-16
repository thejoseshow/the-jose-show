import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { listNewFiles } from "@/lib/google-drive";
import { supabase } from "@/lib/supabase";
import { processVideo, processPhoto } from "@/lib/pipeline";
import { withCronLog } from "@/lib/cron-logger";
import { MAX_VIDEO_SIZE_BYTES, MAX_PHOTO_SIZE_BYTES } from "@/lib/constants";
import type { Video } from "@/lib/types";

export const maxDuration = 800;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronLog("process-uploads", async () => {
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

      const { data: pendingVideos } = await supabase
        .from("videos")
        .select("*")
        .in("status", ["new", "downloaded", "transcribed"])
        .order("created_at", { ascending: true })
        .limit(1);

      let processed = 0;
      const errors: string[] = [];

      for (const videoRow of pendingVideos || []) {
        try {
          const v = videoRow as Video;
          if (v.is_photo) {
            await processPhoto(v);
          } else {
            await processVideo(v);
          }
          processed++;
        } catch (err) {
          errors.push(`${videoRow.filename}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }

      return { new_files_detected: newRecords, processed, errors: errors.length > 0 ? errors : undefined };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
