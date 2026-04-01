<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may differ from training data.

Read the relevant guide in `node_modules/next/dist/docs/` before writing code only when touching Next.js-specific behavior:
- routing, layouts, pages, metadata, server/client boundaries
- data fetching, caching, revalidation, server actions, route handlers
- config, middleware/proxy, build/runtime behavior, or framework warnings/errors

Do not pause for a docs pass on small local UI changes that stay within existing component patterns, Tailwind classes, or isolated presentational JSX unless there is an actual Next-specific uncertainty.
<!-- END:nextjs-agent-rules -->
URL: `collexis.uk`

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

The production site is `collexis.uk`, deployed automatically from the `main` branch on Render. Every code change must be committed and pushed to `main` to take effect in production. After pushing, Render will build and deploy automatically — no manual trigger needed.

## Worktree Workflow

When work in a worktree is complete, merge it cleanly into main: switch to main, merge the worktree branch (fast-forward if possible, otherwise a regular merge), then delete the worktree branch.

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

## Small Change Rule

For small or localized UI changes and bug fixes:
- inspect at most 1-2 likely files first
- avoid broad repo scans and avoid docs passes unless there is real Next-specific uncertainty
- make the smallest plausible patch
- run one relevant verification command and (if UI) one screenshot check
- your speed matters
