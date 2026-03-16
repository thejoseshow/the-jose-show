import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { extractClip } from "@/lib/ffmpeg";
import { getSegmentsInRange, generateSRT } from "@/lib/whisper";
import { uploadClip } from "@/lib/storage";
import { clipSchema, sanitizeError, validateBody } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { TranscriptSegment } from "@/lib/types";

export const maxDuration = 800;

// POST /api/pipeline/clip - Manually extract a clip from a video
export async function POST(request: NextRequest) {
  // Rate limit expensive operation
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`clip:${ip}`, { maxAttempts: 10, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = validateBody(clipSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error, details: parsed.details },
      { status: 400 }
    );
  }

  const { video_id, start_time, end_time, aspect_ratio, burn_captions } = parsed.data;

  const { data: video, error } = await supabase
    .from("videos")
    .select("*")
    .eq("id", video_id)
    .single();

  if (error || !video) {
    return NextResponse.json({ success: false, error: "Video not found" }, { status: 404 });
  }

  if (!video.storage_path) {
    return NextResponse.json({ success: false, error: "Video not downloaded" }, { status: 400 });
  }

  try {
    const { data: urlData } = supabase.storage.from("clips").getPublicUrl(video.storage_path);
    const res = await fetch(urlData.publicUrl);
    const videoBuffer = Buffer.from(await res.arrayBuffer());

    const segments: TranscriptSegment[] = video.transcript_segments || [];
    const clipSegments = getSegmentsInRange(segments, start_time, end_time);
    const srtContent = burn_captions ? generateSRT(clipSegments) : undefined;

    const result = await extractClip(videoBuffer, video.filename, {
      startTime: start_time,
      endTime: end_time,
      aspectRatio: aspect_ratio,
      srtContent,
    });

    const clipPath = `clips/${video_id}/${Date.now()}_clip.mp4`;
    const clipUrl = await uploadClip(clipPath, result.buffer, "video/mp4");

    const { data: clip } = await supabase
      .from("clips")
      .insert({
        video_id,
        storage_path: clipPath,
        start_time,
        end_time,
        duration_seconds: result.duration,
        aspect_ratio: result.aspectRatio,
        srt_captions: generateSRT(clipSegments),
      })
      .select()
      .single();

    return NextResponse.json({
      success: true,
      data: { clip, url: clipUrl },
    });
  } catch (err) {
    const msg = sanitizeError(err, "pipeline:clip");
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
