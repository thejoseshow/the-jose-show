import { NextRequest, NextResponse } from "next/server";
import { generateThumbnail } from "@/lib/thumbnails";
import { generateThumbnailPrompt } from "@/lib/claude";
import { uploadThumbnail } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { thumbnailSchema, sanitizeError } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const maxDuration = 120;

// POST /api/thumbnails - Generate a thumbnail for content
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`thumbnail:${ip}`, { maxAttempts: 10, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = thumbnailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "content_id or custom_prompt required" },
      { status: 400 }
    );
  }

  const { content_id, custom_prompt } = parsed.data;

  try {
    let prompt: string;

    if (custom_prompt) {
      prompt = custom_prompt;
    } else if (content_id) {
      const { data: content } = await supabase
        .from("content")
        .select("title, description, youtube_description")
        .eq("id", content_id)
        .single();

      if (!content) {
        return NextResponse.json({ success: false, error: "Content not found" }, { status: 404 });
      }

      prompt = await generateThumbnailPrompt(
        content.title,
        content.youtube_description || content.description || content.title
      );
    } else {
      return NextResponse.json(
        { success: false, error: "content_id or custom_prompt required" },
        { status: 400 }
      );
    }

    const thumbBuffer = await generateThumbnail(prompt);
    const thumbPath = `thumbnails/${content_id || "manual"}/${Date.now()}.png`;
    const thumbUrl = await uploadThumbnail(thumbPath, thumbBuffer);

    if (content_id) {
      await supabase
        .from("content")
        .update({ thumbnail_url: thumbUrl, updated_at: new Date().toISOString() })
        .eq("id", content_id);
    }

    return NextResponse.json({ success: true, data: { url: thumbUrl, prompt } });
  } catch (err) {
    const msg = sanitizeError(err, "thumbnails:POST");
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
