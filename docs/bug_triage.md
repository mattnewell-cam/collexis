# Bug Triage and Autofix

Collexis can now watch persistent `app_logs`, collapse related failures into `bug_incidents`, ask OpenAI whether each incident looks like a real bug or a transient wobble, and optionally hand high-confidence incidents to an external autofix runner.

## Enable triage

Set these in `.env.local` or the deployed environment:

```env
BUG_TRIAGE_ENABLED=true
BUG_TRIAGE_MODEL=gpt-5.4-mini
BUG_TRIAGE_POLL_INTERVAL_SECONDS=300
BUG_TRIAGE_BOOTSTRAP_LOOKBACK_HOURS=24
BUG_TRIAGE_AUTOFIX_MIN_CONFIDENCE=0.82
```

Requirements:

- `OPENAI_API_KEY`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Supabase migration `20260407170000_bug_incidents.sql` applied

## Optional autofix handoff

If `BUG_AUTOFIX_RUNNER` is set, incidents that the model marks as `draft_pr` with confidence at or above `BUG_TRIAGE_AUTOFIX_MIN_CONFIDENCE` move into `autofix_pending` and are handed to that runner.

Supported runner values:

- a repo-relative script path like `scripts/bug_autofix_runner.py`
- an absolute path
- a PATH command like `codex`

Optional settings:

```env
BUG_AUTOFIX_RUNNER=scripts/bug_autofix_runner.py
BUG_AUTOFIX_REPO_PATH=.
BUG_AUTOFIX_ARTIFACTS_DIR=runtime/bug-autofix
BUG_AUTOFIX_TIMEOUT_SECONDS=1800
```

## Runner contract

The backend invokes the runner with one argument: the incident payload JSON file.

Environment variables provided:

- `COLLEXIS_BUG_INCIDENT_ID`
- `COLLEXIS_BUG_INCIDENT_FILE`
- `COLLEXIS_REPO_ROOT`

The payload file includes:

- the incident row
- the latest log and related logs
- the model's triage decision
- a `runner_prompt` that a coding agent can use directly

The runner must print one JSON object on stdout as its final line:

```json
{
  "status": "draft_pr_created",
  "summary": "Opened a draft PR with a regression test",
  "branch": "codex/fix-incident-123",
  "pr_url": "https://github.com/example/repo/pull/123"
}
```

Allowed `status` values:

- `draft_pr_created`
- `watch`
- `ignore`
- `failed`

Any non-zero exit code or invalid stdout JSON marks the incident as `autofix_failed`.

## Suggested runner behavior

For a Codex-style runner:

1. Read the payload JSON.
2. Ask the coding agent to add a regression test where practical, implement the fix, run targeted verification, commit, and open a draft PR.
3. Return the branch and PR URL as the stdout JSON result.

The backend health endpoint now exposes `bug_triage` status so you can see whether the loop is enabled, configured, and running.
