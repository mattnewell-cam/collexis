---
name: bug_triage_autofix_pipeline
description: Optional backend bug triage now groups app_logs into bug_incidents, asks OpenAI whether each is a real bug or transient, and can hand high-confidence incidents to an external autofix runner for draft PR creation.
type: project
date: 2026-04-07
---

Collexis now has an optional backend bug triage loop.

- It watches persistent Supabase `app_logs` rows and groups distinct failures into `bug_incidents`.
- Fingerprints normalize dynamic values like URLs, UUIDs, long IDs, timestamps, and paths so repeat variants collapse together.
- The triage model is intended for a single-user app, so it does not wait for repeated reports before calling something a likely real bug.
- High-confidence `draft_pr` decisions can be handed to an external runner via `BUG_AUTOFIX_RUNNER`.
- The runner receives an incident payload JSON path as argv[1], plus `COLLEXIS_BUG_INCIDENT_ID`, `COLLEXIS_BUG_INCIDENT_FILE`, and `COLLEXIS_REPO_ROOT`.
- The runner must emit a final stdout JSON line with `status`, and optionally `branch`, `pr_url`, `summary`, and `error`.
- Health output now includes a `bug_triage` block showing whether the loop is enabled, configured, and healthy.
