---
id: TC-CANVAS-RESIZE-002
title: Conditional Resize Handle Z-Order by Zoom Level
module: canvas
area: resize
tags: [zoom, handles, z-order, double-click, text-resize-to-fit]
status: verified
severity: medium
date: 2025-12-09
updated: 2025-12-09
automatable: false
covered_by: []
---

## Behavior

When nodes are zoomed out and resize handles appear small on screen, side handles (N/S/W/E) become higher priority than corner handles, making it easier to resize nodes and double-click on W/E handles for text resize-to-fit. When zoomed in and handles appear larger, corner handles maintain priority for precise corner manipulation.

The system determines handle priority based on how large the node appears on screen, using `MIN_RESIZE_HANDLE_SIZE_FOR_DIAGONAL_PRIORITY_UI_SIZE` as the threshold. Double-clicking on side edges (not corner knobs) triggers resize-to-fit for text nodes.

## Steps

1. Select a node and zoom out until it appears small on screen
2. Hover over the node edges — side handles should take priority over corner handles
3. Zoom in until the node appears large
4. Hover again — corner handles should now take priority
5. With a text node at low zoom, double-click a side edge (W or E)
6. Expected: text resize-to-fit is triggered

## Notes

Threshold is controlled by `MIN_RESIZE_HANDLE_SIZE_FOR_DIAGONAL_PRIORITY_UI_SIZE`.
