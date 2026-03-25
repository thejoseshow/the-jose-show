import { NextRequest, NextResponse } from "next/server";
import { scanDriveForClips, importClip } from "@/lib/pipeline";

export const maxDuration = 300;

// POST /api/webhooks/google-drive - Google Drive push notification
// When new files appear in the Opus Clip folder, auto-import them.
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
    const newClips = await scanDriveForClips();
    let processed = 0;

    // Import up to 5 clips per webhook trigger
    for (const clip of newClips.slice(0, 5)) {
      try {
        const result = await importClip({
          driveFileId: clip.id,
          generateCopy: true,
        });
        if (result.status !== "failed") processed++;
      } catch (err) {
        console.error(`Drive webhook import error for ${clip.name}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      new_clips: newClips.length,
      processed,
    });
  } catch (err) {
    console.error("Drive webhook error:", err);
    return NextResponse.json({ success: true }); // Return 200 to avoid Google retries
  }
}
