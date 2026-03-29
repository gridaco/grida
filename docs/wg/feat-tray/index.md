---
title: Tray Node (tray)
format: md
tags:
  - internal
  - wg
  - tray
  - canvas
  - scene-graph
---

# Tray Node - `tray`

> A canvas-level organizational primitive for grouping design elements without participating in layout.

| feature id | status | description                             | PRs |
| ---------- | ------ | --------------------------------------- | --- |
| `tray`     | beta   | Non-layout organizational grouping node | -   |

---

## Abstract

A Tray is a lightweight, non-structural node that exists on the canvas to visually and hierarchically group Containers and other elements. It provides organizational clarity to a Scene without influencing how its children are positioned, sized, or rendered.

Think of it as a labeled surface on the canvas. Things sit _on_ a Tray. The Tray itself does nothing to them.

---

## Naming and Figma Mapping

| Figma       | Grida     | Role                                   |
| ----------- | --------- | -------------------------------------- |
| Page/Canvas | Scene     | The root working surface               |
| Frame       | Container | A layout-participating structural node |
| Section     | **Tray**  | A non-layout organizational grouping   |
| Group       | Group     | A temporary, transform-linked grouping |

The name "Tray" was chosen to reflect the node's passive, infrastructure-like nature. A tray holds things without transforming them. It has no opinions about its contents. It is the most forgettable node in the tree -- by design.

**Why not "Section"?** Section is vague and implies structural significance (like HTML `<section>`). **Why not "Board"/"Artboard"?** These carry legacy semantics from Sketch/Illustrator where artboards define export boundaries and clipping. Tray is deliberately mundane.

---

## Node Hierarchy

```text
Scene
+-- Tray ("Authentication flows")
|   +-- Container (Login screen)
|   +-- Container (Signup screen)
|   +-- Container (Forgot password)
+-- Tray ("Dashboard")
|   +-- Tray ("Dashboard -- Overview")   <-- nested tray
|   |   +-- Container (Summary view)
|   |   +-- Container (Stats panel)
|   +-- Container (Settings page)
+-- Container (Standalone prototype)
```

---

## Goals

- **Organizational grouping**: Cluster related Containers under a named, visible boundary when a Scene has many root-level Containers.
- **Hierarchy participation**: A Tray is a real node in the scene graph. It appears in the layer panel, has children, and can be a parent. It is not metadata or an annotation.
- **Figma compatibility**: Maps directly to Figma `SECTION` on import. Export back to Figma `SECTION` is not yet implemented.
- **Nestability**: Trays can contain other Trays. Nesting is shallow in practice but unrestricted in depth.
- **Minimal cognitive load**: Users should never need to think about what a Tray "does" -- it doesn't do anything.

## Non-Goals

- **No layout**: No auto-layout, flex, grid, or positioning logic. Children are freely placed. This is permanent, not a v1 limitation.
- **No rendering in output**: Invisible in exported designs. Canvas-only organizational aid.
- **No clipping**: Children can visually extend beyond the Tray's bounds.
- **No effects**: No shadows, blurs, or blend-mode overrides. Canvas-only boundary indicator.
- **Styling supported**: Fills, strokes, and corner radius are supported and rendered in the canvas editor. They are not visible in exported output.
- **No nesting under non-Tray parents**: A Tray cannot be a child of Container, Group, or any other non-Tray node. Trays live at Scene level or nested under other Trays. This constraint is permanent.
- **Does not replace Group**: Groups are temporary, transform-linked wrappers. Trays are persistent, named organizational boundaries. They coexist.

---

## Constraints

| Rule          | Detail                                                    |
| ------------- | --------------------------------------------------------- |
| **Parent**    | Must be `Scene` or `Tray`                                 |
| **Children**  | Any node type: Container, Group, Text, Tray, shapes, etc. |
| **Layout**    | None. Always `none`. Not configurable.                    |
| **Rendering** | Canvas-only. Never appears in exported output.            |
| **Clipping**  | None. Children can overflow.                              |
| **Styling**   | Fills, strokes, and corner radius supported. No effects (shadows, blurs). |

