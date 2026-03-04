import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createTemplateSchema, sanitizeError, validateBody } from "@/lib/validation";

// GET /api/templates - List templates
export async function GET(request: NextRequest) {
  const activeOnly = request.nextUrl.searchParams.get("active") === "true";

  let query = supabase.from("content_templates").select("*").order("name");
  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;

  if (error) {
    sanitizeError(error, "templates:GET");
    return NextResponse.json({ success: false, error: "Failed to load templates" }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// POST /api/templates - Create template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = validateBody(createTemplateSchema, body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, details: result.details },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("content_templates")
      .insert(result.data)
      .select()
      .single();

    if (error) {
      sanitizeError(error, "templates:POST");
      return NextResponse.json({ success: false, error: "Failed to create template" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
