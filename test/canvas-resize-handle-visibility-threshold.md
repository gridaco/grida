---
id: TC-CANVAS-RESIZE-003
title: Resize Handle Visibility Threshold for Small Nodes
module: canvas
area: resize
tags: [zoom, handles, visibility, threshold, translate, drag]
status: verified
severity: medium
date: 2025-12-21
updated: 2025-12-21
automatable: false
covered_by: []
---

## Behavior

When nodes are zoomed out and their viewport size (width or height) falls below `MIN_NODE_OVERLAY_RESIZE_HANDLES_VISIBLE_UI_SIZE`, all resize handles are completely hidden to prioritize the translate-drag region. This ensures thin nodes like text remain easily draggable when zoomed out.

The threshold is calculated based on physical viewport pixel size, considering width and height independently. When either dimension falls below the threshold, resize handles disappear entirely. This applies to both single node selections and multiple node selection groups. Handles reappear when zoomed in above the threshold.

## Steps

1. Select a node and zoom out until it appears very small on screen
2. Observe that resize handles disappear
3. Drag the node — it should translate smoothly without triggering resize
4. Zoom back in until the node is large enough
5. Expected: resize handles reappear

## Notes

Threshold constant: `MIN_NODE_OVERLAY_RESIZE_HANDLES_VISIBLE_UI_SIZE`.
