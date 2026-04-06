<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may differ from training data.

Read the relevant guide in `node_modules/next/dist/docs/` before writing code only when touching Next.js-specific behavior:
- routing, layouts, pages, metadata, server/client boundaries
- data fetching, caching, revalidation, server actions, route handlers
- config, middleware/proxy, build/runtime behavior, or framework warnings/errors

Do not pause for a docs pass on small local UI changes that stay within existing component patterns, Tailwind classes, or isolated presentational JSX unless there is an actual Next-specific uncertainty.
<!-- END:nextjs-agent-rules -->
Default local URL: `http://localhost:3000`

Use the local server for development, testing, and visual verification by default. Do not use or rely on the hosted `collexis.uk` site unless the user explicitly asks for production verification.

## UI Verification

Whenever making UI changes, take a screenshot of the result afterwards and actually inspect it before completing the turn.

Screenshot verification is not a box-ticking exercise. Do not just capture an image and claim it looks fine. You must actively look for visual inconsistencies, regressions, layout bugs, spacing problems, clipping, overflow, broken alignment, unexpected scroll behavior, styling mismatches, or any other unintended consequence. If anything looks wrong, call it out and fix it rather than hand-waving it away.

Screenshot capture is for the agent's own verification. Do not include or summarize screenshot output to the user unless the user asks for it or the screenshot reveals a problem worth calling out.

For a small UI tweak, prefer this loop:
1. Inspect the most likely component and its immediate parent/container first.
2. Make the smallest plausible patch.
3. Verify with one screenshot.
4. Only explore more broadly if the first patch fails or reveals hidden coupling.

## Deployment

The production site is `collexis.uk`, deployed automatically from the `main` branch on Render. Commit completed work automatically, but only push to `main` when the user explicitly asks you to. After a push, Render will build and deploy automatically with no manual trigger needed.

## Worktree Workflow

When work in a worktree is complete, merge it into main immediately after committing — do not wait for the user to ask. Switch to the main repo directory (`/c/Users/matth/PycharmProjects/collexis`), checkout main, merge the worktree branch (fast-forward if possible, otherwise a regular merge), then remove the worktree and delete the branch.

## Process Cleanup

Clean up terminal processes you started for the task when they are no longer needed, and always do a final cleanup pass before ending the turn. Do not leave behind extra terminal windows, dev servers, watchers, or background jobs unless the user explicitly asked for a process to keep running.

## UI Content

Do not add explanatory UI copy that is redundant with the control itself or otherwise irrelevant to the user just because the prompt mentioned it. Prefer concise interfaces over instructional filler. For example, avoid helper text like "This filter searches the address, name and description fields" sitting next to a filter unless that information is genuinely necessary for the user to succeed.

## Repo Map

Use this as the default starting point before broader exploration:

```text
src/
  app/
    console/
      jobs/[id]/communications/page.tsx job-level communications route
  components/
    JobCommsView.tsx                   job communications shell
    JobsTable.tsx                      jobs list
    comms/
      Timeline.tsx                     past communications timeline
      TimelineItem.tsx                 past timeline row/card
      PostNowTimeline.tsx              future timeline
      CommForm.tsx                     communication form
      categoryConfig.ts                communication labels/colors
      postNowPlannerConfig.tsx         future-step config
  data/
    mockJobs.ts
    mockCommunications.ts
    mockPostNowPlans.ts
  types/
    job.ts
    communication.ts
    postNowPlan.ts
```

## Memory

Persistent project memory lives in `.claude/memory/`. Read `.claude/memory/MEMORY.md` for the index at the start of any non-trivial task. Each index entry points to a file with the full detail.

**When to read:** at conversation start when context seems relevant, or when the user references prior decisions/incidents.

**When to write:** when you learn something non-obvious *or* take a meaningful action — infrastructure created/deleted, config changed, integrations added, architectural decisions made, user preferences observed. Do not save things derivable from the code or git history.

**How to write:**
1. Create a file in `.claude/memory/` with a short descriptive name (e.g. `render_services.md`).
2. Add a one-line entry for it in `.claude/memory/MEMORY.md`.
3. Use frontmatter: `name`, `description`, `type` (`user` | `feedback` | `project` | `reference`), `date` (YYYY-MM-DD), then the content body.

**When to update/delete:** if a memory contradicts current reality, update it (and refresh the `date`) or remove it and sync the index.

## Status Tracking

Update `STATUS.md` when a task makes a significant high-level change or addition to the project. Keep entries concise and outcome-focused; do not clog it with low-level implementation details, minor fixes, or routine churn.

## Small Change Rule

For small or localized UI changes and bug fixes:
- inspect at most 1-2 likely files first
- avoid broad repo scans and avoid docs passes unless there is real Next-specific uncertainty
- make the smallest plausible patch
- run one relevant verification command and (if UI) one screenshot check
- your speed matters
