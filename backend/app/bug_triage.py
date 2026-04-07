from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import json
import logging
import os
from pathlib import Path
from time import perf_counter
import re
import subprocess
import sys
import threading
from typing import Any, Literal

import httpx
from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError

from .config import Settings
from .logging_utils import log_event


logger = logging.getLogger(__name__)

FINGERPRINT_UUID_RE = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b", re.IGNORECASE)
FINGERPRINT_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
FINGERPRINT_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
FINGERPRINT_TIMESTAMP_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}[tT ][0-9:.+-Zz]+\b")
FINGERPRINT_LONG_NUMBER_RE = re.compile(r"\b\d{4,}\b")
FINGERPRINT_HEX_RE = re.compile(r"\b0x[0-9a-f]+\b", re.IGNORECASE)
FINGERPRINT_WINDOWS_PATH_RE = re.compile(r"[A-Za-z]:\\\\[^\s:]+")
FINGERPRINT_POSIX_PATH_RE = re.compile(r"(?<![A-Za-z0-9_.-])/(?:[^/\s]+/)*[^/\s]+")
FINGERPRINT_WHITESPACE_RE = re.compile(r"\s+")
BUG_TRIAGE_MAX_NEW_LOGS = 100
BUG_TRIAGE_MAX_CONTEXT_LOGS = 12
BUG_TRIAGE_MAX_SAMPLES = 8
BUG_TRIAGE_MAX_CANDIDATES = 4


class AppLogEntry(BaseModel):
    id: int
    timestamp: str
    level: str
    source: str
    event: str
    request_id: str | None = None
    action_id: str | None = None
    session_id: str | None = None
    context: dict[str, Any] | None = None
    error: str | None = None


class BugTriageDecision(BaseModel):
    classification: Literal["likely_bug", "likely_transient", "unclear"]
    recommended_action: Literal["ignore", "watch", "draft_pr"]
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    summary: str = Field(default="")
    rationale: str = Field(default="")
    likely_root_cause: str = Field(default="")
    suggested_files: list[str] = Field(default_factory=list)
    fix_prompt: str = Field(default="")


class AutofixRunnerResult(BaseModel):
    status: Literal["draft_pr_created", "watch", "ignore", "failed"]
    summary: str = Field(default="")
    branch: str | None = None
    pr_url: str | None = None
    error: str | None = None


@dataclass(frozen=True)
class BugTriageLoopResult:
    processed_log_count: int = 0
    triaged_incident_count: int = 0
    autofix_run_count: int = 0


@dataclass
class BugTriageSnapshot:
    started_at: str
    last_heartbeat_at: str | None
    last_success_at: str | None
    last_error_at: str | None
    last_error: str | None
    processed_log_count: int
    triaged_incident_count: int
    autofix_run_count: int


class BugTriageMonitor:
    def __init__(self, poll_interval_seconds: int):
        self._poll_interval_seconds = poll_interval_seconds
        self._started_at = datetime.now(UTC)
        self._last_heartbeat_at: datetime | None = None
        self._last_success_at: datetime | None = None
        self._last_error_at: datetime | None = None
        self._last_error: str | None = None
        self._processed_log_count = 0
        self._triaged_incident_count = 0
        self._autofix_run_count = 0
        self._lock = threading.Lock()

    def mark_heartbeat(self) -> None:
        with self._lock:
            self._last_heartbeat_at = datetime.now(UTC)

    def mark_success(self, result: BugTriageLoopResult) -> None:
        with self._lock:
            now = datetime.now(UTC)
            self._last_heartbeat_at = now
            self._last_success_at = now
            self._last_error_at = None
            self._last_error = None
            self._processed_log_count = result.processed_log_count
            self._triaged_incident_count = result.triaged_incident_count
            self._autofix_run_count = result.autofix_run_count

    def mark_error(self, error: Exception) -> None:
        with self._lock:
            now = datetime.now(UTC)
            self._last_heartbeat_at = now
            self._last_error_at = now
            self._last_error = str(error)

    def is_healthy(self) -> bool:
        with self._lock:
            now = datetime.now(UTC)
            grace_window = max((self._poll_interval_seconds * 3) + 30, 120)
            if self._last_heartbeat_at is None:
                return (now - self._started_at).total_seconds() <= grace_window
            return (now - self._last_heartbeat_at).total_seconds() <= grace_window

    def snapshot(self) -> BugTriageSnapshot:
        with self._lock:
            return BugTriageSnapshot(
                started_at=self._started_at.isoformat(),
                last_heartbeat_at=self._last_heartbeat_at.isoformat() if self._last_heartbeat_at else None,
                last_success_at=self._last_success_at.isoformat() if self._last_success_at else None,
                last_error_at=self._last_error_at.isoformat() if self._last_error_at else None,
                last_error=self._last_error,
                processed_log_count=self._processed_log_count,
                triaged_incident_count=self._triaged_incident_count,
                autofix_run_count=self._autofix_run_count,
            )


