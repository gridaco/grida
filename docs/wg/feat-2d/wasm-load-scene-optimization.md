# WASM `load_scene` Optimization Plan

## Status: In Progress

## Problem

`Renderer::load_scene()` for a 136k-node Figma-imported scene (yrr-main.grida) takes ~10s in WASM vs ~800ms native — a 13× overhead far beyond the normal 2-3× WASM/native ratio.

## Current Measurements (WASM-on-Node)

| Stage     | Native (ms) | WASM (ms)  | Ratio     | Notes                            |
| --------- | ----------- | ---------- | --------- | -------------------------------- |
| fonts     | 5           | 7          | 1.4×      | Healthy                          |
| layout    | 239         | 4,272      | 17.9×     | Taffy tree + flex compute        |
| geometry  | 121         | 4,017      | 33×       | DFS transform/bounds propagation |
| effects   | 3           | 5          | 1.7×      | Healthy                          |
| layers    | 427         | 2,182      | 5.1×      | Flatten + RTree                  |
| **total** | **796**     | **10,484** | **13.2×** |                                  |

Stages with healthy ratios (fonts, effects) confirm that simple per-node work runs at 1.5-2× in WASM. The pathological ratios in geometry/layout/layers indicate something structurally cache-unfriendly.

## Root Cause Analysis

### What we ruled out

These were investigated and either fixed or confirmed not the bottleneck:

1. **HashMap overhead** — Replaced with `DenseNodeMap` (Vec-backed). Fixed fonts/effects ratios but geometry/layout/layers unchanged.
2. **Function parameter count** — Reduced `build_recursive` from 9 params to 5 via context struct. No measurable change.
3. **Redundant text measurement** — Geometry was calling `paragraph_cache.measure()` for all 27k text spans even when layout results existed. Fixed (skip when layout provides dimensions). Helped native slightly, no WASM change.
4. **RTree sequential insert** — Replaced `RTree::new()` + N inserts with `RTree::bulk_load()`. Marginal improvement.
5. **`taffy_to_scene` HashMap** — Was written to on every node insert but only read in `#[cfg(test)]`. Gated behind `#[cfg(test)]`. No measurable change.

### What IS the bottleneck

The `Node` enum has 15 variants, each containing a full `*NodeRec` struct (transform, paints, effects, text content, vector networks, etc.). During the geometry DFS, every `graph.get_node(id)` fetches a reference into a `Vec<Option<Node>>` where each slot is the size of the largest variant — likely 500+ bytes.

For 136k nodes, the DFS touches ~65MB of node data, most of which is irrelevant to geometry (paints, text content, etc.). In WASM's linear memory model, this cache-unfriendly access pattern is amplified:

- **Native**: L1/L2 cache prefetching partially hides latency → 0.9μs/node
- **WASM**: Linear memory accesses compile to bounds-checked loads, no hardware prefetch → 29μs/node (33×)

The layout stage (17.9×) has a similar problem inside Taffy's `SlotMap` internals, plus the cost of building a parallel Taffy tree from our scene graph.

The layers stage (5.1×) is a DFS that also accesses the full `Node` enum plus geometry cache per node, though it's less pathological since it reads from the already-built geometry cache (dense, cache-friendly).

## Recommended Fix: Targeted SoA for Geometry Phase

### Concept

Extract a compact, geometry-only representation from the scene graph once (O(n) scan), then run the DFS on that instead of the full `Node` enum.

```rust
/// Compact per-node data for geometry computation.
/// ~48 bytes vs hundreds for the full Node enum.
#[derive(Clone, Copy)]
struct GeoInput {
    transform: AffineTransform,      // 28 bytes (6 f32 + rotation)
    width: f32,                       // from layout result or schema
    height: f32,                      // from layout result or schema
    kind: GeoNodeKind,                // 1 byte enum
    render_bounds_inflation: f32,     // pre-computed from effects/stroke
}

#[repr(u8)]
enum GeoNodeKind {
    Group,
    InitialContainer,
    Container,
    BooleanOperation,
    TextSpan,
    Leaf,
}
```

