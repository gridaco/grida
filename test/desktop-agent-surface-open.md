---
id: TC-DESKTOP-AGENT-002
title: Agent artifacts appear without owning task continuation
module: desktop
area: agent
tags: [agent, artifact, surface, workbench, canvas]
status: untested
severity: high
date: 2026-07-23
updated: 2026-11-13
automatable: false
covered_by:
  - crates/grida-agent/tests/process/desktop_tools.rs
  - desktop/src/main/native-editor-surfaces.test.ts
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

Switching to another chat restores its own workbench. An accepted turn in the
previous chat can continue, and its delayed reveal must never open in the
new chat's workbench.

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
   - Give the agent either the full filesystem path printed by a command or
     the path relative to the workspace. Repeat in a file-only workbench
     and a workbench with Browser available.
   - Expected: after the valid manifest references the first meaningful
     document, the bundle opens as one tab and the agent continues refining
     it. The bundle directory is the target.
5. Start another artifact-creation request and close the window while the agent
   is still working. Wait for the run to finish, then reopen the workspace and
   conversation.
   - Expected: the artifact work and conversation continue normally. No
     unresolved `workbench_show` call blocks the run or the queued turn after it.

## Notes

- The file reveal receipt confirms dispatch. The tab becomes visible when
  the workbench applies the request.
- The tab inventory reads the current view of the captured workbench.
