// ============================================================
// The Jose Show - Virality-Based Auto-Scheduling Engine
// ============================================================
//
// Schedules content based on Opus Clip virality scores:
//   HOT (80-100):    Publish ASAP at next optimal time slot
//   MEDIUM (50-79):  Schedule within 1-3 days at optimal times
//   FILLER (0-49):   Spread across the rest of the month as filler
//
// Settings keys (app_settings table):
//   virality_hot_threshold:      80
//   virality_medium_threshold:   50
//   max_posts_per_day:           3
//   auto_schedule_by_virality:   true

import { supabase } from "./supabase";
import { getAppSetting } from "./settings";
import { getOptimalPostingTimes } from "./optimal-times";
import type { Platform } from "./types";

// --- Types ---

export type ViralityPriority = "hot" | "medium" | "filler";

export interface ScheduleResult {
  contentId: string;
  scheduledAt: Date;
  priority: ViralityPriority;
  reason: string;
}

export interface CalendarEntry {
  contentId: string;
  title: string;
  scheduledAt: string;
  priority: ViralityPriority;
  status: string;
  platforms: Platform[];
  viralityScore: number | null;
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  entries: CalendarEntry[];
}

// --- Settings helpers ---

async function getThresholds() {
  const hot = (await getAppSetting<number>("virality_hot_threshold")) ?? 80;
  const medium = (await getAppSetting<number>("virality_medium_threshold")) ?? 50;
  const maxPerDay = (await getAppSetting<number>("max_posts_per_day")) ?? 3;
  return { hot, medium, maxPerDay };
}

function classifyScore(
  score: number | null,
  hotThreshold: number,
  mediumThreshold: number
): ViralityPriority {
  if (score == null) return "filler";
  if (score >= hotThreshold) return "hot";
  if (score >= mediumThreshold) return "medium";
  return "filler";
}

// --- Scheduled times collision check ---

/**
 * Fetch all future scheduled_at times for approved/publishing/published content.
 */
async function getScheduledTimes(): Promise<Date[]> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("content")
    .select("scheduled_at")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", now)
    .in("status", ["approved", "publishing", "published", "partially_published"]);

  return (data || [])
    .filter((r) => r.scheduled_at)
    .map((r) => new Date(r.scheduled_at));
}

/**
 * Check if a candidate time is at least `gapMs` away from all existing times.
 */
function hasCollision(candidate: Date, existing: Date[], gapMs: number): boolean {
  return existing.some(
    (t) => Math.abs(candidate.getTime() - t.getTime()) < gapMs
  );
}

/**
 * Count how many posts are scheduled on a specific date.
 */
function countOnDate(date: Date, scheduled: Date[]): number {
  const day = date.toISOString().slice(0, 10);
  return scheduled.filter((t) => t.toISOString().slice(0, 10) === day).length;
}

// --- Optimal time slot finder ---

/**
 * Build a list of candidate time slots starting from `fromDate` for `days` days,
 * using optimal posting times from analytics.
 */
async function buildCandidateSlots(
  fromDate: Date,
  days: number
): Promise<Date[]> {
  const optimalTimes = await getOptimalPostingTimes();

  // Extract unique hours from optimal times, fallback to defaults
  const hours =
    optimalTimes.length > 0
      ? [...new Set(optimalTimes.map((t) => t.hour))].sort((a, b) => a - b)
      : [11, 14, 18, 19];

  const slots: Date[] = [];
  for (let d = 0; d < days; d++) {
    for (const hour of hours) {
      const slot = new Date(fromDate);
      slot.setDate(slot.getDate() + d);
      slot.setUTCHours(hour, 0, 0, 0);
      if (slot > fromDate) {
        slots.push(slot);
      }
    }
  }
  return slots;
}

/**
 * Find the next available slot that has no collision and respects daily cap.
 */
function findAvailableSlot(
  candidates: Date[],
  scheduled: Date[],
  maxPerDay: number,
  minGapMs: number = 2 * 60 * 60 * 1000 // 2 hours
): Date | null {
  for (const slot of candidates) {
    if (hasCollision(slot, scheduled, minGapMs)) continue;
    if (countOnDate(slot, scheduled) >= maxPerDay) continue;
    return slot;
  }
  return null;
}

// --- Core Functions ---

/**
 * Auto-approve content in 'review' status if its clip's opus_clip_score
 * meets or exceeds the auto_approve_threshold.
 *
 * The threshold setting uses a 1-10 scale; Opus scores use 0-100.
 * Threshold 7 maps to score 70.
 */
