alter table public.app_logs
  drop constraint if exists app_logs_source_check;

alter table public.app_logs
  add constraint app_logs_source_check
  check (source in ('client', 'next-api', 'backend', 'server-component', 'proxy'));
