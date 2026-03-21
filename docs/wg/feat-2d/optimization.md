---
title: Rendering Optimization Strategies
---

# Rendering Optimization Strategies

A summary of optimization techniques for achieving high-performance
rendering (target: 60+ fps with large design documents including effects).

Related:

- Skia GPU Primitives Benchmark — see `crates/grida-canvas/examples/skia_bench/BENCHMARK.md`
- [Chromium Compositor Research](../research/chromium/index.md) — reference architecture
- Benchmark source: `crates/grida-canvas/examples/skia_bench/skia_bench_effects.rs` — effect cost ranking
- Benchmark source: `crates/grida-canvas/examples/skia_bench/skia_bench_opacity.rs` — opacity proof
- Benchmark source: `crates/grida-canvas/examples/skia_bench/skia_bench_atlas.rs` — texture atlas compositor

---

## Transform & Geometry

1. **Transform Cache**
   - Store `local_transform` and derived `world_transform`.
   - Use dirty flags and top-down updates.

2. **Geometry Cache**
   - Cache `local_bounds`, `world_bounds`, `render_bounds` (with effect expansion).
   - Used for culling, layout, hit-testing, and render surface sizing.

3. **Flat Scene Graph + Parent Pointers**
   - Flat arena with parent/children relationships.
   - Enables O(1) access and traversal.

---

## Rendering Pipeline

4. **GPU Acceleration (Skia Backend::GL)**
   - Use hardware compositing, filters, transforms.
   - All compositing caching is GPU-only (no CPU fallback — measured:
     CPU raster is strictly slower than live GPU draw).

5. **Display List Caching (SkPicture per Node)**
   - Record draw commands per node as `SkPicture`.
   - Eliminates Rust-side logic on replay (shape building, paint stacking).
   - Does NOT cache rasterized pixels — GPU effects (blur, shadow) are
     re-executed on every replay (~220 µs/shadow, measured).
   - Supports render policy variants (standard, wireframe) and effect
     quality variants (full, reduced) via variant keys. Both coexist in
     cache without invalidation.

6. **Render Surface Architecture (Effect Isolation)**

   > Replaces the previous "Tile-Based Raster Cache" section. The global
   > tile cache has been deleted. Per-node image caching (item 7) remains
   > as a complementary mechanism for leaf nodes with expensive effects.

   Effects that cannot be applied per-node (blend modes, filters, opacity
   with children, backdrop filters) are isolated into **render surfaces** —
   offscreen GPU textures that entire subtrees are composited into.

   This is how Chromium's compositor works (`cc/trees/effect_node.h`).
   Skia's `save_layer` is the underlying mechanism.

   The key insight: **effects are applied to entire subtrees, not
   individual nodes.** A container with 500 shadow children becomes one
   render surface. The 500 children are drawn as simple rects (fast),
   then one shadow filter is applied to the composited result.

   **What triggers a render surface:**

   | Condition                                | Rationale                                                 |
   | ---------------------------------------- | --------------------------------------------------------- |
   | Opacity `< 1.0` with 2+ visible children | Per-child alpha would double-blend overlaps (see item 6b) |
   | Blend mode other than Normal/PassThrough | Blend reads from content behind — must flatten first      |
   | Layer blur                               | Filter applied to composited group, not individual nodes  |
   | Backdrop blur / liquid glass             | Reads from content below in z-order                       |
   | Clip path                                | Applied to composited output                              |
   | Mask                                     | Composited then masked as a unit                          |
   | Shadows (optimization)                   | Cache the shadow result for the group                     |

   **Nodes without these properties draw directly** — no render surface
   overhead.

