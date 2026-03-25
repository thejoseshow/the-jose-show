// ============================================================
// The Jose Show - Opus Clip API Client
// ============================================================
//
// Integrates with the Opus Clip API to fetch projects, clips,
// and schedule posts across connected social platforms.
// Uses virality ranking from Opus's internal quality sorting.
//
// Env var: OPUS_CLIP_API_KEY

import { getAppSetting } from "./settings";
import { getOptimalPostingTimes } from "./optimal-times";

// --- Types ---

export interface OpusClipProject {
  id: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  clipCount?: number;
}

export interface OpusClipClip {
  id: string;
  projectId: string;
  title: string;
  description: string;
  text: string;
  hashtags: string[];
  keywords: string[];
  genre?: string;
  subgenre?: string;
  durationMs: number;
  uriForPreview: string;
  uriForExport: string;
  timeRanges?: unknown;
  createdAt: string;
  updatedAt: string;
  renderPref?: unknown;
  // Computed field: position-based virality rank (100 = best)
  viralityRank: number;
}

export interface OpusSocialAccount {
  postAccountId: string;
  subAccountId?: string;
  platform: string;
  extUserId: string;
  extUserName: string;
  extUserPictureLink?: string;
  extUserProfileLink?: string;
}

export interface OpusPostDetail {
  title: string;
  mediaType?: string;
  custom?: {
    description?: string;
    privacy?: string;
  };
}

export interface OpusScheduleResult {
  scheduleId: string;
}

export interface OpusSocialCopyResult {
  jobId: string;
  title?: string;
  description?: string;
  hashtags?: string[];
}

export type ViralityTier = "hot" | "medium" | "filler";

export interface ScheduledPostEntry {
  clipId: string;
  clipTitle: string;
  platform: string;
  accountName: string;
  scheduledAt: string;
  viralityRank: number;
  viralityTier: ViralityTier;
  scheduleId?: string;
}

export interface AutoScheduleResult {
  projectId: string;
  totalClips: number;
  totalScheduled: number;
  posts: ScheduledPostEntry[];
  errors: string[];
}

// --- Base Fetch ---

const OPUS_API_BASE = "https://api.opus.pro";

function getApiKey(): string {
  const key = process.env.OPUS_CLIP_API_KEY;
  if (!key) throw new Error("Missing OPUS_CLIP_API_KEY environment variable");
  return key;
}

export async function opusFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${OPUS_API_BASE}${path}`;
  const apiKey = getApiKey();

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Opus Clip API error ${res.status} on ${path}: ${text.slice(0, 200)}`
    );
  }

  return res.json();
}

// --- Social Accounts ---

export async function getSocialAccounts(): Promise<OpusSocialAccount[]> {
  const res = await opusFetch<{ data: OpusSocialAccount[] }>(
    "/api/social-accounts?q=mine"
  );
  return res.data || [];
}

// --- Projects & Clips ---

export async function getProjectClips(
  projectId: string
): Promise<OpusClipClip[]> {
  const res = await opusFetch<{ data: RawClip[] }>(
    `/api/exportable-clips?projectId=${encodeURIComponent(projectId)}`
  );

  const rawClips = res.data || [];

  // Clips are returned sorted by Opus's internal quality ranking.
  // First clip = best/most viral. We assign a computed viralityRank.
  return rawClips.map((clip, index) => ({
    id: clip.id,
    projectId: clip.projectId,
    title: clip.title || "",
    description: clip.description || "",
    text: clip.text || "",
    hashtags: clip.hashtags || [],
    keywords: clip.keywords || [],
    genre: clip.genre,
    subgenre: clip.subgenre,
    durationMs: clip.durationMs || 0,
    uriForPreview: clip.uriForPreview || "",
    uriForExport: clip.uriForExport || "",
    timeRanges: clip.timeRanges,
    createdAt: clip.createdAt || "",
    updatedAt: clip.updatedAt || "",
    renderPref: clip.renderPref,
    viralityRank: Math.max(10, 100 - index * 5),
  }));
}

// Raw clip shape from the API (before we add viralityRank)
interface RawClip {
  id: string;
  projectId: string;
  title?: string;
  description?: string;
  text?: string;
  hashtags?: string[];
  keywords?: string[];
  genre?: string;
  subgenre?: string;
  durationMs?: number;
  uriForPreview?: string;
  uriForExport?: string;
  timeRanges?: unknown;
  createdAt?: string;
  updatedAt?: string;
  renderPref?: unknown;
}

