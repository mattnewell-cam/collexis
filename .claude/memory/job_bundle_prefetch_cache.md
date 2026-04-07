---
name: job_bundle_prefetch_cache
description: Opening a job now preloads the full visible comms/documents/outreach bundle into a shared per-job client cache for fast revisits.
type: project
date: 2026-04-07
---

The `[id]` job layout still fetches the basic job shell on the server, but the client cache now preloads the whole visible job-data bundle after you open a job:

- communications timeline
- documents list
- outreach plan

That bundle is stored in a shared per-job client cache so returning to the same job can reuse the full data set instead of waiting for each page to fetch its own copy again.
