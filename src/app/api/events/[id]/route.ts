import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { updateEventSchema, sanitizeError, validateBody } from "@/lib/validation";

// GET /api/events/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data });
}

// PATCH /api/events/[id] - Update event (field-whitelisted via Zod)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const result = validateBody(updateEventSchema, body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, details: result.details },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("events")
      .update({ ...result.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      sanitizeError(error, "events:PATCH");
      return NextResponse.json({ success: false, error: "Failed to update event" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}

// DELETE /api/events/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabase.from("events").delete().eq("id", id);

  if (error) {
    sanitizeError(error, "events:DELETE");
    return NextResponse.json({ success: false, error: "Failed to delete event" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