def bug_triage_is_configured(settings: Settings) -> bool:
    return bool(
        settings.bug_triage_enabled
        and settings.openai_api_key
        and settings.supabase_url
        and settings.supabase_service_role_key
    )


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def error_excerpt(value: str | None) -> str:
    if not value:
        return ""
    lines = [line.strip() for line in str(value).splitlines() if line.strip()]
    if not lines:
        return ""
    for line in reversed(lines):
        lowered = line.lower()
        if lowered.startswith("traceback "):
            continue
        if lowered.startswith("file "):
            continue
        if lowered == "^":
            continue
        return line
    return lines[-1]


def normalize_fingerprint_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = error_excerpt(value).lower()
    normalized = FINGERPRINT_URL_RE.sub("[url]", normalized)
    normalized = FINGERPRINT_UUID_RE.sub("[uuid]", normalized)
    normalized = FINGERPRINT_EMAIL_RE.sub("[email]", normalized)
    normalized = FINGERPRINT_TIMESTAMP_RE.sub("[timestamp]", normalized)
    normalized = FINGERPRINT_WINDOWS_PATH_RE.sub("[path]", normalized)
    normalized = FINGERPRINT_POSIX_PATH_RE.sub("[path]", normalized)
    normalized = FINGERPRINT_HEX_RE.sub("[hex]", normalized)
    normalized = FINGERPRINT_LONG_NUMBER_RE.sub("[n]", normalized)
    normalized = FINGERPRINT_WHITESPACE_RE.sub(" ", normalized).strip()
    return normalized[:320]


def summarize_log_error(log: AppLogEntry) -> str:
    if log.error:
        return error_excerpt(log.error)
    context_error = (log.context or {}).get("error")
    if isinstance(context_error, dict):
        message = context_error.get("message")
        if message:
            return error_excerpt(str(message))
    if isinstance(context_error, str):
        return error_excerpt(context_error)
    return ""


def fingerprint_log(log: AppLogEntry) -> str:
    context = log.context or {}
    parts = [
        normalize_fingerprint_text(log.source),
        normalize_fingerprint_text(log.event),
        normalize_fingerprint_text(str(context.get("path") or "")),
        normalize_fingerprint_text(str(context.get("operation") or "")),
        normalize_fingerprint_text(str(context.get("table") or "")),
        normalize_fingerprint_text(str(context.get("provider") or "")),
        normalize_fingerprint_text(str(context.get("status") or "")),
        normalize_fingerprint_text(summarize_log_error(log)),
    ]
    return " | ".join(part for part in parts if part)[:500]


def is_internal_bug_triage_log(log: AppLogEntry) -> bool:
    context = log.context or {}
    operation = str(context.get("operation") or "")
    table = str(context.get("table") or "")
    return log.event.startswith("bug_triage.") or operation.startswith("bug_triage") or table == "bug_incidents"


def _compact_list(values: list[Any], new_value: Any) -> list[Any]:
    if new_value is None or new_value == "" or new_value == []:
        return values[:BUG_TRIAGE_MAX_SAMPLES]
    merged = [*values, new_value]
    deduped: list[Any] = []
    for item in merged:
        if item in deduped:
            continue
        deduped.append(item)
    return deduped[-BUG_TRIAGE_MAX_SAMPLES:]