export async function autoApproveContent(): Promise<number> {
  const autoApproveEnabled = await getAppSetting<boolean>("auto_approve_pipeline");
  if (!autoApproveEnabled) return 0;

  const thresholdSetting = (await getAppSetting<number>("auto_approve_threshold")) ?? 7;
  const minScore = thresholdSetting * 10; // 1-10 scale → 0-100

  // Get content in review with a clip_id
  const { data: reviewContent } = await supabase
    .from("content")
    .select("id, clip_id")
    .eq("status", "review")
    .not("clip_id", "is", null);

  if (!reviewContent || reviewContent.length === 0) return 0;

  const clipIds = reviewContent.map((c) => c.clip_id).filter(Boolean) as string[];
  if (clipIds.length === 0) return 0;

  // Fetch opus_clip_score for each clip
  const { data: clips } = await supabase
    .from("clips")
    .select("id, opus_clip_score")
    .in("id", clipIds);

  const scoreMap = new Map<string, number | null>();
  for (const clip of clips || []) {
    scoreMap.set(clip.id, clip.opus_clip_score);
  }

  let approved = 0;
  for (const content of reviewContent) {
    const score = scoreMap.get(content.clip_id!);
    if (score != null && score >= minScore) {
      await supabase
        .from("content")
        .update({
          status: "approved",
          updated_at: new Date().toISOString(),
        })
        .eq("id", content.id)
        .eq("status", "review"); // guard against race

      approved++;
    }
  }

  return approved;
}

/**
 * Schedule all approved content that has no scheduled_at.
 * Assigns times based on virality priority tiers.
 */
