import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getScheduleCalendar } from "@/lib/auto-scheduler";

// GET /api/schedule — Returns the schedule calendar (next 30 days)
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const daysParam = parseInt(url.searchParams.get("days") || "30", 10);
  const days = Math.min(Math.max(daysParam, 1), 90);

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  try {
    const calendar = await getScheduleCalendar(startDate, endDate);
    return NextResponse.json({ success: true, data: calendar });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST /api/schedule — Manual override: reschedule content to a specific time
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { contentId, scheduledAt } = body;

    if (!contentId || !scheduledAt) {
      return NextResponse.json(
        { success: false, error: "contentId and scheduledAt are required" },
        { status: 400 }
      );
    }

    const newTime = new Date(scheduledAt);
    if (isNaN(newTime.getTime())) {
      return NextResponse.json(
        { success: false, error: "Invalid scheduledAt date" },
        { status: 400 }
      );
    }

    // Verify content exists and is in a schedulable status
    const { data: content, error: fetchErr } = await supabase
      .from("content")
      .select("id, status")
      .eq("id", contentId)
      .single();

    if (fetchErr || !content) {
      return NextResponse.json(
        { success: false, error: "Content not found" },
        { status: 404 }
      );
    }

    if (!["approved", "review"].includes(content.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot reschedule content in "${content.status}" status`,
        },
        { status: 400 }
      );
    }

    // If content was in review, also approve it
    const updates: Record<string, unknown> = {
      scheduled_at: newTime.toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (content.status === "review") {
      updates.status = "approved";
    }

    const { error: updateErr } = await supabase
      .from("content")
      .update(updates)
      .eq("id", contentId);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/schedule — Remove scheduled time (content goes back to approved, unscheduled)
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const contentId = url.searchParams.get("contentId");

  if (!contentId) {
    return NextResponse.json(
      { success: false, error: "contentId is required" },
      { status: 400 }
    );
  }

  // Verify content exists and is not already published
  const { data: content, error: fetchErr } = await supabase
    .from("content")
    .select("id, status")
    .eq("id", contentId)
    .single();

  if (fetchErr || !content) {
    return NextResponse.json(
      { success: false, error: "Content not found" },
      { status: 404 }
    );
  }

  if (["published", "publishing", "partially_published"].includes(content.status)) {
    return NextResponse.json(
      { success: false, error: "Cannot unschedule published content" },
      { status: 400 }
    );
  }

  const { error: updateErr } = await supabase
    .from("content")
    .update({
      scheduled_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contentId);

  if (updateErr) {
    return NextResponse.json(
      { success: false, error: updateErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
