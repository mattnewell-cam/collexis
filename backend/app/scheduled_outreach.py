from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable

from .brevo_email import send_brevo_email
from .config import Settings
from .job_snapshot_store import fetch_job_snapshot
from .logging_utils import log_event
from .outreach_planning import london_timezone_for, parse_plan_datetime
from .repository import DocumentRepository


logger = logging.getLogger(__name__)


def now_london() -> datetime:
    current = datetime.now()
    return datetime.now(london_timezone_for(current)).replace(second=0, microsecond=0)


def normalized_recipient_emails(emails: list[str]) -> list[str]:
    return list(dict.fromkeys(email.strip().lower() for email in emails if email.strip()))


def timeline_email_details(subject: str, body: str) -> str:
    return f"Subject: {subject}\n\n{body}"


@dataclass
class SchedulerSnapshot:
    started_at: str
    last_heartbeat_at: str | None
    last_success_at: str | None
    last_error_at: str | None
    last_error: str | None
    processed_count: int


class SchedulerMonitor:
    def __init__(self, poll_interval_seconds: int):
        self._poll_interval_seconds = poll_interval_seconds
        self._started_at = datetime.utcnow()
        self._last_heartbeat_at: datetime | None = None
        self._last_success_at: datetime | None = None
        self._last_error_at: datetime | None = None
        self._last_error: str | None = None
        self._processed_count = 0
        self._lock = threading.Lock()

    def mark_heartbeat(self) -> None:
        with self._lock:
            self._last_heartbeat_at = datetime.utcnow()

    def mark_success(self, processed_count: int) -> None:
        with self._lock:
            now = datetime.utcnow()
            self._last_heartbeat_at = now
            self._last_success_at = now
            self._last_error_at = None
            self._last_error = None
            self._processed_count = processed_count

    def mark_error(self, error: Exception) -> None:
        with self._lock:
            now = datetime.utcnow()
            self._last_heartbeat_at = now
            self._last_error_at = now
            self._last_error = str(error)

    def is_healthy(self) -> bool:
        with self._lock:
            now = datetime.utcnow()
            grace_window = max((self._poll_interval_seconds * 3) + 30, 90)
            if self._last_heartbeat_at is None:
                return (now - self._started_at).total_seconds() <= grace_window
            return (now - self._last_heartbeat_at).total_seconds() <= grace_window

    def snapshot(self) -> SchedulerSnapshot:
        with self._lock:
            return SchedulerSnapshot(
                started_at=self._started_at.isoformat(),
                last_heartbeat_at=self._last_heartbeat_at.isoformat() if self._last_heartbeat_at else None,
                last_success_at=self._last_success_at.isoformat() if self._last_success_at else None,
                last_error_at=self._last_error_at.isoformat() if self._last_error_at else None,
                last_error=self._last_error,
                processed_count=self._processed_count,
            )


def ensure_step_can_send(
    *,
    repository: DocumentRepository,
    settings: Settings,
    step: dict[str, object],
    draft_ensurer: Callable[..., list[dict[str, object]]],
) -> tuple[dict[str, object], dict[str, object] | None, list[str]]:
    recipient_emails = normalized_recipient_emails(list(step.get("recipient_emails") or []))
    draft = repository.get_outreach_plan_draft_by_step_id(str(step["id"]))
    job_snapshot = None

    if not recipient_emails or draft is None:
        job_snapshot = fetch_job_snapshot(settings, str(step["job_id"]))

    if not recipient_emails and job_snapshot and job_snapshot.emails:
        updated_step = repository.set_outreach_plan_step_recipient_emails(str(step["id"]), list(job_snapshot.emails))
        step = updated_step
        recipient_emails = normalized_recipient_emails(list(updated_step.get("recipient_emails") or []))

    if draft is None and job_snapshot:
        stored_steps = repository.list_outreach_plan_steps(str(step["job_id"]))
        drafts_to_create = draft_ensurer(
            job_snapshot=job_snapshot,
            timeline_items=repository.list_timeline_for_job(str(step["job_id"])),
            documents=[
                document
                for document in repository.list_for_job(str(step["job_id"]))
                if str(document.get("status")) == "ready"
            ],
            plan_steps=stored_steps,
            existing_drafts=repository.list_outreach_plan_drafts(str(step["job_id"])),
            settings=settings,
            window_days=None,
            target_step_ids={str(step["id"])},
        )
        if drafts_to_create:
            repository.create_outreach_plan_drafts(str(step["job_id"]), drafts=drafts_to_create)
        draft = repository.get_outreach_plan_draft_by_step_id(str(step["id"]))

    return step, draft, recipient_emails