export async function autoScheduleContent(): Promise<ScheduleResult[]> {
  const viralityEnabled = await getAppSetting<boolean>("auto_schedule_by_virality");
  if (viralityEnabled === false) {
    // Also check the older auto_schedule_enabled flag
    const legacyEnabled = await getAppSetting<boolean>("auto_schedule_enabled");
    if (!legacyEnabled) return [];
  }

  const { hot: hotThreshold, medium: mediumThreshold, maxPerDay } =
    await getThresholds();

  // Fetch approved content without a scheduled time
  const { data: unscheduled } = await supabase
    .from("content")
    .select("id, clip_id, platforms, title")
    .eq("status", "approved")
    .is("scheduled_at", null)
    .not("media_url", "is", null)
    .order("created_at", { ascending: true });

  if (!unscheduled || unscheduled.length === 0) return [];

  // Fetch virality scores for all clips
  const clipIds = unscheduled
    .map((c) => c.clip_id)
    .filter(Boolean) as string[];
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

  // Classify each content item
  const classified = unscheduled.map((c) => ({
    ...c,
    score: c.clip_id ? (scoreMap.get(c.clip_id) ?? null) : null,
    priority: classifyScore(
      c.clip_id ? (scoreMap.get(c.clip_id) ?? null) : null,
      hotThreshold,
      mediumThreshold
    ),
  }));

  // Sort: hot first, then medium, then filler
  const priorityOrder: Record<ViralityPriority, number> = { hot: 0, medium: 1, filler: 2 };
  classified.sort((a, b) => {
    const diff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (diff !== 0) return diff;
    // Within same tier, higher score first
    return (b.score ?? 0) - (a.score ?? 0);
  });

  const now = new Date();
  const scheduled = await getScheduledTimes();
  const results: ScheduleResult[] = [];

  // Build candidate slots for different tiers
  const hotCandidates = await buildCandidateSlots(now, 2); // today + tomorrow
  const mediumCandidates = await buildCandidateSlots(
    new Date(now.getTime() + 24 * 60 * 60 * 1000), // start from tomorrow
    3
  );

  // Filler: rest of month + next 2 weeks
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDays = daysInMonth - now.getDate();
  const fillerDays = Math.max(remainingDays, 14); // at least 14 days out
  const fillerCandidates = await buildCandidateSlots(
    new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // start 3 days out
    fillerDays
  );

  for (const item of classified) {
    let slot: Date | null = null;
    let reason = "";

    switch (item.priority) {
      case "hot":
        slot = findAvailableSlot(hotCandidates, scheduled, maxPerDay);
        reason = `Hot clip (score ${item.score}) — scheduled at next available optimal slot`;
        break;

      case "medium":
        slot = findAvailableSlot(mediumCandidates, scheduled, maxPerDay);
        reason = `Medium clip (score ${item.score}) — scheduled 1-3 days out`;
        break;

      case "filler":
        slot = findAvailableSlot(fillerCandidates, scheduled, maxPerDay);
        reason = `Filler clip (score ${item.score ?? "none"}) — filling calendar gaps`;
        break;
    }

    if (!slot) {
      // Fallback: find any open slot in the next 30 days
      const fallbackCandidates = await buildCandidateSlots(now, 30);
      slot = findAvailableSlot(fallbackCandidates, scheduled, maxPerDay);
    }

    if (!slot) continue; // no available slot found

    // Update the content record
    await supabase
      .from("content")
      .update({
        scheduled_at: slot.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    // Track this slot so subsequent items don't collide
    scheduled.push(slot);

    results.push({
      contentId: item.id,
      scheduledAt: slot,
      priority: item.priority,
      reason,
    });
  }

  return results;
}

/**
 * Returns a map of dates to scheduled content for the dashboard calendar.
 */
export async function getScheduleCalendar(
  startDate: Date,
  endDate: Date
): Promise<CalendarDay[]> {
  const { hot: hotThreshold, medium: mediumThreshold } = await getThresholds();

  // Fetch scheduled content in range
  const { data: content } = await supabase
    .from("content")
    .select("id, title, status, platforms, scheduled_at, clip_id")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", startDate.toISOString())
    .lte("scheduled_at", endDate.toISOString())
    .in("status", ["approved", "publishing", "published", "partially_published"])
    .order("scheduled_at", { ascending: true });

  if (!content || content.length === 0) return [];

  // Fetch virality scores
  const clipIds = content.map((c) => c.clip_id).filter(Boolean) as string[];
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

  // Group by date
  const dayMap = new Map<string, CalendarEntry[]>();

  for (const c of content) {
    const dateKey = c.scheduled_at!.slice(0, 10);
    const score = c.clip_id ? (scoreMap.get(c.clip_id) ?? null) : null;

    const entry: CalendarEntry = {
      contentId: c.id,
      title: c.title,
      scheduledAt: c.scheduled_at!,
      priority: classifyScore(score, hotThreshold, mediumThreshold),
      status: c.status,
      platforms: c.platforms,
      viralityScore: score,
    };

    const existing = dayMap.get(dateKey) || [];
    existing.push(entry);
    dayMap.set(dateKey, existing);
  }

  // Build result array
  const result: CalendarDay[] = [];
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);

  while (cursor <= end) {
    const dateKey = cursor.toISOString().slice(0, 10);
    result.push({
      date: dateKey,
      entries: dayMap.get(dateKey) || [],
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

/**
 * Rebalance the schedule when new high-virality content arrives.
 * Bumps lower-priority content later to make room for hot content.
 */
export async function rebalanceSchedule(): Promise<number> {
  const { hot: hotThreshold, medium: mediumThreshold, maxPerDay } =
    await getThresholds();

  const now = new Date();
  const twoDaysOut = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  // Fetch all scheduled-but-unpublished content in the next 2 days
  const { data: upcoming } = await supabase
    .from("content")
    .select("id, clip_id, scheduled_at, platforms")
    .eq("status", "approved")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", twoDaysOut.toISOString())
    .order("scheduled_at", { ascending: true });

  if (!upcoming || upcoming.length === 0) return 0;

  // Get scores
  const clipIds = upcoming.map((c) => c.clip_id).filter(Boolean) as string[];
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

  // Find lower-priority items in the next 2 days that could be bumped
  const bumpable = upcoming
    .map((c) => ({
      ...c,
      score: c.clip_id ? (scoreMap.get(c.clip_id) ?? null) : null,
      priority: classifyScore(
        c.clip_id ? (scoreMap.get(c.clip_id) ?? null) : null,
        hotThreshold,
        mediumThreshold
      ),
    }))
    .filter((c) => c.priority === "filler" || c.priority === "medium");

  if (bumpable.length === 0) return 0;

  // Check if any day in the next 2 days is over the max
  const scheduled = await getScheduledTimes();
  let bumped = 0;

  // Build later candidate slots (3-14 days out)
  const laterCandidates = await buildCandidateSlots(
    new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
    14
  );

  // Sort bumpable: filler first (lowest priority bumped first)
  bumpable.sort((a, b) => {
    if (a.priority === "filler" && b.priority === "medium") return -1;
    if (a.priority === "medium" && b.priority === "filler") return 1;
    return (a.score ?? 0) - (b.score ?? 0);
  });

  for (const item of bumpable) {
    const itemDate = new Date(item.scheduled_at!);
    const dayCount = countOnDate(itemDate, scheduled);

    // Only bump if the day is at or over capacity
    if (dayCount <= maxPerDay) continue;

    const newSlot = findAvailableSlot(laterCandidates, scheduled, maxPerDay);
    if (!newSlot) continue;

    await supabase
      .from("content")
      .update({
        scheduled_at: newSlot.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    // Update tracked times
    const idx = scheduled.findIndex(
      (t) => t.getTime() === itemDate.getTime()
    );
    if (idx >= 0) scheduled.splice(idx, 1);
    scheduled.push(newSlot);

    bumped++;
  }

  return bumped;
}
