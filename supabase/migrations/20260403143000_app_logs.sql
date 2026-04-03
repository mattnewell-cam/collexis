create table if not exists public.app_logs (
  id bigint generated always as identity primary key,
  timestamp timestamptz not null default timezone('utc', now()),
  level text not null check (level in ('debug', 'info', 'warn', 'error')),
  source text not null check (source in ('client', 'next-api', 'backend')),
  event text not null,
  request_id text null,
  action_id text null,
  session_id text null,
  context jsonb null,
  error text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_app_logs_timestamp
on public.app_logs (timestamp desc);

create index if not exists idx_app_logs_request_id
on public.app_logs (request_id, timestamp desc);

create index if not exists idx_app_logs_action_id
on public.app_logs (action_id, timestamp desc);

create index if not exists idx_app_logs_source_event_timestamp
on public.app_logs (source, event, timestamp desc);

alter table public.app_logs enable row level security;
