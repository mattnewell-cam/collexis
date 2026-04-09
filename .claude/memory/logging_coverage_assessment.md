---
name: logging_coverage_assessment
description: Current logging is good for request tracing but still misses client fetch detail, server-component reads, backend internals, and durable audit history.
type: project
date: 2026-04-03
---

Logging coverage is solid at the plumbing level but incomplete at the feature and forensic levels.

- Strong coverage:
  - Client page views and top-level `runClientAction(...)` events are relayed to the server.
  - Nearly all Next route handlers use `withRouteLogging(...)`.
  - Trace headers propagate across client, Next API, and the Python backend.
  - The backend logs every request, plus explicit events for document processing and scheduled outreach.

- Important blind spots:
  - Client `loggedFetch(...)` request logs are not relayed to the server; only the browser console sees their `http.request.*` entries.
  - Server Components and `src/proxy.ts` auth/session refresh work are not instrumented with structured logs.
  - Many backend business flows rely only on generic request middleware; plan generation, draft generation, inbound email inference, storage/Supabase operations, and Python-side provider calls are not semantically logged.
  - Python-side OpenAI and `httpx` calls have no dedicated latency/status/model logs.
  - There is no durable audit/event store; this is operational logging to stdout/Render rather than per-entity history.
  - Log sanitization intentionally redacts bodies, transcripts, and similar content, which is good for privacy but limits debugging of content-specific issues.
