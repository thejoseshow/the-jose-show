import { z } from "zod";

// ============================================================
// Zod Schemas for API Input Validation
// ============================================================

const platformEnum = z.enum(["youtube", "facebook", "instagram", "tiktok"]);

export const authSchema = z.object({
  password: z.string().min(1).max(200),
});

export const createContentSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  type: z.enum(["video_clip", "event_promo", "story", "post"]).default("video_clip"),
  platforms: z.array(platformEnum).default([]),
  youtube_title: z.string().max(100).nullable().optional(),
  youtube_description: z.string().max(5000).nullable().optional(),
  youtube_tags: z.array(z.string()).max(30).optional(),
  facebook_text: z.string().nullable().optional(),
  instagram_caption: z.string().max(2200).nullable().optional(),
  tiktok_caption: z.string().max(2200).nullable().optional(),
  media_url: z.string().url().nullable().optional(),
  thumbnail_url: z.string().url().nullable().optional(),
  scheduled_at: z.string().nullable().optional(),
  clip_id: z.string().uuid().nullable().optional(),
  event_id: z.string().uuid().nullable().optional(),
});

export const updateContentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(["draft", "review", "approved", "scheduling", "publishing", "published", "partially_published", "failed"]).optional(),
  youtube_title: z.string().max(100).nullable().optional(),
  youtube_description: z.string().max(5000).nullable().optional(),
  youtube_tags: z.array(z.string()).max(30).optional(),
  facebook_text: z.string().nullable().optional(),
  instagram_caption: z.string().max(2200).nullable().optional(),
  tiktok_caption: z.string().max(2200).nullable().optional(),
  media_url: z.string().url().nullable().optional(),
  thumbnail_url: z.string().url().nullable().optional(),
  scheduled_at: z.string().nullable().optional(),
  platforms: z.array(platformEnum).optional(),
});

export const publishSchema = z.object({
  platforms: z.array(platformEnum).optional(),
});

export const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["bachata_class", "dj_gig", "starpoint_event", "rooftop_party", "dr_tour", "other"]).default("other"),
  description: z.string().max(5000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  start_date: z.string(),
  end_date: z.string().nullable().optional(),
  is_recurring: z.boolean().default(false),
  recurrence_rule: z.string().max(200).nullable().optional(),
});

export const updateEventSchema = createEventSchema.partial();

export const createTemplateSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  prefix: z.string().min(1).max(200),
  default_platforms: z.array(platformEnum).default([]),
  hashtags: z.array(z.string()).default([]),
  prompt_hint: z.string().max(2000).default(""),
  is_recurring: z.boolean().default(false),
  frequency: z.enum(["weekly", "biweekly", "monthly"]).nullable().optional(),
  preferred_day: z.number().int().min(0).max(6).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const clipSchema = z.object({
  video_id: z.string().uuid(),
  start_time: z.number().min(0),
  end_time: z.number().min(0),
  aspect_ratio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  burn_captions: z.boolean().default(true),
});

export const transcribeSchema = z.object({
  video_id: z.string().uuid(),
});

export const generateSchema = z.object({
  transcript: z.string().min(1),
  title: z.string().min(1),
  platforms: z.array(platformEnum).optional(),
  is_spanish: z.boolean().optional(),
});

export const thumbnailSchema = z.object({
  content_id: z.string().uuid().optional(),
  custom_prompt: z.string().max(2000).optional(),
}).refine((d) => d.content_id || d.custom_prompt, {
  message: "content_id or custom_prompt is required",
});

export const renderRequestSchema = z.object({
  composition_id: z.enum(["EventPromo", "BrandedClip", "CaptionOverlay"]),
  content_id: z.string().uuid().optional(),
  input_props: z.record(z.string(), z.unknown()),
});

export const renderWebhookSchema = z.object({
  type: z.enum(["success", "timeout", "error"]),
  renderId: z.string(),
  outputUrl: z.string().optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

// ============================================================
// SSRF Protection
// ============================================================

export function validateMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) return false;

    const trustedHost = new URL(supabaseUrl).hostname;
    return parsed.hostname === trustedHost || parsed.hostname.endsWith(`.supabase.co`);
  } catch {
    return false;
  }
}

// ============================================================
// Error Sanitization
// ============================================================

export function sanitizeError(error: unknown, context: string): string {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[${context}]`, detail);
  return "An internal error occurred";
}

// ============================================================
// Validation Helper
// ============================================================

export function validateBody<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string; details?: Record<string, string[]> } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      error: "Validation failed",
      details: result.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  return { success: true, data: result.data };
}
