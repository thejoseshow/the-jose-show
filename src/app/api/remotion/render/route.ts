import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { triggerRender } from "@/lib/remotion";
import { supabase } from "@/lib/supabase";
import { validateBody, sanitizeError } from "@/lib/validation";
import { renderRequestSchema } from "@/lib/validation";
import {
  convertWordTimestampsToFrames,
  convertSegmentsToWords,
  parseSRTToSegments,
} from "@/lib/caption-frames";
import type { CompositionId, Clip } from "@/lib/types";

// POST /api/remotion/render - Trigger a Remotion Lambda render
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = validateBody(renderRequestSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error, details: validation.details },
        { status: 400 }
      );
    }

    const { composition_id, content_id, input_props } = validation.data;

    // Server-side enrichment: populate words for CaptionOverlay if empty
    if (
      composition_id === "CaptionOverlay" &&
      content_id &&
      (!input_props.words || (Array.isArray(input_props.words) && input_props.words.length === 0))
    ) {
      const { data: contentRow } = await supabase
        .from("content")
        .select("clip_id")
        .eq("id", content_id)
        .single();

      if (contentRow?.clip_id) {
        const { data: clip } = await supabase
          .from("clips")
          .select("word_timestamps, srt_captions")
          .eq("id", contentRow.clip_id)
          .single();

        if (clip) {
          const typedClip = clip as Pick<Clip, "word_timestamps" | "srt_captions">;
          if (typedClip.word_timestamps && typedClip.word_timestamps.length > 0) {
            input_props.words = convertWordTimestampsToFrames(typedClip.word_timestamps);
          } else if (typedClip.srt_captions) {
            const segments = parseSRTToSegments(typedClip.srt_captions);
            if (segments.length > 0) {
              input_props.words = convertSegmentsToWords(segments);
            }
          }
        }
      }
    }

    const job = await triggerRender({
      compositionId: composition_id as CompositionId,
      inputProps: input_props,
      contentId: content_id,
    });

    return NextResponse.json({ success: true, data: job });
  } catch (err) {
    const msg = sanitizeError(err, "remotion-render");
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
