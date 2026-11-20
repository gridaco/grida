---
id: TC-DESKTOP-AGENT-CHAT-036
title: Act inspects and edits a captured SVG selection
module: desktop
area: agent-chat
tags: [chat, svg, selection, undo, save]
status: untested
severity: high
date: 2026-11-20
updated: 2026-11-20
automatable: true
covered_by:
  - desktop/src/main/native-gateway-svg-text.test.ts
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - editor/scaffolds/desktop/workbench/workspace-svg-text.test.ts
  - editor/scaffolds/desktop/file/document-surface-host.test.ts
---

## Behavior

An Act message refers to the SVG selection captured when the user sends it.
The agent can inspect selected elements and path points. A supported opacity
edit affects the captured objects in one Undo step. The editor owns Save.
Changing the selection or switching files before the tool runs makes the
original capture stale.

## Steps

1. Open an SVG in a Desktop workspace. Use an SVG with a rectangle, a circle,
   a group, and a path. Select the rectangle and group. Ask the agent what is
   selected. Verify the composer and sent message show the selection marker
   and the agent identifies both objects and their file.
2. Select a pair of points in the path's vector editing mode. Ask which points
   are selected. Verify the result identifies the path and the two points.
3. Select the rectangle and circle. Ask the agent to set their opacity to
   50 percent. Verify both change. Undo once and verify both return to their
   original opacity. Redo, save, and reopen the SVG to check both changes.
4. Queue an opacity request for the rectangle. Before it runs, select the
   circle. Verify the resulting tool reports a stale capture and both objects
   keep their original values for that request.
