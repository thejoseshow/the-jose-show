import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const maxDuration = 300;

// GET /api/cron/publish-scheduled - Publish approved content at scheduled time
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  // Find approved content scheduled for now or earlier
  const { data: scheduledContent, error } = await supabase
    .from("content")
    .select("id, platforms")
    .eq("status", "approved")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(5);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  if (!scheduledContent?.length) {
    return NextResponse.json({ success: true, published: 0 });
  }

  let published = 0;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  for (const content of scheduledContent) {
    try {
      // Trigger publish via internal API
      const res = await fetch(`${siteUrl}/api/content/${content.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: content.platforms }),
      });

      if (res.ok) published++;
    } catch (err) {
      console.error(`Failed to publish ${content.id}:`, err);
    }
  }

  return NextResponse.json({ success: true, published, total: scheduledContent.length });
}
