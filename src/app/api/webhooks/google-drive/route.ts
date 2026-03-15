import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { listNewFiles } from "@/lib/google-drive";
import { processVideo } from "@/lib/pipeline";
import { MAX_VIDEO_SIZE_BYTES } from "@/lib/constants";
import type { Video } from "@/lib/types";

export const maxDuration = 300;

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
    let firstNewVideoId: string | null = null;

    for (const file of newFiles) {
      const fileSize = parseInt(file.size, 10);
      if (fileSize > MAX_VIDEO_SIZE_BYTES) continue;

      const { data, error } = await supabase
        .from("videos")
        .insert({
          google_drive_file_id: file.id,
          filename: file.name,
          mime_type: file.mimeType,
          size_bytes: fileSize,
          status: "new",
        })
        .select()
        .single();

      if (!error && data) {
        created++;
        if (!firstNewVideoId) firstNewVideoId = data.id;
      }
    }

    // Auto-process the first new video immediately (keep to 1 to stay within Vercel timeout)
    let processed = false;
    if (firstNewVideoId) {
      try {
        const { data: videoRow } = await supabase
          .from("videos")
          .select("*")
          .eq("id", firstNewVideoId)
          .single();

        if (videoRow) {
          await processVideo(videoRow as Video);
          processed = true;
        }
      } catch (processErr) {
        console.error("Drive webhook auto-process error:", processErr);
        // Non-fatal — video stays in "new" status for next cron/manual trigger
      }
    }

    return NextResponse.json({ success: true, new_videos: created, processed });
  } catch (err) {
    console.error("Drive webhook error:", err);
    return NextResponse.json({ success: true }); // Return 200 to avoid Google retries
  }
}
