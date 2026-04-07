---
name: dev_starts_backend
description: `npm run dev` now launches the Python backend and Next together so local document/timeline features have port 8000 available by default.
type: project
date: 2026-04-07
---

The local development entrypoint now uses `scripts/dev-with-backend.mjs` instead of calling `next dev` directly.

- It starts the Python backend on `127.0.0.1:8000` first and waits for `/health` to pass.
- It then starts Next dev on the usual frontend port.
- If a healthy backend is already running on `8000`, it reuses it instead of spawning a second copy.
- `npm run dev:next` preserves the old frontend-only behavior when needed.
