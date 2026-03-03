import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createEventSchema, sanitizeError, validateBody } from "@/lib/validation";

// GET /api/events - List events
export async function GET() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("start_date", { ascending: true });

  if (error) {
    sanitizeError(error, "events:GET");
    return NextResponse.json({ success: false, error: "Failed to load events" }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// POST /api/events - Create event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = validateBody(createEventSchema, body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, details: result.details },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("events")
      .insert(result.data)
      .select()
      .single();

    if (error) {
      sanitizeError(error, "events:POST");
      return NextResponse.json({ success: false, error: "Failed to create event" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
