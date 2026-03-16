-- 006: Photo processing support
-- Adds is_photo flag to videos table and photo_post content type

ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_photo boolean NOT NULL DEFAULT false;

ALTER TABLE content DROP CONSTRAINT IF EXISTS content_type_check;
ALTER TABLE content ADD CONSTRAINT content_type_check
  CHECK (type IN ('video_clip', 'event_promo', 'story', 'post', 'photo_post'));
