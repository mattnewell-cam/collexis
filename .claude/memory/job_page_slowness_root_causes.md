---
name: job_page_slowness_root_causes
description: Job-page waits are amplified by per-request Supabase auth refresh, per-request outreach delivery-state detection in the backend repository, and duplicate client backend fetches during comms/documents flows.
type: project
date: 2026-04-07
---

Investigation on April 7, 2026 found three main contributors to slow job pages and noisy failures:

1. `src/proxy.ts` refreshes Supabase auth with `supabase.auth.getUser()` on every matched request, including page requests, backend proxy requests, and `/api/client-logs`.
2. `backend/app/repository.py` creates a fresh `DocumentRepository` per request, and the Supabase implementation in `backend/app/repository_supabase.py` probes `outreach_plan_steps` support in `__post_init__` every time via `_detect_outreach_delivery_state_support()`. That adds an extra Supabase REST call ahead of the real query for documents, timeline, and outreach-plan reads.
3. `src/components/JobCommsView.tsx` and `src/components/JobDocumentsView.tsx` can trigger repeated backend reads and polling, which multiplies the cost of the two items above during development and document-processing flows.

Observed evidence:

- Backend logs showed duplicate `GET /jobs/{id}/documents`, `GET /jobs/{id}/timeline-items`, and `GET /jobs/{id}/outreach-plan` requests for the same job within the same interaction window.
- A single `repository.detect_outreach_delivery_state` probe took about 7.5 seconds, which turned one outreach-plan request into an 8.9-second backend request by itself.
- Document-processing logs for job `8f13b8ba-2c1a-408b-8df0-74d6bd82d076` also showed `openai.responses.parse.failed` / `documents.processing.failed` events, so some “bug” noise in that session came from document extraction failures as well as slow reads.
