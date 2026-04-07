---
name: document_upload_details_refresh
description: Job document uploads now rerun intake-summary extraction so the Details tab picks up new detail/context/contact data.
type: project
date: 2026-04-07
---

Uploading new documents from an existing job's Documents tab now uses the `job-intake` processing profile, waits for the uploaded files to finish extraction, then re-runs the backend `/jobs/{id}/intake-summary` flow.

The refreshed intake summary is merged back into the job so:
- `jobDetail` and `contextInstructions` pick up new extracted document context without discarding the existing text block unless the new summary fully supersedes it
- `emails` and `phones` are merged/deduped with any new contact details found in the uploaded files
- the updated job snapshot is persisted through the normal `/api/jobs/[id]` patch route so the Details tab shows the new data on the next navigation without a hard reload

This keeps the existing document metadata editing flow intact while making late-uploaded evidence enrich the job details instead of only appearing in the Documents list.
