import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// POST /api/pipeline/retry - Reset a failed video for reprocessing
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { video_id } = await request.json();
    if (!video_id) {
      return NextResponse.json({ error: "Missing video_id" }, { status: 400 });
    }

    // Fetch the video
    const { data: video, error: fetchError } = await supabase
      .from("videos")
      .select("*")
      .eq("id", video_id)
      .single();

    if (fetchError || !video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (video.status !== "failed") {
      return NextResponse.json(
        { error: `Video is not in failed status (current: ${video.status})` },
        { status: 400 }
      );
    }

    // Determine the best stage to resume from based on existing data
    let resetStatus: string;
    if (video.transcript) {
      resetStatus = "transcribed";
    } else if (video.storage_path) {
      resetStatus = "downloaded";
    } else {
      resetStatus = "new";
    }

    await supabase
      .from("videos")
      .update({
        status: resetStatus,
        error_message: null,
        retry_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", video_id);

    return NextResponse.json({
      success: true,
      video_id,
      reset_to: resetStatus,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