6b. **Per-Paint Alpha for Opacity (Avoid `save_layer` When Possible)**

    `save_layer` is the most expensive non-filter operation in Skia. It
    allocates an offscreen GPU texture, draws content into it, and
    composites it back — a fixed ~57-60 µs overhead per call regardless
    of content complexity. For opacity on nodes, this cost is avoidable
    in some cases.

    Note: `save_layer_alpha(bounds, alpha)` and `SaveLayerRec` with an
    alpha paint are identical — Skia's `saveLayerAlphaf` internally
    creates a paint and calls `saveLayer`. There is no fast path.

    **The optimization:** instead of wrapping a node's draws in
    `save_layer(alpha)`, bake the opacity directly into the final
    `SkPaint`'s alpha channel. This eliminates the offscreen texture
    entirely.

    **Measured impact (Apple M2 Pro, 1000 nodes):**

    | Node complexity       | `save_layer` | per-paint alpha | Speedup | Frame saved |
    | --------------------- | ------------ | --------------- | ------- | ----------- |
    | 1 fill                | 58.6 ms      | 0.4 ms          | 153x    | 58.2 ms     |
    | fill + stroke         | 58.7 ms      | 1.5 ms          | 39x     | 57.2 ms     |
    | 2 fills + stroke      | 59.4 ms      | 1.7 ms          | 34x     | 57.7 ms     |
    | 3 fills + 2 strokes   | 60.6 ms      | 4.1 ms          | 15x     | 56.5 ms     |
    | rrect fill+stroke (AA)| 60.1 ms      | 1.0 ms          | 60x     | 59.1 ms     |

    At 1000 nodes, per-paint alpha saves ~57 ms/frame — the difference
    between 17 fps and 60+ fps.

    **Scaling behavior:** the speedup grows super-linearly at high node
    counts. At 5000 fill+stroke nodes, per-paint is **93x** faster (vs
    39x at 1000) because `save_layer` cost increases from FBO pool
    pressure (~57 µs at 100 nodes → ~135 µs at 5000 nodes), while
    per-paint stays flat.

    Benchmark source: `crates/grida-canvas/examples/skia_bench/skia_bench_opacity.rs`

    ### Correctness caveats

    Per-paint alpha produces correct results **only when the node's draw
    calls do not overlap on the canvas.** When draws overlap, per-paint
    alpha double-blends at the intersection — the overlapping pixels
    receive opacity twice instead of once.

    In our painter, a single leaf node can issue up to 4 draw calls:

    1. `draw_fills` — one `draw_path` (multiple fills are composed into
       a single shader via `sk_paint_stack`, so this is always one call)
    2. `draw_noise_effects` — draws noise layers on top of fills
    3. `draw_stroke_path` — one `draw_path` (same `sk_paint_stack` logic)
    4. `draw_stroke_decorations` — draws markers at stroke endpoints

    The overlap relationships:

    | Draw A | Draw B | Overlap? | Double-blend visible? |
    | ------ | ------ | -------- | --------------------- |
    | Fills (single draw) | — | No overlap | N/A — always safe |
    | Fills | Stroke | Yes — inner half of stroke covers fill | Yes at low opacity / thick stroke |
    | Fills | Noise | Yes — noise covers fills entirely | **Always visible** — wrong blending |
    | Stroke | Markers | Yes — markers at stroke endpoints | Subtle but present |

    ### When per-paint alpha is safe (no visual difference)

    - **Fills only, no stroke, no noise** — one draw call, zero overlap.
    - **Stroke only, no fill** — one draw call, zero overlap.
    - Multiple fills with no stroke/noise — `sk_paint_stack` composes
      them into one shader, so still one draw call.

    ### When per-paint alpha is visually wrong

    - **Fills + noise** — noise composites over fills. Per-paint alpha
      would alpha-blend fills, then alpha-blend noise on top. The noise
      layer sees pre-multiplied-alpha fills underneath, producing wrong
      color math. **Never use per-paint alpha with noise.**
    - **Fills + stroke at low opacity** — the inner half of the stroke
      overlaps the fill. At opacity 0.3 with a 10px stroke, the overlap
      band is visibly darker than the surroundings. The artifact scales
      with `stroke_width * (1 - opacity)`.
    - **Any draw with non-SrcOver blend mode on individual paints** —
      per-paint alpha changes the blend input, producing different
      compositing results than whole-node alpha.

    ### Previously: heuristic-based tolerance (superseded)

    Before the non-overlapping fill path optimization, a heuristic allowed
    per-paint alpha for thin strokes or high opacity. This has been
    **replaced** by the exact PathOp::Difference approach, which eliminates
    the overlap entirely and produces pixel-correct results at all opacities
    and stroke widths. See `docs/wg/feat-2d/stroke-fill-opacity.md`.

    ### Decision rule for implementation

    ```text
    can_use_per_paint_alpha(node):
      if node has noise effects       → NO  (always wrong)
      if node has expensive effects   → NO  (shadows/blur need isolation)
      if non-Normal blend mode        → NO  (need blend isolation)
      if node has only fills          → YES (one draw call, no overlap)
      if node has only strokes        → YES (one draw call, no overlap)
      if node has fill + stroke:
        if stroke_align == Outside    → YES (no geometric overlap)
        if non_overlapping_fill_path  → YES (overlap eliminated by PathOp)
        otherwise                     → NO  (PathOp failed, use save_layer)
    ```

    See `docs/wg/feat-2d/stroke-fill-opacity.md` for the full spec.

    ### Current state in codebase

    **Implemented.** Per-paint alpha is used for all qualifying nodes:
    fills-only, strokes-only, and fill+stroke with non-overlapping fill
    paths. `with_opacity()` now passes tight local bounds when
    `save_layer_alpha` is still required (effects needing opacity
    isolation). See `docs/wg/feat-2d/stroke-fill-opacity.md`.

    ### Implementation priority

    1. ~~**Fills-only or strokes-only nodes**~~ — **done**. Safe, no heuristic
       needed, large speedup. Majority of typical document nodes.
    2. ~~**Pass bounds to remaining `save_layer` calls**~~ — **done**.
       `with_opacity()` now computes `shape.rect ∪ stroke_path.bounds()`.
    3. ~~**Fill+stroke with heuristic**~~ — **done**. Replaced by
       non-overlapping fill path (PathOp::Difference). See stroke-fill-opacity.md.

