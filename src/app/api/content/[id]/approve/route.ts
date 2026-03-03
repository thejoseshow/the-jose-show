import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST /api/content/[id]/approve - Approve content for publishing
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verify content exists and is in review status
  const { data: content, error: fetchError } = await supabase
    .from("content")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError || !content) {
    return NextResponse.json(
      { success: false, error: "Content not found" },
      { status: 404 }
    );
  }

  if (content.status !== "review" && content.status !== "draft") {
    return NextResponse.json(
      { success: false, error: `Cannot approve content with status: ${content.status}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("content")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data });
}
