create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default timezone('utc', now()),
  actor_user_id uuid null,
  action text not null,
  job_id text null,
  entity_type text not null,
  entity_id text null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_audit_events_occurred_at
on public.audit_events (occurred_at desc);

create index if not exists idx_audit_events_job_occurred_at
on public.audit_events (job_id, occurred_at desc);

create index if not exists idx_audit_events_entity_occurred_at
on public.audit_events (entity_type, entity_id, occurred_at desc);

create index if not exists idx_audit_events_action_occurred_at
on public.audit_events (action, occurred_at desc);

alter table public.audit_events enable row level security;
