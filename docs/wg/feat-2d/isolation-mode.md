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
stays loaded, laid out, and cached — the rest of the pipeline is untouched.
It is a pure **viewport filter**, not a mutation of the document.

---

## Semantics

| Aspect                 | Behavior                                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| Scope                  | One node. The isolated root + all descendants are drawn.                |
| Hit-testing            | Scoped identically. Clicking outside the isolated subtree hits nothing. |
| Caches, layout, R-tree | Unaffected. Isolation is a late filter, not a cache invalidation.       |
| Export                 | Ignores isolation entirely. Isolation is viewport-only.                 |
| Persistence            | None. Resets on scene load. Not in undo history.                        |
| Multiple roots         | Not supported. Extensible for future multi-root.                        |

---

## Outside Modes

The `outside` field on `IsolationMode` selects the rendering strategy
for content outside the isolation root's bounds. Each variant is a
fundamentally different compositing approach — they are mutually exclusive.

### Hidden (default)

Non-isolated content is fully skipped. No overlay, no extra draw passes.

### Viewport

The isolation root's shape defines a viewport. Subtree content inside
the shape draws normally; overflow is dimmed by a post-draw overlay with
the root's shape punched out (`ClipOp::Difference`). Non-isolated content
is still hidden.

### Context (not implemented)

Non-isolated content is drawn dimmed. Isolated content draws at full
opacity on top. This requires two-pass compositing (`saveLayer`) and
produces visually different results from `Viewport` — see "Open questions."

---

## Stage Decoration

An isolation mode can optionally carry a **stage preset** — ephemeral
visual decoration drawn at the isolation root's shape without mutating
the document. The renderer resolves the preset into concrete fills,
strokes, shadows, and corner radii at draw time.

Stage decoration draws in two phases that wrap the subtree content:

1. **Background** (before subtree): fills + drop shadows
2. **Foreground** (after subtree): strokes + inner shadows

The renderer resolves and builds the draw context once per frame via
`IsolationDrawContext`, ensuring no redundant lookups or allocations.

Presets are `#[repr(u32)]` for zero-overhead C-ABI crossing.

---

## API Surface

Isolation is configured via two C-ABI functions (exposed as TS methods
on the `Scene` class):

- **`runtime_renderer_set_isolation_mode`** — set or clear isolation.
  Accepts a node ID (string), flags (bit 0 = enable Viewport mode),
  and overflow opacity.
- **`runtime_renderer_set_isolation_stage_preset`** — set the stage
  decoration preset (u32 discriminant).

Rust-side, `IsolationMode` lives on `RenderFilter` (owned by `Renderer`).
`ChangeFlags::RENDER_FILTER` ensures a frame is queued when isolation
changes — no cache invalidation needed.

See `crates/grida-canvas/src/runtime/filter.rs` for the full type
definitions.

---

## What This Feature Does NOT Do

- Does NOT mutate the document or scene graph.
- Does NOT invalidate any caches.
- Does NOT affect export.
- Does NOT persist across scene loads.
- Does NOT appear in undo/redo history.
- Does NOT change camera, pan/zoom, or viewport behavior.
- Does NOT touch editor state or any UI layer.

---

## Reference: Isolation Across Applications

| Application model             | Outside subtree | Overflow             | Engine variant         | Status          |
| ----------------------------- | --------------- | -------------------- | ---------------------- | --------------- |
| Blender "Local View"          | Hidden          | N/A                  | `Hidden`               | Implemented     |
| Maya / 3ds Max "Isolate"      | Hidden          | N/A                  | `Hidden`               | Implemented     |
| After Effects "Solo"          | Hidden          | N/A                  | `Hidden`               | Implemented     |
| Keynote / Slides / PowerPoint | Hidden          | Dimmed               | `Viewport`             | Implemented     |
| Illustrator "Isolation Mode"  | Dimmed          | No special treatment | `Context`              | Not implemented |
| Figma "Focus on frame"        | Dimmed          | Dimmed               | `Context` + `Viewport` | Not implemented |

---

## Open Questions

- **Context mode** (Illustrator model): requires two-pass `saveLayer`
  compositing. The isolated content composites against the dimmed scene
  (not the normal scene), so semi-transparent nodes look different.
  This is why `Context` and `Viewport` are enum variants, not
  independent flags.

- **Combined Context + Viewport** (Figma model): three visual zones
  (in-bounds at full opacity, overflow dimmed, siblings dimmed). The
  two dimmed zones can share a single `saveLayer`, but the subtree
  is drawn twice. Costs 2x for the isolated subtree.

- **Multi-root isolation**: extensible via `roots: Vec<NodeId>`.
  Isolation set precomputation and filtering generalize naturally.