def default_runner_prompt(incident: dict[str, Any], decision: BugTriageDecision) -> str:
    lines = [
        "Investigate and fix the following likely real bug in the Collexis repo.",
        "",
        f"Incident ID: {incident.get('id')}",
        f"Fingerprint: {incident.get('fingerprint')}",
    ]
    if decision.summary.strip():
        lines.append(f"Summary: {decision.summary.strip()}")
    if decision.rationale.strip():
        lines.append(f"Why this looks real: {decision.rationale.strip()}")
    if decision.likely_root_cause.strip():
        lines.append(f"Likely root cause: {decision.likely_root_cause.strip()}")
    if decision.suggested_files:
        lines.append(f"Likely files: {', '.join(decision.suggested_files[:8])}")
    lines.extend(
        [
            "",
            "Requirements:",
            "- add or update a regression test where practical",
            "- implement the fix",
            "- run targeted verification",
            "- commit the changes",
            "- open a draft PR",
            "- never push directly to main",
        ]
    )
    return "\n".join(lines).strip()


def bug_triage_prompt() -> str:
    return (
        "You are triaging structured production/app errors for Collexis, a single-user debt-collection workflow app. "
        "Do not require repeated reports before calling something a likely bug, because the same user may only hit the issue once. "
        "Classify each incident as likely_bug, likely_transient, or unclear. "
        "Use draft_pr only when this looks like a real product bug and there is a concrete, bounded fix direction a coding agent could attempt from repo context. "
        "Use watch when it may be real but more evidence or local repo inspection is still needed. "
        "Use ignore only when the incident is probably noise, a transient external wobble, or clearly outside product responsibility. "
        "Treat deterministic schema mismatches, null/type errors, failed writes in normal flows, and validation mismatches as likely_bug. "
        "Treat network timeouts, connection resets, upstream 429s, upstream 5xxs, and browser/session glitches as likely_transient unless the logs point to our request shape or code. "
        "Be conservative about suggested files: include only files you have a real signal for."
    )


def build_triage_payload(
    incident: dict[str, Any],
    *,
    latest_log: AppLogEntry | None,
    related_logs: list[AppLogEntry],
) -> dict[str, Any]:
    return {
        "incident": {
            "id": incident.get("id"),
            "fingerprint": incident.get("fingerprint"),
            "status": incident.get("status"),
            "occurrence_count": incident.get("occurrence_count"),
            "source": incident.get("source"),
            "event": incident.get("event"),
            "latest_error": incident.get("latest_error"),
            "latest_context": incident.get("latest_context"),
            "last_seen_at": incident.get("last_seen_at"),
            "last_triaged_at": incident.get("last_triaged_at"),
        },
        "latest_log": latest_log.model_dump() if latest_log is not None else None,
        "related_logs": [entry.model_dump() for entry in related_logs],
        "repo_hints": {
            "backend_routes": "backend/app/main.py",
            "document_extraction": "backend/app/extraction.py",
            "supabase_repository": "backend/app/repository_supabase.py",
            "frontend_api_routes": "src/app/api/",
            "logging": "src/lib/logging/ and backend/app/logging_utils.py",
        },
    }


def parse_runner_stdout(stdout: str) -> AutofixRunnerResult:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    for line in reversed(lines):
        try:
            return AutofixRunnerResult.model_validate_json(line)
        except (ValidationError, json.JSONDecodeError):
            continue
    raise RuntimeError("Autofix runner did not emit a valid JSON result on stdout.")


def write_autofix_payload(
    settings: Settings,
    *,
    incident: dict[str, Any],
    decision: BugTriageDecision,
    latest_log: AppLogEntry | None,
    related_logs: list[AppLogEntry],
) -> Path:
    settings.bug_autofix_artifacts_dir.mkdir(parents=True, exist_ok=True)
    payload_path = settings.bug_autofix_artifacts_dir / f"{incident['id']}.json"
    payload = {
        "generated_at": utc_now(),
        "repo_root": str(settings.bug_autofix_repo_path),
        "incident": incident,
        "latest_log": latest_log.model_dump() if latest_log is not None else None,
        "related_logs": [entry.model_dump() for entry in related_logs],
        "decision": decision.model_dump(),
        "runner_prompt": decision.fix_prompt.strip() or default_runner_prompt(incident, decision),
        "contract": {
            "stdout_json": {
                "status": "draft_pr_created | watch | ignore | failed",
                "summary": "short human-readable outcome",
                "branch": "optional branch name",
                "pr_url": "optional pull request URL",
                "error": "optional failure detail",
            }
        },
    }
    payload_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True, default=str), encoding="utf-8")
    return payload_path


def build_runner_command(runner: Path, payload_path: Path) -> list[str]:
    suffix = runner.suffix.lower()
    if suffix == ".py":
        return [sys.executable, str(runner), str(payload_path)]
    if suffix == ".ps1":
        return [
            "powershell",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(runner),
            str(payload_path),
        ]
    return [str(runner), str(payload_path)]


