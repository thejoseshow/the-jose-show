import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { withCronLog } from "@/lib/cron-logger";
import { checkAllChannels } from "@/lib/youtube-monitor";

export const maxDuration = 300; // 5 min

/**
 * GET /api/cron/youtube-monitor
 *
 * Runs every 15 minutes. Checks all enabled monitored YouTube channels
 * for new uploads. New videos are sent to Opus Clip for clipping, and
 * the resulting projects are queued for the auto-scheduler.
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
        clipsCreated,
        errors,
      } = await checkAllChannels();

      return {
        message:
          newVideosFound > 0
            ? `Checked ${channelsChecked} channel(s), found ${newVideosFound} new video(s), created ${clipsCreated} Opus Clip project(s)`
            : `Checked ${channelsChecked} channel(s), no new videos`,
        channelsChecked,
        newVideosFound,
        clipsCreated,
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
