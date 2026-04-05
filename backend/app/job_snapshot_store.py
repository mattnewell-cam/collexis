from __future__ import annotations

import logging
from time import perf_counter
from typing import Any

import httpx

from .config import Settings
from .logging_utils import log_event
from .schemas import JobSnapshot


def _rest_headers(settings: Settings) -> dict[str, str]:
    service_key = settings.supabase_service_role_key or ""
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Accept": "application/vnd.pgrst.object+json",
    }


logger = logging.getLogger(__name__)


def fetch_job_snapshot(settings: Settings, job_id: str) -> JobSnapshot | None:
    if not settings.uses_supabase or not settings.supabase_url or not settings.supabase_service_role_key:
        return None

    target = f"{settings.supabase_url.rstrip('/')}/rest/v1/jobs"
    started_at = perf_counter()
    log_event(
        logger,
        logging.INFO,
        "supabase.rest.request.started",
        table="jobs",
        method="GET",
        target=target,
        operation="scheduled_outreach.fetch_job_snapshot",
    )
    try:
        response = httpx.get(
            target,
            params={
                "select": ",".join([
                    "id",
                    "name",
                    "address",
                    "job_description",
                    "job_detail",
                    "due_date",
                    "price",
                    "amount_paid",
                    "status",
                    "emails",
                    "phones",
                    "context_instructions",
                    "handover_days",
                    "planned_handover_at",
                ]),
                "id": f"eq.{job_id}",
            },
            headers=_rest_headers(settings),
            timeout=30.0,
        )
    except Exception as exc:
        log_event(
            logger,
            logging.ERROR,
            "supabase.rest.request.failed",
            table="jobs",
            method="GET",
            target=target,
            operation="scheduled_outreach.fetch_job_snapshot",
            duration_ms=int((perf_counter() - started_at) * 1000),
            error=exc,
        )
        raise
    log_event(
        logger,
        logging.INFO if response.status_code < 400 else logging.WARNING,
        "supabase.rest.request.completed",
        table="jobs",
        method="GET",
        target=target,
        operation="scheduled_outreach.fetch_job_snapshot",
        duration_ms=int((perf_counter() - started_at) * 1000),
        status=response.status_code,
    )
    if response.status_code == 406:
        return None
    response.raise_for_status()
    row = response.json()

    payload: dict[str, Any] = {
        "id": row["id"],
        "name": row.get("name") or "",
        "address": row.get("address") or "",
        "job_description": row.get("job_description") or "",
        "job_detail": row.get("job_detail") or "",
        "due_date": row.get("due_date"),
        "price": row.get("price"),
        "amount_paid": row.get("amount_paid"),
        "days_overdue": 0,
        "status": row.get("status") or "",
        "emails": row.get("emails") or [],
        "phones": row.get("phones") or [],
        "context_instructions": row.get("context_instructions") or "",
        "handover_days": row.get("handover_days") or 14,
        "planned_handover_at": row.get("planned_handover_at"),
    }
    return JobSnapshot.model_validate(payload)
