---
id: TC-DESKTOP-AGENT-002
title: Agent artifacts appear without owning task continuation
module: desktop
area: agent
tags: [agent, artifact, surface, workbench, canvas]
status: untested
severity: high
date: 2026-07-23
updated: 2026-07-23
automatable: false
covered_by:
  - packages/grida-ai-agent/src/surface/index.test.ts
  - editor/scaffolds/desktop/workbench/workspace-surface-host.test.ts
---

## Behavior

When the agent produces a primary visual artifact, Grida should present its
first meaningful renderable checkpoint in the current Desktop workspace, then
continue working while the user watches it develop. Presentation is an early
production milestone rather than the last action after polish and validation.
The checkpoint must contain meaningful visible content and be structurally
valid; an empty or broken scaffold is not progress.

The request is idempotent and auxiliary: it may open a new tab or activate an
existing one, but it never creates authority, duplicates a tab, repeatedly
steals focus, or owns continuation of the agent's underlying work.

If the renderer disappears before observing the request, the daemon still
completes the tool call and the artifact work remains valid. Reopening the app
must not reveal a permanently pending presentation call.

## Steps

1. Open a workspace in Grida Desktop and ask the agent to create a moderately
   detailed SVG artifact.
   - Expected: once a valid first frame with meaningful visible content exists,
     it opens as the active workbench tab while the agent is still working.
     Later edits become visible before the final assistant response.
2. Ask the agent to continue editing the same SVG.
   - Expected: the existing tab is activated if needed; no duplicate tab is
     created and normal writes do not repeatedly flash or steal focus.
3. Navigate to another artifact after the agent has presented the SVG.
   - Expected: the user's navigation wins. The agent does not pull focus back
     unless it makes a new intentional presentation request.
4. Ask the agent to create a `.canvas` bundle.
   - Expected: after the valid manifest references its first meaningful
     document, the bundle directory opens as one artifact and the agent
     continues refining it. Its internal `.canvas.json` file is not opened as a
     separate surface.
5. Start another artifact-creation request and close the window while the agent
   is still working. Wait for the run to finish, then reopen the workspace and
   conversation.
   - Expected: the artifact work and conversation continue normally. No
     unresolved `surface_open` call blocks the run or the queued turn after it.

## Notes

- `surface_open` is a best-effort presentation request, not confirmation that a
  renderer completed a transition.
- `surface_list_open` describes the host snapshot captured at turn start; it is
  not a filesystem listing.
