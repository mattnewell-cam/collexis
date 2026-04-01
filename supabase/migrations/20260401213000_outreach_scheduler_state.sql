alter table public.outreach_plan_steps
  add column if not exists recipient_emails jsonb not null default '[]'::jsonb;

alter table public.outreach_plan_steps
  add column if not exists delivery_status text not null default 'pending';

alter table public.outreach_plan_steps
  add column if not exists processing_started_at timestamptz null;

alter table public.outreach_plan_steps
  add column if not exists sent_at timestamptz null;

alter table public.outreach_plan_steps
  add column if not exists failed_at timestamptz null;

alter table public.outreach_plan_steps
  add column if not exists attempt_count integer not null default 0;

alter table public.outreach_plan_steps
  add column if not exists last_error text null;

alter table public.outreach_plan_steps
  add column if not exists provider_message_id text null;

update public.outreach_plan_steps
set recipient_emails = '[]'::jsonb
where recipient_emails is null;

update public.outreach_plan_steps
set delivery_status = 'pending'
where delivery_status is null;

alter table public.outreach_plan_steps
  drop constraint if exists outreach_plan_steps_delivery_status_check;

alter table public.outreach_plan_steps
  add constraint outreach_plan_steps_delivery_status_check
  check (delivery_status in ('pending', 'sending', 'sent', 'failed'));
