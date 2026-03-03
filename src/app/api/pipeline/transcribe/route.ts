import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { transcribeVideo } from "@/lib/whisper";
import { transcribeSchema, sanitizeError, validateBody } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const maxDuration = 300;

// POST /api/pipeline/transcribe - Manually trigger transcription for a video
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`transcribe:${ip}`, { maxAttempts: 5, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = validateBody(transcribeSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error },
      { status: 400 }
    );
  }

  const { video_id } = parsed.data;

  const { data: video, error } = await supabase
    .from("videos")
    .select("*")
    .eq("id", video_id)
    .single();

  if (error || !video) {
    return NextResponse.json({ success: false, error: "Video not found" }, { status: 404 });
  }

  if (!video.storage_path) {
    return NextResponse.json({ success: false, error: "Video not downloaded yet" }, { status: 400 });
  }

  await supabase.from("videos").update({ status: "transcribing" }).eq("id", video_id);

  try {
    const { data: urlData } = supabase.storage.from("clips").getPublicUrl(video.storage_path);
    const res = await fetch(urlData.publicUrl);
    const buffer = Buffer.from(await res.arrayBuffer());

    const result = await transcribeVideo(buffer, video.filename);

    await supabase
      .from("videos")
      .update({
        transcript: result.text,
        transcript_segments: result.segments,
        duration_seconds: result.duration || video.duration_seconds,
        language: result.language,
        status: "transcribed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", video_id);

    return NextResponse.json({
      success: true,
      data: {
        language: result.language,
        duration: result.duration,
        segments: result.segments.length,
        preview: result.text.slice(0, 200),
      },
    });
  } catch (err) {
    await supabase
      .from("videos")
      .update({ status: "failed", error_message: err instanceof Error ? err.message : "Unknown" })
      .eq("id", video_id);

    const msg = sanitizeError(err, "pipeline:transcribe");
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
