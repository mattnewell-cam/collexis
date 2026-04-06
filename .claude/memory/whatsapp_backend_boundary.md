---
name: whatsapp_backend_boundary
description: WhatsApp sending now executes in the Python backend, with Next acting as a thin auth/forward/audit layer.
type: project
date: 2026-04-06
---

WhatsApp send execution now belongs to the Python backend instead of the Next route layer.

- `src/app/api/jobs/[id]/send-whatsapp/route.ts` now does app-facing work only: Supabase auth, job lookup, request validation, forwarding to the Python backend, and audit logging.
- `backend/app/main.py` exposes `POST /jobs/{job_id}/send-whatsapp`, which validates the payload, invokes the sender, and records the timeline item.
- `backend/app/whatsapp_sender.py` owns the Node/Playwright handoff by running `scripts/send-whatsapp.mjs` from Python.
- The sender now prefers a populated `runtime/playwright/whatsapp-profile` directory, but falls back to the legacy root `.playwright-profile` automatically so old authenticated sessions still work after the runtime-artifact cleanup.
- This boundary keeps Playwright out of the Next production bundle, which fixes the prior `npm run build` failure around the WhatsApp route.
