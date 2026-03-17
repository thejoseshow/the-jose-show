-- Add reach and impressions columns to analytics_snapshots
ALTER TABLE analytics_snapshots ADD COLUMN IF NOT EXISTS reach integer DEFAULT 0;
ALTER TABLE analytics_snapshots ADD COLUMN IF NOT EXISTS impressions integer DEFAULT 0;
-- watch_time_seconds column already exists but was unused — now populated by sync cron
