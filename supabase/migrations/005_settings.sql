create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

insert into app_settings (key, value) values ('auto_approve_pipeline', 'false') on conflict do nothing;
