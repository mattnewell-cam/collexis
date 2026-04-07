# Project Memory Index

Each entry links to a memory file. Keep entries under ~150 chars. Files live in `.claude/memory/`.

<!-- entries below -->
- `logging_infrastructure.md` - Structured logging across client actions, Next API routes, and the Python backend with shared trace headers.
- `logging_coverage_assessment.md` - Logging foundation is strong, but client fetch detail, server-component reads, backend LLM/storage internals, and audit-grade history are still blind spots.
- `audit_events_layer.md` - Supabase now has a separate `audit_events` business-history table, with key product actions written from Next server routes while `app_logs` remains the operational log sink.
- `communications_trailing_handover_divider.md` - Past comms timeline now keeps the handover divider visible when handover falls after the last recorded communication.
- `outreach_planner_guidance.md` - Generate-plan modal captures optional tone/context guidance and stores it under a dedicated job-notes heading.
- `persistent_log_storage.md` - Structured logs now persist to Supabase `app_logs`, and AGENTS.md now requires temp logs/screenshots to stay out of the repo root.
- `logging_observability_expansion.md` - Added server-component/proxy auth logs, backend request-scoped trace binding, timed OpenAI/Supabase/Brevo logging, and deeper WhatsApp webhook event logs without touching audit SQL work.
- `password_reset_callback_fix.md` - Recovery links must round-trip through `/auth/callback` before `/reset-password` or the password update fails.
- `production_signup_flow.md` - Signup requests can succeed without feedback; show a confirmation state instead of redirecting immediately.
- `starter_timeline_backfill.md` - Sample jobs seeded into `jobs` without backend timeline rows now backfill their starter communications the first time the communications page is opened.
- `outreach_plan_change_requests.md` - Outreach-plan pages now expose a dedicated Suggest changes flow and persist plan-change requests alongside tone guidance.
- `supabase_migration_history_repair.md` - Production Supabase migration history was repaired to match local timestamps, and the missing outreach scheduler columns were applied.
- `local_first_agent_workflow.md` - Agent instructions now default to `http://localhost:3000`, commit automatically, and only push when explicitly asked.
- `runtime_artifact_layout.md` - Local generated artifacts now default into `runtime/`, including backend data, Next output, pytest cache, tsbuildinfo, the runtime venv, and Playwright profile state.
- `dev_starts_backend.md` - `npm run dev` now launches the local Python backend before Next so document-backed flows work in development without a second terminal.
- `render_log_source_compat.md` - Production now normalizes `proxy` and `server-component` log sources for the legacy `app_logs` schema and binds Next explicitly to `0.0.0.0`.
- `timeline_item_schema_compatibility.md` - Supabase timeline writes now retry without newer optional columns, and document extraction errors are sanitized before reaching the UI.
- `bug_triage_autofix_pipeline.md` - Optional bug triage now groups app_logs into incidents, asks OpenAI whether they are real bugs or transient, and can hand high-confidence cases to an external autofix runner.
- `windows_bug_autofix_runner_launch.md` - On Windows Store Codex installs, the autofix runner must launch `codex` through `cmd /c` because direct subprocess launches fail with WinError 5.
- `whatsapp_backend_boundary.md` - WhatsApp sending now executes in the Python backend, with Next narrowed to auth, forwarding, and audit work.
- `job_route_tab_cache.md` - Job sub-routes now share a client cache so documents/comms/outreach data persist across tab switches.
- `job_page_slowness_root_causes.md` - Job-page waits are amplified by per-request Supabase auth refresh, per-request outreach delivery-state detection in the backend repository, and duplicate client backend fetches during comms/documents flows.
- `document_upload_details_refresh.md` - Existing-job document uploads now rerun intake summary so the Details tab picks up new detail/context/contact data.
- `manual_communications_simplified.md` - Manual communication entries now use only medium/date/details and generate short timeline headlines with nano.
