from __future__ import annotations

import httpx
import logging
from time import perf_counter

from .config import Settings
from .logging_utils import log_event


BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
logger = logging.getLogger(__name__)


def brevo_configuration_error(settings: Settings) -> str | None:
    if settings.brevo_api_key and settings.brevo_api_key.strip():
        return None
    return "Brevo is not configured. Add BREVO_API_KEY."


def send_brevo_email(
    *,
    settings: Settings,
    recipients: list[dict[str, str]],
    subject: str,
    text_content: str,
) -> dict[str, str | None]:
    api_key = (settings.brevo_api_key or "").strip()
    if not api_key:
        raise RuntimeError(brevo_configuration_error(settings) or "Brevo is not configured.")

    started_at = perf_counter()
    log_event(
        logger,
        logging.INFO,
        "provider.email.brevo.request.started",
        provider="brevo",
        method="POST",
        target=BREVO_API_URL,
        recipient_count=len(recipients),
        subject_length=len(subject.strip()),
        body_length=len(text_content.strip()),
        sandbox=bool(settings.brevo_sandbox),
    )
    try:
        response = httpx.post(
            BREVO_API_URL,
            headers={
                "accept": "application/json",
                "api-key": api_key,
                "content-type": "application/json",
            },
            json={
                "sender": {
                    "email": settings.collexis_from_email,
                    "name": settings.collexis_from_name,
                },
                "replyTo": {
                    "email": settings.collexis_from_email,
                    "name": settings.collexis_from_name,
                },
                "to": recipients,
                "subject": subject,
                "textContent": text_content,
                **(
                    {
                        "headers": {
                            "X-Sib-Sandbox": "drop",
                        }
                    }
                    if settings.brevo_sandbox
                    else {}
                ),
            },
            timeout=60.0,
        )
    except Exception as exc:
        log_event(
            logger,
            logging.ERROR,
            "provider.email.brevo.request.failed",
            provider="brevo",
            method="POST",
            target=BREVO_API_URL,
            recipient_count=len(recipients),
            duration_ms=int((perf_counter() - started_at) * 1000),
            error=exc,
        )
        raise

    log_event(
        logger,
        logging.INFO if response.status_code < 400 else logging.WARNING,
        "provider.email.brevo.request.completed",
        provider="brevo",
        method="POST",
        target=BREVO_API_URL,
        recipient_count=len(recipients),
        duration_ms=int((perf_counter() - started_at) * 1000),
        status=response.status_code,
    )

    if response.status_code >= 400:
        payload = response.json() if response.content else {}
        message = str(payload.get("message") or "").strip()
        raise RuntimeError(message or "Brevo rejected the email request.")

    payload = response.json() if response.content else {}
    return {
        "message_id": payload.get("messageId"),
    }
