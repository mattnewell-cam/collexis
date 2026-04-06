---
name: starter_timeline_backfill
description: Communications pages now hydrate missing sample-job timeline rows into Supabase on first open.
type: project
date: 2026-04-06
---

Seeded/sample accounts were getting starter `jobs` rows in Supabase without matching `timeline_items`, so starter debtors like Patricia Whitmore appeared with an empty communications page even though the sample timeline existed in the repo.

The communications server component now runs a lazy starter-timeline backfill before rendering. It matches a job against the known starter samples by stable job attributes, and if the matched job has zero timeline rows it inserts deterministic `starter-<job-id>-<template-id>` records into Supabase using the service-role client.

The inserted payload intentionally sticks to the columns guaranteed to exist in the current Supabase schema (`category`, `subtype`, `sender`, `date`, `short_description`, `details`, `created_at`, `updated_at`) because some environments do not yet expose the newer `recipient` column in PostgREST.
