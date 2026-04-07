---
name: document_upload_details_refresh
description: Existing-job uploads now review only the new documents against the current saved job fields, preserving manual details instead of regenerating the whole summary.
type: project
date: 2026-04-07
---

Uploading new documents from an existing job's Documents tab now uses the `job-intake` processing profile, waits for the uploaded files to finish extraction, then sends the current saved job fields plus the newly uploaded document IDs to a dedicated backend review flow.

That review flow asks whether any updates are needed, using the new documents as evidence while preserving existing manual content by default.

The resulting behavior is:
- `jobDetail` and `contextInstructions` keep existing user-added wording unless the follow-up documents clearly justify an edit
- the model is nudged to make the smallest useful insertion or append, instead of regenerating the full summary from scratch
- `emails` and `phones` still merge in newly found debtor contact details without dropping existing ones
- the updated job snapshot is persisted through the normal `/api/jobs/[id]` patch route so the Details tab reflects the reviewed update
