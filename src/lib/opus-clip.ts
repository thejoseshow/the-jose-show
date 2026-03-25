// ============================================================
// The Jose Show - Opus Clip via Zapier Webhooks
// ============================================================
//
// Integrates with Opus Clip through Zapier webhooks instead of
// the direct Opus Clip API (which requires enterprise access).
//
// Flow:
//   1. Send video URL to Zapier webhook -> Zapier triggers Opus Clip
//   2. Opus Clip processes video, generates clips
//   3. Zapier sends webhook back to our app with clip data (Path A)
//      OR Opus Clip exports clips to Google Drive folder (Path B)
//   4. Our app downloads clips, stores in Supabase Storage
//   5. Claude generates platform-specific copy
//   6. Auto-scheduler ranks by position and schedules
//   7. Our publish pipeline posts to YouTube/FB/IG/TikTok
//
// Env vars:
//   ZAPIER_WEBHOOK_CLIP_VIDEO  — Zapier webhook URL that triggers "Clip Your Video"
//   ZAPIER_WEBHOOK_SECRET      — Optional shared secret for verifying incoming webhooks

import { supabase } from "./supabase";
import { getAppSetting, setAppSetting } from "./settings";
import { uploadClip } from "./storage";
import { generatePlatformCopy } from "./claude";
import type { Platform } from "./types";

// --- Types ---

export interface ZapierClipRequest {
  videoUrl?: string;       // YouTube URL
  videoFileUrl?: string;   // Google Drive / direct file URL
  sourceVideoId?: string;  // Our internal tracking ID
}

export interface OpusClipResult {
  projectId: string;
  clips: OpusClip[];
}

export interface OpusClip {
  id: string;
  title: string;
  description: string;
  downloadUrl: string;     // Direct URL to clip file
  durationMs: number;
  position: number;        // 0-indexed position in results
  viralityRank: number;    // Computed: 100 - (position * 5), min 10
}

export type ViralityTier = "hot" | "medium" | "filler";

export interface PendingProject {
  id: string;
  videoUrl: string;
  sourceVideoId?: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  clipCount?: number;
  error?: string;
}

export interface AutoScheduleResult {
  projectId: string;
  totalClips: number;
  totalScheduled: number;
  contentIds: string[];
  errors: string[];
}

// --- Zapier Webhook: Send Video for Clipping ---

/**
 * Send a video URL to Opus Clip via Zapier webhook.
 * This triggers the Zapier zap that calls Opus Clip's "Clip Your Video" action.
 * Returns immediately — processing is async.
 */
