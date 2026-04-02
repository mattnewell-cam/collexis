---
name: logging_infrastructure
description: Structured client, Next API, and backend logging with correlation IDs and client log relay.
type: project
date: 2026-04-02
---

The app now has a shared structured logging layer.

- Client logs live under `src/lib/logging/` and include `runClientAction`, `loggedFetch`, and a root `RouteLogger` for page-view tracing.
- Meaningful browser actions are relayed to the server through `POST /api/client-logs`, so production Render logs capture page views and user-triggered actions instead of relying only on the browser console.
- Request tracing uses `x-request-id`, `x-collexis-action-id`, `x-collexis-session-id`, and `x-collexis-trace-origin` headers across client, Next API routes, and the Python backend.
- Next API routes use `withRouteLogging(...)` for request start/completion/error logs, and outbound calls from Next to the Python backend/providers use `loggedFetch(...)` with propagated trace headers.
- The Python backend now uses JSON logging via `backend/app/logging_utils.py`, request middleware in `backend/app/main.py`, and extra logs for document processing and scheduled outreach.
- Log payloads are intentionally sanitized: passwords, tokens, message bodies, transcripts, and similar content are redacted or reduced to counts/lengths rather than full contents.