export async function getProjectDetails(
  projectId: string
): Promise<OpusClipProject> {
  const res = await opusFetch<{ data: OpusClipProject }>(
    `/api/clip-projects/${encodeURIComponent(projectId)}`
  );
  return res.data;
}

// --- Social Copy Generation ---

export async function generateSocialCopy(
  projectId: string,
  clipId: string,
  postAccountId: string,
  subAccountId?: string
): Promise<OpusSocialCopyResult> {
  // Start the job
  const startRes = await opusFetch<{ data: { jobId: string } }>(
    "/api/social-copy-jobs",
    {
      method: "POST",
      body: JSON.stringify({
        projectId,
        clipId,
        postAccountId,
        ...(subAccountId ? { subAccountId } : {}),
      }),
    }
  );

  const jobId = startRes.data.jobId;

  // Poll until done (max 30 seconds)
  const maxAttempts = 15;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);

    const pollRes = await opusFetch<{
      data: {
        status: string;
        title?: string;
        description?: string;
        hashtags?: string[];
      };
    }>(`/api/social-copy-jobs/${jobId}`);

    if (pollRes.data.status === "completed" || pollRes.data.status === "done") {
      return {
        jobId,
        title: pollRes.data.title,
        description: pollRes.data.description,
        hashtags: pollRes.data.hashtags,
      };
    }

    if (pollRes.data.status === "failed" || pollRes.data.status === "error") {
      throw new Error(`Social copy generation failed for job ${jobId}`);
    }
  }

  throw new Error(`Social copy generation timed out for job ${jobId}`);
}

// --- Publishing ---

export async function publishNow(
  projectId: string,
  clipId: string,
  postAccountId: string,
  subAccountId: string | undefined,
  postDetail: OpusPostDetail
): Promise<void> {
  await opusFetch("/api/post-tasks", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      clipId,
      postAccountId,
      ...(subAccountId ? { subAccountId } : {}),
      postDetail,
    }),
  });
}

export async function schedulePost(
  projectId: string,
  clipId: string,
  postAccountId: string,
  subAccountId: string | undefined,
  publishAt: string, // ISO 8601 UTC
  postDetail: OpusPostDetail
): Promise<OpusScheduleResult> {
  const res = await opusFetch<{ data: { scheduleId: string } }>(
    "/api/publish-schedules",
    {
      method: "POST",
      body: JSON.stringify({
        projectId,
        clipId,
        postAccountId,
        ...(subAccountId ? { subAccountId } : {}),
        publishAt,
        postDetail,
      }),
    }
  );

  return { scheduleId: res.data.scheduleId };
}

export async function cancelSchedule(scheduleId: string): Promise<void> {
  await opusFetch(`/api/publish-schedules/${encodeURIComponent(scheduleId)}`, {
    method: "DELETE",
  });
}

// --- Virality Tier Classification ---

export async function getViralityThresholds(): Promise<{
  hot: number;
  medium: number;
}> {
  const hot =
    (await getAppSetting<number>("virality_hot_threshold")) ?? 80;
  const medium =
    (await getAppSetting<number>("virality_medium_threshold")) ?? 50;
  return { hot, medium };
}

export function classifyViralityTier(
  rank: number,
  hotThreshold: number,
  mediumThreshold: number
): ViralityTier {
  if (rank >= hotThreshold) return "hot";
  if (rank >= mediumThreshold) return "medium";
  return "filler";
}

// --- Schedule Time Calculation ---

async function calculateScheduleTime(
  tier: ViralityTier,
  index: number,
  platformCount: number
): Promise<Date> {
  const now = new Date();
  const optimalTimes = await getOptimalPostingTimes();
  const defaultHours = [11, 14, 18, 19];
  const hours =
    optimalTimes.length > 0
      ? [...new Set(optimalTimes.map((t) => t.hour))].sort((a, b) => a - b)
      : defaultHours;

  // Offset within the day: spread across optimal time slots
  const slotIndex = (index * platformCount) % hours.length;
  const targetHour = hours[slotIndex] ?? 14;

  let daysOut: number;

  switch (tier) {
    case "hot":
      // Schedule within hours: today or tomorrow at the next optimal slot
      daysOut = 0;
      break;
    case "medium":
      // Schedule 1-3 days out, spread evenly
      daysOut = 1 + (index % 3);
      break;
    case "filler":
      // Spread across the rest of the month: 4+ days out
      daysOut = 4 + index * 2;
      break;
  }

  const scheduled = new Date(now);
  scheduled.setDate(scheduled.getDate() + daysOut);
  scheduled.setUTCHours(targetHour, 0, 0, 0);

  // If the computed time is in the past, bump to next day
  if (scheduled <= now) {
    scheduled.setDate(scheduled.getDate() + 1);
  }

  return scheduled;
}

