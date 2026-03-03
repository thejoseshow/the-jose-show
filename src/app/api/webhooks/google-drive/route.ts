import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { listNewFiles } from "@/lib/google-drive";
import { MAX_VIDEO_SIZE_BYTES } from "@/lib/constants";

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

      if (!error) created++;
    }

    return NextResponse.json({ success: true, new_videos: created });
  } catch (err) {
    console.error("Drive webhook error:", err);
    return NextResponse.json({ success: true }); // Return 200 to avoid Google retries
  }
}