def resolve_runner_path(settings: Settings, runner: Path) -> Path | None:
    if runner.is_absolute():
        return runner
    if len(runner.parts) > 1 or runner.suffix.lower() in {".py", ".ps1", ".cmd", ".bat", ".exe"}:
        return (settings.bug_autofix_repo_path / runner).resolve()
    return None


class SupabaseBugIncidentStore:
    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise RuntimeError("Supabase bug triage storage is not configured.")
        self._rest_base_url = settings.supabase_url.rstrip("/") + "/rest/v1"
        self._headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
        }

    def _rest_request(
        self,
        method: str,
        table: str,
        *,
        params: dict[str, str] | None = None,
        json_body: Any = None,
        return_representation: bool = True,
        object_response: bool = False,
    ) -> Any:
        headers = dict(self._headers)
        if return_representation:
            headers["Prefer"] = "return=representation"
        if object_response:
            headers["Accept"] = "application/vnd.pgrst.object+json"
        target = f"{self._rest_base_url}/{table}"
        started_at = perf_counter()
        log_event(
            logger,
            logging.INFO,
            "supabase.rest.request.started",
            table=table,
            method=method.upper(),
            target=target,
            operation="bug_triage.store",
            object_response=object_response,
            return_representation=return_representation,
            param_keys=sorted((params or {}).keys()),
        )
        try:
            response = httpx.request(
                method,
                target,
                params=params,
                json=json_body,
                headers=headers,
                timeout=60.0,
            )
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                "supabase.rest.request.failed",
                table=table,
                method=method.upper(),
                target=target,
                operation="bug_triage.store",
                duration_ms=int((perf_counter() - started_at) * 1000),
                param_keys=sorted((params or {}).keys()),
                error=exc,
            )
            raise
        log_event(
            logger,
            logging.INFO if response.status_code < 400 else logging.WARNING,
            "supabase.rest.request.completed",
            table=table,
            method=method.upper(),
            target=target,
            operation="bug_triage.store",
            duration_ms=int((perf_counter() - started_at) * 1000),
            param_keys=sorted((params or {}).keys()),
            status=response.status_code,
        )
        if object_response and response.status_code == 406:
            return None
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()

    def last_processed_log_id(self) -> int | None:
        row = self._rest_request(
            "GET",
            "bug_triage_state",
            params={"select": "last_processed_log_id", "id": "eq.singleton"},
            object_response=True,
        )
        if not row:
            return None
        value = row.get("last_processed_log_id")
        return int(value) if value is not None else None

    def update_last_processed_log_id(self, log_id: int) -> None:
        self._rest_request(
            "PATCH",
            "bug_triage_state",
            params={"id": "eq.singleton"},
            json_body={
                "last_processed_log_id": log_id,
                "last_processed_at": utc_now(),
            },
            return_representation=False,
        )

    def list_new_error_logs(self, *, after_id: int | None, bootstrap_lookback_hours: int) -> list[AppLogEntry]:
        params = {
            "select": "id,timestamp,level,source,event,request_id,action_id,session_id,context,error",
            "level": "eq.error",
            "order": "id.asc",
            "limit": str(BUG_TRIAGE_MAX_NEW_LOGS),
        }
        if after_id is not None:
            params["id"] = f"gt.{after_id}"
        else:
            since = (datetime.now(UTC) - timedelta(hours=bootstrap_lookback_hours)).isoformat()
            params["timestamp"] = f"gte.{since}"
        rows = self._rest_request("GET", "app_logs", params=params)
        return [AppLogEntry.model_validate(row) for row in rows or []]

    def get_incident_by_fingerprint(self, fingerprint: str) -> dict[str, Any] | None:
        return self._rest_request(
            "GET",
            "bug_incidents",
            params={"select": "*", "fingerprint": f"eq.{fingerprint}"},
            object_response=True,
        )

    def get_incident(self, incident_id: str) -> dict[str, Any] | None:
        return self._rest_request(
            "GET",
            "bug_incidents",
            params={"select": "*", "id": f"eq.{incident_id}"},
            object_response=True,
        )

    def create_incident_from_log(self, log: AppLogEntry, *, fingerprint: str) -> dict[str, Any]:
        rows = self._rest_request(
            "POST",
            "bug_incidents",
            json_body={
                "fingerprint": fingerprint,
                "status": "new",
                "first_seen_at": log.timestamp,
                "last_seen_at": log.timestamp,
                "first_log_id": log.id,
                "latest_log_id": log.id,
                "occurrence_count": 1,
                "source": log.source,
                "event": log.event,
                "latest_level": log.level,
                "latest_error": summarize_log_error(log) or None,
                "latest_context": log.context or None,
                "sample_log_ids": [log.id],
                "sample_request_ids": [log.request_id] if log.request_id else [],
                "sample_action_ids": [log.action_id] if log.action_id else [],
                "updated_at": utc_now(),
            },
        )
        return (rows or [None])[0]

    def mark_incident_seen(self, incident: dict[str, Any], log: AppLogEntry) -> dict[str, Any]:
        sample_log_ids = [int(value) for value in list(incident.get("sample_log_ids") or []) if value is not None]
        sample_request_ids = [str(value) for value in list(incident.get("sample_request_ids") or []) if value]
        sample_action_ids = [str(value) for value in list(incident.get("sample_action_ids") or []) if value]
        rows = self._rest_request(
            "PATCH",
            "bug_incidents",
            params={"id": f"eq.{incident['id']}"},
            json_body={
                "last_seen_at": log.timestamp,
                "latest_log_id": log.id,
                "occurrence_count": int(incident.get("occurrence_count") or 0) + 1,
                "source": log.source,
                "event": log.event,
                "latest_level": log.level,
                "latest_error": summarize_log_error(log) or None,
                "latest_context": log.context or None,
                "sample_log_ids": _compact_list(sample_log_ids, log.id),
                "sample_request_ids": _compact_list(sample_request_ids, log.request_id),
                "sample_action_ids": _compact_list(sample_action_ids, log.action_id),
                "updated_at": utc_now(),
            },
        )
        return (rows or [incident])[0]

    def list_triage_candidates(self) -> list[dict[str, Any]]:
        rows = self._rest_request(
            "GET",
            "bug_incidents",
            params={
                "select": "*",
                "status": "in.(new,watching,ignored,autofix_failed)",
                "order": "last_seen_at.desc",
                "limit": "25",
            },
        )
        incidents = rows or []
        return [
            incident
            for incident in incidents
            if incident.get("last_triaged_occurrence_count") is None
            or int(incident.get("occurrence_count") or 0) > int(incident.get("last_triaged_occurrence_count") or 0)
        ]

    def list_pending_autofix(self) -> list[dict[str, Any]]:
        rows = self._rest_request(
            "GET",
            "bug_incidents",
            params={
                "select": "*",
                "status": "eq.autofix_pending",
                "order": "last_seen_at.desc",
                "limit": str(BUG_TRIAGE_MAX_CANDIDATES),
            },
        )
        return rows or []

    def list_logs_for_request_id(self, request_id: str) -> list[AppLogEntry]:
        rows = self._rest_request(
            "GET",
            "app_logs",
            params={
                "select": "id,timestamp,level,source,event,request_id,action_id,session_id,context,error",
                "request_id": f"eq.{request_id}",
                "order": "timestamp.asc",
                "limit": str(BUG_TRIAGE_MAX_CONTEXT_LOGS),
            },
        )
        return [AppLogEntry.model_validate(row) for row in rows or []]

    def list_logs_for_action_id(self, action_id: str) -> list[AppLogEntry]:
        rows = self._rest_request(
            "GET",
            "app_logs",
            params={
                "select": "id,timestamp,level,source,event,request_id,action_id,session_id,context,error",
                "action_id": f"eq.{action_id}",
                "order": "timestamp.asc",
                "limit": str(BUG_TRIAGE_MAX_CONTEXT_LOGS),
            },
        )
        return [AppLogEntry.model_validate(row) for row in rows or []]

    def list_logs_by_ids(self, log_ids: list[int]) -> list[AppLogEntry]:
        if not log_ids:
            return []
        joined = ",".join(str(log_id) for log_id in sorted(set(log_ids)))
        rows = self._rest_request(
            "GET",
            "app_logs",
            params={
                "select": "id,timestamp,level,source,event,request_id,action_id,session_id,context,error",
                "id": f"in.({joined})",
                "order": "timestamp.asc",
                "limit": str(BUG_TRIAGE_MAX_CONTEXT_LOGS),
            },
        )
        return [AppLogEntry.model_validate(row) for row in rows or []]

    def update_incident(self, incident_id: str, **fields: Any) -> dict[str, Any]:
        rows = self._rest_request(
            "PATCH",
            "bug_incidents",
            params={"id": f"eq.{incident_id}"},
            json_body={**fields, "updated_at": utc_now()},
        )
        return (rows or [None])[0]


