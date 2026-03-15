import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { z } from "zod";
import { validateBody } from "@/lib/validation";

const bulkApproveSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});

// POST /api/content/approve-bulk - Approve multiple content items
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = validateBody(bulkApproveSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error, details: parsed.details },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("content")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .in("id", parsed.data.ids)
    .in("status", ["draft", "review"])
    .select("id");

  if (error) {
    return NextResponse.json({ success: false, error: "Failed to approve content" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    approved: data?.length || 0,
    total: parsed.data.ids.length,
  });
}
