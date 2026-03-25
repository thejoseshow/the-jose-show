import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { withCronLog } from "@/lib/cron-logger";
import {
  autoApproveContent,
  autoScheduleContent,
  rebalanceSchedule,
} from "@/lib/auto-scheduler";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronLog("auto-schedule", async () => {
      // Step 1: Auto-approve clips above threshold
      const approved = await autoApproveContent();

      // Step 2: Schedule all approved unscheduled content
      const scheduled = await autoScheduleContent();

      // Step 3: If any HOT content was scheduled, rebalance to make room
      const hasHot = scheduled.some((s) => s.priority === "hot");
      let bumped = 0;
      if (hasHot) {
        bumped = await rebalanceSchedule();
      }

      return {
        approved,
        scheduled: scheduled.length,
        hot: scheduled.filter((s) => s.priority === "hot").length,
        medium: scheduled.filter((s) => s.priority === "medium").length,
        filler: scheduled.filter((s) => s.priority === "filler").length,
        bumped,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