def collect_related_logs(store: SupabaseBugIncidentStore, incident: dict[str, Any]) -> tuple[AppLogEntry | None, list[AppLogEntry]]:
    latest_log = None
    if incident.get("latest_log_id") is not None:
        matching = store.list_logs_by_ids([int(incident["latest_log_id"])])
        latest_log = matching[0] if matching else None

    request_id = latest_log.request_id if latest_log is not None else None
    action_id = latest_log.action_id if latest_log is not None else None
    if request_id is None:
        request_ids = list(incident.get("sample_request_ids") or [])
        request_id = str(request_ids[-1]) if request_ids else None
    if action_id is None:
        action_ids = list(incident.get("sample_action_ids") or [])
        action_id = str(action_ids[-1]) if action_ids else None

    related_logs: list[AppLogEntry] = []
    if request_id:
        related_logs.extend(store.list_logs_for_request_id(request_id))
    if action_id and not any(entry.action_id == action_id for entry in related_logs):
        related_logs.extend(store.list_logs_for_action_id(action_id))
    if not related_logs:
        sample_log_ids = [int(value) for value in list(incident.get("sample_log_ids") or []) if value is not None]
        related_logs.extend(store.list_logs_by_ids(sample_log_ids))

    deduped: dict[int, AppLogEntry] = {}
    for entry in related_logs:
        deduped[entry.id] = entry
    ordered = sorted(deduped.values(), key=lambda entry: (entry.timestamp, entry.id))
    return latest_log, ordered[-BUG_TRIAGE_MAX_CONTEXT_LOGS:]


