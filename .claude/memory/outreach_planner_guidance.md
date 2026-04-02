---
name: outreach_planner_guidance
description: Generate-plan modal can capture collector tone/context and stores it in contextInstructions under a dedicated guidance heading.
type: project
date: 2026-04-02
---

The communications `Generate Plan` / `Regenerate plan` modal now always opens before plan creation so the collector can optionally add tone or debtor-context guidance for the planner.

That modal guidance is stored in the job's `contextInstructions` under the heading `Outreach planner tone guidance:` so:
- it can be reviewed or edited later from Job Details
- it is passed through to plan generation and draft generation
- it does not overwrite the rest of the existing internal notes

Introductory outreach copy remains prompt-driven rather than hardcoded. The drafting prompt now explicitly asks for a professional debt-collection-agency tone and tells the model to avoid casual phrasing such as `Collexis here`.
