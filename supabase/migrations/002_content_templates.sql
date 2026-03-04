-- ============================================================
-- Phase 4: Content Templates
-- ============================================================

create table content_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  prefix text not null,
  default_platforms text[] not null default '{}',
  hashtags text[] not null default '{}',
  prompt_hint text not null default '',
  is_recurring boolean not null default false,
  frequency text check (frequency in ('weekly', 'biweekly', 'monthly')),
  preferred_day smallint check (preferred_day between 0 and 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table content add column template_id uuid references content_templates(id) on delete set null;