def assess_incident(
    settings: Settings,
    *,
    incident: dict[str, Any],
    latest_log: AppLogEntry | None,
    related_logs: list[AppLogEntry],
) -> BugTriageDecision:
    if not settings.openai_api_key:
        raise RuntimeError("BUG_TRIAGE_ENABLED requires OPENAI_API_KEY.")

    payload = build_triage_payload(incident, latest_log=latest_log, related_logs=related_logs)
    client = OpenAI(api_key=settings.openai_api_key)
    started_at = perf_counter()
    log_event(
        logger,
        logging.INFO,
        "bug_triage.assess.started",
        operation="bug_triage.assess",
        incident_id=str(incident.get("id") or ""),
        model=settings.bug_triage_model,
        occurrence_count=int(incident.get("occurrence_count") or 0),
        related_log_count=len(related_logs),
    )
    try:
        response = client.responses.parse(
            model=settings.bug_triage_model,
            input=[
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": bug_triage_prompt()}],
                },
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": json.dumps(payload, ensure_ascii=True, default=str)}],
                },
            ],
            text_format=BugTriageDecision,
        )
    except Exception as exc:
        log_event(
            logger,
            logging.ERROR,
            "bug_triage.assess.failed",
            operation="bug_triage.assess",
            incident_id=str(incident.get("id") or ""),
            model=settings.bug_triage_model,
            duration_ms=int((perf_counter() - started_at) * 1000),
            error=exc,
        )
        raise

    log_event(
        logger,
        logging.INFO,
        "bug_triage.assess.completed",
        operation="bug_triage.assess",
        incident_id=str(incident.get("id") or ""),
        model=settings.bug_triage_model,
        recommended_action=response.output_parsed.recommended_action,
        classification=response.output_parsed.classification,
        confidence=response.output_parsed.confidence,
        duration_ms=int((perf_counter() - started_at) * 1000),
    )
    return response.output_parsed


