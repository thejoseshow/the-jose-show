import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { listNewFiles } from "@/lib/google-drive";
import { processVideo, processPhoto } from "@/lib/pipeline";
import { MAX_VIDEO_SIZE_BYTES, MAX_PHOTO_SIZE_BYTES, PIPELINE_CONCURRENCY, LARGE_VIDEO_THRESHOLD_MB } from "@/lib/constants";
import type { Video } from "@/lib/types";

export const maxDuration = 800;

// POST /api/webhooks/google-drive - Google Drive push notification
// Set up via Drive API watch: drive.files.watch()
export async function POST(request: NextRequest) {
  // Verify the webhook comes from Google
  const channelId = request.headers.get("x-goog-channel-id");
  const resourceState = request.headers.get("x-goog-resource-state");

  if (!channelId) {
    return NextResponse.json({ error: "Missing channel ID" }, { status: 400 });
  }

  // Google sends a "sync" message when watch is first set up
  if (resourceState === "sync") {
    return NextResponse.json({ success: true, message: "Sync acknowledged" });
  }

  // Only process "change" events
  if (resourceState !== "change") {
    return NextResponse.json({ success: true });
  }

  try {
    const newFiles = await listNewFiles();
    let created = 0;
    const newVideoIds: string[] = [];

    for (const file of newFiles) {
      const fileSize = parseInt(file.size, 10);
      const sizeLimit = file.isPhoto ? MAX_PHOTO_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
      if (fileSize > sizeLimit) continue;

      const { data, error } = await supabase
        .from("videos")
        .insert({
          google_drive_file_id: file.id,
          filename: file.name,
          mime_type: file.mimeType,
          size_bytes: fileSize,
          is_photo: file.isPhoto,
          status: "new",
        })
        .select()
        .single();

      if (!error && data) {
        created++;
        newVideoIds.push(data.id);
      }
    }

    // Auto-process new videos in parallel batches (Pro tier: 15-min timeout)
    let processed = 0;
    const idsToProcess = newVideoIds.slice(0, 4);
    for (let i = 0; i < idsToProcess.length; i += PIPELINE_CONCURRENCY) {
      const batchIds = idsToProcess.slice(i, i + PIPELINE_CONCURRENCY);
      const batchVideos = await Promise.all(
        batchIds.map(async (vid) => {
          const { data } = await supabase.from("videos").select("*").eq("id", vid).single();
          return data as Video | null;
        })
      );
      const valid = batchVideos.filter((v): v is Video => v !== null);
      // Drop to single concurrency if any file is large
      if (valid.some((v) => v.size_bytes > LARGE_VIDEO_THRESHOLD_MB * 1024 * 1024)) {
        for (const v of valid) {
          try {
            if (v.is_photo) await processPhoto(v); else await processVideo(v);
            processed++;
          } catch (e) { console.error("Drive webhook auto-process error:", e); }
        }
        continue;
      }
      const results = await Promise.allSettled(
        valid.map((v) => (v.is_photo ? processPhoto(v) : processVideo(v)))
      );
      for (const r of results) {
        if (r.status === "fulfilled") processed++;
        else console.error("Drive webhook auto-process error:", (r as PromiseRejectedResult).reason);
      }
    }

    return NextResponse.json({ success: true, new_videos: created, processed });
  } catch (err) {
    console.error("Drive webhook error:", err);
    return NextResponse.json({ success: true }); // Return 200 to avoid Google retries
  }
}
