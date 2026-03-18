// ============================================================
// The Jose Show - Type Definitions
// ============================================================

// --- Database Row Types ---

export type VideoStatus =
  | "new"
  | "downloading"
  | "downloaded"
  | "transcribing"
  | "transcribed"
  | "clipping"
  | "clipped"
  | "failed"
  | "archived";

export type ContentStatus =
  | "draft"
  | "review"
  | "approved"
  | "scheduling"
  | "publishing"
  | "published"
  | "partially_published"
  | "failed";

export type Platform = "youtube" | "facebook" | "instagram" | "tiktok";

export type EventType =
  | "bachata_class"
  | "dj_gig"
  | "starpoint_event"
  | "rooftop_party"
  | "dr_tour"
  | "other";

export interface Video {
  id: string;
  google_drive_file_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  storage_path: string | null;
  transcript: string | null;
  transcript_segments: TranscriptSegment[] | null;
  word_timestamps: WordTimestamp[] | null;
  language: string | null;
  is_photo: boolean;
  status: VideoStatus;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface Clip {
  id: string;
  video_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  start_time: number;
  end_time: number;
  duration_seconds: number;
  aspect_ratio: "9:16" | "16:9" | "1:1";
  srt_captions: string | null;
  word_timestamps: WordTimestamp[] | null;
  ai_score: number | null;
  ai_reasoning: string | null;
  created_at: string;
}

export interface Content {
  id: string;
  clip_id: string | null;
  event_id: string | null;
  type: "video_clip" | "event_promo" | "story" | "post" | "photo_post";
  status: ContentStatus;
  title: string;
  description: string | null;
  // Per-platform copy
  youtube_title: string | null;
  youtube_description: string | null;
  youtube_tags: string[] | null;
  facebook_text: string | null;
  instagram_caption: string | null;
  tiktok_caption: string | null;
  // Media
  media_url: string | null;
  thumbnail_url: string | null;
  // Scheduling
  scheduled_at: string | null;
  platforms: Platform[];
  // Post-publish IDs
  youtube_video_id: string | null;
  facebook_post_id: string | null;
  instagram_media_id: string | null;
  tiktok_publish_id: string | null;
  // Template
  template_id: string | null;
  // Render
  render_job_id: string | null;
  // Bilingual
  language: string | null;
  parent_content_id: string | null;
  // A/B testing
  variant: "A" | "B" | null;
  ab_group_id: string | null;
  ab_winner: boolean | null;
  ab_decided_at: string | null;
  // Metadata
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface Event {
  id: string;
  name: string;
  type: EventType;
  description: string | null;
  location: string | null;
  start_date: string;
  end_date: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null; // e.g., "FREQ=MONTHLY;BYDAY=2SA"
  promo_schedule: PromoScheduleItem[] | null;
  created_at: string;
  updated_at: string;
}

export interface PromoScheduleItem {
  days_before: number;
  type: "countdown" | "reminder" | "recap" | "announcement";
  generated: boolean;
  content_id?: string;
}

export interface PublishLog {
  id: string;
  content_id: string;
  platform: Platform;
  status: "pending" | "success" | "failed";
  platform_post_id: string | null;
  error_message: string | null;
  published_at: string | null;
  created_at: string;
}

export interface PlatformToken {
  id: string;
  platform: Platform | "google";
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsSnapshot {
  id: string;
  content_id: string;
  platform: Platform;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time_seconds: number | null;
  snapshot_date: string;
  created_at: string;
}

export interface ContentTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  prefix: string;
  default_platforms: Platform[];
  hashtags: string[];
  prompt_hint: string;
  is_recurring: boolean;
  frequency: "weekly" | "biweekly" | "monthly" | null;
  preferred_day: number | null; // 0=Sun, 1=Mon, ..., 6=Sat
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type RenderJobStatus = "pending" | "rendering" | "completed" | "failed";

export type CompositionId = "EventPromo" | "BrandedClip" | "CaptionOverlay";

export interface RenderJob {
  id: string;
  content_id: string | null;
  composition_id: CompositionId;
  input_props: Record<string, unknown>;
  status: RenderJobStatus;
  render_id: string | null;
  output_url: string | null;
  progress: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PerformanceInsight {
  id: string;
  week_start: string;
  insights_json: {
    top_insights: string[];
    content_type_rankings: Array<{ type: string; avg_engagement: number }>;
    platform_rankings: Array<{ platform: string; total_views: number; avg_engagement: number }>;
    recommended_hashtags: string[];
    suggested_content_ideas: string[];
    week_summary: string;
  };
  created_at: string;
}

// --- API / UI Types ---

export interface DashboardStats {
  total_videos: number;
  processing: number;
  ready_for_review: number;
  published_this_week: number;
  upcoming_events: number;
}

export interface ContentListItem {
  id: string;
  title: string;
  type: Content["type"];
  status: ContentStatus;
  thumbnail_url: string | null;
  platforms: Platform[];
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  language: string | null;
  variant: "A" | "B" | null;
  ab_group_id: string | null;
  parent_content_id: string | null;
}

export interface SessionPayload {
  authenticated: boolean;
  exp: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
