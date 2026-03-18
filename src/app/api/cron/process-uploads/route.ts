import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { listNewFiles } from "@/lib/google-drive";
import { supabase } from "@/lib/supabase";
import { processVideo, processPhoto } from "@/lib/pipeline";
import { withCronLog } from "@/lib/cron-logger";
import { MAX_VIDEO_SIZE_BYTES, MAX_PHOTO_SIZE_BYTES, PIPELINE_CONCURRENCY, LARGE_VIDEO_THRESHOLD_MB } from "@/lib/constants";
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
        .limit(3);

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

      // Auto-archive failed videos older than 24 hours
      const archiveCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: archived } = await supabase
        .from("videos")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("status", "failed")
        .lt("updated_at", archiveCutoff)
        .select("id");

      // Recover content stuck at "publishing" for more than 15 minutes
      const stuckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: stuckContent } = await supabase
        .from("content")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("status", "publishing")
        .lt("updated_at", stuckCutoff)
        .select("id");

      return {
        new_files_detected: newRecords,
        processed,
        archived: archived?.length || 0,
        recovered_publishing: stuckContent?.length || 0,
        errors: errors.length > 0 ? errors : undefined,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
