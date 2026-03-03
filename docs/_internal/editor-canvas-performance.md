# Canvas Editor Performance

> Internal engineering reference for diagnosing and fixing performance
> bottlenecks in the canvas editor (WASM/Skia backend).

**Status**: Investigation complete, implementation pending
**Last updated**: 2026-03-03

---

## Table of Contents

- [Observed Symptoms](#observed-symptoms)
- [Architecture Overview](#architecture-overview)
- [Root Cause Analysis](#root-cause-analysis)
  - [Finding 1: Full Scene Reload on Every Node Mutation](#finding-1-full-scene-reload-on-every-node-mutation)
  - [Finding 2: Broad React Subscriptions Amplified by Dev Mode](#finding-2-broad-react-subscriptions-amplified-by-dev-mode)
  - [Finding 3: Immer produceWithPatches on Monolithic State](#finding-3-immer-producewithpatches-on-monolithic-state)
- [Evidence Matrix](#evidence-matrix)
- [Fix Plan](#fix-plan)
  - [Phase 1: Targeted WASM FFI Updates](#phase-1-targeted-wasm-ffi-updates)
  - [Phase 2: React Subscription Narrowing](#phase-2-react-subscription-narrowing)
  - [Phase 3: State Architecture Improvements (Future)](#phase-3-state-architecture-improvements-future)
- [File Reference](#file-reference)
- [Benchmarking Protocol](#benchmarking-protocol)

---

## Observed Symptoms

| Action                | Dev (~localhost:3000) | Production                      | Notes                              |
| --------------------- | --------------------- | ------------------------------- | ---------------------------------- |
| **Pan (camera)**      | ~30fps (OK)           | Smooth                          | Does NOT touch `state.document`    |
| **Marquee selection** | ~30fps (OK)           | Smooth                          | Does NOT touch `state.document`    |
| **Arrow-key nudge**   | ~5fps (~500ms/frame)  | Usable but slower than expected | Touches `state.document.nodes[id]` |
| **Drag-move node**    | Very slow             | Usable                          | Touches `state.document.nodes[id]` |
| **Resize handle**     | Very slow             | Usable                          | Touches `state.document.nodes[id]` |
| **Color picker**      | Slow                  | Usable                          | Touches `state.document.nodes[id]` |

**Key insight**: The performance cliff correlates exactly with whether `state.document` is mutated. Pan and marquee (which only touch `state.transform`, `state.marquee`, `state.pointer`) are tolerable even in dev mode. Any operation that mutates a node property triggers the full bottleneck pipeline.

The dev-vs-production gap is **not** a simple "dev mode is slower" situation. The gap is disproportionately large for node mutations specifically, pointing to a compounding effect between two independent bottlenecks (WASM round-trip and React subscription overhead).

---

## Architecture Overview

### The Current Pipeline (per node mutation)

```
User presses arrow key
  |
  v
JS: Editor.dispatch("nudge")
  |
  v
JS: Immer produceWithPatches(ENTIRE_STATE, draft => {
      draft.document.nodes[id].layout_inset_left += 1
    })
  - Wraps entire state tree in ES Proxies
  - Generates patches + inverse patches
  - Records in history manager
  |
  v
JS: emit() to ALL ~250+ useSyncExternalStore listeners
  - Each runs its selector function
  - Each runs fast-deep-equal on the selected slice
  - React schedules re-renders for changed slices
  |
  v
JS: subscribeWithSelector for WASM sync fires
  (selector: state => state.document, equality: Object.is)
  - Immer always produces a new reference for touched paths
  - So this ALWAYS fires when document is mutated
  |
  v
JS: Filter Immer patches for document changes
  |
  v
JS: Convert Immer patches to JSON Patch operations
  |
  v
JS: JSON.stringify(patches)
  |
  v
FFI: Copy JSON string into WASM memory
  |
  v
Rust: serde_json::from_str() - deserialize patch operations
  |
  v
Rust: document.clone() - CLONE THE ENTIRE DOCUMENT JSON (serde_json::Value)
  |
  v
Rust: json_patch::patch() - apply the single "replace" op
  |
  v
Rust: serde_json::from_value::<JSONCanvasFile>(working.clone())
  - CLONE THE DOCUMENT AGAIN
  - DESERIALIZE THE ENTIRE DOCUMENT into typed Rust structs
  |
  v
Rust: IdConverter::convert_json_canvas_file()
  - Walk ALL nodes, assign fresh u64 IDs
  - Rebuild bidirectional ID mapping
  |
  v
Rust: renderer.load_scene(scene)
  - SceneCache::new() - DESTROY ALL CACHES
  - layout_engine.compute() - RE-LAYOUT ENTIRE SCENE (Taffy)
  - update_geometry_with_layout() - REBUILD ALL GEOMETRY
  - update_layers() - REBUILD ALL LAYERS + R-TREE
  |
  v
Rust: queue_stable() - FULL REPAINT via Skia
```

**To move one rectangle 1px right, the entire document is cloned twice in JSON, fully deserialized into Rust structs, all node IDs are re-mapped, every cache is destroyed, the entire scene is re-laid-out, all geometry is rebuilt, and Skia repaints everything from scratch. This is the same cost as loading the document for the first time.**

### Why Pan/Marquee Are OK

These operations only mutate `state.transform`, `state.marquee`, `state.pointer` -- they never touch `state.document`. The WASM document sync subscription (`subscribeWithSelector` with `state => state.document` and `Object.is` equality) correctly detects no change (same reference) and **never fires**. Camera transforms go through a separate lightweight path: `set_main_camera_transform` FFI call, which directly updates the Rust `Camera2D` struct -- no scene reload.

---

## Root Cause Analysis

### Finding 1: Full Scene Reload on Every Node Mutation

**Severity**: Critical
**Impact**: ~500ms per frame for any node property change
**Affects**: Both dev and production (but less noticeable in prod due to absence of React overhead)

The Rust-side `apply_transactions` function (`io_grida_patch.rs:65-107`):

1. `document.clone()` (line 65) -- deep-clones the entire document JSON (`serde_json::Value`)
2. `json_patch::patch()` (line 71) -- applies the patch (fast, O(1))
3. `serde_json::from_value::<JSONCanvasFile>(working.clone())` (line 88) -- **clones again** and **fully deserializes** the entire document into typed Rust structs

Then `process_document_transactions` in `application.rs:712-734` calls `load_scene_from_canvas_file()` which:

1. Creates a fresh `IdConverter` (line 676-682) -- walks all nodes to build String-to-u64 ID mappings
2. Calls `renderer.load_scene()` (line 684)

The `renderer.load_scene()` at `runtime/scene.rs:492-528`:

1. `self.scene_cache = SceneCache::new()` -- **destroys all cached geometry, pictures, tiles, layers**
2. `layout_engine.compute()` -- full Taffy layout rebuild from scratch (clears tree, rebuilds it)
3. `update_geometry_with_layout()` -- computes transforms + bounding boxes for every node
4. `update_layers()` -- rebuilds flat layer list + R-tree spatial index

**Existing infrastructure for future incremental updates**: The `GeometryEntry` struct (`cache/geometry.rs`) already has `dirty_transform: bool` and `dirty_bounds: bool` fields, but they are always initialized to `false` and never set to `true`. These are placeholders for a dirty-tracking system that was never implemented.

### Finding 2: Broad React Subscriptions Amplified by Dev Mode

**Severity**: High (dev mode), Medium (production)
**Impact**: Every dispatch triggers deep-equal checks on the full document for overlay components

Several React hooks subscribe to the entire `document` + `document_ctx` via `useDocumentState()` (`provider.tsx:337-347`):

```typescript
export function useDocumentState(): UseDocumentState {
  const editor = useCurrentEditor();
  return useEditorState<UseDocumentState>(editor, (state) => ({
    document: state.document, // THE ENTIRE DOCUMENT
    document_ctx: state.document_ctx, // THE ENTIRE HIERARCHY GRAPH
  }));
}
```

Consumers:

| Location                                 | Hook/Component                | What it actually needs                          |
| ---------------------------------------- | ----------------------------- | ----------------------------------------------- |
| `surface-hooks.ts:246`                   | `useSelectionGroups`          | `document.nodes[selected_ids]` + `document_ctx` |
| `surface-hooks.ts:304`                   | `useSingleSelection`          | `document.nodes[one_id]` + `document_ctx`       |
| `surface.tsx:623`                        | `RootFramesBarOverlay`        | `document.nodes[scene_children]`                |
| `provider.tsx:704`                       | `useRootTemplateInstanceNode` | `document.nodes[root_id]`                       |
| `sidecontrol-document-properties.tsx:54` | `DocumentProperties`          | `document.properties`                           |
| `starterkit-preview/index.tsx:51`        | `PreviewProvider`             | Already marked `// FIXME: very expensive`       |

The `useEditorState` hook uses `useSyncExternalStoreWithSelector` + `fast-deep-equal`. When the selector returns the full `document` object, `fast-deep-equal` must walk the entire node tree on every dispatch -- even for unrelated state changes like pointer moves.

In React dev mode (Strict Mode), effects and state hooks run twice, and Immer adds extra safety checks (Proxy overhead, auto-freeze). This multiplies the cost of already-broad subscriptions, explaining why dev is dramatically worse than production for node interactions specifically.

Additionally, `useNode()` (`provider.tsx:759`) subscribes to the entire `document + templates`, and is used by DOM renderer node components. While the DOM renderer is not the primary backend, any remaining `useNode()` consumers in the overlay layer (text-editor, corner-radius-handle, sidecontrol-global) contribute to the overhead.

### Finding 3: Immer produceWithPatches on Monolithic State

**Severity**: Medium
**Impact**: O(state_size) proxy overhead per dispatch, history recording for ephemeral state

The entire `IEditorState` (~30+ top-level fields including `document`, `transform`, `pointer`, `gesture`, `hits`, `selection`, `marquee`, `surface_snapping`, etc.) goes through a single `produceWithPatches` call (`reducers/index.ts:51`). This means:

- Even pointer moves (which only update `state.pointer`) wrap the entire state in Immer Proxies
- Patches are generated and recorded in the history manager for ephemeral state changes that should never be in the undo stack
- The `enablePatches()` call (line 18) has global overhead

By contrast, tools like Figma, Excalidraw, and tldraw separate ephemeral surface state (pointer, gesture, hover, camera) from document state, using mutable refs or lightweight stores for the former.

This is not the primary bottleneck (the WASM round-trip dominates), but it contributes to the overall dev-mode sluggishness and scales with state tree size.

---

## Evidence Matrix

| Mutation target              | Immer cost | React subscribers fire     | WASM sync fires            | Full scene reload     | Observed FPS (dev) |
| ---------------------------- | ---------- | -------------------------- | -------------------------- | --------------------- | ------------------ |
| `state.pointer`              | Full proxy | All ~250 selectors checked | No (`Object.is`: same ref) | No                    | ~30fps             |
| `state.transform`            | Full proxy | All ~250 selectors checked | No (separate subscription) | No                    | ~30fps             |
| `state.marquee`              | Full proxy | All ~250 selectors checked | No                         | No                    | ~30fps             |
| `state.document.nodes[id].x` | Full proxy | All ~250 selectors checked | **Yes** (new ref)          | **Yes** (full reload) | **~5fps**          |

The evidence cleanly isolates the bottleneck: only mutations to `state.document` trigger the WASM full-scene-reload path, and only those mutations exhibit catastrophic performance.

---

## Fix Plan

### Phase 1: Targeted WASM FFI Updates

**Goal**: Bypass the JSON serialize/deserialize/full-scene-reload pipeline for common node property changes.

**Approach**: Add new FFI methods to the WASM module that mutate the in-memory `Scene` directly, then call `invalidate_cache()` + `rebuild_scene_caches()` + `queue()`. On the JS side, inspect Immer patches and route simple property changes to these new FFI methods instead of the existing JSON Patch pipeline. Fall back to the JSON pipeline for anything complex (structural changes, add/remove nodes, link changes, etc.).

#### New Rust Methods to Add (`application.rs`)

| Method                    | Parameters                                     | Behavior                                                                                                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `update_node_transform()` | `user_id: &str, x: f32, y: f32, rotation: f32` | Look up internal NodeId via `id_mapping`. Mutate node's position/rotation in-place. Handle both Container (`LayoutPositioningBasis::Cartesian`) and leaf nodes (`AffineTransform::from_box_center`). Patch `document_json`. Call `invalidate_cache()` + `rebuild_scene_caches()` + `queue()`. |
| `update_node_size()`      | `user_id: &str, width: f32, height: f32`       | Same pattern. Handle Container (`layout_dimensions`) and leaf nodes (`Size` + recompute `AffineTransform`).                                                                                                                                                                                   |
| `update_node_fills()`     | `user_id: &str, fills_json: &str`              | Deserialize as `Vec<JSONPaint>`, convert via `Paint::from()`, set `fills: Paints` on the node.                                                                                                                                                                                                |
| `update_node_strokes()`   | `user_id: &str, strokes_json: &str`            | Same pattern as fills, for strokes.                                                                                                                                                                                                                                                           |

All methods must also patch `self.document_json` (the stored `serde_json::Value`) with the equivalent JSON Patch operation, so the existing JSON Patch fallback path stays consistent for subsequent operations.

**Node type handling**: The position/size model differs by node type:

- **Container**: `position: LayoutPositioningBasis` + `rotation: f32` + `layout_dimensions: LayoutDimensionStyle`
- **Rectangle, Ellipse, Image, Line, RegularPolygon, RegularStarPolygon**: `transform: AffineTransform` + `size: Size`
- **TextSpan**: `transform: AffineTransform` + `width: Option<f32>` + `height: Option<f32>`
- **Vector, Path, Polygon**: `transform: AffineTransform` (no `size` field)
- **Group, BooleanOperation**: `transform: Option<AffineTransform>`

For size updates on nodes that use `AffineTransform`, the transform must be recomputed with `AffineTransform::from_box_center(x, y, new_width, new_height, rotation)` to preserve center-origin positioning.

#### New FFI Exports to Add (`wasm_application.rs`)

Follow the existing pattern (see `highlight_strokes` as reference):

```
_update_node_transform(app, id_ptr, id_len, x, y, rotation) -> bool
_update_node_size(app, id_ptr, id_len, width, height) -> bool
_update_node_fills(app, id_ptr, id_len, json_ptr, json_len) -> bool
_update_node_strokes(app, id_ptr, id_len, json_ptr, json_len) -> bool
```

#### TS Bindings to Add

`canvas-bindings.d.ts`: Add type declarations for the 4 new `_update_node_*` functions.

`canvas.ts` (`Scene` class): Add wrapper methods that handle string allocation/deallocation:

```typescript
updateNodeTransform(nodeId: string, x: number, y: number, rotation: number): boolean
updateNodeSize(nodeId: string, width: number, height: number): boolean
updateNodeFills(nodeId: string, fills: unknown[]): boolean
updateNodeStrokes(nodeId: string, strokes: unknown[]): boolean
```

#### JS Integration (`editor.ts`)

Add a `__tryTargetedWasmUpdate()` method that inspects Immer patches and routes to targeted FFI when ALL patches target known node property fields on the `document/nodes/<id>/<field>` path with `op: "replace"`:

| Immer Patch Pattern                                                                  | FFI Route                                                  |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `document/nodes/<id>/layout_inset_left`, `layout_inset_top`, `rotation`              | `updateNodeTransform()`                                    |
| `document/nodes/<id>/layout_target_width`, `layout_target_height`, `width`, `height` | `updateNodeSize()`                                         |
| `document/nodes/<id>/fill`, `fill_paints`                                            | `updateNodeFills()`                                        |
| `document/nodes/<id>/stroke`, `stroke_paints`                                        | `updateNodeStrokes()`                                      |
| Anything else (structural, links, scenes, mixed fields, `op: "add"/"remove"`)        | Return false, fall through to existing JSON Patch pipeline |

Modify the existing `subscribeWithSelector` callback for `state.document` to try `__tryTargetedWasmUpdate()` first, then fall back to the existing JSON Patch pipeline.

#### What This Eliminates

| Pipeline Step                            | Before | After (targeted)                                              |
| ---------------------------------------- | ------ | ------------------------------------------------------------- |
| `JSON.stringify(patches)`                | Yes    | No                                                            |
| FFI string copy of large JSON            | Yes    | No (only node ID string + scalar params)                      |
| `serde_json::from_str` (parse patches)   | Yes    | No                                                            |
| `document.clone()` x2                    | Yes    | No                                                            |
| Full `JSONCanvasFile` deserialize        | Yes    | No                                                            |
| `IdConverter` rebuild (walk all nodes)   | Yes    | No                                                            |
| `SceneCache::new()` (destroy all caches) | Yes    | No (`invalidate_cache` only clears pictures/paragraphs/paths) |
| Full layout recompute                    | Yes    | **Yes** (still, via `rebuild_scene_caches()`)                 |
| Full geometry rebuild                    | Yes    | **Yes** (still)                                               |
| Full layer rebuild                       | Yes    | **Yes** (still)                                               |

The remaining `rebuild_scene_caches()` cost is pure Rust computation (no serialization) and should be fast for moderate scene sizes. If it becomes a bottleneck, see Phase 3a.

#### Checklist

- [ ] Implement Rust methods on `UnknownTargetApplication` in `application.rs`
- [ ] Add FFI exports in `wasm_application.rs`
- [ ] Add TS type declarations in `canvas-bindings.d.ts`
- [ ] Add `Scene` wrapper methods in `canvas.ts`
- [ ] Add `__tryTargetedWasmUpdate()` in `editor.ts`
- [ ] Modify WASM document sync subscription to try targeted update first
- [ ] Rebuild WASM binary (`just dev` or `just build` in `crates/grida-canvas-wasm/`)
- [ ] Copy artifacts to `lib/bin/`, rebuild npm package
- [ ] Test: arrow-key nudge, drag-move, resize, color changes
- [ ] Test: multi-node selection nudge
- [ ] Test: undo/redo after targeted update
- [ ] Test: structural changes still work via JSON fallback (add/delete nodes, reparenting)
- [ ] Test: `document_json` consistency (targeted update followed by JSON Patch fallback)
- [ ] Benchmark: compare FPS before/after for nudge with 10, 50, 100 node scenes

---

### Phase 2: React Subscription Narrowing

**Goal**: Reduce the number of React re-renders and deep-equal checks per dispatch, especially for the overlay layer in dev mode.

**Approach**: Replace broad `useDocumentState()` calls with narrow `useEditorState()` selectors that only pick the specific nodes/fields each consumer actually needs. This prevents `fast-deep-equal` from walking the entire document tree on every dispatch.

#### Specific Changes

| Location                                         | Current                                     | Proposed                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `surface-hooks.ts:246` `useSelectionGroups`      | `useDocumentState()` -- entire document     | `useEditorState(state => ({ selectedNodes: ids.map(id => state.document.nodes[id]), document_ctx: state.document_ctx }))` |
| `surface-hooks.ts:304` `useSingleSelection`      | `useDocumentState()` -- entire document     | `useEditorState(state => ({ node: state.document.nodes[node_id], document_ctx: state.document_ctx }))`                    |
| `surface.tsx:623` `RootFramesBarOverlay`         | `useDocumentState()` -- entire document     | `useEditorState(state => scene.children_refs.map(id => state.document.nodes[id]))`                                        |
| `provider.tsx:704` `useRootTemplateInstanceNode` | `useDocumentState()` -- entire document     | `useEditorState(state => state.document.nodes[root_id])`                                                                  |
| `sidecontrol-document-properties.tsx:54`         | `useDocumentState()`                        | `useEditorState(state => state.document.properties)`                                                                      |
| `starterkit-preview/index.tsx:51`                | `useDocumentState()` (already marked FIXME) | Narrow selector for needed nodes                                                                                          |

Additionally, remaining consumers of the deprecated `useNode()` hook (which subscribes to entire `document + templates`):

| Location                   | Consumer            |
| -------------------------- | ------------------- |
| `text-editor.tsx`          | `useNode(node_id!)` |
| `corner-radius-handle.tsx` | `useNode(node_id)`  |
| `sidecontrol-global.tsx`   | `useNode("page")`   |

These should migrate to `useNodeState()` which already exists and selects only the specific node.

#### Checklist

- [ ] Narrow `useSelectionGroups` subscription
- [ ] Narrow `useSingleSelection` subscription
- [ ] Narrow `RootFramesBarOverlay` subscription
- [ ] Narrow `useRootTemplateInstanceNode` subscription
- [ ] Narrow `DocumentProperties` subscription
- [ ] Narrow `PreviewProvider` subscription
- [ ] Migrate `text-editor.tsx` from `useNode()` to `useNodeState()`
- [ ] Migrate `corner-radius-handle.tsx` from `useNode()` to `useNodeState()`
- [ ] Migrate `sidecontrol-global.tsx` from `useNode()` to `useNodeState()`
- [ ] Verify no regressions in overlay positioning, selection handles, text editing
- [ ] Benchmark: count re-renders per nudge before/after (React DevTools Profiler)

---

### Phase 3: State Architecture Improvements (Future)

These are longer-term structural changes. Not required for immediate improvement but would fundamentally resolve the dev/prod performance gap and scale to large documents.

#### 3a. Incremental Cache Rebuilds in Rust

Instead of `rebuild_scene_caches()` doing a full recompute for all nodes, implement:

- **Dirty tracking**: Use the existing `GeometryEntry.dirty_transform` / `dirty_bounds` fields (currently always `false`) to mark only changed nodes
- **Targeted layout recompute**: For position-only changes on absolutely-positioned nodes, skip Taffy entirely (just update the transform). For size changes on flex children, only recompute the affected flex container.
- **Targeted geometry update**: Only recompute the changed node's `GeometryEntry` + propagate absolute transforms to descendants
- **Targeted picture invalidation**: Only clear the specific node's `Picture` from `PictureCache` instead of all pictures
- **Targeted layer update**: Update the moved node's entry in the R-tree instead of rebuilding the entire spatial index

This would make targeted updates O(affected subtree) instead of O(all nodes).

#### 3b. Split Ephemeral State Out of Immer

Move high-frequency, non-document state out of the `produceWithPatches` pipeline:

| State              | Current                   | Proposed                              |
| ------------------ | ------------------------- | ------------------------------------- |
| `pointer`          | Immer + patches + history | Mutable ref, no React subscription    |
| `hits`             | Immer + patches + history | Mutable ref                           |
| `hovered_node_id`  | Immer + patches + history | Mutable ref or lightweight store      |
| `gesture`          | Immer + patches + history | Lightweight store, no history         |
| `transform`        | Immer + patches + history | Separate store, sync directly to WASM |
| `marquee`          | Immer + patches + history | Lightweight store, no history         |
| `surface_snapping` | Immer + patches + history | Lightweight store                     |

This would reduce the Immer Proxy overhead for high-frequency events from O(full state) to O(document-only state), and stop recording meaningless history entries for ephemeral state.

#### 3c. Binary Protocol for WASM Sync

Replace JSON serialization with a binary protocol for WASM communication:

- Instead of `JSON.stringify` + `serde_json::from_str`, pass structured data via shared `ArrayBuffer` or typed scalar parameters
- For patches: encode as `(node_id_hash: u32, field_id: u16, value: f32)` tuples
- Eliminates JSON parse overhead entirely for common operations

#### 3d. Lazy Scene Loading (Demand Paging)

**Industry term**: This technique is commonly called **demand paging** or **lazy loading** in graphics engines and editors. The principle is the same as virtual memory paging in operating systems — only load data into memory when it is actually accessed, and evict it when it is no longer needed.

**Current behavior**: When a document is opened, the entire file (all scenes/pages and all their nodes) is loaded into the WASM renderer via `load_scene_json()` / `load_scene_from_canvas_file()`. All nodes across all scenes are deserialized, assigned internal IDs, and have their geometry/layout computed — even though the user only ever views one scene at a time.

**Proposed behavior**: Only load the **active scene** into the WASM renderer. Other scenes remain as inert JSON (or not fetched at all) until the user explicitly switches to them. On scene switch, unload the previous scene and load the new one.

**Benefits**:

- **Reduced initial load time**: Proportional to active scene size, not total document size.
- **Reduced memory footprint**: Only one scene's worth of `Scene`, `SceneCache`, ID mappings, layout trees, and Skia pictures in memory.
- **Reduced `rebuild_scene_caches()` cost**: Layout/geometry/layers computed only for nodes in the active scene, not the entire document.
- **Reduced WASM sync cost**: Patches for the active scene are smaller; patches for inactive scenes can be deferred or batched.

**Design considerations and constraints**:

This is not a drop-in optimization. It introduces architectural constraints that must be carefully designed around:

- **Cross-scene operations**: Any feature that needs to read or mutate nodes across multiple scenes (e.g. an AI agent operating on the full document, global find-and-replace, cross-page symbol references, export-all) must be aware that non-active scenes are not loaded. These operations would need to either:
  - Temporarily load the target scene, perform the operation, and unload it.
  - Operate on the serialized representation (JSON) without loading into the renderer.
  - Queue mutations as deferred patches applied when the scene is next loaded.
- **Component/symbol instances**: If a symbol is defined in scene A and instanced in scene B, the renderer for scene B needs access to the symbol definition. This requires a dependency graph between scenes, or a separate lightweight symbol registry that is always in memory.
- **Undo/redo across scenes**: The history manager currently records patches against the full document. With lazy loading, undoing a change that affects a non-loaded scene requires either loading that scene or applying the inverse patch to the serialized representation.
- **Collaboration/real-time sync**: If multiple users are editing different scenes simultaneously, incoming patches for non-loaded scenes must be stored and applied when the scene is loaded — similar to operational transform buffering.
- **Preloading and transitions**: Scene switches should feel instant. A preloading strategy (load adjacent scenes in idle time, keep recently-visited scenes warm) can mitigate the latency of on-demand loading.

**Implementation sketch**:

1. The JS `Editor` keeps the full document in `state.document` (for sidebar, layers panel, cross-scene queries).
2. The WASM renderer only receives `loadScene(activeSceneJson)` for the current scene.
3. On scene switch: serialize the new scene's subset of the document, call `loadScene()`. The old scene's WASM state is dropped.
4. The WASM document sync subscription filters patches to only forward those targeting the active scene.
5. Non-active scene patches accumulate in JS state (Immer handles this) and are synced to WASM when the user switches to that scene.

**Priority**: Low-medium. This is a significant architectural change best tackled after Phases 1-3c stabilize. The benefit scales with document complexity (many scenes, many nodes per scene). For single-scene documents it provides no improvement.

---

## File Reference

### Rust (crates)

| File                                               | Role                                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `crates/grida-canvas/src/window/application.rs`    | `UnknownTargetApplication` -- owns `Renderer`, `Scene`, `document_json`, `id_mapping`. Phase 1 methods go here.   |
| `crates/grida-canvas/src/io/io_grida_patch.rs`     | `apply_transactions()` -- the current JSON Patch pipeline (full clone + deserialize). The bottleneck code.        |
| `crates/grida-canvas/src/io/io_grida.rs`           | `JSONCanvasFile`, `JSONPaint`, `JSONNode`, `merge_paints()` -- JSON deserialization types and field name mappings |
| `crates/grida-canvas/src/io/id_converter.rs`       | `IdConverter` -- String-to-u64 ID mapping (rebuilt on every scene load)                                           |
| `crates/grida-canvas/src/runtime/scene.rs`         | `Renderer` -- `load_scene()` (line 492), `rebuild_scene_caches()` (line 567), `invalidate_cache()` (line 561)     |
| `crates/grida-canvas/src/cache/scene.rs`           | `SceneCache` -- geometry, pictures, tiles, layers, R-tree                                                         |
| `crates/grida-canvas/src/cache/geometry.rs`        | `GeometryEntry` -- per-node transforms + bounds. Has unused `dirty_transform`/`dirty_bounds` fields.              |
| `crates/grida-canvas/src/layout/engine.rs`         | `LayoutEngine` -- Taffy-based layout (full recompute, no dirty tracking)                                          |
| `crates/grida-canvas/src/node/schema.rs`           | `Node` enum, `Scene`, `SceneGraph`, all `*NodeRec` types, `Size`, `LayoutPositioningBasis`                        |
| `crates/grida-canvas/src/node/scene_graph.rs`      | `SceneGraph` -- `get_node_mut()` for in-place mutation                                                            |
| `crates/grida-canvas-wasm/src/wasm_application.rs` | FFI exports (`#[no_mangle] extern "C"`) -- Phase 1 FFI functions go here                                          |

### TypeScript (WASM bindings)

| File                                                        | Role                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `crates/grida-canvas-wasm/lib/modules/canvas.ts`            | `Scene` class -- JS wrappers for FFI calls. Phase 1 wrapper methods go here. |
| `crates/grida-canvas-wasm/lib/modules/canvas-bindings.d.ts` | Type declarations for emscripten FFI functions                               |
| `crates/grida-canvas-wasm/lib/index.ts`                     | Package entry point -- exports `Scene` type                                  |

### TypeScript (Editor)

| File                                                      | Role                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `editor/grida-canvas/editor.ts:3164`                      | WASM document sync subscription -- where Phase 1 JS routing logic goes       |
| `editor/grida-canvas/editor.ts:474`                       | `dispatch()` -- Immer `produceWithPatches` + `emit()`                        |
| `editor/grida-canvas/editor.ts:530`                       | `subscribeWithSelector()` -- subscription mechanism                          |
| `editor/grida-canvas/editor.i.ts`                         | All state type definitions (`IEditorState`, `Patch`, action types)           |
| `editor/grida-canvas/reducers/index.ts:51`                | Root reducer -- single `produceWithPatches` over entire state                |
| `editor/grida-canvas/reducers/document.reducer.ts:936`    | `"nudge"` action handler                                                     |
| `editor/grida-canvas/reducers/methods/transform.ts:44`    | `self_nudge_transform` -- the arrow-key nudge implementation                 |
| `editor/grida-canvas-react/use-editor.tsx:142`            | `useEditorState()` -- `useSyncExternalStoreWithSelector` + `fast-deep-equal` |
| `editor/grida-canvas-react/provider.tsx:337`              | `useDocumentState()` -- selects entire `document + document_ctx`             |
| `editor/grida-canvas-react/provider.tsx:740`              | `useNodeState()` -- narrow per-node selector (the correct pattern)           |
| `editor/grida-canvas-react/provider.tsx:759`              | `useNode()` -- deprecated, selects entire `document + templates`             |
| `editor/grida-canvas-react/viewport/surface-hooks.ts:242` | `useSelectionGroups()` -- uses broad `useDocumentState()`                    |
| `editor/grida-canvas-react/viewport/surface-hooks.ts:295` | `useSingleSelection()` -- uses broad `useDocumentState()`                    |
| `editor/grida-canvas-react/viewport/surface.tsx:621`      | `RootFramesBarOverlay` -- uses broad `useDocumentState()`                    |

---

## Benchmarking Protocol

### Setup

1. Open canvas editor at `localhost:3000/canvas` (dev) or production URL
2. Create a scene with a known number of nodes (e.g. 10 rectangles, 50 rectangles, 100 rectangles)
3. Select a single rectangle

### Tests

| Test               | How                                                 | What to Measure                               |
| ------------------ | --------------------------------------------------- | --------------------------------------------- |
| **Nudge latency**  | Hold arrow key for 2 seconds, count frames rendered | FPS = frames / 2s                             |
| **Drag latency**   | Drag a node in a circle for 5 seconds               | FPS via browser Performance tab               |
| **Resize latency** | Drag resize handle for 3 seconds                    | FPS via browser Performance tab               |
| **Pan baseline**   | Pan canvas with space+drag for 3 seconds            | FPS (reference baseline, should always be OK) |
| **Color change**   | Open color picker, drag hue slider                  | Responsiveness / lag                          |

### Browser Performance Tab

Use Chrome DevTools > Performance tab:

1. Start recording
2. Perform the action for 3-5 seconds
3. Stop recording
4. Look at "Frames" section for frame duration
5. Look at "Main" thread for long tasks (>50ms)
6. Compare scripting vs rendering vs painting time
7. Search for `applyTransactions` or `loadScene` calls in the flame chart to identify the WASM bottleneck

### Console Instrumentation

Add temporary timing around the WASM sync path in `editor.ts` (the `subscribeWithSelector` callback for `state.document`):

```typescript
// Around the targeted update path (once implemented):
const t0 = performance.now();
const handled = this.__tryTargetedWasmUpdate(surface, documentPatches);
const t1 = performance.now();
console.log(
  `targeted update: ${handled ? "HIT" : "MISS"} ${(t1 - t0).toFixed(1)}ms`
);

// Around the existing JSON Patch fallback:
const t0 = performance.now();
const result = surface.applyTransactions([operations]);
const t1 = performance.now();
console.log(`json patch pipeline: ${(t1 - t0).toFixed(1)}ms`);
```

### Expected Results After Phase 1

| Test                  | Before (dev) | After (dev, expected) | Rationale                                                                                                               |
| --------------------- | ------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Nudge FPS             | ~5fps        | ~20-30fps             | Eliminates JSON round-trip + full scene reload. `rebuild_scene_caches()` is pure Rust, should be <5ms for small scenes. |
| Pan FPS               | ~30fps       | ~30fps (no change)    | Pan never triggered the bottleneck path.                                                                                |
| Nudge FPS (100 nodes) | ~2-3fps      | ~15-25fps             | `rebuild_scene_caches()` scales with node count but is much faster than full JSON deserialize + ID rebuild.             |