### Validation Invariants

```text
Tray.parent    in { Scene, Tray }
Tray.layout    = none           // invariant, not a default
Tray.effects   = empty          // not supported
Tray.clip      = false          // invariant
```

---

## Implementation Status

Tray is implemented as a first-class node type with visual rendering across all layers.

### What's Done

**Format Schema** (`format/grida.fbs`):

- `Tray` in `NodeType` enum
- `TrayNode` table with SystemNodeTrait, LayerTrait, stroke_geometry, corner_radius, fill_paints, stroke_paints
- `TrayNode` in the `Node` union

**Rust** (`crates/grida-canvas/`):

- `NodeTypeTag::Tray`, `Node::Tray(TrayNodeRec)` in `node/schema.rs`
- `TrayNodeRec` struct: active, opacity, blend_mode, mask, rotation, position, layout_dimensions, corner_radius, corner_smoothing, fills, strokes, stroke_style, stroke_width
- `NodeFillsMixin`, `NodeGeometryMixin`, `to_own_shape()` impls
- Full wiring: `extract_layer_core`, all trait impls, `extract_geo_data` (`GeoNodeKind::Tray`)
- Geometry cache: Tray has explicit bounds (like Container), not derived from children (unlike Group)
- Painter: renders fills, strokes, corner_radius — like Container but simpler (no effects, no clipping, no render surface)
- `build_shape`: Tray case for rect/rrect/smooth-rrect based on corner_radius
- Layout: excluded from Taffy (`is_layout_node_tag` returns false); uses schema position/dimensions directly
- FBS encode/decode: full round-trip with fills, strokes, corner_radius, dimensions
- JSON format: `JSONNode::Tray` variant in `io_grida.rs` (defaults for visual fields until dedicated JSONTrayNode)
- Factory: `NodeFactory::create_tray_node()` with explicit dimensions
- Resources: image URL extraction from Tray fills/strokes

**TypeScript** (`packages/grida-canvas-schema/grida.ts`):

- `TrayNode` interface (extends IBaseNode, ISceneNode, IBlend, IPositioning, ICornerRadius, IStroke, IFill)
- Added to `LayerNode` union, `UnknownNode`, `NodePrototype`

**Figma Import** (`packages/grida-canvas-io-figma/lib.ts`):

- `SECTION` case produces `type: "tray"` with fills, strokes, corner_radius, positioning

**FBS I/O** (`packages/grida-canvas-io/format.ts`):

- Full encode/decode with fills, strokes, corner_radius, stroke_geometry

**DOM Renderer** (`editor/grida-canvas-react-renderer-dom/`):

- Tray uses "background" fill mode (renders fills visually)

### What's Left (future work)

- **Figma Export**: Map `tray` back to Figma `SECTION` on export.
- **Editor Layer Panel**: Distinct visual treatment for Tray nodes. Drag-and-drop parent constraints.
- **Canvas Rendering**: Tray-specific editor-only chrome (labeled boundary region, section name badge).
- **JSON format**: Dedicated `JSONTrayNode` struct with visual fields (currently uses `JSONGroupNode` with defaults).

---

## FAQ

**Why not a Container with `layout: none`?**
A Container without layout is still a Container -- it supports clipping, effects, layout containers, and can be nested anywhere. A Tray supports fills, strokes, and corner radius, but has no clipping, no effects, no layout, and lives only at the canvas root level. Modeling it as a restricted Container means every Container feature needs a "but not if it's a Tray" check. Separate primitives are cleaner.

**Can a Container be a direct child of a Tray?**
Yes. That is the primary use case.

**Can a Tray be empty?**
Yes. An empty Tray is valid -- a named region waiting for content.

**Will Trays ever gain layout capabilities?**
No. If you need layout, use a Container. The entire value of a Tray is that it does nothing.

---

## Related

- [WG: Layout Model](../feat-layout) -- layout system that Tray explicitly opts out of
- [WG: Figma Import](../feat-fig) -- SECTION import/export pipeline
- [WG: Schema Naming Conventions](../feat-schema/naming-conventions.md) -- property naming standards
