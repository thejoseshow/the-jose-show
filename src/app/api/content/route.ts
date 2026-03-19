import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createContentSchema, sanitizeError, validateBody } from "@/lib/validation";
import type { ContentStatus, Platform, DashboardStats, ContentListItem } from "@/lib/types";

// GET /api/content - List content or get stats
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Return dashboard stats
  if (searchParams.get("stats") === "true") {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [videosRes, processingRes, reviewRes, approvedRes, publishedRes, eventsRes] =
      await Promise.all([
        supabase.from("videos").select("id", { count: "exact", head: true }),
        supabase
          .from("videos")
          .select("id", { count: "exact", head: true })
          .not("status", "in", '("clipped","failed")'),
        supabase
          .from("content")
          .select("id", { count: "exact", head: true })
          .eq("status", "review"),
        supabase
          .from("content")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved"),
        supabase
          .from("content")
          .select("id", { count: "exact", head: true })
          .in("status", ["published", "partially_published"])
          .gte("published_at", weekAgo),
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .gte("start_date", now.toISOString()),
      ]);

    const stats: DashboardStats = {
      total_videos: videosRes.count ?? 0,
      processing: processingRes.count ?? 0,
      ready_for_review: (reviewRes.count ?? 0) + (approvedRes.count ?? 0),
      published_this_week: publishedRes.count ?? 0,
      upcoming_events: eventsRes.count ?? 0,
    };

    return NextResponse.json({ success: true, data: stats });
  }

  // List content
  const status = searchParams.get("status") as ContentStatus | null;
  const platform = searchParams.get("platform") as Platform | null;
  const language = searchParams.get("language");
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const sort = searchParams.get("sort") || "created_at";

  let query = supabase
    .from("content")
    .select("id, title, type, status, thumbnail_url, platforms, scheduled_at, published_at, created_at, language, variant, ab_group_id, parent_content_id, clip_id, clips(aspect_ratio, duration_seconds)", { count: "exact" })
    .order(sort, { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (platform) query = query.contains("platforms", [platform]);
  if (language) query = query.eq("language", language);

  const { data, error, count } = await query;

  if (error) {
    sanitizeError(error, "content:GET");
    return NextResponse.json(
      { success: false, error: "Failed to load content" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: (data || []) as ContentListItem[],
    total: count ?? 0,
  });
}

// POST /api/content - Create new content manually
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = validateBody(createContentSchema, body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, details: result.details },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("content")
      .insert({ ...result.data, status: "draft" })
      .select()
      .single();

    if (error) {
      sanitizeError(error, "content:POST");
      return NextResponse.json(
        { success: false, error: "Failed to create content" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
