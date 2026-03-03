import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/pipeline/status - Get all videos with pipeline progress
export async function GET() {
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data });
}
