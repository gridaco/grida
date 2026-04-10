---
title: Isolation Mode
format: md
tags:
  - internal
  - wg
  - canvas
  - rendering
  - viewport-filter
---

# Isolation Mode

Isolation Mode restricts what the renderer draws and hit-tests to a specific
subtree of the current scene. When active, only the isolation root and its
descendants are painted and pointer-tested. Everything else in the scene graph
stays loaded, laid out, and cached -- the rest of the pipeline is untouched.
It is a pure **viewport filter**, not a mutation of the document.

This is the same primitive Blender calls "Local View", Maya/Max/C4D call
"Isolate Select", Illustrator calls "Isolation Mode", and After Effects
calls "Solo".

---

## Semantics

| Aspect                                       | Behavior                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| **Scope**                                    | One node. The isolated root + all descendants are drawn.                |
| **Hit-testing**                              | Scoped identically. Clicking outside the isolated subtree hits nothing. |
| **Scene background, grid, guides**           | Unaffected.                                                             |
| **Picture caches, layout, geometry, R-tree** | Unaffected. Isolation is a late filter, not a cache invalidation.       |
| **Export (`export_node_as`)**                | Ignores isolation entirely. Isolation is viewport-only.                 |
| **Outside the isolated subtree**             | Hard-hide (nothing drawn). No fade, no dim (v1).                        |
| **Persistence**                              | None. Resets on scene load / document reset. Not in undo history.       |
| **Multiple roots**                           | Not supported in v1. Struct is extensible for future multi-root.        |

---

## `RenderFilter` Extensibility

All viewport-time filters live on a single `RenderFilter` struct owned by
the `Renderer`. Isolation Mode is the first slot. Future slots include:

- **`outside: OutsideStyle`** -- "hide" (v1 default), "fade", "cover" for
  the content outside the isolated subtree.
- **`roots: Vec<NodeId>`** -- multi-root isolation for showing several
  disjoint subtrees simultaneously.
- **`hit_test: bool`** -- optionally scope hit-testing independently of
  draw-scoping.
- **Visibility overrides** -- force-show / force-hide individual nodes
  regardless of schema visibility.
- **Layer-type filters** -- show only text layers, only images, etc.
- **Debug tints** -- overlay colored tints on specific node types.

Adding a new filter category means adding a field to `RenderFilter` and
reading it in the draw loop and/or hit-tester. No plumbing changes elsewhere.

---

## API Shape

### Rust types (`crates/grida-canvas/src/runtime/filter.rs`)

```rust
pub struct IsolationMode {
    pub root: NodeId,
}

pub struct RenderFilter {
    pub isolation_mode: Option<IsolationMode>,
}
```

### Renderer methods (`crates/grida-canvas/src/runtime/scene.rs`)

```rust
impl Renderer {
    pub fn set_isolation_mode(&mut self, mode: Option<IsolationMode>);
    pub fn isolation_mode(&self) -> Option<&IsolationMode>;
    pub fn isolation_set(&self) -> Option<&HashSet<NodeId>>;
}
```

`set_isolation_mode` precomputes a `HashSet<NodeId>` of the root + all
descendants (via `SceneGraph::descendants`). The draw loop and hit-tester
use this set for O(1) per-layer filtering.

### ChangeFlags (`crates/grida-canvas/src/runtime/changes.rs`)

```rust
pub const RENDER_FILTER: Self = Self(1 << 9);
```

No cache invalidation is performed for this flag. It only ensures a frame
is queued so the filter change becomes visible immediately.

### ApplicationApi trait method (`crates/grida-canvas/src/window/application.rs`)

```rust
fn runtime_renderer_set_isolation_mode(&mut self, root_user_id: Option<&str>);
```

Accepts a user-facing string ID (`Option<&str>`). `Some("node-id")` enables
isolation; `None` clears it. The implementation converts the string ID to an
internal `NodeId` via `user_id_to_internal`.

### WASM C-ABI (`crates/grida-canvas-wasm/src/wasm_application.rs`)

```rust
pub unsafe extern "C" fn runtime_renderer_set_isolation_mode(
    app: *mut UnknownTargetApplication,
    id_ptr: *const u8,
    id_len: usize,
);
```

Pass `(null, 0)` to clear. Pass `(ptr, len)` pointing to a UTF-8 node ID
string to set.

### TypeScript wrapper (`crates/grida-canvas-wasm/lib/modules/canvas.ts`)

```typescript
class Scene {
  runtime_renderer_set_isolation_mode(nodeId: string | null): void;
}
```

---

## What This Feature Does NOT Do

- Does NOT mutate the document or scene graph.
- Does NOT invalidate caches (picture, compositor, geometry, layout, R-tree).
- Does NOT affect export (`export_node_as`).
- Does NOT persist across scene loads.
- Does NOT appear in undo/redo history.
- Does NOT support multiple isolation roots (v1).
- Does NOT fade or dim content outside the isolated subtree (v1 is hard-hide).
- Does NOT change camera, pan/zoom clamp, or viewport behavior.
- Does NOT touch editor state, React code, or any UI layer.
