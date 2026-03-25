import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProcessedProjectIds, getProjectClips, getProjectDetails } from "@/lib/opus-clip";
import { getAppSetting } from "@/lib/settings";

/**
 * GET /api/opus-clip/projects
 *
 * Lists recent Opus Clip projects. Returns project info with clip counts.
 * Projects can come from the pending list or already-processed list.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Collect all known project IDs
    const pendingProjects =
      (await getAppSetting<string[]>("opus_clip_pending_projects")) || [];
    const processedProjects = await getProcessedProjectIds();

    const allProjectIds = [
      ...new Set([...pendingProjects, ...processedProjects]),
    ];

    if (allProjectIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: "No projects found. Add a project ID to get started.",
      });
    }

    // Fetch details for each project
    const projects = [];
    for (const projectId of allProjectIds.slice(-20)) {
      // Last 20 projects
      try {
        const clips = await getProjectClips(projectId);
        let name = `Project ${projectId.slice(0, 8)}`;

        try {
          const details = await getProjectDetails(projectId);
          if (details.name) name = details.name;
        } catch {
          // Project details endpoint may not always work
        }

        projects.push({
          id: projectId,
          name,
          clipCount: clips.length,
          createdAt: clips[0]?.createdAt || new Date().toISOString(),
          autoScheduled: processedProjects.includes(projectId),
        });
      } catch (err) {
        projects.push({
          id: projectId,
          name: `Project ${projectId.slice(0, 8)}`,
          clipCount: 0,
          createdAt: new Date().toISOString(),
          autoScheduled: processedProjects.includes(projectId),
          error:
            err instanceof Error ? err.message : "Failed to fetch project",
        });
      }
    }

    // Sort by createdAt descending
    projects.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ success: true, data: projects });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to fetch projects",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/opus-clip/projects
 *
 * Add a project ID to the pending list for auto-scheduling.
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

    const { setAppSetting } = await import("@/lib/settings");
    const pending =
      (await getAppSetting<string[]>("opus_clip_pending_projects")) || [];

    if (!pending.includes(projectId)) {
      pending.push(projectId);
      await setAppSetting("opus_clip_pending_projects", pending);
    }

    return NextResponse.json({
      success: true,
      message: `Project ${projectId} added to pending list`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to add project",
      },
      { status: 500 }
    );
  }
}