7. **Per-Node Image Cache (for Expensive Effect Nodes)**

   Individual nodes with expensive effects (blur, shadow, noise) whose
   replay cost exceeds ~100 µs are promoted to cached GPU textures
   (`SkImage`). On subsequent frames, a single texture blit replaces the
   expensive effect replay.

   **Measured costs (Apple M2 Pro):**

   | Operation                       | Per-call |
   | ------------------------------- | -------- |
   | Rect fill                       | 0.31 µs  |
   | Image blit (same texture)       | 0.3 µs   |
   | Image blit (different textures) | 2.4 µs   |
   | SkPicture replay with blur      | 220 µs   |

   **Promotion heuristics:**
   - Promote: nodes with shadows, blur, noise (measured replay > 100 µs)
   - Do NOT promote: simple fill/stroke (blit is slower than direct draw),
     backdrop-dependent effects (cannot capture in isolation), actively
     edited nodes

   **Limitation:** At scale (>500 promoted nodes), texture-switching
   overhead dominates (2.4 µs × 500 = 1.2 ms). For large scenes, the
   render surface approach (item 6) is more effective. The texture atlas
   (item 7b) mitigates this by packing cached images into shared pages.

7b. **Texture Atlas (Compositor Cache Packing)**

    Per-node cached images stored as individual GPU textures cause
    texture-switching overhead during compositing. Packing cached images
    into shared large textures (atlas pages) eliminates this.

    **Approach:** Shelf-based bin-packing allocates cached node images
    into atlas pages (default 4096x4096). The compositor blits sub-rects
    from shared atlas textures instead of binding a different texture per
    node.

    **Measured impact (microbenchmarks):**

    | Scenario                              | Separate textures | Atlas    | Speedup  |
    | ------------------------------------- | ----------------- | -------- | -------- |
    | Pan 64x64 x1000                       | 727 µs            | 118 µs   | 6.2x     |
    | Pan 32x32 x2000                       | 8463 µs           | 364 µs   | 23.2x    |
    | Full compositor sim (pan+opacity+blend, 64x64 x1000) | 2329 µs | 747 µs | 3.1x |

    Falls back to individual texture capture when atlas allocation fails
    (node too large for a page).

    Benchmark source: `crates/grida-canvas/examples/skia_bench/skia_bench_atlas.rs`

7c. **Compositor Early-Exit for Non-Promotable Nodes**

    The compositor update loop iterates over all visible nodes each frame to
    decide which nodes should be promoted to cached GPU textures. For nodes
    without expensive effects (simple fill/stroke), this loop performs
    unnecessary HashMap lookups (`compositor.peek`, `geometry.get_render_bounds`)
    and `should_promote` calls — only to conclude the node is not promotable.

    **The optimization:** check `has_promotable_effects()` (a cheap struct field
    check on the LayerEffects fields) before any HashMap lookups. Nodes without
    shadows, blur, noise, or glass skip the entire compositor evaluation.

    **Measured impact (Apple M2 Pro, GPU benchmark):**

    | Scene                          | Compositor before | Compositor after | Delta   |
    | ------------------------------ | ----------------- | ---------------- | ------- |
    | flat grid (10K rects, pan)     | 941 µs            | 134 µs           | -85.8%  |
    | stroke rect grid (2K, pan)     | 122 µs            | 18 µs            | -85.2%  |
    | opacity fill (5K, pan)         | 346 µs            | 51 µs            | -85.3%  |
    | opacity fill+stroke (5K, pan)  | 428 µs            | 74 µs            | -82.7%  |
    | shadow grid (2K promoted, pan) | 38 µs             | 38 µs            | 0%      |

    Total frame time improvement:

    | Scene                        | Pan avg before | Pan avg after | Delta   |
    | ---------------------------- | -------------- | ------------- | ------- |
    | flat grid (10K rects)        | 7310 µs        | 6084 µs       | -16.8%  |
    | opacity fill (5K)            | 3320 µs        | 2956 µs       | -11.0%  |
    | opacity fill+stroke (5K)     | 6214 µs        | 5767 µs       | -7.2%   |
    | shadow grid (2K promoted)    | 1233 µs        | 1224 µs       | 0%      |

    Scenes with promoted nodes (shadow grid) are unaffected — all their visible
    nodes have effects and still go through the full compositor path.

