-- Migration 011: Opus Clip Rebuild
-- Adds source_videos table, Opus Clip columns, white-label config
-- ============================================================

-- 1. Source Videos - Long-form originals that produce clips
CREATE TABLE IF NOT EXISTS source_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  source_type text NOT NULL CHECK (source_type IN ('phone', 'ecamm', 'livestream', 'other')),
  google_drive_file_id text UNIQUE,
  filename text,
  duration_seconds numeric,
  storage_url text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_videos_drive_id ON source_videos(google_drive_file_id);
CREATE INDEX IF NOT EXISTS idx_source_videos_type ON source_videos(source_type);

ALTER TABLE source_videos ENABLE ROW LEVEL SECURITY;

-- 2. Videos table additions (videos now also represents imported clips)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'opus_clip';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS opus_clip_score numeric;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS opus_clip_metadata jsonb;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS source_video_id uuid REFERENCES source_videos(id);

CREATE INDEX IF NOT EXISTS idx_videos_source_video ON videos(source_video_id);

-- 3. Clips table additions
ALTER TABLE clips ADD COLUMN IF NOT EXISTS source_video_id uuid REFERENCES source_videos(id);
ALTER TABLE clips ADD COLUMN IF NOT EXISTS opus_clip_score numeric;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS opus_clip_title text;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS has_captions boolean DEFAULT true;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS has_face_tracking boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clips_source_video ON clips(source_video_id);

-- 4. Make clips.start_time and clips.end_time nullable
--    Opus Clip exports may not have exact timestamps from the source
ALTER TABLE clips ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE clips ALTER COLUMN end_time DROP NOT NULL;

-- 5. White-label config for future multi-tenant support
CREATE TABLE IF NOT EXISTS white_label_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text UNIQUE NOT NULL DEFAULT 'default',
  brand_name text NOT NULL DEFAULT 'The Jose Show',
  primary_color text DEFAULT '#f97316',
  secondary_color text DEFAULT '#1e293b',
  logo_url text,
  favicon_url text,
  custom_domain text,
  features jsonb DEFAULT '{"opus_clip": true, "remotion": true, "ai_copy": true, "events": true, "templates": true, "analytics": true}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE white_label_config ENABLE ROW LEVEL SECURITY;

-- Index on custom_domain for tenant lookup by domain
CREATE INDEX IF NOT EXISTS idx_white_label_custom_domain
  ON white_label_config (custom_domain)
  WHERE custom_domain IS NOT NULL;

-- Seed default tenant
INSERT INTO white_label_config (tenant_id, brand_name)
VALUES ('default', 'The Jose Show')
ON CONFLICT (tenant_id) DO NOTHING;

-- 6. App settings for Opus Clip
INSERT INTO app_settings (key, value) VALUES
  ('opus_clip_drive_folder', '"opus-clips"'::jsonb)
ON CONFLICT (key) DO NOTHING;
