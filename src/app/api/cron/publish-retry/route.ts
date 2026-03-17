import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { publishContent } from "@/lib/publish";
import { withCronLog } from "@/lib/cron-logger";

export const maxDuration = 800;

// Retry partially published content — picks up items where some platforms failed
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronLog("publish-retry", async () => {
      // Find content that partially published (some platforms failed)
      const { data: retryContent, error } = await supabase
        .from("content")
        .select("id, title, platforms")
        .eq("status", "partially_published")
        .order("updated_at", { ascending: true })
        .limit(3);

      if (error) throw new Error(error.message);
      if (!retryContent?.length) return { retried: 0 };

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

      return { retried, total: retryContent.length, errors: errors.length > 0 ? errors : undefined };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
