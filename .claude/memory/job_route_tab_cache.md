---
name: job_route_tab_cache
description: Shared job-route cache now preserves documents, communications, outreach-plan data, and job edits across job-tab navigation.
type: project
date: 2026-04-07
---

The `/console/jobs/[id]` layout now owns a client-side cache provider for the active job route.

What it preserves:
- current job details
- communications timeline
- job documents
- outreach plan / drafts

Why:
- switching between Details, Documents, and Communications previously remounted each page and kicked off fresh uncached client fetches, which made the UI feel cold on every tab change

Implementation notes:
- the cache provider lives under the job layout so it survives child route navigation for the same job
- details/documents pages stopped re-fetching the job server-side when the parent layout has already loaded it
- communications/documents views now hydrate from cached route state first and only fetch when the cache is empty
- a route `loading.tsx` was added under `/console/jobs/[id]` so dynamic job-route navigations show immediate fallback UI while server work completes
