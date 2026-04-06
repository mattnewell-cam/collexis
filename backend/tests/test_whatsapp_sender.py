from __future__ import annotations

import subprocess

from backend.app.whatsapp_sender import _trim_command_error, send_playwright_whatsapp_messages
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
    monkeypatch.setattr("backend.app.whatsapp_sender.playwright_whatsapp_configuration_error", lambda: None)

    def fake_runner(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        commands.append(command)
        return subprocess.CompletedProcess(args=command, returncode=0, stdout="ok", stderr="")

    message_ids = send_playwright_whatsapp_messages(
        recipients=["+447700900111", "+447700900222"],
        text_body="Test body",
        settings=build_settings(),
        runner=fake_runner,
    )

    assert message_ids == [None, None]
    assert commands == [
        ["node", str((build_settings().data_dir.parents[2] / "scripts" / "send-whatsapp.mjs").resolve()), "447700900111", "Test body"],
        ["node", str((build_settings().data_dir.parents[2] / "scripts" / "send-whatsapp.mjs").resolve()), "447700900222", "Test body"],
    ]


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
