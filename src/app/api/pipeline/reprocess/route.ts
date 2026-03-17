import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { reprocessVideo } from "@/lib/pipeline";

export const maxDuration = 800;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.video_id || typeof body.video_id !== "string") {
    return NextResponse.json({ error: "Missing video_id" }, { status: 400 });
  }

  const videoId = body.video_id;

  // Validate video exists and has a storage_path
  const { data: video, error } = await supabase
    .from("videos")
    .select("id, status, storage_path, filename")
    .eq("id", videoId)
    .single();

  if (error || !video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (!video.storage_path) {
    return NextResponse.json(
      { error: "Video has no archived raw file — cannot reprocess" },
      { status: 422 }
    );
  }

  // Guard against reprocessing in-progress videos
  const inProgressStatuses = ["downloading", "transcribing", "clipping"];
  if (inProgressStatuses.includes(video.status)) {
    return NextResponse.json(
      { error: `Video is currently ${video.status} — wait for it to finish` },
      { status: 409 }
    );
  }

  try {
    await reprocessVideo(videoId);
    return NextResponse.json({
      success: true,
      message: `Video "${video.filename}" reprocessed successfully`,
    });
  } catch (err) {
    console.error("Reprocess error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Reprocess failed" },
      { status: 500 }
    );
  }
}
