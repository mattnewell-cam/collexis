---
name: manual_communications_simplified
description: Manual timeline entry UI is now restricted to debtor-facing medium/date/details, with nano-generated short descriptions.
type: project
date: 2026-04-07
---

The manual "Add Communication" flow on the job communications page now only exposes medium, date, and details.

Guardrails:
- Manual entries no longer let the user choose Collexis/internal senders or recipients.
- Manual entries no longer expose handover letters, letters, or other category selection.
- Protected/system timeline items (Collexis-owned, due-date, handover-letter, and letter items) no longer show inline edit/delete controls.

Implementation:
- Manual save requests call a backend helper that uses `gpt-5.4-nano` to generate the timeline `short_description` from the free-text details.
- The frontend derives the timeline category from the chosen medium (`conversation` for phone/in-person, `chase` for the other supported mediums).
