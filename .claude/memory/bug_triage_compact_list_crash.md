---
name: bug_triage_compact_list_crash
description: The live bug-triage worker was crashing because `_compact_list` used a set literal containing `[]`, which raises `TypeError: unhashable type: 'list'`.
type: project
date: 2026-04-07
---

The bug triage loop could crash immediately after startup once it touched incident sample fields because `_compact_list` checked `new_value in {None, "", []}`.

- Python cannot build a set containing `[]`, so that branch raised `TypeError: unhashable type: 'list'`.
- The fix was to replace the set-membership check with simple explicit comparisons.
- A regression test now covers the empty-list case so the watcher does not regress the same way again.
