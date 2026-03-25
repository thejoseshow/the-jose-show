import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { publishContent } from "@/lib/publish";
import { withCronLog } from "@/lib/cron-logger";

export const maxDuration = 800;

// Retry partially published content and recover stuck "publishing" items
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronLog("publish-retry", async () => {
      // 1. Recover stuck "publishing" items — if status has been "publishing"
      //    for more than 10 minutes, something crashed. Revert to "approved"
      //    so the next publish-scheduled run can pick them up.
      const stuckThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: stuckContent, error: stuckErr } = await supabase
        .from("content")
        .select("id, title")
        .eq("status", "publishing")
        .lt("updated_at", stuckThreshold)
        .limit(10);

      if (stuckErr) throw new Error(stuckErr.message);

      let recovered = 0;
      if (stuckContent?.length) {
        for (const item of stuckContent) {
          const { error: updateErr } = await supabase
            .from("content")
            .update({ status: "approved", updated_at: new Date().toISOString() })
            .eq("id", item.id)
            .eq("status", "publishing");

          if (!updateErr) {
            recovered++;
            console.log(`Recovered stuck content: ${item.title} (${item.id})`);
          }
        }
      }

      // 2. Retry partially published content (some platforms failed)
      const { data: retryContent, error } = await supabase
        .from("content")
        .select("id, title, platforms")
        .eq("status", "partially_published")
        .order("updated_at", { ascending: true })
        .limit(3);

      if (error) throw new Error(error.message);
      if (!retryContent?.length) return { retried: 0, recovered };

      let retried = 0;
      const errors: string[] = [];

      for (const content of retryContent) {
        try {
          await publishContent(content.id, content.platforms);
          retried++;
        } catch (err) {
          errors.push(`${content.title}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }

      return {
        retried,
        recovered,
        total: retryContent.length,
        errors: errors.length > 0 ? errors : undefined,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
