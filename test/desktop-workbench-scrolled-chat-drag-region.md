---
id: TC-DESKTOP-WORKBENCH-006
title: Scrolled chat controls do not block native window dragging
module: desktop
area: workbench
tags: [desktop, title-bar, chat, scroll, window-drag]
status: untested
severity: medium
date: 2026-07-24
updated: 2026-07-24
automatable: false
covered_by: []
---

## Behavior

Interactive controls inside the vertically scrolling chat remain ordinary
content controls and do not publish native window regions. Scrolling a message
action toolbar behind the chat viewport must not leave ghost `no-drag`
rectangles over the left title bar.

## Steps

1. Open a Desktop workspace with enough chat history to scroll vertically.
2. Before scrolling, drag the native window from empty space in the left title
   bar to the right of the workspace-name button.
   - Expected: the OS window moves.
3. Scroll the conversation until a message and its action buttons move above
   the visible chat viewport.
4. Drag again from the same title-bar point.
   - Expected: the OS window still moves.
5. Hover a visible message and use a non-destructive action such as Copy.
   - Expected: the action remains interactive and the window does not move.

## Notes

- Companion regression for #994. Chromium does not clip native app-region
  rectangles to scrollports, so this requires a real OS window drag rather than
  renderer pointer events.