def apply_triage_decision(
    store: SupabaseBugIncidentStore,
    *,
    incident: dict[str, Any],
    decision: BugTriageDecision,
    settings: Settings,
) -> dict[str, Any]:
    occurrence_count = int(incident.get("occurrence_count") or 0)
    status = "watching"
    if decision.recommended_action == "ignore":
        status = "ignored"
    elif decision.recommended_action == "draft_pr" and decision.confidence >= settings.bug_triage_autofix_min_confidence:
        status = "autofix_pending"

    return store.update_incident(
        str(incident["id"]),
        status=status,
        classification=decision.classification,
        recommended_action=decision.recommended_action,
        triage_confidence=round(decision.confidence, 3),
        triage_summary=decision.summary.strip() or None,
        triage_rationale=decision.rationale.strip() or None,
        likely_root_cause=decision.likely_root_cause.strip() or None,
        suggested_files=[path for path in decision.suggested_files[:8] if str(path).strip()],
        fix_prompt=decision.fix_prompt.strip() or None,
        last_triaged_at=utc_now(),
        last_triaged_occurrence_count=occurrence_count,
        autofix_requested_at=utc_now() if status == "autofix_pending" else None,
    )


def run_autofix(
    store: SupabaseBugIncidentStore,
    *,
    settings: Settings,
    incident: dict[str, Any],
    latest_log: AppLogEntry | None,
    related_logs: list[AppLogEntry],
) -> bool:
    runner = settings.bug_autofix_runner
    if runner is None:
        return False
    resolved_runner = resolve_runner_path(settings, runner)
    command_runner = resolved_runner or runner
    if resolved_runner is not None and not resolved_runner.exists():
        store.update_incident(
            str(incident["id"]),
            status="autofix_failed",
            autofix_completed_at=utc_now(),
            autofix_last_error=f"BUG_AUTOFIX_RUNNER does not exist: {resolved_runner}",
        )
        return False

    decision = BugTriageDecision(
        classification=str(incident.get("classification") or "unclear"),
        recommended_action=str(incident.get("recommended_action") or "watch"),
        confidence=float(incident.get("triage_confidence") or 0.0),
        summary=str(incident.get("triage_summary") or ""),
        rationale=str(incident.get("triage_rationale") or ""),
        likely_root_cause=str(incident.get("likely_root_cause") or ""),
        suggested_files=[str(value) for value in list(incident.get("suggested_files") or []) if str(value).strip()],
        fix_prompt=str(incident.get("fix_prompt") or ""),
    )
    payload_path = write_autofix_payload(
        settings,
        incident=incident,
        decision=decision,
        latest_log=latest_log,
        related_logs=related_logs,
    )
    store.update_incident(
        str(incident["id"]),
        status="autofix_running",
        autofix_started_at=utc_now(),
        autofix_payload_path=str(payload_path),
        autofix_last_error=None,
    )

    started_at = perf_counter()
    log_event(
        logger,
        logging.INFO,
        "bug_triage.autofix.started",
        operation="bug_triage.autofix",
        incident_id=str(incident.get("id") or ""),
        runner=str(command_runner),
        payload_path=str(payload_path),
    )
    env = dict(
        **os.environ,
        COLLEXIS_BUG_INCIDENT_ID=str(incident["id"]),
        COLLEXIS_BUG_INCIDENT_FILE=str(payload_path),
        COLLEXIS_REPO_ROOT=str(settings.bug_autofix_repo_path),
    )
    command = build_runner_command(command_runner, payload_path)
    try:
        completed = subprocess.run(
            command,
            cwd=settings.bug_autofix_repo_path,
            capture_output=True,
            text=True,
            timeout=settings.bug_autofix_timeout_seconds,
            check=False,
            env=env,
        )
    except Exception as exc:
        store.update_incident(
            str(incident["id"]),
            status="autofix_failed",
            autofix_completed_at=utc_now(),
            autofix_payload_path=str(payload_path),
            autofix_last_error=str(exc),
        )
        log_event(
            logger,
            logging.ERROR,
            "bug_triage.autofix.failed",
            operation="bug_triage.autofix",
            incident_id=str(incident.get("id") or ""),
            runner=str(command_runner),
            duration_ms=int((perf_counter() - started_at) * 1000),
            error=exc,
        )
        return False

    duration_ms = int((perf_counter() - started_at) * 1000)
    stdout = completed.stdout.strip()
    stderr = completed.stderr.strip()
    if completed.returncode != 0:
        store.update_incident(
            str(incident["id"]),
            status="autofix_failed",
            autofix_completed_at=utc_now(),
            autofix_payload_path=str(payload_path),
            autofix_last_error=(stderr or stdout or f"Runner exited with code {completed.returncode}")[:2000],
        )
        log_event(
            logger,
            logging.ERROR,
            "bug_triage.autofix.failed",
            operation="bug_triage.autofix",
            incident_id=str(incident.get("id") or ""),
            runner=str(command_runner),
            duration_ms=duration_ms,
            exit_code=completed.returncode,
            stderr=stderr[:500] if stderr else None,
            error=RuntimeError(stderr or stdout or f"Runner exited with code {completed.returncode}"),
        )
        return False

    try:
        result = parse_runner_stdout(stdout)
    except Exception as exc:
        store.update_incident(
            str(incident["id"]),
            status="autofix_failed",
            autofix_completed_at=utc_now(),
            autofix_payload_path=str(payload_path),
            autofix_last_error=str(exc),
        )
        log_event(
            logger,
            logging.ERROR,
            "bug_triage.autofix.failed",
            operation="bug_triage.autofix",
            incident_id=str(incident.get("id") or ""),
            runner=str(command_runner),
            duration_ms=duration_ms,
            error=exc,
        )
        return False

    status = "draft_pr_created"
    if result.status == "watch":
        status = "watching"
    elif result.status == "ignore":
        status = "ignored"
    elif result.status == "failed":
        status = "autofix_failed"

    store.update_incident(
        str(incident["id"]),
        status=status,
        autofix_completed_at=utc_now(),
        autofix_payload_path=str(payload_path),
        autofix_branch=result.branch,
        autofix_pr_url=result.pr_url,
        autofix_last_error=result.error or (result.summary if status == "autofix_failed" else None),
    )
    log_event(
        logger,
        logging.INFO if status != "autofix_failed" else logging.WARNING,
        "bug_triage.autofix.completed",
        operation="bug_triage.autofix",
        incident_id=str(incident.get("id") or ""),
        runner=str(command_runner),
        duration_ms=duration_ms,
        result_status=result.status,
        branch=result.branch,
        pr_url=result.pr_url,
    )
    return status == "draft_pr_created"


