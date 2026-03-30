---
id: TC-CANVAS-LAYOUT-001
title: Auto-Layout Direct Container Application
module: canvas
area: layout
tags: [auto-layout, flex, shift-a, container, nesting]
status: verified
severity: high
date: 2025-12-09
updated: 2025-12-09
automatable: false
covered_by: []
---

## Behavior

When applying auto-layout (Shift+A) to a single container selection that has no layout applied, the layout is applied directly to that container rather than wrapping it in a new container. This preserves the container's identity and hierarchy.

The system checks if the selection is exactly one container node whose layout property is not set to "flex". If both conditions are met, flex layout properties are applied directly, analyzing children's spatial arrangement to determine optimal flex direction, spacing, and alignment. This is controlled by `prefersDirectApplication` (defaults to `true`).

When `prefersDirectApplication` is `false`, or the selection contains multiple nodes, a single non-container node, or a container that already has flex layout, nodes are wrapped into new flex containers.

## Steps

1. Create a frame with several child elements (no layout applied)
2. Select the frame and press Shift+A
3. Expected: flex layout is applied directly to the frame, no new wrapper created
4. Verify the frame's identity (name, ID) is preserved
5. Select multiple nodes and press Shift+A
6. Expected: nodes are wrapped in a new flex container

## Notes

Parameter `prefersDirectApplication` defaults to `true`.
