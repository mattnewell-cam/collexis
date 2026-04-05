---
name: logging_observability_expansion
description: Expanded observability across Next server components/proxy, backend business flows, external provider/model calls, and the WhatsApp webhook while avoiding concurrent audit SQL work.
type: project
date: 2026-04-05
---

Logging coverage was expanded without touching migrations or the in-flight `audit_events` table work.

- Next.js now logs request-scoped server-component reads on the console and job pages, plus proxy-level auth refresh start/completion/failure with propagated `x-request-id` headers.
- The shared server Supabase helper now records when server-rendered auth clients are created and when cookie writes are skipped during Server Component rendering.
- Backend request logging now binds request/action/session IDs through the whole Python call stack via context variables, so semantic logs from internal business logic inherit the same trace IDs.
- Outreach planning, outreach draft generation, inbound email job inference, document extraction/intake/timeline planning, Supabase repository calls, Brevo sends, and scheduled-outreach job snapshot fetches now emit dedicated latency/status/model/provider logs.
- The WhatsApp webhook route now logs per-message and per-status semantic events plus payload-shape warnings instead of only returning aggregate counts.
