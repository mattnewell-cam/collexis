from __future__ import annotations

import json
from pathlib import Path

from backend.app.bug_triage import (
    _compact_list,
    AppLogEntry,
    BugTriageDecision,
    fingerprint_log,
    process_bug_triage_once,
    run_autofix,
)
from backend.app.config import Settings


def build_settings(tmp_path: Path) -> Settings:
    data_dir = tmp_path / "data"
    return Settings(
        data_dir=data_dir,
        database_path=data_dir / "documents.sqlite3",
        uploads_dir=data_dir / "uploads",
        openai_api_key="test-key",
        brevo_api_key="brevo-test-key",
        collexis_from_email="hello@collexis.uk",
        collexis_from_name="Collexis",
        brevo_sandbox=True,
        scheduler_poll_interval_seconds=60,
        scheduler_claim_timeout_seconds=600,
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="service-role-key",
        bug_triage_enabled=True,
    )


class FakeBugStore:
    def __init__(self, logs: list[AppLogEntry]) -> None:
        self._logs = {entry.id: entry for entry in logs}
        self.incidents_by_id: dict[str, dict[str, object]] = {}
        self.incidents_by_fingerprint: dict[str, dict[str, object]] = {}
        self.created_incident_count = 0
        self.last_processed_id: int | None = None

    def last_processed_log_id(self) -> int | None:
        return self.last_processed_id

    def update_last_processed_log_id(self, log_id: int) -> None:
        self.last_processed_id = log_id

    def list_new_error_logs(self, *, after_id: int | None, bootstrap_lookback_hours: int) -> list[AppLogEntry]:
        _ = after_id, bootstrap_lookback_hours
        return list(self._logs.values())

    def get_incident_by_fingerprint(self, fingerprint: str) -> dict[str, object] | None:
        return self.incidents_by_fingerprint.get(fingerprint)

    def create_incident_from_log(self, log: AppLogEntry, *, fingerprint: str) -> dict[str, object]:
        self.created_incident_count += 1
        incident = {
            "id": f"incident-{self.created_incident_count}",
            "fingerprint": fingerprint,
            "status": "new",
            "last_seen_at": log.timestamp,
            "first_log_id": log.id,
            "latest_log_id": log.id,
            "occurrence_count": 1,
            "last_triaged_occurrence_count": None,
            "source": log.source,
            "event": log.event,
            "latest_error": log.error,
            "latest_context": log.context,
            "sample_log_ids": [log.id],
            "sample_request_ids": [log.request_id] if log.request_id else [],
            "sample_action_ids": [log.action_id] if log.action_id else [],
            "classification": None,
            "recommended_action": None,
            "triage_confidence": None,
            "triage_summary": None,
            "triage_rationale": None,
            "likely_root_cause": None,
            "suggested_files": [],
            "fix_prompt": None,
            "autofix_requested_at": None,
            "autofix_payload_path": None,
            "autofix_branch": None,
            "autofix_pr_url": None,
            "autofix_last_error": None,
        }
        self.incidents_by_id[str(incident["id"])] = incident
        self.incidents_by_fingerprint[fingerprint] = incident
        return incident

    def mark_incident_seen(self, incident: dict[str, object], log: AppLogEntry) -> dict[str, object]:
        incident["occurrence_count"] = int(incident.get("occurrence_count") or 0) + 1
        incident["latest_log_id"] = log.id
        incident["last_seen_at"] = log.timestamp
        return incident

    def list_triage_candidates(self) -> list[dict[str, object]]:
        return [
            incident
            for incident in self.incidents_by_id.values()
            if incident.get("last_triaged_occurrence_count") is None
            or int(incident.get("occurrence_count") or 0) > int(incident.get("last_triaged_occurrence_count") or 0)
        ]

    def list_pending_autofix(self) -> list[dict[str, object]]:
        return [
            incident
            for incident in self.incidents_by_id.values()
            if incident.get("status") == "autofix_pending"
        ]

    def list_logs_by_ids(self, log_ids: list[int]) -> list[AppLogEntry]:
        return [self._logs[log_id] for log_id in log_ids if log_id in self._logs]

    def list_logs_for_request_id(self, request_id: str) -> list[AppLogEntry]:
        return [entry for entry in self._logs.values() if entry.request_id == request_id]

    def list_logs_for_action_id(self, action_id: str) -> list[AppLogEntry]:
        return [entry for entry in self._logs.values() if entry.action_id == action_id]

    def update_incident(self, incident_id: str, **fields: object) -> dict[str, object]:
        incident = self.incidents_by_id[incident_id]
        incident.update(fields)
        return incident


class RunnerStore:
    def __init__(self, incident: dict[str, object]) -> None:
        self.incident = incident
        self.updates: list[dict[str, object]] = []

    def update_incident(self, incident_id: str, **fields: object) -> dict[str, object]:
        assert incident_id == self.incident["id"]
        self.updates.append(fields)
        self.incident.update(fields)
        return self.incident


