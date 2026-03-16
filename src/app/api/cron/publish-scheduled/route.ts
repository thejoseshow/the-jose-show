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

      const { data: scheduledContent, error } = await supabase
        .from("content")
        .select("id, platforms")
        .eq("status", "approved")
        .not("scheduled_at", "is", null)
        .lte("scheduled_at", now)
        .order("scheduled_at", { ascending: true })
        .limit(5);

      if (error) throw new Error(error.message);
      if (!scheduledContent?.length) return { published: 0 };

      let published = 0;
      for (const content of scheduledContent) {
        try {
          await publishContent(content.id, content.platforms);
          published++;
        } catch (err) {
          console.error(`Failed to publish ${content.id}:`, err);
        }
      }

      return { published, total: scheduledContent.length };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
