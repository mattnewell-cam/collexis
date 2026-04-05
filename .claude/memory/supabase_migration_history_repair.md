---
name: supabase_migration_history_repair
description: Production Supabase migration history was repaired to match the repo, including applying the missing outreach scheduler migration and aligning the app_logs timestamp.
type: project
date: 2026-04-05
---

Supabase project `pvvsvfvkndnfiihrjlmy` had drift between `supabase/migrations/` and `supabase_migrations.schema_migrations`.

- Repaired `backend_state` history from remote version `20260401202315` to local version `20260401120000`.
- Applied the missing `20260401213000_outreach_scheduler_state.sql` changes to `public.outreach_plan_steps`.
- Repaired `app_logs` history from remote version `20260403202248` to local version `20260403143000`.
- Final remote migration list now matches the repo: `20260401120000_backend_state`, `20260401213000_outreach_scheduler_state`, `20260403143000_app_logs`.