7d. **Pre-Filtered Compositor Indices (Eliminate Redundant R-Tree Query)**

    The compositor update previously performed its own R-tree spatial query
    each frame to find visible nodes, duplicating the same query already done
    by the frame plan builder. Additionally, it iterated ALL visible nodes
    just to check `has_promotable_effects()` — which returns false for the
    vast majority of nodes in typical scenes.

    **The optimization:** the frame plan now pre-filters visible indices to
    only those with promotable effects (`compositor_indices`) during its
    existing iteration pass. The compositor receives this pre-filtered slice,
    eliminating both the redundant R-tree query and the per-node promotability
    check.

    For scenes without effects (the common case), `compositor_indices` is
    empty and the compositor loop body never executes — zero work.

    **Measured impact (Apple M2 Pro, GPU benchmark):**

    | Scene                          | Compositor before | Compositor after | Delta   |
    | ------------------------------ | ----------------- | ---------------- | ------- |
    | flat grid (10K rects, pan)     | 134 µs            | 0 µs             | -100%   |
    | stroke rect grid (2K, pan)     | 18 µs             | 0 µs             | -100%   |
    | opacity fill (5K, pan)         | 51 µs             | 0 µs             | -100%   |
    | shadow grid (2K promoted, pan) | 34 µs             | 33 µs            | -3%     |

    **Criterion (CPU raster, statistically rigorous):**

    | Scene                                  | Change    | p-value |
    | -------------------------------------- | --------- | ------- |
    | simple_baseline/pan                    | -2.18%    | < 0.01  |
    | simple_baseline/zoom                   | -1.85%    | < 0.01  |
    | heavy_compositing/pan                  | -5.41%    | < 0.01  |
    | heavy_compositing/zoom                 | -4.63%    | < 0.01  |
    | heavy_compositing/pinch_zoom           | -4.85%    | < 0.01  |
    | heavy_compositing/pan_after_zoom       | -4.79%    | < 0.01  |
    | heavy_compositing/rapid_zoom_steps     | -4.94%    | < 0.01  |

    Also includes: `RefCell<usize>` → `Cell<usize>` for the picture cache
    hit counter (eliminates runtime borrow checking overhead in the hot draw
    loop), and removal of a redundant `canvas.clear(TRANSPARENT)` call.

8. **Dirty & Re-Cache Strategy**
   - Nodes marked dirty trigger re-recording of their `SkPicture`.
   - Render surfaces containing dirty children are re-composited.
   - Per-node cached images are invalidated on content change.
   - Transform changes do NOT invalidate cached images (transform applied
     at composite time).
   - Zoom changes invalidate all cached images (wrong pixel density).

9. **Display List Compilation**

   Scene is compiled into a flat list of render commands with resolved:
   - Transform
   - Clip bounds
   - Opacity
   - Z-order

   Enables non-recursive rendering and independent recording.

   ```text
   Logical Tree:
   Frame
     └── Group
          ├── Rect1
          ├── Rect2
          └── Rect3

   Flattened:
   [
     RenderCommand { node_id: Rect1, transform: ..., clip: ..., z: ... },
     RenderCommand { node_id: Rect2, transform: ..., clip: ..., z: ... },
     RenderCommand { node_id: Rect3, transform: ..., clip: ..., z: ... },
   ]
   ```

10. **Viewport Culling**
    - Use camera's `visible_rect` to cull via R-tree spatial index.
    - The R-tree indexes effect-expanded render bounds
      (`absolute_render_bounds`), not base geometry bounds. This means
      nodes whose base rect is offscreen but whose effect output (shadow,
      blur) extends into the viewport are correctly included.
    - `compute_render_bounds_from_effects()` accounts for blur (3x sigma),
      drop shadows (offset + spread + blur), progressive blur, backdrop
      blur, and liquid glass.
    - Nodes whose entire effect-expanded bounds are outside the viewport
      are skipped.

11. **Minimize Canvas State Changes**
    - Reuse transforms and paints.
    - Precompute common values like DPI × Zoom × ViewMatrix.

