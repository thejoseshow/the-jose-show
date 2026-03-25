import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  autoScheduleProject,
  getProjectClips,
  getSocialAccounts,
  cancelSchedule,
  markProjectProcessed,
} from "@/lib/opus-clip";
import { getAppSetting, setAppSetting } from "@/lib/settings";

/**
 * POST /api/opus-clip/schedule
 *
 * Manually trigger auto-scheduling for a specific Opus Clip project.
 * Body: { projectId: string }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { projectId } = body as { projectId?: string };

    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid projectId" },
        { status: 400 }
      );
    }

    const result = await autoScheduleProject(projectId);
    await markProjectProcessed(projectId);

    // Store the schedule results in app_settings for retrieval
    const scheduleKey = `opus_schedule_${projectId}`;
    await setAppSetting(scheduleKey, {
      ...result,
      scheduledAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error ? err.message : "Failed to schedule project",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/opus-clip/schedule?projectId=xxx
 *
 * Get the schedule status for a project.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projectId = request.nextUrl.searchParams.get("projectId");

    if (projectId) {
      // Get schedule for a specific project
      const scheduleKey = `opus_schedule_${projectId}`;
      const schedule = await getAppSetting<Record<string, unknown>>(
        scheduleKey
      );

      if (!schedule) {
        return NextResponse.json({
          success: true,
          data: null,
          message: "No schedule found for this project",
        });
      }

      return NextResponse.json({ success: true, data: schedule });
    }

    // No projectId: return all recent schedules
    // Collect from processed projects
    const processedIds =
      (await getAppSetting<string[]>("opus_clip_processed_projects")) || [];
    const schedules = [];

    for (const id of processedIds.slice(-10)) {
      const scheduleKey = `opus_schedule_${id}`;
      const schedule = await getAppSetting<Record<string, unknown>>(
        scheduleKey
      );
      if (schedule) {
        schedules.push({ projectId: id, ...schedule });
      }
    }

    return NextResponse.json({ success: true, data: schedules });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch schedule status",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/opus-clip/schedule?scheduleId=xxx
 *
 * Cancel a scheduled post.
 */
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const scheduleId = request.nextUrl.searchParams.get("scheduleId");

    if (!scheduleId) {
      return NextResponse.json(
        { error: "Missing scheduleId parameter" },
        { status: 400 }
      );
    }

    await cancelSchedule(scheduleId);

    return NextResponse.json({
      success: true,
      message: `Schedule ${scheduleId} cancelled`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to cancel schedule",
      },
      { status: 500 }
    );
  }
}
