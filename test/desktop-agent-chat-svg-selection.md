---
id: TC-DESKTOP-AGENT-CHAT-036
title: Act inspects and edits a captured SVG selection
module: desktop
area: agent-chat
tags: [chat, svg, selection, undo, save]
status: untested
severity: high
date: 2026-11-20
updated: 2026-11-21
automatable: true
covered_by:
  - desktop/src/main/native-gateway-svg-text.test.ts
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - editor/scaffolds/desktop/canvas/board-store.test.ts
  - editor/scaffolds/desktop/workbench/workspace-svg-selection.test.ts
  - editor/scaffolds/desktop/file/document-surface-host.test.ts
---

## Behavior

An Act message refers to the SVG selection captured when the user sends it.
The agent can inspect selected elements and path points in an SVG or a deck's
active slide, or a whole SVG placed on a freeform board. It can use an
editable SVG capture to read and replace one eligible text element. Supported
edits appear in the normal Undo history and are saved through the editor.
Changing the captured target before the tool runs makes the selection stale.

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
5. Open a deck as a project tab. Select a rectangle and verify the composer
   shows **Rectangle**. Select a heading and verify the chip previews its text,
   including when it is stored in text spans. Select **×** and verify the chip
   and canvas selection clear. Reselect one plain heading and ask the agent to
   read and shorten it. Verify the sent selection marker appears and the
   change can be undone once. Repeat in a dedicated deck window.
6. Queue an edit for the heading, then switch to another slide before the
   request runs. Verify it reports a stale capture and both slides retain
   their original values. Send a new request from the new slide and verify
   it addresses that slide.
7. Open a freeform board with two pins of the same SVG at different
   positions. Select one and verify the blue outline surrounds the whole pin.
   Ask which pin is selected and verify the selection marker and the correct
   source and placement. Repeat in a dedicated board window.
8. Queue a request about one pin, then select the other before the tool
   runs. Verify it reports a stale capture. Send again and check that the
   answer identifies the second pin's placement.
