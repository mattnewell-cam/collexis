---
name: local_first_agent_workflow
description: Agent instructions now default to local development on localhost and require explicit user direction before pushing to main.
type: user
date: 2026-04-05
---

The user wants agents to work against the local server by default instead of the hosted `collexis.uk` site.

- Default development and visual verification target: `http://localhost:3000`.
- Use hosted production only when the user explicitly asks for production verification.
- Commit completed work automatically.
- Only push to `main` when the user explicitly tells the agent to push.
