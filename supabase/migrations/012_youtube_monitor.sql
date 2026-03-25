-- ============================================================
-- YouTube Channel Monitoring
-- ============================================================
-- Tracks YouTube channels to auto-detect new uploads and send
-- them to Opus Clip for clipping.

CREATE TABLE IF NOT EXISTS monitored_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text UNIQUE NOT NULL,
  channel_name text NOT NULL,
  uploads_playlist_id text NOT NULL,
  last_checked_video_id text,
  last_checked_at timestamptz,
  enabled boolean DEFAULT true,
  auto_clip boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE monitored_channels ENABLE ROW LEVEL SECURITY;

-- Index for quick lookups on enabled channels
CREATE INDEX IF NOT EXISTS idx_monitored_channels_enabled
  ON monitored_channels (enabled) WHERE enabled = true;
