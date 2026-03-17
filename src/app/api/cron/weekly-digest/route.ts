import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { withCronLog } from "@/lib/cron-logger";
import { supabase } from "@/lib/supabase";
import { generateWeeklyInsights } from "@/lib/claude";
import { notifyWeeklyDigest } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withCronLog("weekly-digest", async () => {
    // Calculate previous week's Monday
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // days since last Monday
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - daysBack - 7); // previous Monday
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

    const weekStartStr = weekStart.toISOString().split("T")[0];

    // Dedup: skip if already generated for this week
    const { data: existing } = await supabase
      .from("performance_insights")
      .select("id")
      .eq("week_start", weekStartStr)
      .single();

    if (existing) {
      return { skipped: true, week_start: weekStartStr, reason: "already_generated" };
    }

    // Fetch analytics snapshots for the week
    const { data: snapshots } = await supabase
      .from("analytics_snapshots")
      .select("content_id, platform, views, likes, comments, shares, watch_time_seconds")
      .gte("snapshot_date", weekStartStr)
      .lt("snapshot_date", weekEnd.toISOString().split("T")[0]);

    // Fetch published content for the week
    const { data: contentData } = await supabase
      .from("content")
      .select("id, title, type, platforms, published_at")
      .eq("status", "published")
      .not("published_at", "is", null)
      .gte("published_at", weekStart.toISOString())
      .lt("published_at", weekEnd.toISOString());

    const insights = await generateWeeklyInsights(
      snapshots || [],
      contentData || []
    );

    // Store in performance_insights table
    await supabase.from("performance_insights").insert({
      week_start: weekStartStr,
      insights_json: insights,
    });

    // Send email digest
    await notifyWeeklyDigest(insights).catch(console.error);

    return {
      week_start: weekStartStr,
      content_count: contentData?.length || 0,
      snapshot_count: snapshots?.length || 0,
      insights_generated: true,
    };
  });

  return NextResponse.json({ success: true, ...result });
}
