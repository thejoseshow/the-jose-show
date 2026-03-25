import { NextRequest, NextResponse } from "next/server";
import { scanDriveForClips } from "@/lib/pipeline";

export const maxDuration = 300;

/**
 * POST /api/webhooks/google-drive
 *
 * Google Drive push notification webhook.
 * When new files appear in the Opus Clip folder, log them.
 *
 * Direct clip imports via Drive have been replaced by the Opus Clip API
 * scheduling workflow. This webhook now only logs new files — actual
 * scheduling is handled via the Schedule page or process-uploads cron.
 */
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

    if (newClips.length > 0) {
      console.log(
        `Drive webhook: ${newClips.length} new clip(s) detected. Use Schedule page or process-uploads cron to schedule.`
      );
    }

    return NextResponse.json({
      success: true,
      new_clips: newClips.length,
      message:
        newClips.length > 0
          ? "New clips detected. Use Opus Clip API scheduling."
          : "No new clips",
    });
  } catch (err) {
    console.error("Drive webhook error:", err);
    return NextResponse.json({ success: true }); // Return 200 to avoid Google retries
  }
}
