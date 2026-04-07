from __future__ import annotations

import importlib.util
import json
from pathlib import Path


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
