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

Only the visible portions of interactive editor tabs exclude native window
dragging. Tabs that are horizontally clipped or fully scrolled out of view must
not leave ghost hit regions over the neighboring title bars. Visually empty
title-bar space and the gaps between visible tabs remain draggable at every
scroll position.

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
7. Scroll the rail in both directions with the trackpad or mouse, stopping with
   a tab partially clipped at each edge.
   - Expected: visible tab portions remain interactive while newly exposed
     gaps and neighboring title bars remain draggable.
8. Repeat with the file-tree pane both hidden and visible.
   - Expected: the left, editor, and right title-bar drag regions behave
     consistently.

## Notes

- Regression for #994. Renderer pointer events cannot verify this behavior; the
  pass requires a real OS mouse drag and comparison of the native window
  position.