11b. **Specialized Primitive Draw Calls (Avoid Intermediate Path Creation)**

    `PainterShape` discriminates between rect, rrect, oval, and path. Instead
    of always calling `shape.to_path()` followed by `canvas.draw_path()`, use
    Skia's specialized draw calls (`draw_rect`, `draw_rrect`, `draw_oval`)
    that bypass path construction and use optimized GPU pipelines.

    Similarly, clipping uses `clip_rect`/`clip_rrect` instead of converting to
    a path and calling `clip_path`.

    The `draw_on_canvas()` and `clip_on_canvas()` methods on `PainterShape`
    dispatch to the optimal Skia primitive based on shape type.

    **Measured impact (Apple M2 Pro, GPU benchmark):**

    | Scene                        | Before      | After       | Delta  |
    | ---------------------------- | ----------- | ----------- | ------ |
    | flat grid (10K rects, pan)   | 11802 µs    | 10717 µs    | -9.2%  |
    | stroke rect grid (2K, pan)   | 4015 µs     | 3654 µs     | -9.0%  |
    | opacity fill (5K, pan)       | 13910 µs    | 13073 µs    | -6.0%  |

    **Criterion (CPU raster, statistically rigorous):**

    | Scene                        | Change    | p-value |
    | ---------------------------- | --------- | ------- |
    | simple_baseline/pan          | -10.3%    | < 0.01  |
    | simple_baseline/pan_zoomed_in| -20.7%    | < 0.01  |
    | heavy_compositing/pan        | -11.6%    | < 0.01  |

    The improvement is purely CPU-side: eliminated `Path::rect()`/`Path::rrect()`
    allocation on every fill draw call. At 10000 visible nodes, this saves ~1ms
    of CPU time per frame.

    Applied to: `draw_fills`, `draw_fills_with_opacity`, `draw_drop_shadow`,
    `draw_inner_shadow`, `render_noise_effect`, `with_clip`, `draw_backdrop_blur`,
    `draw_glass_effect`.

11c. **Direct Color Paint for Single Solid Fills**

    `sk_paint_stack` creates a `SkColorShader` and attaches it to the paint
    even for the most common case: a single solid fill. The GPU backend
    dispatches a shader program for any paint with a shader, even a trivial
    color shader. Setting the color directly on the paint via
    `paint.set_color()` gives Skia a simpler GPU code path.

    The fast path fires when `paints.len() == 1` and the paint is
    `Paint::Solid`. All other cases (gradients, images, multi-paint stacks)
    fall through to the existing shader-blending path.

    Applied to both `sk_paint_stack` and `sk_paint_stack_without_images`.

    **Measured impact (Apple M2 Pro, GPU benchmark):**

    | Scene                        | Before      | After       | Delta   |
    | ---------------------------- | ----------- | ----------- | ------- |
    | flat grid (10K rects, pan)   | 10885 µs    | 9223 µs     | -15.3%  |
    | opacity fill (5K, pan)       | 13906 µs    | 4296 µs     | -69.1%  |
    | opacity fill+stroke (5K)     | 16416 µs    | 7462 µs     | -54.6%  |

    The opacity scene improvements are amplified by the combined effect of
    this optimization, per-paint-alpha opacity folding (item 6b), and
    specialized primitive draw calls (item 11b). For fill-only nodes,
    per-paint-alpha eliminates `save_layer` entirely; for fill+stroke
    nodes with overlap, the non-overlapping fill path (PathOp::Difference)
    achieves the same. Direct color paint further reduces per-draw overhead
    by avoiding shader program dispatch for solid colors.

11d. **Translate-Fold for Pure-Translation Transforms**

    For the most common node type — fills-only with a pure-translation
    transform (no rotation, scale, or skew) — the painter folds the
    translation directly into the shape coordinates and draws with a single
    Skia call. This eliminates `canvas.save()`, `canvas.concat(matrix)`, and
    `canvas.restore()`, reducing the recorded SkPicture from 4 commands to 1
    per qualifying node.

    The optimization fires when:
    - Transform is pure translation (`[[1,0,tx],[0,1,ty]]`)
    - No clip path
    - No stroke path (fills only)
    - Trivial fast path conditions (opacity=1.0, no effects, Normal blend)

    Also applied to the per-paint-alpha opacity path for fills-only nodes
    with opacity < 1.0.

    For rect shapes, coordinates are offset directly. For rrect and oval
    shapes, `with_offset()` is used. Path shapes fall back to
    `save/translate/draw/restore`.

    **Measured impact (Apple M2 Pro, GPU benchmark):**

    | Scene                        | Before      | After       | Delta   |
    | ---------------------------- | ----------- | ----------- | ------- |
    | flat grid (10K rects, pan)   | 6882 µs     | 5455 µs     | -20.7%  |
    | flat grid (10K rects, draw)  | 5538 µs     | 4228 µs     | -23.7%  |
    | opacity fill (5K, pan)       | 2896 µs     | 2529 µs     | -12.7%  |
    | opacity fill (5K, draw)      | 2311 µs     | 1899 µs     | -17.8%  |
    | stroke rect (2K, pan)        | 2115 µs     | ~2250 µs    | ~0% (noise) |
    | shadow grid (2K promoted)    | 1196 µs     | ~1218 µs    | ~0% (noise) |

    Scenes with strokes or effects are unaffected — all their nodes bypass
    the translate-fold path and use the existing `save/concat/restore`.

