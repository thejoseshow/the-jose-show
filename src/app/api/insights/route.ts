import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { generateWeeklyInsights } from "@/lib/claude";

// GET /api/insights?latest=true or ?limit=10
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const latest = searchParams.get("latest");
  const limit = parseInt(searchParams.get("limit") || "10", 10);

  try {
    if (latest === "true") {
      const { data } = await supabase
        .from("performance_insights")
        .select("*")
        .order("week_start", { ascending: false })
        .limit(1)
        .single();

      return NextResponse.json({ success: true, data: data || null });
    }

    const { data } = await supabase
      .from("performance_insights")
      .select("*")
      .order("week_start", { ascending: false })
      .limit(Math.min(limit, 52));

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch insights";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/insights — on-demand analysis for custom date range
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { start_date, end_date } = body;

    // Default: last 7 days
    const end = end_date ? new Date(end_date) : new Date();
    const start = start_date ? new Date(start_date) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    const { data: snapshots } = await supabase
      .from("analytics_snapshots")
      .select("content_id, platform, views, likes, comments, shares, watch_time_seconds")
      .gte("snapshot_date", startStr)
      .lte("snapshot_date", endStr);

    const { data: contentData } = await supabase
      .from("content")
      .select("id, title, type, platforms, published_at")
      .eq("status", "published")
      .not("published_at", "is", null)
      .gte("published_at", start.toISOString())
      .lte("published_at", end.toISOString());

    const insights = await generateWeeklyInsights(snapshots || [], contentData || []);

    return NextResponse.json({ success: true, data: insights });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate insights";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
