-- Store structured deadline data on timeline items so missed-deadline
-- detection uses real dates instead of fragile keyword matching.
alter table public.timeline_items
  add column if not exists stated_deadline text null,
  add column if not exists computed_deadline text null;
