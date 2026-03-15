import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { updateContentSchema, sanitizeError, validateBody } from "@/lib/validation";

// GET /api/content/[id] - Get single content item
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabase
    .from("content")
    .select("*, clips(*), events(*), publish_log(*)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { success: false, error: "Content not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data });
}

// PATCH /api/content/[id] - Update content
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const result = validateBody(updateContentSchema, body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, details: result.details },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("content")
      .update({ ...result.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      sanitizeError(error, "content:PATCH");
      return NextResponse.json(
        { success: false, error: "Failed to update content" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}

// DELETE /api/content/[id] - Delete content
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabase.from("content").delete().eq("id", id);

  if (error) {
    sanitizeError(error, "content:DELETE");
    return NextResponse.json(
      { success: false, error: "Failed to delete content" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
