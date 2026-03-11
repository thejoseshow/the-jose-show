import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkProgress } from "@/lib/remotion";
import { supabase } from "@/lib/supabase";
import { handleRenderComplete, handleRenderFailed } from "@/lib/remotion";
import { sanitizeError } from "@/lib/validation";

// GET /api/remotion/status/[renderId] - Poll render progress (fallback)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ renderId: string }> }
) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { renderId } = await params;

    // Look up the render job
    const { data: job } = await supabase
      .from("render_jobs")
      .select("*")
      .eq("render_id", renderId)
      .single();

    if (!job) {
      return NextResponse.json(
        { success: false, error: "Render job not found" },
        { status: 404 }
      );
    }

    // If already completed/failed, return cached result
    if (job.status === "completed" || job.status === "failed") {
      return NextResponse.json({ success: true, data: job });
    }

    // Check Lambda progress
    const progress = await checkProgress(renderId);

    if (progress.done && progress.outputUrl) {
      await handleRenderComplete({
        jobId: job.id,
        contentId: job.content_id,
        outputUrl: progress.outputUrl,
      });
      return NextResponse.json({
        success: true,
        data: { ...job, status: "completed", output_url: progress.outputUrl, progress: 1 },
      });
    }

    if (progress.done && progress.errors?.length) {
      const errorMsg = progress.errors.join("; ");
      await handleRenderFailed({ jobId: job.id, errorMessage: errorMsg });
      return NextResponse.json({
        success: true,
        data: { ...job, status: "failed", error_message: errorMsg },
      });
    }

    // Update progress
    await supabase
      .from("render_jobs")
      .update({ progress: progress.progress, updated_at: new Date().toISOString() })
      .eq("id", job.id);

    return NextResponse.json({
      success: true,
      data: { ...job, progress: progress.progress },
    });
  } catch (err) {
    const msg = sanitizeError(err, "remotion-status");
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
