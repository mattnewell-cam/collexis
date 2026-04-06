from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
from typing import Callable, Sequence

from .config import REPO_ROOT, Settings


NODE_EXECUTABLE_ENV = "COLLEXIS_NODE_EXECUTABLE"
PLAYWRIGHT_PROFILE_DIR_ENV = "COLLEXIS_PLAYWRIGHT_PROFILE_DIR"
SEND_WHATSAPP_SCRIPT = REPO_ROOT / "scripts" / "send-whatsapp.mjs"
LEGACY_PLAYWRIGHT_PROFILE_DIR = REPO_ROOT / ".playwright-profile"
RUNTIME_PLAYWRIGHT_PROFILE_DIR = REPO_ROOT / "runtime" / "playwright" / "whatsapp-profile"
SEND_CONFIRMED_SENTINEL = "WHATSAPP_SEND_CONFIRMED"


def node_executable() -> str:
    return (os.getenv(NODE_EXECUTABLE_ENV) or "node").strip() or "node"


def _normalize_profile_dir(value: str) -> Path:
    candidate = Path(value.strip())
    return candidate if candidate.is_absolute() else (REPO_ROOT / candidate).resolve()


def _is_populated_directory(path: Path) -> bool:
    try:
        return path.is_dir() and any(path.iterdir())
    except OSError:
        return False


def playwright_profile_dir() -> Path:
    configured = os.getenv(PLAYWRIGHT_PROFILE_DIR_ENV, "").strip()
    if configured:
        return _normalize_profile_dir(configured)
    if _is_populated_directory(RUNTIME_PLAYWRIGHT_PROFILE_DIR):
        return RUNTIME_PLAYWRIGHT_PROFILE_DIR
    if _is_populated_directory(LEGACY_PLAYWRIGHT_PROFILE_DIR):
        return LEGACY_PLAYWRIGHT_PROFILE_DIR
    return RUNTIME_PLAYWRIGHT_PROFILE_DIR


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


def _delivery_confirmation_error(result: subprocess.CompletedProcess[str]) -> str:
    details = _trim_command_error(result)
    if details:
        return details
    return "WhatsApp send script exited without confirming delivery."


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
    command_env = os.environ.copy()
    command_env[PLAYWRIGHT_PROFILE_DIR_ENV] = str(playwright_profile_dir())

    for recipient in normalized_recipients:
        phone_digits = recipient.lstrip("+")
        result = runner(
            [*command_base, phone_digits, text_body],
            cwd=str(REPO_ROOT),
            env=command_env,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(_trim_command_error(result))
        if SEND_CONFIRMED_SENTINEL not in (result.stdout or ""):
            raise RuntimeError(_delivery_confirmation_error(result))
        message_ids.append(None)

    return message_ids
