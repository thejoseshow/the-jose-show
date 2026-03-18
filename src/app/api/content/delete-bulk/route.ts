import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { z } from "zod";
import { validateBody } from "@/lib/validation";

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});

// POST /api/content/delete-bulk - Delete multiple non-published content items
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = validateBody(bulkDeleteSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error, details: parsed.details },
      { status: 400 }
    );
  }

  // Only delete non-published content (guard against deleting published content)
  const { data, error } = await supabase
    .from("content")
    .delete()
    .in("id", parsed.data.ids)
    .not("status", "in", '("published","partially_published")')
    .select("id");

  if (error) {
    return NextResponse.json({ success: false, error: "Failed to delete content" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    deleted: data?.length || 0,
    total: parsed.data.ids.length,
  });
}
