---
name: timeline_item_schema_compatibility
description: Supabase timeline writes now retry without newer optional columns, and document extraction errors are sanitized before reaching the UI.
type: project
date: 2026-04-07
---

Some environments still reject newer optional `timeline_items` fields through PostgREST (`recipient`, `response_classification`, `response_action`, `stated_deadline`, `computed_deadline`), which caused document extraction to fail with raw `400 Bad Request` errors while trying to create timeline rows.

The Supabase-backed repository now retries timeline create/update calls without those optional fields when PostgREST reports a schema-cache column miss. This keeps document processing working against older schema caches while preserving the newer fields where they are supported.

Document-processing failures are also normalized to user-facing copy in both the backend and frontend. Intake now stops before routing away when uploaded documents settle into `failed`, and documents pages no longer render raw HTTP exception text from stored `extraction_error` values.
