---
name: windows_bug_autofix_runner_launch
description: On Windows Store Codex installs, the autofix runner must launch `codex` through `cmd /c` because direct subprocess execution of the alias path fails with WinError 5.
type: reference
date: 2026-04-07
---

For the built-in `scripts/bug_autofix_runner.py` on Windows:

- `subprocess.run(["codex", ...])` fails with `PermissionError: [WinError 5] Access is denied`.
- Resolving to the Windows Store `codex.exe` path under `Program Files\\WindowsApps` still fails the same way.
- The working launch pattern on this machine is `cmd /c codex ...`.
- The runner now detects Windows alias-style command resolution and wraps the Codex invocation with `cmd /c` in that case.
