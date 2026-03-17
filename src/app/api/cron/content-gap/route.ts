import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { withCronLog } from "@/lib/cron-logger";
import { notifyContentGap } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withCronLog("content-gap", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // Check if any content was published in the last 3 days
    const { data: recentContent, error } = await supabase
      .from("content")
      .select("id")
      .eq("status", "published")
      .gte("published_at", threeDaysAgo)
      .limit(1);

    if (error) throw new Error(error.message);

    if (recentContent && recentContent.length > 0) {
      return { gap_detected: false };
    }

    // Check if there's content in the queue (review/approved) that could be published
    const { data: queuedContent } = await supabase
      .from("content")
      .select("id, status")
      .in("status", ["review", "approved"])
      .limit(10);

    // Check if there are new videos waiting to be processed
    const { data: pendingVideos } = await supabase
      .from("videos")
      .select("id")
      .in("status", ["new", "downloaded", "transcribed"])
      .limit(5);

    const queueCount = queuedContent?.length || 0;
    const pendingCount = pendingVideos?.length || 0;

    // Check if we already sent a gap alert today (dedup via cron_logs)
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: todayLog } = await supabase
      .from("cron_logs")
      .select("id")
      .eq("job_name", "content-gap")
      .gte("started_at", todayStr)
      .limit(2);

    // Only alert if this is the first run today (dedup)
    if (!todayLog || todayLog.length <= 1) {
      await notifyContentGap(queueCount, pendingCount).catch(console.error);
    }

    return { gap_detected: true, queued_content: queueCount, pending_videos: pendingCount };
  });

  return NextResponse.json({ success: true, ...result });
}
