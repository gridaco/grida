---
id: TC-CANVAS-TRAY-001
title: Tray Node Hierarchy Constraints and Interaction Behavior
module: canvas
area: hierarchy
tags: [tray, hierarchy, reparent, insert, container, scene, drag, auto-wrap]
status: untested
severity: high
date: 2026-03-29
automatable: partial
covered_by:
  - editor/grida-canvas/reducers/methods/__tests__/move-tray.test.ts
---

## Behavior

A Tray is a non-layout organizational grouping node. It lives at Scene root level (or nested under another Tray) and can contain any child nodes. It behaves like a Container for hierarchy purposes (children can enter/exit, auto-wrap on draw) but has strict parent constraints.

### Tray Parent Constraint

A Tray can only be a child of:

- **Scene** (root level)
- **Another Tray** (nesting)

A Tray **cannot** be a child of Container, Group, Boolean, or any other node type. This constraint is permanent and enforced in all code paths: layer tree drag-and-drop, canvas translate hierarchy change, auto-wrap on insert, and paste targeting.

### Tray as Parent

A Tray can contain any child node type: Container, Group, Text, shapes, other Trays, etc. It appears as an expandable folder in the layer panel.

### Auto-Wrap Behavior

When a Container or Tray is drawn over existing sibling nodes, those siblings are auto-reparented into the new node. If the auto-wrap target is a Tray inside a Container (violating the parent constraint), the move is rejected and the Tray's position is not modified.

### Canvas Translate Hierarchy Change

When dragging a child node on the canvas, it can enter/exit a Tray the same way it enters/exits a Container. When dragging a Tray itself, it can only be dropped into Scene root or another Tray — dragging it over a Container does not reparent it.

## Steps

### TC-TRAY-001a: Insert Tray at Scene Root

1. Press `Shift+F` to activate the Tray tool
2. Click and drag on empty canvas area
3. Expected: a Tray node is created at Scene root level
4. Expected: Tray appears in layer panel with dashed-square icon, expandable

### TC-TRAY-001b: Insert Tray Inside Another Tray

1. Select an existing Tray
2. Press `Shift+F` and draw inside the selected Tray
3. Expected: nested Tray is created as a child of the outer Tray

### TC-TRAY-001c: Auto-Wrap — Container Over Tray (Rejected)

1. Have a Tray at Scene root with some content
2. Press `A` or `F` to activate Container tool
3. Draw a Container that encompasses the Tray
4. Expected: Container is created, but Tray is **not** reparented into it
5. Expected: Tray's position does **not** change

### TC-TRAY-001d: Auto-Wrap — Tray Over Containers (Accepted)

1. Have two Containers at Scene root
2. Press `Shift+F` and draw a Tray encompassing both Containers
3. Expected: both Containers are reparented into the new Tray
4. Expected: Containers' visual positions are preserved (insets adjusted)

### TC-TRAY-001e: Canvas Drag — Move Node Into Tray

1. Have a Container and a Tray as siblings at Scene root
2. Drag the Container over the Tray bounds
3. Expected: Container is reparented into the Tray (visual position preserved)

### TC-TRAY-001f: Canvas Drag — Move Node Out of Tray

1. Have a Container inside a Tray
2. Drag the Container outside the Tray bounds
3. Expected: Container escapes to Scene root (visual position preserved)

### TC-TRAY-001g: Canvas Drag — Tray Into Container (Rejected)

1. Have a Tray and a large Container as siblings
2. Drag the Tray over the Container
3. Expected: Tray is **not** reparented into the Container
4. Expected: Tray remains at Scene root

### TC-TRAY-001h: Layer Panel — Drag Tray Into Container (Rejected)

1. In the layer panel, drag a Tray node onto a Container node
2. Expected: the move is rejected, Tray stays at its current level

### TC-TRAY-001i: Layer Panel — Drag Node Into/Out of Tray

1. Drag a Container from Scene root into a Tray in the layer panel
2. Expected: Container becomes a child of the Tray
3. Drag it back out to Scene root
4. Expected: Container returns to Scene root

## Notes

- Tray defaults: white fill, black 10% opacity stroke (1px inside), corner radius 2
- Tray has no layout, no clipping, no effects — children are freely placed
- Shortcut: `Shift+F` (Frame variant — F = Container, Shift+F = Tray)
- The parent constraint is enforced by `self_moveNode` (returns false) and the caller must check the return value before adjusting positions
- Unit tests: `editor/grida-canvas/reducers/methods/__tests__/move-tray.test.ts`
