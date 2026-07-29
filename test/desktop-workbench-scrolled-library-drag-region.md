---
id: TC-DESKTOP-WORKBENCH-013
title: Scrolled Library cards do not block native window dragging
module: desktop
area: workbench
tags: [desktop, library, title-bar, scroll, window-drag]
status: untested
severity: medium
date: 2026-07-29
updated: 2026-07-29
automatable: false
covered_by: []
---

## Behavior

Library cards inside the workbench reference picker remain ordinary content
controls and do not publish native window regions. Scrolling a card behind the
picker viewport must not leave its rectangular `no-drag` region over the editor
title bar; card-sized areas and masonry gaps must be equally draggable there.

## Steps

1. Open a Desktop workspace and an agent Library reference picker with enough
   results to scroll vertically.
2. Scroll the picker until several Library cards move above its visible
   viewport.
3. Drag the native window from multiple empty points in the editor title bar,
   including points aligned with both a culled card and a masonry gap.
   - Expected: the OS window moves from every empty point.
4. Continue scrolling and repeat from the same title-bar points.
   - Expected: no culled card leaves a ghost non-draggable rectangle.
5. Click a visible Library card and its Add action.
   - Expected: visible cards remain interactive and do not move the window.

## Notes

- Companion regression for #994. Chromium does not clip native app-region
  rectangles to scrollports, so this requires a real OS mouse drag rather than
  renderer pointer events.
- The broader move to opt-in native drag regions is tracked in #1003.
