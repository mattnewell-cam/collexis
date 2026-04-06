---
name: runtime_artifact_layout
description: Local generated runtime artifacts now default into a dedicated runtime/ directory tree instead of scattering across backend/ and the repo root.
type: project
date: 2026-04-06
---

Local generated artifacts are being consolidated under `runtime/`:

- Backend local SQLite/uploads default to `runtime/backend-data/default`.
- Ad hoc backend `.data-*` sandboxes belong under `runtime/backend-data/sandboxes/`.
- Next build/dev output uses `runtime/next` via `distDir`.
- Pytest cache uses `runtime/pytest-cache`.
- TypeScript incremental build info uses `runtime/typescript/tsconfig.tsbuildinfo`.
- The local build/start scripts create the runtime venv under `runtime/venvs/collexis`.
- The Playwright WhatsApp profile path now points at `runtime/playwright/whatsapp-profile`.

If old root-level `.next`, `.collexis-runtime-venv`, or `backend/.data` directories still exist, check for already-running local processes before deleting them; they may be leftovers from sessions started before the runtime-path change.
