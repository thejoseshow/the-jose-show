-- ============================================================
-- Migration 004: Reliability improvements
-- - retry_count on videos for pipeline retry logic
-- - partially_published status on content
-- - cron_log table for observability
-- ============================================================

-- 1. Add retry_count to videos
alter table videos add column if not exists retry_count integer not null default 0;

-- 2. Add partially_published to content status check
alter table content drop constraint if exists content_status_check;
alter table content add constraint content_status_check
  check (status in ('draft', 'review', 'approved', 'scheduling', 'publishing', 'published', 'partially_published', 'failed'));

-- 3. Cron execution log
create table if not exists cron_log (
  id uuid primary key default uuid_generate_v4(),
  cron_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'error')),
  result jsonb,
  error_message text,
  duration_ms integer
);

create index idx_cron_log_name on cron_log(cron_name);
create index idx_cron_log_started on cron_log(started_at desc);
