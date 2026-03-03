-- ============================================================
-- The Jose Show - Database Schema
-- Run this in Supabase SQL Editor to create all tables
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Videos - Raw uploads from Google Drive
create table videos (
  id uuid primary key default uuid_generate_v4(),
  google_drive_file_id text unique not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  duration_seconds numeric,
  storage_path text,
  transcript text,
  transcript_segments jsonb,
  language text default 'en',
  status text not null default 'new'
    check (status in ('new', 'downloading', 'downloaded', 'transcribing', 'transcribed', 'clipping', 'clipped', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_videos_status on videos(status);
create index idx_videos_drive_id on videos(google_drive_file_id);

-- 2. Clips - Extracted segments from videos
create table clips (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references videos(id) on delete cascade,
  storage_path text not null,
  thumbnail_path text,
  start_time numeric not null,
  end_time numeric not null,
  duration_seconds numeric not null,
  aspect_ratio text not null default '9:16'
    check (aspect_ratio in ('9:16', '16:9', '1:1')),
  srt_captions text,
  ai_score numeric,
  ai_reasoning text,
  created_at timestamptz not null default now()
);

create index idx_clips_video on clips(video_id);

-- 3. Events - Jose's events
create table events (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null default 'other'
    check (type in ('bachata_class', 'dj_gig', 'starpoint_event', 'rooftop_party', 'dr_tour', 'other')),
  description text,
  location text,
  start_date timestamptz not null,
  end_date timestamptz,
  is_recurring boolean not null default false,
  recurrence_rule text,
  promo_schedule jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_events_date on events(start_date);

-- 4. Content - Central publishable items
create table content (
  id uuid primary key default uuid_generate_v4(),
  clip_id uuid references clips(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  type text not null default 'video_clip'
    check (type in ('video_clip', 'event_promo', 'story', 'post')),
  status text not null default 'draft'
    check (status in ('draft', 'review', 'approved', 'scheduling', 'publishing', 'published', 'failed')),
  title text not null,
  description text,
  -- Per-platform copy
  youtube_title text,
  youtube_description text,
  youtube_tags text[],
  facebook_text text,
  instagram_caption text,
  tiktok_caption text,
  -- Media
  media_url text,
  thumbnail_url text,
  -- Scheduling
  scheduled_at timestamptz,
  platforms text[] not null default '{}',
  -- Post-publish platform IDs
  youtube_video_id text,
  facebook_post_id text,
  instagram_media_id text,
  tiktok_publish_id text,
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index idx_content_status on content(status);
create index idx_content_scheduled on content(scheduled_at) where scheduled_at is not null;
create index idx_content_published on content(published_at) where published_at is not null;

-- 5. Publish Log - Audit trail of publish attempts
create table publish_log (
  id uuid primary key default uuid_generate_v4(),
  content_id uuid not null references content(id) on delete cascade,
  platform text not null
    check (platform in ('youtube', 'facebook', 'instagram', 'tiktok')),
  status text not null default 'pending'
    check (status in ('pending', 'success', 'failed')),
  platform_post_id text,
  error_message text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_publish_log_content on publish_log(content_id);

-- 6. Platform Tokens - OAuth tokens with auto-refresh
create table platform_tokens (
  id uuid primary key default uuid_generate_v4(),
  platform text unique not null
    check (platform in ('google', 'youtube', 'facebook', 'instagram', 'tiktok')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text[],
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. Analytics Snapshots - Daily per-content per-platform metrics
create table analytics_snapshots (
  id uuid primary key default uuid_generate_v4(),
  content_id uuid not null references content(id) on delete cascade,
  platform text not null
    check (platform in ('youtube', 'facebook', 'instagram', 'tiktok')),
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  watch_time_seconds integer,
  snapshot_date date not null,
  created_at timestamptz not null default now(),
  unique(content_id, platform, snapshot_date)
);

create index idx_analytics_content on analytics_snapshots(content_id);
create index idx_analytics_date on analytics_snapshots(snapshot_date);

-- ============================================================
-- Storage Buckets (run separately in Supabase Dashboard > Storage)
-- Create these buckets:
--   1. "clips" - Public bucket for processed video clips
--   2. "thumbnails" - Public bucket for generated thumbnails
-- ============================================================

-- RLS Policies: Since this is a single-user admin app using service role key,
-- we disable RLS on all tables. Enable if multi-user access is needed later.
alter table videos enable row level security;
alter table clips enable row level security;
alter table events enable row level security;
alter table content enable row level security;
alter table publish_log enable row level security;
alter table platform_tokens enable row level security;
alter table analytics_snapshots enable row level security;

-- Allow all access for service role (bypasses RLS automatically)
-- If you need anon access later, add policies here.
