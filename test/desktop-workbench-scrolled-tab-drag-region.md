---
id: TC-DESKTOP-WORKBENCH-005
title: Scrolled editor tabs do not block native window dragging
module: desktop
area: workbench
tags: [desktop, title-bar, tabs, scroll, window-drag]
status: untested
severity: medium
date: 2026-07-24
updated: 2026-07-24
automatable: false
covered_by:
  - editor/scaffolds/desktop/workbench/tab-native-drag-region.test.ts
---

## Behavior

Only the visible occupied tab run—interactive tabs and the gaps between
them—excludes native window dragging. The gaps remain part of the horizontal
scroll surface, so wheel input works continuously while crossing the tab rail.
Tabs that are horizontally clipped or fully scrolled out of view must not leave
ghost hit regions over neighboring title bars. Visually empty title-bar space
after the final tab remains draggable at every scroll position.

## Steps

1. Open enough files in the Desktop workbench for the editor tab rail to
   overflow horizontally.
2. With the rail at its initial scroll position, drag the native window from an
   empty point in the title bar immediately to the left of the rail.
   - Expected: the OS window moves.
3. Scroll the editor tabs fully to the right.
4. Drag again from the exact same visible title-bar point.
   - Expected: the OS window still moves.
5. Drag from the visible portion of a partially clipped tab.
   - Expected: the window does not move.
6. Select a visible tab, open and dismiss its context menu, then close a
   disposable tab with its close button.
   - Expected: tab selection, context menus, and close actions still work.
7. Place the pointer directly over a gap between two tabs and scroll the rail
   in both directions with the trackpad or mouse.
   - Expected: the tabs scroll continuously; crossing a gap does not interrupt
     wheel input.
8. Close enough tabs to leave visibly unused rail space after the final tab,
   then drag from that empty space.
   - Expected: the OS window moves. The horizontal strips above and below the
     tabs also remain draggable.
9. Repeat with the file-tree pane both hidden and visible.
   - Expected: the left, editor, and right title-bar drag regions behave
     consistently.

## Notes

- Regression for #994. Renderer pointer events cannot verify this behavior; the
  pass requires a real OS mouse drag and comparison of the native window
  position.
