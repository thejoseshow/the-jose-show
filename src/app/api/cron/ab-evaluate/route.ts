import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getAppSetting } from "@/lib/settings";

export const maxDuration = 60;

// GET /api/cron/ab-evaluate - Evaluate A/B tests and pick winners
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const abTestDays = parseInt((await getAppSetting<string>("ab_test_days")) || "3", 10);
    const cutoff = new Date(Date.now() - abTestDays * 24 * 60 * 60 * 1000).toISOString();

    // Find variant A content that was published long enough ago and hasn't been decided
    const { data: variantAs } = await supabase
      .from("content")
      .select("id, ab_group_id, published_at")
      .eq("variant", "A")
      .not("ab_group_id", "is", null)
      .is("ab_decided_at", null)
      .in("status", ["published", "partially_published"])
      .lt("published_at", cutoff);

    if (!variantAs || variantAs.length === 0) {
      return NextResponse.json({ success: true, evaluated: 0 });
    }

    let evaluated = 0;

    for (const variantA of variantAs) {
      // Get analytics for variant A
      const { data: aAnalytics } = await supabase
        .from("analytics_snapshots")
        .select("views, likes, comments, shares")
        .eq("content_id", variantA.id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .single();

      const aEngagement = aAnalytics
        ? (aAnalytics.likes + aAnalytics.comments + aAnalytics.shares) / Math.max(aAnalytics.views, 1) * 100
        : 0;

      // Mark variant A as winner (since it was published and B wasn't)
      const now = new Date().toISOString();
      await supabase
        .from("content")
        .update({ ab_winner: true, ab_decided_at: now })
        .eq("id", variantA.id);

      // Mark variant B as non-winner
      await supabase
        .from("content")
        .update({ ab_winner: false, ab_decided_at: now })
        .eq("ab_group_id", variantA.ab_group_id)
        .eq("variant", "B");

      evaluated++;
      console.log(`A/B test evaluated: group ${variantA.ab_group_id}, A engagement: ${aEngagement.toFixed(1)}%`);
    }

    return NextResponse.json({ success: true, evaluated });
  } catch (err) {
    console.error("A/B evaluate error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
