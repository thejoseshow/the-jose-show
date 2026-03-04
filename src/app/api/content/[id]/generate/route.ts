import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getTemplateById } from "@/lib/templates";
import { generateTemplatedCopy } from "@/lib/claude";
import { sanitizeError } from "@/lib/validation";
import type { Content, Platform } from "@/lib/types";

// POST /api/content/[id]/generate - Generate copy from a template
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { template_id, additional_context } = body as {
      template_id: string;
      additional_context?: string;
    };

    if (!template_id) {
      return NextResponse.json(
        { success: false, error: "template_id is required" },
        { status: 400 }
      );
    }

    // Fetch content
    const { data: content, error: contentErr } = await supabase
      .from("content")
      .select("*")
      .eq("id", id)
      .single();

    if (contentErr || !content) {
      return NextResponse.json({ success: false, error: "Content not found" }, { status: 404 });
    }

    const c = content as Content;
    if (c.status === "published") {
      return NextResponse.json(
        { success: false, error: "Cannot generate copy for published content" },
        { status: 400 }
      );
    }

    // Fetch template
    const template = await getTemplateById(template_id);
    if (!template) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    // Generate copy
    const copy = await generateTemplatedCopy(
      c.title,
      c.platforms as Platform[],
      {
        promptHint: template.prompt_hint,
        hashtags: template.hashtags,
        prefix: template.prefix,
        description: template.description,
      },
      additional_context
    );

    // Update content with generated copy and template_id
    const { data: updated, error: updateErr } = await supabase
      .from("content")
      .update({
        youtube_title: copy.youtube_title,
        youtube_description: copy.youtube_description,
        youtube_tags: copy.youtube_tags,
        facebook_text: copy.facebook_text,
        instagram_caption: copy.instagram_caption,
        tiktok_caption: copy.tiktok_caption,
        template_id: template.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      sanitizeError(updateErr, "content:generate");
      return NextResponse.json({ success: false, error: "Failed to update content" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    sanitizeError(err, "content:generate");
    return NextResponse.json(
      { success: false, error: "Failed to generate copy" },
      { status: 500 }
    );
  }
}
