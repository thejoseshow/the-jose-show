-- Phase 4: AI Captions, Smart Auto-Pilot, Performance Coach
-- ============================================================

-- Feature A: Word-level timestamps for captions
ALTER TABLE clips ADD COLUMN IF NOT EXISTS word_timestamps jsonb;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS word_timestamps jsonb;

-- Feature B: Auto-pilot settings seeds
INSERT INTO app_settings (key, value) VALUES ('auto_approve_threshold', '7') ON CONFLICT DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('auto_schedule_enabled', 'false') ON CONFLICT DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('preferred_post_times',
  '{"youtube":{"hour":14,"minute":0},"facebook":{"hour":11,"minute":0},"instagram":{"hour":18,"minute":0},"tiktok":{"hour":19,"minute":0}}')
  ON CONFLICT DO NOTHING;

-- Feature C: Performance insights table
CREATE TABLE IF NOT EXISTS performance_insights (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_start date NOT NULL UNIQUE,
  insights_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE performance_insights ENABLE ROW LEVEL SECURITY;