// --- Main Auto-Schedule Function ---

export async function autoScheduleProject(
  projectId: string
): Promise<AutoScheduleResult> {
  const errors: string[] = [];
  const posts: ScheduledPostEntry[] = [];

  // 1. Fetch all clips for the project (sorted by Opus quality)
  const clips = await getProjectClips(projectId);
  if (clips.length === 0) {
    return {
      projectId,
      totalClips: 0,
      totalScheduled: 0,
      posts: [],
      errors: ["No clips found for this project"],
    };
  }

  // 2. Fetch connected social accounts
  const accounts = await getSocialAccounts();

  // 3. Filter accounts based on platform toggles from settings
  const enabledPlatforms = await getEnabledPlatforms();
  const filteredAccounts = accounts.filter((a) =>
    enabledPlatforms.includes(a.platform.toLowerCase())
  );

  if (filteredAccounts.length === 0) {
    return {
      projectId,
      totalClips: clips.length,
      totalScheduled: 0,
      posts: [],
      errors: [
        "No connected social accounts match enabled platforms. Check Opus Clip connections and platform settings.",
      ],
    };
  }

  // 4. Get virality thresholds
  const { hot: hotThreshold, medium: mediumThreshold } =
    await getViralityThresholds();

  // 5. For each clip, calculate schedule time and post to each platform
  for (let clipIndex = 0; clipIndex < clips.length; clipIndex++) {
    const clip = clips[clipIndex];
    const tier = classifyViralityTier(
      clip.viralityRank,
      hotThreshold,
      mediumThreshold
    );

    const scheduleTime = await calculateScheduleTime(
      tier,
      clipIndex,
      filteredAccounts.length
    );

    for (const account of filteredAccounts) {
      try {
        // Stagger posts on different platforms by 30 minutes
        const platformOffset = filteredAccounts.indexOf(account) * 30;
        const adjustedTime = new Date(
          scheduleTime.getTime() + platformOffset * 60 * 1000
        );

        const postDetail: OpusPostDetail = {
          title: clip.title || `Clip ${clipIndex + 1}`,
          custom: {
            description: clip.description || undefined,
          },
        };

        const result = await schedulePost(
          projectId,
          clip.id,
          account.postAccountId,
          account.subAccountId,
          adjustedTime.toISOString(),
          postDetail
        );

        posts.push({
          clipId: clip.id,
          clipTitle: clip.title || `Clip ${clipIndex + 1}`,
          platform: account.platform,
          accountName: account.extUserName,
          scheduledAt: adjustedTime.toISOString(),
          viralityRank: clip.viralityRank,
          viralityTier: tier,
          scheduleId: result.scheduleId,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : String(err);
        errors.push(
          `Failed to schedule clip "${clip.title}" on ${account.platform} (${account.extUserName}): ${msg}`
        );
      }
    }
  }

  return {
    projectId,
    totalClips: clips.length,
    totalScheduled: posts.length,
    posts,
    errors,
  };
}

// --- Platform Enable/Disable ---

async function getEnabledPlatforms(): Promise<string[]> {
  const setting = await getAppSetting<Record<string, boolean>>(
    "opus_clip_platforms"
  );

  if (!setting) {
    // Default: all platforms enabled
    return [
      "youtube",
      "tiktok_business",
      "facebook_page",
      "instagram_business",
      "linkedin",
      "twitter",
    ];
  }

  return Object.entries(setting)
    .filter(([, enabled]) => enabled)
    .map(([platform]) => platform);
}

// --- Sync Projects ---

/**
 * Fetch recent project IDs that have been processed.
 * Returns project IDs stored in app_settings.
 */
export async function getProcessedProjectIds(): Promise<string[]> {
  const ids = await getAppSetting<string[]>("opus_clip_processed_projects");
  return ids || [];
}

export async function markProjectProcessed(projectId: string): Promise<void> {
  const { setAppSetting } = await import("./settings");
  const existing = await getProcessedProjectIds();
  if (!existing.includes(projectId)) {
    // Keep last 100 project IDs
    const updated = [...existing, projectId].slice(-100);
    await setAppSetting("opus_clip_processed_projects", updated);
  }
}

// --- Helpers ---

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
