import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { withCronLog } from "@/lib/cron-logger";
import { notifyErrorDigest } from "@/lib/notifications";
import { checkProgress, handleRenderComplete, handleRenderFailed } from "@/lib/remotion";

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withCronLog("error-digest", async () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Failed videos in the last 24h
    const { data: failedVideos } = await supabase
      .from("videos")
      .select("id, filename, error_message, retry_count, updated_at")
      .eq("status", "failed")
      .gte("updated_at", oneDayAgo);

    // Failed publish attempts in the last 24h
    const { data: failedPublishes } = await supabase
      .from("publish_log")
      .select("id, content_id, platform, error_message, created_at")
      .eq("status", "failed")
      .gte("created_at", oneDayAgo);

    // Failed cron jobs in the last 24h
    const { data: failedCrons } = await supabase
      .from("cron_logs")
      .select("id, job_name, error, started_at")
      .eq("status", "error")
      .gte("started_at", oneDayAgo);

    // Check for stalled render jobs (rendering > 1 hour = likely webhook missed)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: stalledRenders } = await supabase
      .from("render_jobs")
      .select("id, render_id, content_id")
      .eq("status", "rendering")
      .lt("updated_at", oneHourAgo);

    let rendersRecovered = 0;
    for (const render of stalledRenders || []) {
      if (!render.render_id) continue;
      try {
        const progress = await checkProgress(render.render_id);
        if (progress.done && progress.outputUrl) {
          await handleRenderComplete({ jobId: render.id, contentId: render.content_id, outputUrl: progress.outputUrl });
          rendersRecovered++;
        } else if (progress.done && progress.errors?.length) {
          await handleRenderFailed({ jobId: render.id, errorMessage: progress.errors.join("; ") });
        }
      } catch {
        // Remotion Lambda might not be configured — skip silently
      }
    }

    const totalErrors =
      (failedVideos?.length || 0) +
      (failedPublishes?.length || 0) +
      (failedCrons?.length || 0);

    if (totalErrors === 0) {
      return { errors: 0 };
    }

    await notifyErrorDigest({
      failedVideos: failedVideos || [],
      failedPublishes: failedPublishes || [],
      failedCrons: failedCrons || [],
    }).catch(console.error);

    return {
      errors: totalErrors,
      pipeline_failures: failedVideos?.length || 0,
      publish_failures: failedPublishes?.length || 0,
      cron_failures: failedCrons?.length || 0,
      stalled_renders_recovered: rendersRecovered,
    };
  });

  return NextResponse.json({ success: true, ...result });
}
