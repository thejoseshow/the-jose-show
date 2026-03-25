import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { withCronLog } from "@/lib/cron-logger";
import {
  autoScheduleProject,
  getProcessedProjectIds,
  markProjectProcessed,
  getProjectClips,
} from "@/lib/opus-clip";
import { getAppSetting } from "@/lib/settings";

export const maxDuration = 300; // 5 min

/**
 * GET /api/cron/process-uploads
 *
 * Checks for new Opus Clip projects that haven't been auto-scheduled yet.
 * For each new project, runs autoScheduleProject() to distribute clips
 * across connected social platforms based on virality ranking.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronLog("process-uploads", async () => {
      // Check if auto-scheduling is enabled
      const autoScheduleEnabled = await getAppSetting<boolean>(
        "opus_clip_auto_schedule"
      );
      if (autoScheduleEnabled === false) {
        return {
          message: "Opus Clip auto-scheduling is disabled",
          processed: 0,
          scheduled: 0,
        };
      }

      // Get list of pending project IDs to process
      const pendingProjects = await getAppSetting<string[]>(
        "opus_clip_pending_projects"
      );

      if (!pendingProjects || pendingProjects.length === 0) {
        return {
          message: "No pending Opus Clip projects to process",
          processed: 0,
          scheduled: 0,
        };
      }

      const processedIds = await getProcessedProjectIds();
      const newProjects = pendingProjects.filter(
        (id) => !processedIds.includes(id)
      );

      if (newProjects.length === 0) {
        return {
          message: "All pending projects already processed",
          processed: 0,
          scheduled: 0,
        };
      }

      console.log(
        `Found ${newProjects.length} new Opus Clip project(s) to auto-schedule`
      );

      let totalScheduled = 0;
      const results = [];

      for (const projectId of newProjects) {
        try {
          console.log(`Auto-scheduling project: ${projectId}`);
          const scheduleResult = await autoScheduleProject(projectId);
          totalScheduled += scheduleResult.totalScheduled;

          await markProjectProcessed(projectId);

          results.push({
            projectId,
            clips: scheduleResult.totalClips,
            scheduled: scheduleResult.totalScheduled,
            errors: scheduleResult.errors,
          });

          console.log(
            `Project ${projectId}: ${scheduleResult.totalScheduled} posts scheduled across ${scheduleResult.totalClips} clips`
          );
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : String(err);
          console.error(
            `Error auto-scheduling project ${projectId}:`,
            errorMsg
          );
          results.push({
            projectId,
            clips: 0,
            scheduled: 0,
            errors: [errorMsg],
          });
        }
      }

      return {
        message: `Processed ${newProjects.length} project(s), ${totalScheduled} total posts scheduled`,
        processed: newProjects.length,
        scheduled: totalScheduled,
        results,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("process-uploads cron error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Cron failed",
        processed: 0,
      },
      { status: 500 }
    );
  }
}
