from __future__ import annotations

from datetime import UTC, datetime
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from textwrap import dedent
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


CODEx_OUTPUT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "status": {
            "type": "string",
            "enum": ["fixed", "watch", "ignore", "failed"],
        },
        "summary": {"type": "string"},
        "verification": {
            "type": "array",
            "items": {"type": "string"},
        },
        "pr_title": {"type": "string"},
        "pr_body": {"type": "string"},
        "error": {"type": "string"},
    },
    "required": ["status", "summary", "verification", "pr_title", "pr_body", "error"],
}


def emit(result: dict[str, object]) -> int:
    print(json.dumps(result, ensure_ascii=True))
    return 0


def run_command(
    command: list[str],
    *,
    cwd: Path,
    input_text: str | None = None,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        input=input_text,
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )


def require_command(name: str) -> str | None:
    return shutil.which(name)


def git(
    args: list[str],
    *,
    cwd: Path,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return run_command(["git", *args], cwd=cwd, env=env)


def git_ok(
    args: list[str],
    *,
    cwd: Path,
    env: dict[str, str] | None = None,
    error_prefix: str,
) -> subprocess.CompletedProcess[str]:
    completed = git(args, cwd=cwd, env=env)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "git command failed"
        raise RuntimeError(f"{error_prefix}: {detail}")
    return completed


def git_output(args: list[str], *, cwd: Path, error_prefix: str) -> str:
    return git_ok(args, cwd=cwd, error_prefix=error_prefix).stdout.strip()


def load_payload(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def sanitize_slug(value: str) -> str:
    lowered = re.sub(r"[^a-zA-Z0-9-]+", "-", value).strip("-").lower()
    return lowered or "incident"


def build_branch_name(incident_id: str) -> str:
    short = sanitize_slug(incident_id)[:20]
    timestamp = git_safe_timestamp()
    return f"codex/bug-{short}-{timestamp}"


def git_safe_timestamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d%H%M%S")


def parse_github_repo_full_name(remote_url: str) -> str:
    ssh_match = re.search(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$", remote_url)
    if ssh_match:
        return f"{ssh_match.group('owner')}/{ssh_match.group('repo')}"
    https_match = re.search(r"https://github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$", remote_url)
    if https_match:
        return f"{https_match.group('owner')}/{https_match.group('repo')}"
    raise RuntimeError(f"Could not work out the GitHub repo from remote URL: {remote_url}")


def github_token() -> str | None:
    for name in ("BUG_AUTOFIX_GITHUB_TOKEN", "GITHUB_TOKEN", "GH_TOKEN", "GITHUB_PAT"):
        value = (os.getenv(name) or "").strip()
        if value:
            return value
    return None


def detect_base_branch(repo_root: Path) -> str:
    configured = (os.getenv("BUG_AUTOFIX_BASE_BRANCH") or "").strip()
    if configured:
        return configured
    for candidate in ("origin/main", "main", "origin/master", "master", "HEAD"):
        completed = git(["rev-parse", "--verify", candidate], cwd=repo_root)
        if completed.returncode == 0:
            return candidate
    return "HEAD"


def branch_exists(repo_root: Path, branch_name: str) -> bool:
    return git(["show-ref", "--verify", "--quiet", f"refs/heads/{branch_name}"], cwd=repo_root).returncode == 0


def cleanup_worktree(repo_root: Path, worktree_path: Path) -> None:
    if not worktree_path.exists():
        return
    git(["worktree", "remove", "--force", str(worktree_path)], cwd=repo_root)
    git(["worktree", "prune"], cwd=repo_root)


def delete_branch(repo_root: Path, branch_name: str) -> None:
    git(["branch", "-D", branch_name], cwd=repo_root)


def write_json_file(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def build_codex_prompt(payload: dict[str, object], *, worktree_path: Path) -> str:
    incident = dict(payload.get("incident") or {})
    decision = dict(payload.get("decision") or {})
    latest_log = payload.get("latest_log")
    related_logs = payload.get("related_logs") or []
    runner_prompt = str(payload.get("runner_prompt") or "").strip()
    return dedent(
        f"""
        You are fixing a bug in the Collexis repo from an automated handoff.

        Work from this git worktree only: {worktree_path}

        First steps:
        - read AGENTS.md
        - inspect the relevant code
        - use plain English in your final answer

        Main job:
        - decide if this still looks like a real, fixable bug from the repo context
        - if it does, add or update a regression test where practical
        - implement the fix
        - run targeted checks
        - commit the changes
        - do not push
        - do not open a PR

        If this now looks too weak, too ambiguous, or probably transient, do not force a change. Return `watch` or `ignore` instead.

        Important:
        - leave the worktree clean when you finish
        - if you make code changes, they must be committed
        - do not create extra docs unless they directly help the fix

        Suggested task from the triage system:
        {runner_prompt or "(none provided)"}

        Incident:
        {json.dumps(incident, indent=2, ensure_ascii=True)}

        Triage decision:
        {json.dumps(decision, indent=2, ensure_ascii=True)}

        Latest log:
        {json.dumps(latest_log, indent=2, ensure_ascii=True)}

        Related logs:
        {json.dumps(related_logs[:8], indent=2, ensure_ascii=True)}

        Final response rules:
        - follow the output schema exactly
        - use `fixed` only if you really changed code and committed it
        - `verification` should be a short list of commands or checks you ran
        - if `status` is not `fixed`, keep `pr_title` and `pr_body` empty
        - if `status` is `fixed`, give a short PR title and a short PR body summary
        """
    ).strip()


def build_codex_command(
    *,
    codex_command: str,
    worktree_path: Path,
    schema_path: Path,
    output_path: Path,
    model: str,
) -> list[str]:
    return [
        codex_command,
        "exec",
        "-",
        "--cd",
        str(worktree_path),
        "--sandbox",
        "workspace-write",
        "-c",
        'approval_policy="never"',
        "--ephemeral",
        "--color",
        "never",
        "--output-schema",
        str(schema_path),
        "--output-last-message",
        str(output_path),
        "--model",
        model,
    ]


def load_codex_result(output_path: Path) -> dict[str, object]:
    return json.loads(output_path.read_text(encoding="utf-8"))


def ensure_clean_committed_fix(worktree_path: Path, initial_head: str) -> tuple[str, str]:
    head = git_output(["rev-parse", "HEAD"], cwd=worktree_path, error_prefix="Could not read worktree HEAD")
    if head == initial_head:
        raise RuntimeError("Codex said the bug was fixed but did not create a new commit.")
    dirty = git_output(["status", "--porcelain"], cwd=worktree_path, error_prefix="Could not read worktree status")
    if dirty:
        raise RuntimeError("Codex left uncommitted changes in the worktree.")
    subject = git_output(["log", "-1", "--pretty=%s"], cwd=worktree_path, error_prefix="Could not read latest commit message")
    return head, subject


def push_branch(repo_root: Path, branch_name: str, repo_full_name: str) -> None:
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    token = github_token()
    if token:
        auth_url = f"https://x-access-token:{quote(token, safe='')}@github.com/{repo_full_name}.git"
        completed = git(["push", "-u", auth_url, branch_name], cwd=repo_root, env=env)
    else:
        completed = git(["push", "-u", "origin", branch_name], cwd=repo_root, env=env)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "git push failed"
        raise RuntimeError(f"Could not push the autofix branch: {detail}")


def github_api_json(method: str, url: str, *, token: str, payload: dict[str, object]) -> dict[str, object]:
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "collexis-bug-autofix-runner",
        },
    )
    try:
        with urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"GitHub API request failed: {detail or exc.reason}") from exc


def create_draft_pr_via_api(
    *,
    repo_full_name: str,
    base_branch: str,
    head_branch: str,
    title: str,
    body: str,
) -> str:
    token = github_token()
    if not token:
        raise RuntimeError(
            "No GitHub token found. Set BUG_AUTOFIX_GITHUB_TOKEN, GITHUB_TOKEN, GH_TOKEN, or GITHUB_PAT so the runner can open a draft PR."
        )
    payload = {
        "title": title,
        "body": body,
        "head": head_branch,
        "base": base_branch.removeprefix("origin/"),
        "draft": True,
    }
    response = github_api_json(
        "POST",
        f"https://api.github.com/repos/{repo_full_name}/pulls",
        token=token,
        payload=payload,
    )
    pr_url = str(response.get("html_url") or "").strip()
    if not pr_url:
        raise RuntimeError("GitHub created the PR response, but no PR URL was returned.")
    return pr_url


def build_pr_body(
    payload: dict[str, object],
    *,
    codex_result: dict[str, object],
    commit_sha: str,
    commit_subject: str,
) -> str:
    incident = dict(payload.get("incident") or {})
    verification = [str(item).strip() for item in list(codex_result.get("verification") or []) if str(item).strip()]
    lines = [
        str(codex_result.get("pr_body") or "").strip() or "Automated fix generated from a bug incident.",
        "",
        f"- Incident ID: `{incident.get('id')}`",
        f"- Fingerprint: `{incident.get('fingerprint')}`",
        f"- Commit: `{commit_sha[:12]}` `{commit_subject}`",
    ]
    if verification:
        lines.append("")
        lines.append("Checks run:")
        lines.extend(f"- `{item}`" for item in verification)
    return "\n".join(lines).strip()


def run(payload_path: Path) -> dict[str, object]:
    payload = load_payload(payload_path)
    repo_root = Path(str(payload.get("repo_root") or os.getenv("COLLEXIS_REPO_ROOT") or ".")).resolve()
    incident = dict(payload.get("incident") or {})
    incident_id = str(incident.get("id") or "incident")
    codex_command = os.getenv("BUG_AUTOFIX_CODEX_COMMAND", "codex").strip() or "codex"
    codex_model = os.getenv("BUG_AUTOFIX_CODEX_MODEL", "gpt-5.4").strip() or "gpt-5.4"

    if require_command(codex_command) is None:
        raise RuntimeError(f"Could not find the Codex CLI command `{codex_command}`.")
    if not github_token():
        raise RuntimeError(
            "No GitHub token found. Set BUG_AUTOFIX_GITHUB_TOKEN, GITHUB_TOKEN, GH_TOKEN, or GITHUB_PAT before using the autofix runner."
        )

    origin_url = git_output(["remote", "get-url", "origin"], cwd=repo_root, error_prefix="Could not read git origin URL")
    repo_full_name = parse_github_repo_full_name(origin_url)
    base_branch = detect_base_branch(repo_root)
    branch_name = build_branch_name(incident_id)
    if branch_exists(repo_root, branch_name):
        raise RuntimeError(f"Autofix branch already exists: {branch_name}")

    artifacts_dir = payload_path.parent
    worktree_path = artifacts_dir / "worktrees" / sanitize_slug(branch_name.replace("/", "-"))
    schema_path = artifacts_dir / f"{sanitize_slug(incident_id)}-schema.json"
    codex_output_path = artifacts_dir / f"{sanitize_slug(incident_id)}-codex-result.json"
    codex_log_path = artifacts_dir / f"{sanitize_slug(incident_id)}-codex.log"
    worktree_path.parent.mkdir(parents=True, exist_ok=True)
    write_json_file(schema_path, CODEx_OUTPUT_SCHEMA)

    fetched = git(["fetch", "origin", base_branch.removeprefix("origin/")], cwd=repo_root)
    _ = fetched

    branch_should_be_deleted = True
    cleanup_worktree(repo_root, worktree_path)
    git_ok(
        ["worktree", "add", "-b", branch_name, str(worktree_path), base_branch],
        cwd=repo_root,
        error_prefix="Could not create the autofix worktree",
    )

    try:
        initial_head = git_output(["rev-parse", "HEAD"], cwd=worktree_path, error_prefix="Could not read initial worktree HEAD")
        prompt = build_codex_prompt(payload, worktree_path=worktree_path)
        codex_command_line = build_codex_command(
            codex_command=codex_command,
            worktree_path=worktree_path,
            schema_path=schema_path,
            output_path=codex_output_path,
            model=codex_model,
        )
        codex_run = run_command(codex_command_line, cwd=repo_root, input_text=prompt)
        codex_log_path.write_text(
            "\n\n".join(
                [
                    "STDOUT",
                    codex_run.stdout,
                    "STDERR",
                    codex_run.stderr,
                ]
            ),
            encoding="utf-8",
        )
        if codex_run.returncode != 0:
            detail = codex_run.stderr.strip() or codex_run.stdout.strip() or "Codex exited with an error."
            raise RuntimeError(f"Codex could not complete the autofix task: {detail}")
        if not codex_output_path.exists():
            raise RuntimeError("Codex finished but did not write a final structured result.")

        codex_result = load_codex_result(codex_output_path)
        codex_status = str(codex_result.get("status") or "").strip()
        summary = str(codex_result.get("summary") or "").strip()
        error = str(codex_result.get("error") or "").strip()

        if codex_status == "ignore":
            return {"status": "ignore", "summary": summary or "Codex thinks this should be ignored.", "error": error or None}
        if codex_status == "watch":
            return {"status": "watch", "summary": summary or "Codex wants this watched rather than fixed now.", "error": error or None}
        if codex_status == "failed":
            raise RuntimeError(error or summary or "Codex said the fix attempt failed.")
        if codex_status != "fixed":
            raise RuntimeError(f"Codex returned an unknown status: {codex_status}")

        commit_sha, commit_subject = ensure_clean_committed_fix(worktree_path, initial_head)
        branch_should_be_deleted = False
        push_branch(repo_root, branch_name, repo_full_name)
        pr_title = str(codex_result.get("pr_title") or "").strip() or f"Fix bug incident {incident_id}"
        pr_body = build_pr_body(payload, codex_result=codex_result, commit_sha=commit_sha, commit_subject=commit_subject)
        pr_url = create_draft_pr_via_api(
            repo_full_name=repo_full_name,
            base_branch=base_branch,
            head_branch=branch_name,
            title=pr_title,
            body=pr_body,
        )
        return {
            "status": "draft_pr_created",
            "summary": summary or "Codex fixed the bug and opened a draft PR.",
            "branch": branch_name,
            "pr_url": pr_url,
            "error": None,
        }
    finally:
        cleanup_worktree(repo_root, worktree_path)
        if branch_should_be_deleted and branch_exists(repo_root, branch_name):
            delete_branch(repo_root, branch_name)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        return emit(
            {
                "status": "failed",
                "summary": "The autofix runner needs exactly one argument: the incident payload JSON path.",
                "error": "Usage: bug_autofix_runner.py <payload.json>",
            }
        )

    try:
        payload_path = Path(argv[1]).resolve()
        result = run(payload_path)
        return emit(result)
    except Exception as exc:
        return emit(
            {
                "status": "failed",
                "summary": "The autofix runner could not finish the job.",
                "error": str(exc),
            }
        )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