12. **Tight Bounds for `save_layer` Operations**
    - First: avoid `save_layer` entirely when possible (see item 6b).
    - When required: always provide explicit bounds.
    - Unbounded `save_layer` creates full-canvas offscreen buffers (~100x
      larger than necessary).
    - Compute tight bounds including effect expansion (shadow offset +
      spread + 3x blur radius).
    - Critical for blend mode isolation and render surface sizing.
    - Each `save_layer` has a fixed ~57-60 µs overhead (measured).
      At scale, this dominates frame time.

    **Current status:** `with_opacity()` now passes tight local bounds
    (`shape.rect ∪ stroke_path.bounds()`) to `save_layer_alpha`. Previously
    it passed `None` (unbounded, full-canvas offscreen). Blend mode isolation
    (`with_blendmode`, `with_blendmode_and_opacity`) already used bounded
    `save_layer` via `compute_blend_mode_bounds_with_stroke()`.

13. **Text & Path Caching**
    - Cache laid-out paragraphs keyed by content hash + font generation.
    - Cache parsed SVG paths keyed by content hash.
    - Caches invalidated when fonts or source data change.

14. **Render Pass Ordering**
    - Render passes execute in dependency order (children before parents).
    - Within a pass, nodes are drawn front-to-back.
    - Backdrop filters require all content behind them to be drawn first.

---

## Effect Cacheability Classification

Not all effects can be cached in isolation. The critical distinction:

**Self-contained** (safe to cache):

| Effect                               | Notes                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Fills (solid, gradient, image)       | Pure paint operations                                                                                               |
| Strokes (all variants)               | Computed from path + stroke params                                                                                  |
| Drop shadows                         | Extends bounds — cached image must include expansion                                                                |
| Inner shadows                        | Clipped to shape; operates on own content only                                                                      |
| Noise effects                        | Blends with fills within same surface                                                                               |
| Layer blur                           | `save_layer` with image filter — reads own buffer only                                                              |
| Opacity (fills-only or strokes-only) | Per-paint alpha — no `save_layer` needed (item 6b)                                                                  |
| Opacity (fills + noise)              | Requires `save_layer` — noise compositing is wrong without isolation                                                |
| Opacity (fills + stroke)             | Per-paint alpha via non-overlapping fill path (PathOp::Difference); `save_layer` fallback if PathOp fails (item 6b) |
| Opacity (2+ overlapping children)    | Requires `save_layer` via render surface (item 6)                                                                   |
| Clip paths                           | Restricts visible area                                                                                              |
| Mask groups                          | Self-contained, cached as a unit                                                                                    |

**Context-dependent** (must draw live):

| Effect                 | Why                                                      |
| ---------------------- | -------------------------------------------------------- |
| Backdrop blur          | Reads pixels behind the node                             |
| Liquid glass           | Runtime shader reads + distorts backdrop                 |
| Non-Normal blend modes | Final pixels depend on `src × dst` with scene background |
| PassThrough blend mode | No isolation boundary                                    |

**Design rule:** Nodes with context-dependent effects are never cached in
isolation. They draw live every frame. Their siblings can still be cached.

---

## Pan-Only Optimization

Users pan far more often than they zoom. Panning is a pure translation —
zoom stays constant. This unlocks optimizations impossible when scale changes.

15. **Camera Change Classification**

    ```text
    enum CameraChangeKind {
        None,       // no camera change
        PanOnly,    // translation changed, zoom did not
        ZoomIn,     // zoom increased (viewport shrinks into existing content)
        ZoomOut,    // zoom decreased (viewport expands, new content appears)
        PanAndZoom, // both changed (pinch gesture)
    }
    ```

    Computed once per frame, threaded through the pipeline so every stage
    can take the cheapest path.

    **Frame cost hierarchy:** `None < ZoomIn < PanOnly < ZoomOut < PanAndZoom`.
    Zoom-in is cheaper than pan because no new spatial content enters the
    viewport — only pixel density changes. Zoom-out is more expensive than
    pan because new content appears in all four directions simultaneously.

