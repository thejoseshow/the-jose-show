import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/opus-clip/schedule
 *
 * Get scheduled content from our system. Shows upcoming posts
 * with their virality tier and platform info.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // Fetch upcoming scheduled content
    const { data: content, error } = await supabase
      .from("content")
      .select("id, title, status, platforms, scheduled_at, clip_id, created_at")
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", now)
      .in("status", ["approved", "publishing", "published", "partially_published"])
      .order("scheduled_at", { ascending: true })
      .limit(50);

    if (error) throw new Error(error.message);

    // Fetch virality scores for clips
    const clipIds = (content || []).map((c) => c.clip_id).filter(Boolean) as string[];
    const scoreMap = new Map<string, number | null>();

    if (clipIds.length > 0) {
      const { data: clips } = await supabase
        .from("clips")
        .select("id, opus_clip_score")
        .in("id", clipIds);

      for (const clip of clips || []) {
        scoreMap.set(clip.id, clip.opus_clip_score);
      }
    }

    // Build response
    const posts = (content || []).map((c) => {
      const score = c.clip_id ? (scoreMap.get(c.clip_id) ?? null) : null;
      let viralityTier: "hot" | "medium" | "filler" = "filler";
      if (score != null) {
        if (score >= 80) viralityTier = "hot";
        else if (score >= 50) viralityTier = "medium";
      }

      return {
        contentId: c.id,
        title: c.title,
        platforms: c.platforms,
        scheduledAt: c.scheduled_at,
        status: c.status,
        viralityRank: score ?? 0,
        viralityTier,
      };
    });

    return NextResponse.json({ success: true, data: posts });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to fetch schedule",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/opus-clip/schedule?contentId=xxx
 *
 * Remove a content item from the schedule (set scheduled_at to null).
 */
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentId = request.nextUrl.searchParams.get("contentId");
    if (!contentId) {
      return NextResponse.json(
        { error: "Missing contentId parameter" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("content")
      .update({
        scheduled_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contentId)
      .eq("status", "approved");

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      message: `Content ${contentId} unscheduled`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to unschedule",
      },
      { status: 500 }
    );
  }
}
