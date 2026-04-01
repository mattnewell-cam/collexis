create table if not exists public.documents (
  id text primary key,
  job_id text not null,
  original_filename text not null,
  mime_type text not null,
  storage_path text not null,
  status text not null check (status in ('processing', 'ready', 'failed')),
  title text not null default '',
  communication_date text null,
  description text not null default '',
  transcript text not null default '',
  extraction_error text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_documents_job_created_at
on public.documents (job_id, created_at desc);

create table if not exists public.timeline_items (
  id text primary key,
  job_id text not null,
  category text not null check (category in ('due-date', 'handover-letter', 'chase', 'conversation', 'letter', 'other')),
  subtype text null check (subtype in ('email', 'sms', 'whatsapp', 'facebook', 'voicemail', 'home-visit', 'phone', 'in-person')),
  sender text null check (sender in ('you', 'collexis')),
  date text not null,
  short_description text not null,
  details text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_timeline_items_job_date
on public.timeline_items (job_id, date asc, created_at asc);

create table if not exists public.document_timeline_items (
  document_id text not null references public.documents(id) on delete cascade,
  timeline_item_id text not null references public.timeline_items(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (document_id, timeline_item_id)
);

create index if not exists idx_document_timeline_items_timeline_item
on public.document_timeline_items (timeline_item_id, created_at desc);

create table if not exists public.outreach_plan_steps (
  id text primary key,
  job_id text not null,
  type text not null check (type in ('email', 'sms', 'whatsapp', 'call', 'letter-warning', 'letter-of-claim', 'initiate-legal-action')),
  sender text not null check (sender in ('you', 'collexis')),
  headline text not null,
  scheduled_for text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_outreach_plan_steps_job_scheduled
on public.outreach_plan_steps (job_id, scheduled_for asc, created_at asc);

create table if not exists public.outreach_plan_drafts (
  id text primary key,
  job_id text not null,
  plan_step_id text not null unique references public.outreach_plan_steps(id) on delete cascade,
  subject text null,
  body text not null,
  is_user_edited boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_outreach_plan_drafts_job_updated
on public.outreach_plan_drafts (job_id, updated_at desc);

alter table public.documents enable row level security;
alter table public.timeline_items enable row level security;
alter table public.document_timeline_items enable row level security;
alter table public.outreach_plan_steps enable row level security;
alter table public.outreach_plan_drafts enable row level security;

insert into storage.buckets (id, name, public)
values ('collexis-documents', 'collexis-documents', false)
on conflict (id) do nothing;
