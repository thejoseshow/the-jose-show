import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getPendingProjects,
  getProcessedProjectIds,
  sendToOpusClip,
} from "@/lib/opus-clip";

/**
 * GET /api/opus-clip/projects
 *
 * Lists Opus Clip projects tracked by our system.
 * Shows both pending (sent to Opus Clip, waiting for clips) and
 * completed (clips imported and processed).
 */
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pending = await getPendingProjects();
    const processedIds = await getProcessedProjectIds();

    // Build combined project list
    const projects = pending.map((p) => ({
      id: p.id,
      name: p.videoUrl
        ? `Video: ${p.videoUrl.slice(0, 60)}${p.videoUrl.length > 60 ? "..." : ""}`
        : `Project ${p.id.slice(0, 8)}`,
      videoUrl: p.videoUrl,
      clipCount: p.clipCount || 0,
      status: p.status,
      createdAt: p.createdAt,
      completedAt: p.completedAt,
      autoScheduled: processedIds.includes(p.id),
      error: p.error,
    }));

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
 * Send a video to Opus Clip for clipping via Zapier webhook.
 * Body: { videoUrl: string }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { videoUrl } = body as { videoUrl?: string };

    if (!videoUrl || typeof videoUrl !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid videoUrl" },
        { status: 400 }
      );
    }

    const { projectId } = await sendToOpusClip(videoUrl);

    return NextResponse.json({
      success: true,
      data: { projectId },
      message: `Video sent to Opus Clip for clipping (project ${projectId})`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to send to Opus Clip",
      },
      { status: 500 }
    );
  }
}
