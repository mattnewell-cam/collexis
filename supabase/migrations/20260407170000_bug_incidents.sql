create table if not exists public.bug_incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  status text not null default 'new' check (
    status in (
      'new',
      'ignored',
      'watching',
      'autofix_pending',
      'autofix_running',
      'draft_pr_created',
      'autofix_failed'
    )
  ),
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  first_log_id bigint null references public.app_logs(id) on delete set null,
  latest_log_id bigint null references public.app_logs(id) on delete set null,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  last_triaged_occurrence_count integer null,
  source text not null default '',
  event text not null default '',
  latest_level text not null default 'error',
  latest_error text null,
  latest_context jsonb null,
  sample_log_ids jsonb not null default '[]'::jsonb,
  sample_request_ids jsonb not null default '[]'::jsonb,
  sample_action_ids jsonb not null default '[]'::jsonb,
  classification text null check (classification in ('likely_bug', 'likely_transient', 'unclear')),
  recommended_action text null check (recommended_action in ('ignore', 'watch', 'draft_pr')),
  triage_confidence numeric(4, 3) null,
  triage_summary text null,
  triage_rationale text null,
  likely_root_cause text null,
  suggested_files jsonb not null default '[]'::jsonb,
  fix_prompt text null,
  last_triaged_at timestamptz null,
  autofix_requested_at timestamptz null,
  autofix_started_at timestamptz null,
  autofix_completed_at timestamptz null,
  autofix_payload_path text null,
  autofix_branch text null,
  autofix_pr_url text null,
  autofix_last_error text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_bug_incidents_status_updated_at
on public.bug_incidents (status, updated_at desc);

create index if not exists idx_bug_incidents_last_seen_at
on public.bug_incidents (last_seen_at desc);

create index if not exists idx_bug_incidents_latest_log_id
on public.bug_incidents (latest_log_id desc);

alter table public.bug_incidents enable row level security;

create table if not exists public.bug_triage_state (
  id text primary key default 'singleton' check (id = 'singleton'),
  last_processed_log_id bigint null,
  last_processed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.bug_triage_state (id)
values ('singleton')
on conflict (id) do nothing;

alter table public.bug_triage_state enable row level security;