### Implementation Steps

1. **Define `GeoInput` and `GeoNodeKind`** in `cache/geometry.rs`

2. **Add extraction pass** in `from_scene_with_layout`:

   ```rust
   // O(n) scan: extract geometry-relevant data from Node enum
   let mut geo_inputs = DenseNodeMap::with_capacity(graph.node_count());
   for (id, node) in graph.nodes_iter() {
       let layout = layout_result.and_then(|r| r.get(&id));
       geo_inputs.insert(id, GeoInput::from_node(node, layout, &ctx));
   }
   ```

3. **Rewrite `build_recursive`** to operate on `&GeoInput` instead of `&Node`:
   - `graph.get_node(id)` → `geo_inputs.get(id)` (44 bytes, cache-friendly)
   - Match on `GeoNodeKind` (1-byte discriminant) instead of `Node` (large enum)
   - Children still come from `graph.get_children(id)` (unchanged)

4. **Handle text measurement**: For `GeoNodeKind::TextSpan` without layout results, store the measured (width, height) in `GeoInput` during the extraction pass. This moves text measurement out of the DFS entirely.

5. **Handle render bounds**: Pre-compute the effect/stroke inflation in `GeoInput::from_node` so the DFS only needs `world_bounds.inflate(inflation)`.

### Expected Impact

- **Geometry**: The DFS now touches ~6.5MB (48 bytes × 136k) instead of ~65MB. Should bring WASM ratio from 33× closer to 3-5×.
- **Native**: Also benefits from better cache locality, potentially 2-3× faster.
- **Layers**: Can follow the same pattern later (extract a `LayerInput` struct).
- **Layout**: Harder — Taffy's internal data structures are the bottleneck. Consider profiling Taffy separately.

### What this does NOT change

- Taffy layout computation (still uses Taffy's own data structures)
- Layer flattening (still reads full Node enum for paint info — separate optimization)
- Scene graph structure (Node enum stays as-is for all other uses)

### Risks

- **Render bounds accuracy**: Pre-computing inflation requires careful handling of per-side stroke widths and multiple effect types. The extraction pass must match the current `compute_render_bounds_*` logic exactly.
- **Text measurement in extraction**: Moving text measurement before the DFS means we measure all text nodes, even inactive ones. Add an `active` check.
- **Maintenance**: Two representations of the same data. Document clearly that `GeoInput` is a cache, not a source of truth.

## Benchmark Infrastructure

WASM-on-Node benchmarks are in `crates/grida-canvas-wasm/lib/__test__/bench-load-scene.test.ts`. Run with:

```sh
cd crates/grida-canvas-wasm
npx vitest run __test__/bench-load-scene.test.ts
```

Native benchmarks:

```sh
cargo run -p grida-dev --release -- load-bench fixtures/local/perf/local/yrr-main.grida --iterations 3
```

Build WASM (from repo root):

```sh
just --justfile crates/grida-canvas-wasm/justfile build
```

## Files to Modify

| File                                         | Change                                                 |
| -------------------------------------------- | ------------------------------------------------------ |
| `crates/grida-canvas/src/cache/geometry.rs`  | Add `GeoInput`, extraction pass, rewrite DFS           |
| `crates/grida-canvas/src/cache/paragraph.rs` | No change (already optimized with measurement caching) |
| `crates/grida-canvas/src/cache/scene.rs`     | No change                                              |
| `crates/grida-canvas/src/layout/tree.rs`     | No change                                              |

## Validation

1. `cargo test -p cg` — all 330 tests must pass
2. `cargo check -p cg -p grida-canvas-wasm -p grida-dev` — all crates compile
3. Native benchmark: should not regress (target: <800ms)
4. WASM-on-Node benchmark: geometry stage should drop from ~4s to <1s
5. Visual: load yrr-main in browser debug embed, verify text renders correctly and pan/zoom/settle work
