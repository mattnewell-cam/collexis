from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from .log_persistence import SupabaseLogHandler


LOG_HEADER_REQUEST_ID = "x-request-id"
LOG_HEADER_ACTION_ID = "x-collexis-action-id"
LOG_HEADER_SESSION_ID = "x-collexis-session-id"
LOG_HEADER_TRACE_ORIGIN = "x-collexis-trace-origin"

SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "password",
    "token",
    "secret",
    "api_key",
    "body",
    "details",
    "transcript",
    "raw_message",
    "text_content",
}


def _mask_email(value: str) -> str:
    trimmed = value.strip()
    if "@" not in trimmed:
        return "[email]" if trimmed else ""
    local_part, domain = trimmed.split("@", 1)
    visible = local_part[:2]
    return f"{visible}{'*' * max(len(local_part) - len(visible), 0)}@{domain}"


def _mask_phone(value: str) -> str:
    digits = "".join(character for character in value if character.isdigit())
    if not digits:
        return "[phone]" if value.strip() else ""
    visible = digits[-4:]
    return f"{'*' * max(len(digits) - len(visible), 0)}{visible}"


def sanitize_for_logs(value: Any, *, key: str | None = None, depth: int = 0) -> Any:
    if depth > 4:
        return "[truncated]"

    if value is None or isinstance(value, (bool, int, float)):
        return value

    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()

    if isinstance(value, str):
        lowered_key = (key or "").lower()
        if lowered_key in SENSITIVE_KEYS:
            return f"[redacted:{len(value)}]"
        if "email" in lowered_key:
            return _mask_email(value)
        if "phone" in lowered_key:
            return _mask_phone(value)
        if len(value) > 180:
            return f"[string:{len(value)}]"
        return value

    if isinstance(value, BaseException):
        return {
            "type": value.__class__.__name__,
            "message": str(value),
        }

    if isinstance(value, dict):
        return {
            str(entry_key): sanitize_for_logs(entry_value, key=str(entry_key), depth=depth + 1)
            for entry_key, entry_value in value.items()
            if entry_value is not None
        }

    if isinstance(value, (list, tuple, set)):
        values = list(value)
        sanitized = [sanitize_for_logs(entry, key=key, depth=depth + 1) for entry in values[:20]]
        if len(values) > 20:
            sanitized.append(f"[+{len(values) - 20} more]")
        return sanitized

    return str(value)


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname.lower(),
            "source": "backend",
            "event": getattr(record, "event", record.getMessage()),
            "request_id": getattr(record, "request_id", None),
            "action_id": getattr(record, "action_id", None),
            "session_id": getattr(record, "session_id", None),
            "context": sanitize_for_logs(getattr(record, "context", None)),
        }
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)


def configure_json_logging(
    level_name: str = "INFO",
    *,
    supabase_url: str | None = None,
    supabase_service_role_key: str | None = None,
) -> None:
    root_logger = logging.getLogger()
    if getattr(root_logger, "_collexis_logging_configured", False):
        return

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(JsonLogFormatter())

    handlers: list[logging.Handler] = [stream_handler]
    if supabase_url and supabase_service_role_key and "PYTEST_CURRENT_TEST" not in os.environ:
        handlers.append(
            SupabaseLogHandler(
                supabase_url=supabase_url,
                service_role_key=supabase_service_role_key,
            )
        )

    root_logger.handlers = handlers
    root_logger.setLevel(getattr(logging, level_name.upper(), logging.INFO))
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    root_logger._collexis_logging_configured = True  # type: ignore[attr-defined]


def log_event(
    logger: logging.Logger,
    level: int,
    event: str,
    *,
    request_id: str | None = None,
    action_id: str | None = None,
    session_id: str | None = None,
    **context: Any,
) -> None:
    logger.log(
        level,
        event,
        extra={
            "event": event,
            "request_id": request_id,
            "action_id": action_id,
            "session_id": session_id,
            "context": sanitize_for_logs(context),
        },
    )
