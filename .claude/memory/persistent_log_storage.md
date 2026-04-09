---
name: persistent_log_storage
description: Structured logs now persist to Supabase app_logs from Next routes, relayed client events, and the Python backend; repo-root temp artifacts are now discouraged in AGENTS.md.
type: project
date: 2026-04-03
---

Structured app logging is no longer stdout-only.

- Added Supabase migration `supabase/migrations/20260403143000_app_logs.sql` for `public.app_logs`.
- Next server logging now writes to stdout and best-effort inserts into `app_logs`.
- Browser-side `loggedFetch(...)` events now relay through `/api/client-logs`, so client HTTP events can also persist instead of staying browser-only.
- Python backend logging now keeps the JSON stream handler and adds a best-effort async Supabase log handler when Supabase service-role config is present.
- Backend test runs skip durable log writes, and noisy `httpx` info logs are suppressed at the logger config level.
- `AGENTS.md` now explicitly tells agents to keep logs, screenshots, and temp artifacts out of the repo root and use `logs/` or `tmp/` instead.
