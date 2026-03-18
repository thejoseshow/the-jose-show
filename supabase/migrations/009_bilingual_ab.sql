-- ============================================================
-- 009: Bilingual Content + A/B Testing
-- ============================================================

-- Bilingual support
ALTER TABLE content ADD COLUMN IF NOT EXISTS language text DEFAULT NULL;
ALTER TABLE content ADD COLUMN IF NOT EXISTS parent_content_id uuid REFERENCES content(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_content_language ON content(language);

-- A/B testing
ALTER TABLE content ADD COLUMN IF NOT EXISTS variant text DEFAULT NULL CHECK (variant IN ('A', 'B'));
ALTER TABLE content ADD COLUMN IF NOT EXISTS ab_group_id uuid DEFAULT NULL;
ALTER TABLE content ADD COLUMN IF NOT EXISTS ab_winner boolean DEFAULT NULL;
ALTER TABLE content ADD COLUMN IF NOT EXISTS ab_decided_at timestamptz DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_content_ab_group ON content(ab_group_id) WHERE ab_group_id IS NOT NULL;

-- A/B settings
INSERT INTO app_settings (key, value) VALUES ('ab_testing_enabled', 'false') ON CONFLICT DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('ab_test_days', '3') ON CONFLICT DO NOTHING;
