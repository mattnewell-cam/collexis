from __future__ import annotations

import json
import logging
import sys
import threading
import time
from datetime import datetime, timezone
from queue import Full, Queue
from typing import Any

import httpx


def _serialize_error(record: logging.LogRecord) -> str | None:
    if record.exc_info:
        return logging.Formatter().formatException(record.exc_info)

    context = getattr(record, "context", None)
    if not isinstance(context, dict):
        return None

    error = context.get("error")
    if error is None:
        return None

    if isinstance(error, str):
        return error

    try:
        return json.dumps(error, ensure_ascii=True, default=str)
    except TypeError:
        return str(error)


def build_log_row(record: logging.LogRecord) -> dict[str, Any]:
    return {
        "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
        "level": record.levelname.lower(),
        "source": "backend",
        "event": getattr(record, "event", record.getMessage()),
        "request_id": getattr(record, "request_id", None),
        "action_id": getattr(record, "action_id", None),
        "session_id": getattr(record, "session_id", None),
        "context": getattr(record, "context", None),
        "error": _serialize_error(record),
    }


class SupabaseLogHandler(logging.Handler):
    def __init__(
        self,
        *,
        supabase_url: str,
        service_role_key: str,
        queue_size: int = 2048,
    ) -> None:
        super().__init__()
        self._endpoint = f"{supabase_url.rstrip('/')}/rest/v1/app_logs"
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        self._queue: Queue[dict[str, Any]] = Queue(maxsize=queue_size)
        self._client = httpx.Client(timeout=5.0)
        self._last_warning_at = 0.0
        self._worker = threading.Thread(
            target=self._drain_queue,
            name="supabase-log-writer",
            daemon=True,
        )
        self._worker.start()

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._queue.put_nowait(build_log_row(record))
        except Full:
            self._warn("Supabase log queue is full; dropping log entries.")
        except Exception:
            self.handleError(record)

    def close(self) -> None:
        try:
            self._client.close()
        finally:
            super().close()

    def _drain_queue(self) -> None:
        while True:
            payload = self._queue.get()
            try:
                response = self._client.post(
                    self._endpoint,
                    headers=self._headers,
                    json=payload,
                )
                if response.status_code >= 400:
                    self._warn(
                        f"Supabase log write failed with status {response.status_code}.",
                        response.text.strip()[:240] or None,
                    )
            except Exception as exc:
                self._warn("Supabase log write failed.", str(exc))
            finally:
                self._queue.task_done()

    def _warn(self, message: str, detail: str | None = None) -> None:
        now = time.monotonic()
        if now - self._last_warning_at < 60:
            return

        self._last_warning_at = now
        if detail:
            print(f"[logging.persistence] {message} {detail}", file=sys.stderr)
            return

        print(f"[logging.persistence] {message}", file=sys.stderr)
