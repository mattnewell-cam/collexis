from __future__ import annotations

import subprocess
from pathlib import Path

from backend.app.whatsapp_sender import (
    _trim_command_error,
    LEGACY_PLAYWRIGHT_PROFILE_DIR,
    PLAYWRIGHT_PROFILE_DIR_ENV,
    RUNTIME_PLAYWRIGHT_PROFILE_DIR,
    SEND_WHATSAPP_SCRIPT,
    playwright_profile_dir,
    send_playwright_whatsapp_messages,
)
from backend.app.config import Settings


def build_settings() -> Settings:
    return Settings.from_env()


def test_trim_command_error_prefers_stderr_then_stdout() -> None:
    result = subprocess.CompletedProcess(
        args=["node", "scripts/send-whatsapp.mjs"],
        returncode=1,
        stdout="stdout details",
        stderr="stderr details",
    )

    assert _trim_command_error(result) == "stderr details\nstdout details"


def test_send_playwright_whatsapp_messages_invokes_script_for_each_recipient(monkeypatch) -> None:
    commands: list[list[str]] = []
    environments: list[dict[str, str]] = []
    monkeypatch.setattr("backend.app.whatsapp_sender.playwright_whatsapp_configuration_error", lambda: None)
    monkeypatch.setattr("backend.app.whatsapp_sender.playwright_profile_dir", lambda: Path("C:/tmp/legacy-profile"))

    def fake_runner(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        commands.append(command)
        environments.append(kwargs["env"])
        return subprocess.CompletedProcess(args=command, returncode=0, stdout="ok", stderr="")

    message_ids = send_playwright_whatsapp_messages(
        recipients=["+447700900111", "+447700900222"],
        text_body="Test body",
        settings=build_settings(),
        runner=fake_runner,
    )

    assert message_ids == [None, None]
    assert commands == [
        ["node", str(SEND_WHATSAPP_SCRIPT), "447700900111", "Test body"],
        ["node", str(SEND_WHATSAPP_SCRIPT), "447700900222", "Test body"],
    ]
    assert all(Path(env[PLAYWRIGHT_PROFILE_DIR_ENV]) == Path("C:/tmp/legacy-profile") for env in environments)


def test_send_playwright_whatsapp_messages_raises_script_error(monkeypatch) -> None:
    monkeypatch.setattr("backend.app.whatsapp_sender.playwright_whatsapp_configuration_error", lambda: None)

    def failing_runner(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(args=command, returncode=1, stdout="", stderr="send failed")

    try:
        send_playwright_whatsapp_messages(
            recipients=["+447700900111"],
            text_body="Test body",
            settings=build_settings(),
            runner=failing_runner,
        )
    except RuntimeError as exc:
        assert str(exc) == "send failed"
    else:
        raise AssertionError("Expected a RuntimeError when the send script fails.")


def test_playwright_profile_dir_prefers_configured_env(monkeypatch) -> None:
    monkeypatch.setenv(PLAYWRIGHT_PROFILE_DIR_ENV, "custom/profile")

    resolved = playwright_profile_dir()

    assert resolved == (build_settings().data_dir.parents[2] / "custom" / "profile").resolve()


def test_playwright_profile_dir_falls_back_to_legacy_profile(monkeypatch) -> None:
    monkeypatch.delenv(PLAYWRIGHT_PROFILE_DIR_ENV, raising=False)
    monkeypatch.setattr("backend.app.whatsapp_sender.LEGACY_PLAYWRIGHT_PROFILE_DIR", Path("C:/tmp/.playwright-profile"))
    monkeypatch.setattr("backend.app.whatsapp_sender.RUNTIME_PLAYWRIGHT_PROFILE_DIR", Path("C:/tmp/runtime/whatsapp-profile"))
    monkeypatch.setattr("backend.app.whatsapp_sender._is_populated_directory", lambda path: path == Path("C:/tmp/.playwright-profile"))

    resolved = playwright_profile_dir()

    assert resolved == Path("C:/tmp/.playwright-profile")


def test_playwright_profile_dir_prefers_runtime_profile_when_populated(monkeypatch) -> None:
    monkeypatch.delenv(PLAYWRIGHT_PROFILE_DIR_ENV, raising=False)
    monkeypatch.setattr("backend.app.whatsapp_sender.LEGACY_PLAYWRIGHT_PROFILE_DIR", Path("C:/tmp/.playwright-profile"))
    monkeypatch.setattr("backend.app.whatsapp_sender.RUNTIME_PLAYWRIGHT_PROFILE_DIR", Path("C:/tmp/runtime/whatsapp-profile"))
    monkeypatch.setattr("backend.app.whatsapp_sender._is_populated_directory", lambda path: path in {Path("C:/tmp/.playwright-profile"), Path("C:/tmp/runtime/whatsapp-profile")})

    resolved = playwright_profile_dir()

    assert resolved == Path("C:/tmp/runtime/whatsapp-profile")


def test_playwright_profile_dir_defaults_to_runtime_path(monkeypatch) -> None:
    monkeypatch.delenv(PLAYWRIGHT_PROFILE_DIR_ENV, raising=False)
    monkeypatch.setattr("backend.app.whatsapp_sender.LEGACY_PLAYWRIGHT_PROFILE_DIR", LEGACY_PLAYWRIGHT_PROFILE_DIR)
    monkeypatch.setattr("backend.app.whatsapp_sender.RUNTIME_PLAYWRIGHT_PROFILE_DIR", RUNTIME_PLAYWRIGHT_PROFILE_DIR)
    monkeypatch.setattr("backend.app.whatsapp_sender._is_populated_directory", lambda _path: False)

    resolved = playwright_profile_dir()

    assert resolved == RUNTIME_PLAYWRIGHT_PROFILE_DIR