16. **Cached Content Reuse on Pan**

    When panning only:
    - All cached render surfaces remain pixel-perfect (same zoom).
    - All cached per-node images remain valid.
    - The compositor blits cached textures at shifted positions.
    - Only live (non-cached) nodes need actual draw calls.
    - No re-rasterization, no geometry recomputation.

17. **Incremental Visible-Set Update**

    Track the previous frame's visible set. On pan, compute only entering
    and exiting layers (intersecting newly exposed strips). For small pan
    deltas, these sets are tiny — cheaper than a full R-tree query.

    Fall back to full query when: pan delta > 50% of viewport, after zoom,
    after scene mutation.

18. **Skip LOD / Resolution Recalculation on Pan**

    These computations depend on zoom, not pan offset:
    - Image mipmap level selection
    - Effect LOD decisions (blur sigma, shadow quality)
    - Adaptive resolution scaling

    Guard with `if zoom_changed { ... }`.

19. **Pan Velocity-Based Prefetch**

    During sustained panning, predict upcoming visible regions:
    - Track pan velocity: `v_pan = (current_offset - prev_offset) / dt`
    - Prefetch region: extend viewport by `v_pan * lookahead_time`
    - Pre-rasterize content for the prefetch region at idle priority.
    - Typical lookahead: 100–200ms of predicted motion.

    Chromium calls this the "skewport" — a velocity-extrapolated rect.

20. **Overlay Layer Fast Path**

    UI overlays (selection handles, guides, rulers, cursors) are drawn in
    screen space. On pan-only frames, apply the delta as a uniform
    translation rather than recomputing from world coordinates.

---

## Zoom-In / Zoom-Out Asymmetry

Zoom-in and zoom-out are fundamentally different operations from a caching
perspective. The previous `ZoomOnly` classification treated them identically,
missing the cheapest possible camera-change path.

21. **Zoom-In: Pure Texture Scale**

    When zooming in, the viewport shrinks into content that was already
    rendered. The previous frame is a spatial superset of the current
    frame — every pixel that will be visible was already visible. The only
    deficit is pixel density (the texture is magnified past its native
    resolution).

    During an active zoom-in gesture:
    - Blit the previous composited frame with a scale transform. No new
      rasterization, no new content discovery, no visible-set changes.
    - The only artifact is upscale blur, which is acceptable during a
      gesture and disappears on refinement.
    - This is the cheapest possible non-idle frame — one texture blit.

    Chromium exploits this during pinch-to-zoom: existing compositor tiles
    are scaled, and re-rasterization is deferred until the gesture settles.

22. **Zoom-Out: Radial Content Discovery**

    When zooming out, the viewport expands beyond previously rendered
    content. New spatial regions appear at all four edges. The center of
    the previous frame remains valid (at higher density than needed, so
    scaling down looks visually clean), but the border strips are
    unrasterized.

    During an active zoom-out gesture:
    - Scale the previous frame down for the center region.
    - Treat newly exposed border strips like pan-discovered content:
      apply the same incremental visible-set logic (item 17), but
      radially rather than in one direction.
    - Prioritize rasterizing the largest newly-visible regions first.

    Scale-down produces fewer visual artifacts than scale-up (discarding
    information vs. interpolating it), so zoom-out's intermediate frames
    look better than zoom-in's even without refinement.

23. **Settle & Refine (shared)**

    After the gesture ends (~50 ms idle), re-rasterize at the correct zoom
    density using progressive refinement (center-out ordering, focal point
    priority). This is shared behavior for both zoom directions and is
    covered further in items 25–27.

---

## Zoom & Interaction Optimization

24. **Adaptive Interactive Resolution (LOD While Zooming)**
    - Maintain `interactive_scale` s in (0, 1]
    - Effective render resolution: `effective_dpr = device_dpr * s`
    - Drive `s` by zoom velocity, not zoom level
    - High velocity → lower `s` (faster), near-zero → ramp to 1 (sharpen)
    - Hysteresis to avoid flicker

25. **Two-Phase Rendering: Fast Preview Then Refine**

    **During active zoom/pan:**
    - Reuse cached content at stale zoom (scale the texture)
    - Skip expensive effects (blur, shadow, noise)
    - Render at reduced resolution

    **After settle (50ms idle):**
    - Re-rasterize at full quality and correct zoom density
    - Progressive refinement: center-out ordering

    Chromium does this with pinch-zoom: discrete raster scale jumps,
    snap to existing tilings, refine when gesture ends.