def test_fingerprint_log_normalizes_dynamic_bits() -> None:
    first = AppLogEntry(
        id=1,
        timestamp="2026-04-07T12:00:00+00:00",
        level="error",
        source="backend",
        event="backend.request.failed",
        context={"path": "/jobs/703e2d61-7381-40e7-97ed-4859aeff0b81/documents", "status": 400},
        error="httpx.HTTPStatusError: Client error '400 Bad Request' for url 'https://example.supabase.co/rest/v1/timeline_items'",
    )
    second = AppLogEntry(
        id=2,
        timestamp="2026-04-07T12:05:00+00:00",
        level="error",
        source="backend",
        event="backend.request.failed",
        context={"path": "/jobs/12345678-1234-1234-1234-123456789012/documents", "status": 400},
        error="httpx.HTTPStatusError: Client error '400 Bad Request' for url 'https://different.supabase.co/rest/v1/timeline_items'",
    )

    assert fingerprint_log(first) == fingerprint_log(second)


def test_compact_list_ignores_empty_list_values_without_crashing() -> None:
    assert _compact_list([1, 2], []) == [1, 2]
    assert _compact_list(["req-1"], None) == ["req-1"]


def test_process_bug_triage_triages_single_hit_bug_and_hands_off(monkeypatch, tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    settings = Settings(
        **{**settings.__dict__, "bug_autofix_runner": tmp_path / "runner.py"},
    )
    log_entry = AppLogEntry(
        id=11,
        timestamp="2026-04-07T12:00:00+00:00",
        level="error",
        source="backend",
        event="backend.request.failed",
        request_id="req-1",
        context={"path": "/jobs/job-1/documents", "status": 500},
        error="ValueError: timeline item payload invalid",
    )
    store = FakeBugStore([log_entry])
    handed_off: list[str] = []

    monkeypatch.setattr("backend.app.bug_triage.SupabaseBugIncidentStore", lambda settings: store)
    monkeypatch.setattr(
        "backend.app.bug_triage.assess_incident",
        lambda settings, *, incident, latest_log, related_logs: BugTriageDecision(
            classification="likely_bug",
            recommended_action="draft_pr",
            confidence=0.93,
            summary="Timeline item writes fail during document processing.",
            rationale="The logs show a deterministic backend failure in a normal workflow.",
            likely_root_cause="The write payload does not match the expected persistence schema.",
            suggested_files=["backend/app/repository_supabase.py"],
            fix_prompt="Add a regression test and fix the timeline write path.",
        ),
    )
    monkeypatch.setattr(
        "backend.app.bug_triage.run_autofix",
        lambda store, *, settings, incident, latest_log, related_logs: handed_off.append(str(incident["id"])) or True,
    )

    result = process_bug_triage_once(settings)

    assert result.processed_log_count == 1
    assert result.triaged_incident_count == 1
    assert result.autofix_run_count == 1
    assert store.last_processed_id == 11
    assert handed_off == ["incident-1"]
    incident = store.incidents_by_id["incident-1"]
    assert incident["status"] == "autofix_pending"
    assert incident["recommended_action"] == "draft_pr"
    assert incident["classification"] == "likely_bug"


def test_process_bug_triage_skips_internal_triage_logs(monkeypatch, tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    log_entry = AppLogEntry(
        id=22,
        timestamp="2026-04-07T12:00:00+00:00",
        level="error",
        source="backend",
        event="bug_triage.assess.failed",
        context={"operation": "bug_triage.assess"},
        error="RuntimeError: test",
    )
    store = FakeBugStore([log_entry])
    monkeypatch.setattr("backend.app.bug_triage.SupabaseBugIncidentStore", lambda settings: store)

    result = process_bug_triage_once(settings)

    assert result.processed_log_count == 1
    assert result.triaged_incident_count == 0
    assert store.created_incident_count == 0
    assert store.last_processed_id == 22


def test_run_autofix_executes_python_runner_and_records_pr(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    runner = tmp_path / "runner.py"
    runner.write_text(
        "\n".join(
            [
                "from __future__ import annotations",
                "import json",
                "import sys",
                "payload = json.load(open(sys.argv[1], 'r', encoding='utf-8'))",
                "assert payload['incident']['id'] == 'incident-123'",
                "print(json.dumps({'status': 'draft_pr_created', 'branch': 'codex/fix-incident-123', 'pr_url': 'https://example.com/pr/123'}))",
            ]
        ),
        encoding="utf-8",
    )
    settings = Settings(
        **{
            **settings.__dict__,
            "bug_autofix_runner": runner,
            "bug_autofix_repo_path": tmp_path,
            "bug_autofix_artifacts_dir": tmp_path / "artifacts",
        },
    )
    incident = {
        "id": "incident-123",
        "classification": "likely_bug",
        "recommended_action": "draft_pr",
        "triage_confidence": 0.94,
        "triage_summary": "A real bug.",
        "triage_rationale": "Deterministic failure.",
        "likely_root_cause": "Schema mismatch.",
        "suggested_files": ["backend/app/repository_supabase.py"],
        "fix_prompt": "Fix it.",
    }
    store = RunnerStore(incident)
    latest_log = AppLogEntry(
        id=33,
        timestamp="2026-04-07T12:00:00+00:00",
        level="error",
        source="backend",
        event="backend.request.failed",
        request_id="req-runner",
        context={"path": "/jobs/job-1/documents"},
        error="ValueError: broken",
    )

    created_pr = run_autofix(
        store,
        settings=settings,
        incident=incident,
        latest_log=latest_log,
        related_logs=[latest_log],
    )

    assert created_pr is True
    assert incident["status"] == "draft_pr_created"
    assert incident["autofix_branch"] == "codex/fix-incident-123"
    assert incident["autofix_pr_url"] == "https://example.com/pr/123"
    assert (tmp_path / "artifacts" / "incident-123.json").exists()
