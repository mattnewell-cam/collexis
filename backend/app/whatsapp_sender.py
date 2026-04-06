from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
from typing import Callable, Sequence

from .config import REPO_ROOT, Settings


NODE_EXECUTABLE_ENV = "COLLEXIS_NODE_EXECUTABLE"
SEND_WHATSAPP_SCRIPT = REPO_ROOT / "scripts" / "send-whatsapp.mjs"


def node_executable() -> str:
    return (os.getenv(NODE_EXECUTABLE_ENV) or "node").strip() or "node"


def playwright_whatsapp_configuration_error() -> str | None:
    if not SEND_WHATSAPP_SCRIPT.exists():
        return f"WhatsApp sender script not found at {SEND_WHATSAPP_SCRIPT}."

    if shutil.which(node_executable()) is None:
        return f"{NODE_EXECUTABLE_ENV} is not configured and 'node' is not available on PATH."

    return None


def _trim_command_error(result: subprocess.CompletedProcess[str]) -> str:
    combined = "\n".join(
        part.strip()
        for part in [result.stderr or "", result.stdout or ""]
        if part and part.strip()
    ).strip()
    return combined or f"WhatsApp send script exited with code {result.returncode}."


def send_playwright_whatsapp_messages(
    *,
    recipients: Sequence[str],
    text_body: str,
    settings: Settings,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> list[str | None]:
    del settings

    configuration_error = playwright_whatsapp_configuration_error()
    if configuration_error is not None:
        raise RuntimeError(configuration_error)

    normalized_recipients = [recipient.strip() for recipient in recipients if recipient.strip()]
    if not normalized_recipients:
        raise RuntimeError("At least one WhatsApp recipient is required.")

    message_ids: list[str | None] = []
    command_base = [node_executable(), str(SEND_WHATSAPP_SCRIPT)]

    for recipient in normalized_recipients:
        phone_digits = recipient.lstrip("+")
        result = runner(
            [*command_base, phone_digits, text_body],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(_trim_command_error(result))
        message_ids.append(None)

    return message_ids
