# Project Memory Index

Each entry links to a memory file. Keep entries under ~150 chars. Files live in `.claude/memory/`.

<!-- entries below -->
- `logging_infrastructure.md` - Structured logging across client actions, Next API routes, and the Python backend with shared trace headers.
- `logging_coverage_assessment.md` - Logging foundation is strong, but client fetch detail, server-component reads, backend LLM/storage internals, and audit-grade history are still blind spots.
- `communications_trailing_handover_divider.md` - Past comms timeline now keeps the handover divider visible when handover falls after the last recorded communication.
- `outreach_planner_guidance.md` - Generate-plan modal captures optional tone/context guidance and stores it under a dedicated job-notes heading.
- `persistent_log_storage.md` - Structured logs now persist to Supabase `app_logs`, and AGENTS.md now requires temp logs/screenshots to stay out of the repo root.
- `password_reset_callback_fix.md` - Recovery links must round-trip through `/auth/callback` before `/reset-password` or the password update fails.
- `production_signup_flow.md` - Signup requests can succeed without feedback; show a confirmation state instead of redirecting immediately.
- `outreach_plan_change_requests.md` - Outreach-plan pages now expose a dedicated Suggest changes flow and persist plan-change requests alongside tone guidance.
- `supabase_migration_history_repair.md` - Production Supabase migration history was repaired to match local timestamps, and the missing outreach scheduler columns were applied.
