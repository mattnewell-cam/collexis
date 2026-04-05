---
name: audit_events_layer
description: Separate business-history audit table for key product actions, alongside existing app_logs operational logging.
type: project
date: 2026-04-05
---

The app now writes a small set of product-level audit events to Supabase `public.audit_events`.

- `app_logs` remains in place for operational/debug tracing; audit history is a separate append-only layer.
- Current audited actions are `job.created`, `job.updated`, `job.deleted`, `communication.sent`, `timeline_item.deleted`, and `outreach_plan.generated`.
- Audit writes happen in Next server routes using the Supabase service-role client, while actor context comes from the authenticated user session when available.
- Timeline deletion and outreach-plan generation now go through small Next API wrappers so audit events can capture `actor_user_id` instead of relying on client-to-backend direct calls.
- The live Supabase migration was applied as `20260405201845_audit_events`, and the repo migration filename was aligned to that timestamp to avoid local/remote migration drift.
