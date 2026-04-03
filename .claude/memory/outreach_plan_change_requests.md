---
name: outreach_plan_change_requests
description: Outreach-plan pages now expose a dedicated Suggest changes flow and persist plan-change requests alongside tone guidance in job context instructions.
type: project
date: 2026-04-03
---

The job communications view now treats plan revisions as a first-class workflow instead of hiding them behind a generic regenerate action.

Key behavior:
- Existing plans show both `Suggest changes` and `Regenerate plan`.
- The regenerate modal for existing plans now includes a dedicated `What should change?` textarea plus the existing `Tone / Extra Context` field.
- Requested changes are stored under `Outreach plan change requests:` in the job's `contextInstructions`, alongside `Outreach planner tone guidance:`.
- When either planner note is already saved, the outreach-plan card warns that those saved notes will be reused on the next regeneration.

Implementation note:
- Planner-specific notes are extracted and merged as dedicated trailing sections inside `contextInstructions`, preserving the rest of the job notes above them.