def process_due_outreach_once(
    *,
    settings: Settings,
    draft_ensurer: Callable[..., list[dict[str, object]]],
) -> int:
    repository = DocumentRepository(settings)
    now_local = now_london()
    stale_before = (now_local - timedelta(seconds=settings.scheduler_claim_timeout_seconds)).isoformat()
    repository.release_stale_outreach_plan_email_claims(stale_before)

    pending_steps = repository.list_pending_outreach_plan_email_steps()
    due_steps = []
    for step in pending_steps:
        scheduled_for = parse_plan_datetime(str(step.get("scheduled_for") or ""))
        if scheduled_for is None or scheduled_for > now_local:
            continue
        due_steps.append(step)

    processed_count = 0
    for pending_step in due_steps:
        claimed_at = now_local.isoformat()
        claimed_step = repository.claim_outreach_plan_email_step(str(pending_step["id"]), claimed_at)
        if claimed_step is None:
            continue
        expected_attempt_count = int(pending_step.get("attempt_count") or 0) + 1
        if int(claimed_step.get("attempt_count") or 0) != expected_attempt_count:
            claimed_step = repository.increment_claimed_outreach_plan_email_step_attempt(
                str(claimed_step["id"]),
                expected_attempt_count,
                claimed_at,
            )

        try:
            claimed_step, draft, recipient_emails = ensure_step_can_send(
                repository=repository,
                settings=settings,
                step=claimed_step,
                draft_ensurer=draft_ensurer,
            )
            if not recipient_emails:
                raise RuntimeError("Scheduled email has no recipient email address.")
            if draft is None:
                raise RuntimeError("Scheduled email has no saved draft.")

            subject = str(draft.get("subject") or "").strip()
            body = str(draft.get("body") or "").strip()
            if not subject:
                raise RuntimeError("Scheduled email draft is missing a subject.")
            if not body:
                raise RuntimeError("Scheduled email draft is missing a body.")

            send_result = send_brevo_email(
                settings=settings,
                recipients=[{"email": email} for email in recipient_emails],
                subject=subject,
                text_content=body,
            )

            sent_at = now_london().isoformat()
            log_event(
                logger,
                logging.INFO,
                "scheduled_outreach.sent",
                step_id=str(claimed_step["id"]),
                job_id=str(claimed_step["job_id"]),
                recipient_count=len(recipient_emails),
                provider_message_id=str(send_result.get("message_id") or "") or None,
            )
            repository.mark_outreach_plan_step_sent(
                str(claimed_step["id"]),
                sent_at=sent_at,
                provider_message_id=str(send_result.get("message_id") or "") or None,
            )
            try:
                sender = claimed_step.get("sender")
                timeline_sender = str(sender) if sender in {"you", "collexis"} else None
                repository.create_timeline_item(
                    job_id=str(claimed_step["job_id"]),
                    category="chase",
                    subtype="email",
                    sender=timeline_sender,
                    date=sent_at,
                    short_description=subject,
                    details=timeline_email_details(subject, body),
                )
            except Exception:
                logger.exception("Scheduled email sent but timeline creation failed for step %s", claimed_step["id"])
            processed_count += 1
        except Exception as error:
            repository.mark_outreach_plan_step_failed(
                str(claimed_step["id"]),
                failed_at=now_london().isoformat(),
                error_message=str(error),
            )
            logger.exception("Scheduled outreach failed for step %s", claimed_step["id"])

    return processed_count


def start_scheduler_thread(
    *,
    settings: Settings,
    monitor: SchedulerMonitor,
    stop_event: threading.Event,
    draft_ensurer: Callable[..., list[dict[str, object]]],
) -> threading.Thread:
    def runner() -> None:
        while not stop_event.is_set():
            monitor.mark_heartbeat()
            try:
                processed_count = process_due_outreach_once(
                    settings=settings,
                    draft_ensurer=draft_ensurer,
                )
                monitor.mark_success(processed_count)
            except Exception as error:
                monitor.mark_error(error)
                logger.exception("Scheduled outreach loop crashed")
            stop_event.wait(settings.scheduler_poll_interval_seconds)

    thread = threading.Thread(
        target=runner,
        name="scheduled-outreach-loop",
        daemon=True,
    )
    thread.start()
    return thread
