---
id: TC-CANVAS-OVERLAY-001
title: Container/Frame Title Bar Must Be Above Selection Overlay
module: canvas
area: overlay
tags: [z-order, title-bar, selection-overlay, frame, container, shift-click]
status: verified
severity: high
date: 2025-12-24
updated: 2025-12-24
automatable: false
covered_by: []
---

## Behavior

When a container or frame is selected and its selection overlay is present, the container/frame title bar must remain interactive and not be blocked by the selection overlay layer. Users must be able to click the title bar to change selection (including Shift-modified selection) and hover it reliably.

The title bar UI layer must render with a higher z-index than the selection overlay layer, while remaining below resize/rotation handles. The z-order is tracked via `FLOATING_BAR_Z_INDEX`.

## Steps

1. Select a frame/container so its selection overlay appears
2. Click the frame's title bar
3. Expected: selection changes (or Shift+click toggles selection), not blocked by overlay
4. Hover the title bar — it should respond to hover state
5. Verify resize/rotation handles still render above the title bar

## Notes

Z-order constant: `FLOATING_BAR_Z_INDEX`.
