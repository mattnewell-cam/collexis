-- Add recipient column to timeline_items to clarify who each communication is TO
alter table public.timeline_items
  add column if not exists recipient text null;

-- Add response classification columns to timeline_items for debtor replies
alter table public.timeline_items
  add column if not exists response_classification text null,
  add column if not exists response_action text null;
