<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI Verification

Whenever making UI changes, take a screenshot of the result afterwards and check that it looks correct before completing the turn.

## UI Content

Do not add explanatory UI copy that is redundant with the control itself or otherwise irrelevant to the user just because the prompt mentioned it. Prefer concise interfaces over instructional filler. For example, avoid helper text like "This filter searches the address, name and description fields" sitting next to a filter unless that information is genuinely necessary for the user to succeed.
