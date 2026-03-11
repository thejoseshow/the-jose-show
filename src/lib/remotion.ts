import {
  renderMediaOnLambda,
  getRenderProgress,
  type RenderMediaOnLambdaOutput,
} from "@remotion/lambda/client";
import { supabase } from "./supabase";
import { SITE_URL } from "./constants";
import type { CompositionId, RenderJob } from "./types";

// ============================================================
// Remotion Lambda Client
// ============================================================

function getConfig() {
  const region = process.env.REMOTION_AWS_REGION;
  const functionName = process.env.REMOTION_FUNCTION_NAME;
  const serveUrl = process.env.REMOTION_SERVE_URL;

  if (!region || !functionName || !serveUrl) {
    throw new Error(
      "Missing Remotion config: REMOTION_AWS_REGION, REMOTION_FUNCTION_NAME, REMOTION_SERVE_URL"
    );
  }

  // Remotion Lambda reads standard AWS env vars — map our prefixed vars
  if (process.env.REMOTION_AWS_ACCESS_KEY_ID && !process.env.AWS_ACCESS_KEY_ID) {
    process.env.AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID;
  }
  if (process.env.REMOTION_AWS_SECRET_ACCESS_KEY && !process.env.AWS_SECRET_ACCESS_KEY) {
    process.env.AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
  }

  return {
    region: region as Parameters<typeof renderMediaOnLambda>[0]["region"],
    functionName,
    serveUrl,
  };
}

/**
 * Create a render job in Supabase and trigger Remotion Lambda.
 */
export async function triggerRender(params: {
  compositionId: CompositionId;
  inputProps: Record<string, unknown>;
  contentId?: string;
  durationInFrames?: number;
}): Promise<RenderJob> {
  const { compositionId, inputProps, contentId, durationInFrames } = params;
  const config = getConfig();

  // 1. Create render job record
  const { data: job, error: insertError } = await supabase
    .from("render_jobs")
    .insert({
      content_id: contentId || null,
      composition_id: compositionId,
      input_props: inputProps,
      status: "pending",
    })
    .select()
    .single();

  if (insertError || !job) {
    throw new Error(`Failed to create render job: ${insertError?.message}`);
  }

  const webhookUrl = `${SITE_URL}/api/remotion/webhook`;

  try {
    // 2. Trigger Lambda render
    const renderResult: RenderMediaOnLambdaOutput = await renderMediaOnLambda({
      region: config.region,
      functionName: config.functionName,
      serveUrl: config.serveUrl,
      composition: compositionId,
      inputProps,
      codec: "h264",
      maxRetries: 3,
      framesPerLambda: 360, // Keep concurrency low for new AWS accounts
      webhook: {
        url: webhookUrl,
        secret: process.env.REMOTION_WEBHOOK_SECRET || null,
        customData: { jobId: job.id, contentId: contentId || null },
      },
    });

    // 3. Update job with render ID
    await supabase
      .from("render_jobs")
      .update({
        render_id: renderResult.renderId,
        status: "rendering",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return { ...job, render_id: renderResult.renderId, status: "rendering" } as RenderJob;
  } catch (err) {
    // Mark job as failed
    const errorMsg = err instanceof Error ? err.message : "Lambda trigger failed";
    await supabase
      .from("render_jobs")
      .update({
        status: "failed",
        error_message: errorMsg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    throw err;
  }
}

/**
 * Check render progress from Lambda (fallback if webhook doesn't fire).
 */
export async function checkProgress(renderId: string): Promise<{
  done: boolean;
  progress: number;
  outputUrl?: string;
  errors?: string[];
}> {
  const config = getConfig();

  const progress = await getRenderProgress({
    renderId,
    bucketName: `remotion-${config.region}`,
    functionName: config.functionName,
    region: config.region,
  });

  if (progress.done) {
    return {
      done: true,
      progress: 1,
      outputUrl: progress.outputFile ?? undefined,
    };
  }

  if (progress.fatalErrorEncountered) {
    return {
      done: true,
      progress: progress.overallProgress,
      errors: progress.errors.map((e) => e.message),
    };
  }

  return {
    done: false,
    progress: progress.overallProgress,
  };
}

/**
 * Handle completed render: update job + content with output URL.
 */
export async function handleRenderComplete(params: {
  jobId: string;
  contentId: string | null;
  outputUrl: string;
}) {
  const { jobId, contentId, outputUrl } = params;

  // Update render job
  await supabase
    .from("render_jobs")
    .update({
      status: "completed",
      output_url: outputUrl,
      progress: 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  // Update content media_url if linked
  if (contentId) {
    await supabase
      .from("content")
      .update({
        media_url: outputUrl,
        render_job_id: jobId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contentId);
  }
}

/**
 * Handle failed render: update job with error.
 */
export async function handleRenderFailed(params: {
  jobId: string;
  errorMessage: string;
}) {
  await supabase
    .from("render_jobs")
    .update({
      status: "failed",
      error_message: params.errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.jobId);
}

/**
 * Convert Whisper transcript segments to word-level frames for CaptionOverlay.
 * Each segment gets split into words with proportionally distributed timing.
 */
export function convertSegmentsToWords(
  segments: Array<{ start: number; end: number; text: string }>,
  fps: number = 30
): Array<{ text: string; startFrame: number; endFrame: number }> {
  const words: Array<{ text: string; startFrame: number; endFrame: number }> = [];

  for (const segment of segments) {
    const segmentWords = segment.text.trim().split(/\s+/);
    if (segmentWords.length === 0) continue;

    const segDuration = segment.end - segment.start;
    const wordDuration = segDuration / segmentWords.length;

    for (let i = 0; i < segmentWords.length; i++) {
      const wordStart = segment.start + i * wordDuration;
      const wordEnd = wordStart + wordDuration;
      words.push({
        text: segmentWords[i],
        startFrame: Math.round(wordStart * fps),
        endFrame: Math.round(wordEnd * fps),
      });
    }
  }

  return words;
}
