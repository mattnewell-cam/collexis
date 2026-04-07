from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
from time import monotonic


REPO_ROOT = Path(__file__).resolve().parents[2]
RUNNER_PATH = REPO_ROOT / "scripts" / "bug_autofix_runner.py"


def load_runner_module():
    spec = importlib.util.spec_from_file_location("bug_autofix_runner_for_tests", RUNNER_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_parse_github_repo_full_name_supports_https_and_ssh() -> None:
    runner = load_runner_module()

    assert runner.parse_github_repo_full_name("https://github.com/example/collexis.git") == "example/collexis"
    assert runner.parse_github_repo_full_name("git@github.com:example/collexis.git") == "example/collexis"


def test_build_branch_name_uses_codex_prefix(monkeypatch) -> None:
    runner = load_runner_module()
    monkeypatch.setattr(runner, "git_safe_timestamp", lambda: "20260407183000")

    branch = runner.build_branch_name("Incident 123 / bad write")

    assert branch == "codex/bug-incident-123-bad-wri-20260407183000"


def test_command_needs_cmd_shim_for_windowsapps_alias(monkeypatch) -> None:
    runner = load_runner_module()
    cmd_alias = r"C:\Users\matth\AppData\Local\Microsoft\WindowsApps\codex.cmd"

    monkeypatch.setattr(runner.os, "name", "nt", raising=False)

    assert runner.command_needs_cmd_shim("codex", cmd_alias) is True


def test_default_codex_sandbox_prefers_danger_full_access_on_windows(monkeypatch) -> None:
    runner = load_runner_module()

    monkeypatch.setattr(runner.os, "name", "nt", raising=False)
    monkeypatch.delenv("BUG_AUTOFIX_CODEX_SANDBOX", raising=False)

    assert runner.default_codex_sandbox() == "danger-full-access"


def test_build_pr_body_includes_incident_and_checks() -> None:
    runner = load_runner_module()

    body = runner.build_pr_body(
        {
            "incident": {
                "id": "incident-123",
                "fingerprint": "backend | bad write",
            }
        },
        codex_result={
            "pr_body": "Fixes the timeline write path.",
            "verification": ["pytest backend/tests/test_bug_triage.py", "manual repro"],
        },
        commit_sha="1234567890abcdef",
        commit_subject="Fix the timeline write path",
    )

    assert "incident-123" in body
    assert "backend | bad write" in body
    assert "pytest backend/tests/test_bug_triage.py" in body
    assert "Fix the timeline write path" in body


def test_build_codex_command_uses_requested_sandbox() -> None:
    runner = load_runner_module()

    command = runner.build_codex_command(
        codex_command="codex",
        worktree_path=Path("C:/tmp/worktree"),
        schema_path=Path("C:/tmp/schema.json"),
        output_path=Path("C:/tmp/result.json"),
        model="gpt-5.4-mini",
        sandbox_mode="danger-full-access",
    )

    assert "--sandbox" in command
    assert "danger-full-access" in command


def test_run_codex_command_returns_after_output_file_even_if_process_lingers(tmp_path: Path) -> None:
    runner = load_runner_module()
    output_path = tmp_path / "codex-result.json"
    script_path = tmp_path / "fake_codex.py"
    script_path.write_text(
        "\n".join(
            [
                "from pathlib import Path",
                "import sys",
                "import time",
                "Path(sys.argv[1]).write_text('{\"status\":\"watch\",\"summary\":\"done\",\"verification\":[],\"pr_title\":\"\",\"pr_body\":\"\",\"error\":\"\"}', encoding='utf-8')",
                "print('wrote result')",
                "sys.stdout.flush()",
                "time.sleep(30)",
            ]
        ),
        encoding="utf-8",
    )

    started_at = monotonic()
    completed = runner.run_codex_command(
        command=[sys.executable, str(script_path), str(output_path)],
        cwd=tmp_path,
        output_path=output_path,
        input_text="ignored",
        timeout_seconds=5,
        linger_after_output_seconds=0.2,
        poll_interval_seconds=0.05,
    )
    duration = monotonic() - started_at

    assert output_path.exists()
    assert duration < 5
    assert "wrote result" in completed.stdout


def test_run_codex_command_decodes_utf8_output_without_windows_codec_crash(tmp_path: Path) -> None:
    runner = load_runner_module()
    output_path = tmp_path / "codex-result.json"
    script_path = tmp_path / "fake_codex_utf8.py"
    script_path.write_text(
        "\n".join(
            [
                "from pathlib import Path",
                "import sys",
                "Path(sys.argv[1]).write_text('{\"status\":\"watch\",\"summary\":\"done\",\"verification\":[],\"pr_title\":\"\",\"pr_body\":\"\",\"error\":\"\"}', encoding='utf-8')",
                "sys.stdout.buffer.write('Tooling worked. 😀\\n'.encode('utf-8'))",
                "sys.stdout.flush()",
            ]
        ),
        encoding="utf-8",
    )

    completed = runner.run_codex_command(
        command=[sys.executable, str(script_path), str(output_path)],
        cwd=tmp_path,
        output_path=output_path,
        input_text="ignored",
        timeout_seconds=5,
        linger_after_output_seconds=0.2,
        poll_interval_seconds=0.05,
    )

    assert output_path.exists()
    assert "Tooling worked." in completed.stdout


def test_main_fails_cleanly_when_github_token_is_missing(tmp_path: Path, monkeypatch, capsys) -> None:
    runner = load_runner_module()
    payload_path = tmp_path / "incident.json"
    payload_path.write_text(
        json.dumps(
            {
                "repo_root": str(tmp_path),
                "incident": {"id": "incident-123"},
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.delenv("BUG_AUTOFIX_GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("GH_TOKEN", raising=False)
    monkeypatch.delenv("GITHUB_PAT", raising=False)

    exit_code = runner.main(["bug_autofix_runner.py", str(payload_path)])
    captured = capsys.readouterr()
    result = json.loads(captured.out.strip())

    assert exit_code == 0
    assert result["status"] == "failed"
    assert "GitHub token" in result["error"]
