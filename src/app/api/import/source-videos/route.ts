import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/import/source-videos — List source videos
 * POST /api/import/source-videos — Create a source video record
 */

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const { data, error, count } = await supabase
    .from("source_videos")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: data || [],
    total: count || 0,
  });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, source_type, google_drive_file_id, filename, duration_seconds, notes } =
      body as {
        title?: string;
        source_type?: string;
        google_drive_file_id?: string;
        filename?: string;
        duration_seconds?: number;
        notes?: string;
      };

    if (!source_type || !["phone", "ecamm", "livestream", "other"].includes(source_type)) {
      return NextResponse.json(
        { error: "source_type must be one of: phone, ecamm, livestream, other" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("source_videos")
      .insert({
        title: title || null,
        source_type,
        google_drive_file_id: google_drive_file_id || null,
        filename: filename || null,
        duration_seconds: duration_seconds || null,
        notes: notes || null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to create source video",
      },
      { status: 500 }
    );
  }
}
