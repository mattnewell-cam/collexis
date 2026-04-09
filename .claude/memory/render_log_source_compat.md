---
name: render_log_source_compat
description: Production log writes now normalize newer Next log sources to the legacy `app_logs` schema until the Supabase constraint migration is applied.
type: project
date: 2026-04-07
---

Render production was rejecting some persistent log writes because `public.app_logs.source` still only allowed `client`, `next-api`, and `backend`, while the app had started emitting `proxy` and `server-component`.

The app now:

- persists those newer sources as `next-api` for compatibility,
- preserves the original value in `context.originalSource`,
- and ships a Supabase migration that expands the constraint to include `proxy` and `server-component`.

The production start script also now launches `next start` with an explicit `-H 0.0.0.0` and `-p $PORT`.
