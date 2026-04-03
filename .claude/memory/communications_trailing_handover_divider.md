---
name: communications_trailing_handover_divider
description: Past communications timeline now shows the handover divider after the final communication when handover happened before now.
type: project
date: 2026-04-03
---

The communications timeline previously rendered the handover divider only when there was a communication on or after the planned handover date. If the last communication happened before handover and handover was already in the past, the divider disappeared entirely.

`src/components/comms/Timeline.tsx` now adds a trailing handover divider between the final communication and the `Now` marker when `plannedHandoverAt` falls after the last communication date but on or before today.