26. **Effect LOD During Interaction**

    While zooming/panning, selectively degrade expensive operations:
    - Drop shadow: blur radius → 0 (sharp offset shadow, still visible)
    - Inner shadow: skip entirely
    - Layer blur: radius / 4
    - Noise: skip entirely
    - Backdrop blur: radius / 4
    - Liquid glass: kept (cheap enough, visually jarring to remove)

    After settle: restore exact effects.

    Record two SkPicture variants per node (full quality, fast) and switch
    based on the `stable` frame flag.

27. **Progressive Refinement Ordering**

    When restoring full quality after interaction:
    1. Content near focal point (pinch center / cursor)
    2. Content in the visible viewport
    3. Content in a margin ring (prefetch)

28. **Snap Bounds to Reduce Thrash**

    Continuous zoom changes cause float differences that trigger re-raster.
    - Snap bounds to integer pixels in device space.
    - Quantize `effective_dpr` to a small set (e.g. `{0.5, 0.67, 0.75, 1.0}`)

29. **Temporal Throttling**

    During active zoom:
    - Rate-limit expensive re-raster to 30–60 Hz
    - Still update transform (scale) every frame for responsiveness
    - Refine pass runs only after settle

30. **Interaction Overlays at Full Resolution**

    Always render UI overlays at native resolution:
    - Selection bounds, handles, guides, cursor, rulers
    - Snapping hints, hover highlights

    Even if content is temporarily low-res, the tool feels precise.

---

## Image Optimization

31. **LoD / Mipmapped Image Swapping**
    - Use lower-res versions of images at low zoom.
    - Prevents high GPU bandwidth use at low visibility.

32. **ImageRepository with Transform-Aware Access**
    - Pick image resolution based on projected screen size.

---

## Text & Glyph Optimization

33. **Glyph Cache (Paragraph Caching)**
    - Cache rasterized or vector glyphs used across the document.
    - Prevents redundant layout or rendering of text.
    - Content-hash keyed to prevent memory leaks.

---

## Engine-Level

34. **Precomputed World Transforms**
    - Avoid recalculating transforms per draw call.
    - Essential for random-access rendering.

35. **Flat Table Architecture**
    - All node data (transforms, bounds, styles) stored in flat maps.
    - Enables fast diffing, syncing, and concurrent access.

36. **Scene Planner & Scheduler**
    - Builds the render pass list per frame.
    - Reacts to scene changes, memory pressure, frame budget.
    - Drives decisions to re-record, cache, evict, or degrade fidelity.

---

## Future: Worker-Thread Rasterization

37. **Multithreaded Rasterization**

    Move SkPicture recording and/or render surface rasterization to worker
    threads. This is the single largest performance gap vs. Chromium:
    - Chromium: 32 concurrent raster threads
    - Grida: 1 thread (main)

    2000 shadows at 220 µs each:
    - 1 thread: 440 ms (2 fps)
    - 32 threads: 14 ms (71 fps)

    Prerequisite: the render surface / effect tree architecture (item 6)
    which defines independent units of work that can be parallelized.

    **Constraint:** Grida's primary target is WASM. WASM does not support
    shared-memory threads in a way compatible with Skia's GPU context.
    Worker-thread rasterization is not feasible on the web target. All
    single-thread optimizations (effect tree, render surfaces, effect LOD,
    viewport culling, texture atlas, pan fast path, quantized DPR) exist
    specifically to compensate for this. Multithreaded rasterization
    applies only to native (desktop) builds.

38. **BVH or Quadtree Spatial Index**
    - Build dynamic index from `world_bounds` for fast spatial queries.
    - Currently using R-tree (rstar crate).

39. **CRDT-Ready Data Stores**
    - Flat table model enables future collaboration support.

---

## Memory Budget

Each cached item costs GPU memory:

| Item             | Cost                                       |
| ---------------- | ------------------------------------------ |
| Per-node SkImage | `width × height × 4` bytes                 |
| Render surface   | `surface_width × surface_height × 4` bytes |
| SkPicture        | Variable (command stream, typically small) |

Default budget: 128 MB. When exceeded, evict least-recently-used items.
Chromium uses 64 MB default with soft/hard limits.

---

This list is designed to evolve the renderer from single-threaded mode to
scalable, GPU-friendly real-time performance. Items are ordered roughly by
implementation priority within each section.
