import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { SEED_TEMPLATES } from "@/lib/templates";

// POST /api/admin/seed-templates - Upsert the 7 built-in templates into content_templates
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let upserted = 0;

  for (const template of SEED_TEMPLATES) {
    const { error } = await supabase
      .from("content_templates")
      .upsert(template, { onConflict: "slug" });

    if (error) {
      console.error(`[seed-templates] Failed to upsert ${template.slug}:`, error.message);
      continue;
    }
    upserted++;
  }

  return NextResponse.json({ success: true, upserted, total: SEED_TEMPLATES.length });
}
