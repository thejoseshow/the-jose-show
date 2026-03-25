import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { withCronLog } from "@/lib/cron-logger";
import { checkAllChannels } from "@/lib/youtube-monitor";

export const maxDuration = 300; // 5 min

/**
 * GET /api/cron/youtube-monitor
 *
 * Runs every 15 minutes. Checks all enabled monitored YouTube channels
 * for new uploads. New videos are sent to Opus Clip via Zapier webhook
 * for clipping. When clips are ready, they arrive via:
 *   - Path A: Zapier webhook to /api/webhooks/opus-clip
 *   - Path B: Opus Clip exports to Google Drive, picked up by process-uploads cron
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronLog("youtube-monitor", async () => {
      const {
        channelsChecked,
        newVideosFound,
        clipsSent,
        errors,
      } = await checkAllChannels();

      return {
        message:
          newVideosFound > 0
            ? `Checked ${channelsChecked} channel(s), found ${newVideosFound} new video(s), sent ${clipsSent} to Opus Clip via Zapier`
            : `Checked ${channelsChecked} channel(s), no new videos`,
        channelsChecked,
        newVideosFound,
        clipsSent,
        errors,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("youtube-monitor cron error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Cron failed",
      },
      { status: 500 }
    );
  }
}
