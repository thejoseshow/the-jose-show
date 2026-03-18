import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { publishContent } from "@/lib/publish";
import { withCronLog } from "@/lib/cron-logger";

export const maxDuration = 800;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronLog("publish-scheduled", async () => {
      const now = new Date().toISOString();

      // Fetch approved content: scheduled items due now + unscheduled items (publish ASAP)
      const { data: scheduledContent, error: schedErr } = await supabase
        .from("content")
        .select("id, platforms")
        .eq("status", "approved")
        .not("scheduled_at", "is", null)
        .lte("scheduled_at", now)
        .order("scheduled_at", { ascending: true })
        .limit(5);

      const { data: unscheduledContent, error: unschedErr } = await supabase
        .from("content")
        .select("id, platforms")
        .eq("status", "approved")
        .is("scheduled_at", null)
        .not("media_url", "is", null)
        .order("created_at", { ascending: true })
        .limit(3);

      if (schedErr) throw new Error(schedErr.message);
      if (unschedErr) throw new Error(unschedErr.message);

      const allContent = [...(scheduledContent || []), ...(unscheduledContent || [])];
      if (!allContent.length) return { published: 0 };

      let published = 0;
      for (const content of allContent) {
        try {
          await publishContent(content.id, content.platforms);
          published++;
        } catch (err) {
          console.error(`Failed to publish ${content.id}:`, err);
        }
      }

      return { published, total: allContent.length };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