def process_bug_triage_once(settings: Settings) -> BugTriageLoopResult:
    if not bug_triage_is_configured(settings):
        return BugTriageLoopResult()

    store = SupabaseBugIncidentStore(settings)
    last_processed_log_id = store.last_processed_log_id()
    new_logs = store.list_new_error_logs(
        after_id=last_processed_log_id,
        bootstrap_lookback_hours=settings.bug_triage_bootstrap_lookback_hours,
    )
    max_seen_log_id = max((log.id for log in new_logs), default=None)
    for log in new_logs:
        if is_internal_bug_triage_log(log):
            continue
        fingerprint = fingerprint_log(log)
        if not fingerprint:
            continue
        incident = store.get_incident_by_fingerprint(fingerprint)
        if incident is None:
            store.create_incident_from_log(log, fingerprint=fingerprint)
            continue
        store.mark_incident_seen(incident, log)
    if max_seen_log_id is not None:
        store.update_last_processed_log_id(max_seen_log_id)

    triaged_incident_count = 0
    for incident in store.list_triage_candidates()[:BUG_TRIAGE_MAX_CANDIDATES]:
        latest_log, related_logs = collect_related_logs(store, incident)
        decision = assess_incident(settings, incident=incident, latest_log=latest_log, related_logs=related_logs)
        apply_triage_decision(store, incident=incident, decision=decision, settings=settings)
        triaged_incident_count += 1

    autofix_run_count = 0
    if settings.bug_autofix_runner is not None:
        for incident in store.list_pending_autofix():
            latest_log, related_logs = collect_related_logs(store, incident)
            if run_autofix(store, settings=settings, incident=incident, latest_log=latest_log, related_logs=related_logs):
                autofix_run_count += 1

    return BugTriageLoopResult(
        processed_log_count=len(new_logs),
        triaged_incident_count=triaged_incident_count,
        autofix_run_count=autofix_run_count,
    )


def start_bug_triage_thread(
    *,
    settings: Settings,
    monitor: BugTriageMonitor,
    stop_event: threading.Event,
) -> threading.Thread:
    def runner() -> None:
        while not stop_event.is_set():
            monitor.mark_heartbeat()
            try:
                result = process_bug_triage_once(settings)
                monitor.mark_success(result)
            except Exception as error:
                monitor.mark_error(error)
                logger.exception("Bug triage loop crashed")
            stop_event.wait(settings.bug_triage_poll_interval_seconds)

    thread = threading.Thread(
        target=runner,
        name="bug-triage-loop",
        daemon=True,
    )
    thread.start()
    return thread
