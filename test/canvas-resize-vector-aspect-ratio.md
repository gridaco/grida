---
id: TC-CANVAS-RESIZE-001
title: Vector Resize with Aspect Ratio Preservation
module: canvas
area: resize
tags:
  [
    shift-key,
    vector-network,
    aspect-ratio,
    handles,
    edge-handles,
    corner-handles,
  ]
status: verified
severity: high
date: 2025-12-08
updated: 2025-12-08
automatable: false
covered_by: []
---

## Behavior

Vector nodes support resizing through edge handles (N/S/E/W) and corner handles (NE/SE/NW/SW). When the SHIFT key is held during resize, the aspect ratio should be preserved uniformly across all handle types. The vector network's vertices and segments must scale proportionally to match the transformed bounding box exactly, ensuring that the visual representation remains consistent with the node's dimensions.

Edge handles should maintain aspect ratio by scaling both dimensions based on the dominant movement axis, while diagonal handles should scale uniformly in both dimensions. The vector network transformation must always derive its scale factors from the final bounding box dimensions after the aspect-ratio-preserved transformation has been applied, rather than calculating scales independently from raw movement deltas. This ensures that the vector network geometry always matches the bounding box transformation, regardless of handle type or modifier key combinations.

## Steps

1. Create or select a vector node with a non-square aspect ratio
2. Drag a corner handle (e.g. SE) while holding SHIFT — aspect ratio must be preserved
3. Drag an edge handle (e.g. E) while holding SHIFT — aspect ratio must also be preserved
4. Verify the vector network vertices scale proportionally in both cases
5. Expected: visual geometry matches bounding box exactly, no distortion

## Notes

Status: Fixed, ready for comprehensive test coverage.