export async function sendToOpusClip(
  videoUrl: string,
  sourceVideoId?: string
): Promise<{ projectId: string }> {
  const webhookUrl = process.env.ZAPIER_WEBHOOK_CLIP_VIDEO;
  if (!webhookUrl) {
    throw new Error(
      "Missing ZAPIER_WEBHOOK_CLIP_VIDEO environment variable. " +
      "Set this to your Zapier webhook URL that triggers Opus Clip."
    );
  }

  // Generate a tracking ID for this project
  const projectId = crypto.randomUUID();

  const payload: ZapierClipRequest & { projectId: string } = {
    videoUrl,
    sourceVideoId,
    projectId,
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Zapier webhook failed (${res.status}): ${text.slice(0, 200)}`
    );
  }

  // Store pending project in app_settings
  const pending = (await getAppSetting<PendingProject[]>("opus_pending_projects")) || [];
  pending.push({
    id: projectId,
    videoUrl,
    sourceVideoId,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  // Keep last 50 pending projects
  await setAppSetting("opus_pending_projects", pending.slice(-50));

  console.log(`[opus-clip] Sent to Zapier: ${videoUrl} -> project ${projectId}`);

  return { projectId };
}

// --- Handle Incoming Webhook (Path A) ---

/**
 * Called when Zapier sends us the "project completed" webhook.
 * Processes the clips: download, store, create records, generate copy, auto-schedule.
 */
export async function handleOpusClipComplete(webhookData: {
  projectId?: string;
  clips?: Array<{
    id?: string;
    title?: string;
    description?: string;
    download_url?: string;
    downloadUrl?: string;
    duration_ms?: number;
    durationMs?: number;
    position?: number;
  }>;
  videoUrl?: string;
  error?: string;
}): Promise<AutoScheduleResult> {
  const projectId = webhookData.projectId || crypto.randomUUID();
  const errors: string[] = [];
  const contentIds: string[] = [];

  // Update pending project status
  await updatePendingProject(projectId, "processing");

  if (webhookData.error) {
    await updatePendingProject(projectId, "failed", webhookData.error);
    return { projectId, totalClips: 0, totalScheduled: 0, contentIds: [], errors: [webhookData.error] };
  }

  const rawClips = webhookData.clips || [];
  if (rawClips.length === 0) {
    await updatePendingProject(projectId, "failed", "No clips in webhook payload");
    return { projectId, totalClips: 0, totalScheduled: 0, contentIds: [], errors: ["No clips received from Zapier"] };
  }

  // Normalize clip data
  const clips: OpusClip[] = rawClips.map((clip, index) => ({
    id: clip.id || crypto.randomUUID(),
    title: clip.title || `Clip ${index + 1}`,
    description: clip.description || "",
    downloadUrl: clip.download_url || clip.downloadUrl || "",
    durationMs: clip.duration_ms || clip.durationMs || 0,
    position: clip.position ?? index,
    viralityRank: Math.max(10, 100 - (clip.position ?? index) * 5),
  }));

  console.log(`[opus-clip] Processing ${clips.length} clips for project ${projectId}`);

  // Get enabled platforms
  const enabledPlatforms = await getEnabledPlatforms();

  for (const clip of clips) {
    try {
      // Skip clips with no download URL
      if (!clip.downloadUrl) {
        errors.push(`Clip "${clip.title}" has no download URL, skipping`);
        continue;
      }

      // Download clip
      const videoRes = await fetch(clip.downloadUrl);
      if (!videoRes.ok) {
        errors.push(`Failed to download clip "${clip.title}": HTTP ${videoRes.status}`);
        continue;
      }
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      const durationSeconds = clip.durationMs > 0 ? clip.durationMs / 1000 : 0;

      // Upload to Supabase Storage
      const storagePath = `opus/${projectId}/${clip.id}.mp4`;
      const publicUrl = await uploadClip(storagePath, videoBuffer, "video/mp4");

      // Create clip record
      const { data: clipRecord, error: clipError } = await supabase
        .from("clips")
        .insert({
          video_id: null, // No parent video record for Opus Clip imports
          storage_path: storagePath,
          start_time: 0,
          end_time: durationSeconds,
          duration_seconds: durationSeconds,
          aspect_ratio: "9:16",
          opus_clip_score: clip.viralityRank,
          opus_clip_title: clip.title,
          has_captions: true,
          has_face_tracking: false,
        })
        .select("id")
        .single();

      if (clipError || !clipRecord) {
        errors.push(`Failed to create clip record for "${clip.title}": ${clipError?.message}`);
        continue;
      }

      // Generate platform-specific copy via Claude
      const isShort = durationSeconds <= 60;
      const copy = await generatePlatformCopy(
        clip.description || clip.title,
        clip.title,
        enabledPlatforms,
        false,
        undefined,
        isShort
      );

      // Create content record
      const { data: contentRecord, error: contentError } = await supabase
        .from("content")
        .insert({
          clip_id: clipRecord.id,
          type: "video_clip",
          status: "review",
          title: clip.title,
          description: clip.description || null,
          youtube_title: copy.youtube_title,
          youtube_description: copy.youtube_description,
          youtube_tags: copy.youtube_tags,
          facebook_text: copy.facebook_text,
          instagram_caption: copy.instagram_caption,
          tiktok_caption: copy.tiktok_caption,
          media_url: publicUrl,
          platforms: enabledPlatforms,
        })
        .select("id")
        .single();

      if (contentError || !contentRecord) {
        errors.push(`Failed to create content for "${clip.title}": ${contentError?.message}`);
        continue;
      }

      contentIds.push(contentRecord.id);
      console.log(`[opus-clip] Created content ${contentRecord.id} for clip "${clip.title}" (rank: ${clip.viralityRank})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error processing clip "${clip.title}": ${msg}`);
    }
  }

  // Update pending project status
  await updatePendingProject(projectId, "completed", undefined, contentIds.length);

  // Mark project as processed
  await markProjectProcessed(projectId);

  return {
    projectId,
    totalClips: clips.length,
    totalScheduled: contentIds.length,
    contentIds,
    errors,
  };
}

// --- Process Clips from Google Drive (Path B) ---

/**
 * Alternative path: import clips from Google Drive folder.
 * Called by the process-uploads cron when it finds new files
 * in the Opus Clip export folder.
 */
export async function processClipsFromDrive(driveFiles: Array<{
  id: string;
  name: string;
  mimeType: string;
  downloadUrl: string;
  size?: number;
}>): Promise<AutoScheduleResult> {
  const projectId = `drive-${Date.now()}`;
  const errors: string[] = [];
  const contentIds: string[] = [];

  console.log(`[opus-clip] Processing ${driveFiles.length} clips from Drive`);

  const enabledPlatforms = await getEnabledPlatforms();

  for (let index = 0; index < driveFiles.length; index++) {
    const file = driveFiles[index];
    try {
      // Skip non-video files
      if (!file.mimeType.startsWith("video/")) {
        continue;
      }

      // Download from Drive
      const videoRes = await fetch(file.downloadUrl);
      if (!videoRes.ok) {
        errors.push(`Failed to download "${file.name}": HTTP ${videoRes.status}`);
        continue;
      }
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

      // Upload to Supabase Storage
      const clipId = crypto.randomUUID();
      const storagePath = `opus/${projectId}/${clipId}.mp4`;
      const publicUrl = await uploadClip(storagePath, videoBuffer, file.mimeType);

      // Position-based virality rank (first file = best)
      const viralityRank = Math.max(10, 100 - index * 5);

      // Create clip record
      const { data: clipRecord, error: clipError } = await supabase
        .from("clips")
        .insert({
          video_id: null,
          storage_path: storagePath,
          start_time: 0,
          end_time: 0,
          duration_seconds: 0,
          aspect_ratio: "9:16",
          opus_clip_score: viralityRank,
          opus_clip_title: file.name.replace(/\.[^.]+$/, ""),
          has_captions: true,
          has_face_tracking: false,
        })
        .select("id")
        .single();

      if (clipError || !clipRecord) {
        errors.push(`Failed to create clip for "${file.name}": ${clipError?.message}`);
        continue;
      }

      // Generate copy
      const title = file.name.replace(/\.[^.]+$/, "");
      const copy = await generatePlatformCopy(
        title,
        title,
        enabledPlatforms,
        false,
        undefined,
        true // assume short-form from Opus Clip
      );

      // Create content record
      const { data: contentRecord, error: contentError } = await supabase
        .from("content")
        .insert({
          clip_id: clipRecord.id,
          type: "video_clip",
          status: "review",
          title,
          youtube_title: copy.youtube_title,
          youtube_description: copy.youtube_description,
          youtube_tags: copy.youtube_tags,
          facebook_text: copy.facebook_text,
          instagram_caption: copy.instagram_caption,
          tiktok_caption: copy.tiktok_caption,
          media_url: publicUrl,
          platforms: enabledPlatforms,
        })
        .select("id")
        .single();

      if (contentError || !contentRecord) {
        errors.push(`Failed to create content for "${file.name}": ${contentError?.message}`);
        continue;
      }

      contentIds.push(contentRecord.id);
      console.log(`[opus-clip] Imported "${file.name}" -> content ${contentRecord.id} (rank: ${viralityRank})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error processing "${file.name}": ${msg}`);
    }
  }

  return {
    projectId,
    totalClips: driveFiles.filter((f) => f.mimeType.startsWith("video/")).length,
    totalScheduled: contentIds.length,
    contentIds,
    errors,
  };
}

// --- Virality Tier Classification ---

export async function getViralityThresholds(): Promise<{
  hot: number;
  medium: number;
}> {
  const hot = (await getAppSetting<number>("virality_hot_threshold")) ?? 80;
  const medium = (await getAppSetting<number>("virality_medium_threshold")) ?? 50;
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

// --- Platform Enable/Disable ---

export async function getEnabledPlatforms(): Promise<Platform[]> {
  const setting = await getAppSetting<Record<string, boolean>>(
    "opus_clip_platforms"
  );

  // Default platforms for our publish pipeline
  const defaultPlatforms: Platform[] = ["youtube", "facebook", "instagram", "tiktok"];

  if (!setting) return defaultPlatforms;

  // Map Opus Clip platform keys to our platform names
  const platformMap: Record<string, Platform> = {
    youtube: "youtube",
    tiktok_business: "tiktok",
    facebook_page: "facebook",
    instagram_business: "instagram",
  };

  const enabled: Platform[] = [];
  for (const [key, isEnabled] of Object.entries(setting)) {
    if (isEnabled && platformMap[key]) {
      enabled.push(platformMap[key]);
    }
  }

  return enabled.length > 0 ? enabled : defaultPlatforms;
}

// --- Pending Projects Management ---

export async function getPendingProjects(): Promise<PendingProject[]> {
  return (await getAppSetting<PendingProject[]>("opus_pending_projects")) || [];
}

async function updatePendingProject(
  projectId: string,
  status: PendingProject["status"],
  error?: string,
  clipCount?: number
): Promise<void> {
  const pending = await getPendingProjects();
  const updated = pending.map((p) =>
    p.id === projectId
      ? {
          ...p,
          status,
          ...(error ? { error } : {}),
          ...(clipCount !== undefined ? { clipCount } : {}),
          ...(status === "completed" || status === "failed"
            ? { completedAt: new Date().toISOString() }
            : {}),
        }
      : p
  );
  await setAppSetting("opus_pending_projects", updated);
}

// --- Processed Projects ---

export async function getProcessedProjectIds(): Promise<string[]> {
  const ids = await getAppSetting<string[]>("opus_clip_processed_projects");
  return ids || [];
}

export async function markProjectProcessed(projectId: string): Promise<void> {
  const existing = await getProcessedProjectIds();
  if (!existing.includes(projectId)) {
    // Keep last 100 project IDs
    const updated = [...existing, projectId].slice(-100);
    await setAppSetting("opus_clip_processed_projects", updated);
  }
}

// --- Webhook Verification ---

/**
 * Verify an incoming webhook from Zapier using a shared secret.
 * The secret can be passed as a query parameter or header.
 */
export function verifyWebhookSecret(
  secret: string | null | undefined
): boolean {
  const expected = process.env.ZAPIER_WEBHOOK_SECRET;
  // If no secret configured, allow all webhooks (simpler setup)
  if (!expected) return true;
  return secret === expected;
}
