---
title: Rendering Optimization Strategies
---

# Rendering Optimization Strategies

A summary of optimization techniques for achieving high-performance
rendering (target: 60+ fps with large design documents including effects).

Related:

- [Skia GPU Primitives Benchmark](./skia-gpu-primitives-benchmark.md) — measured Skia primitive costs
- [Chromium Compositor Research](../research/chromium/index.md) — reference architecture

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
   - Supports render policy variants (standard, wireframe) via variant keys.

6. **Render Surface Architecture (Effect Isolation)**

   > Replaces the previous "Tile-Based Raster Cache" and "Per-Node Image
   > Cache" sections.

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

   | Condition                                | Rationale                                                |
   | ---------------------------------------- | -------------------------------------------------------- |
   | Opacity < 1.0 with 2+ visible children   | Per-child alpha would double-blend overlaps              |
   | Blend mode other than Normal/PassThrough | Blend reads from content behind — must flatten first     |
   | Layer blur                               | Filter applied to composited group, not individual nodes |
   | Backdrop blur / liquid glass             | Reads from content below in z-order                      |
   | Clip path                                | Applied to composited output                             |
   | Mask                                     | Composited then masked as a unit                         |
   | Shadows (optimization)                   | Cache the shadow result for the group                    |

   **Nodes without these properties draw directly** — no render surface
   overhead.

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
   render surface approach (item 6) is more effective.

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
    - Use camera's `visible_rect` to cull `world_bounds` via R-tree spatial index.
    - Nodes entirely outside viewport are skipped.
    - Effect bounds expansion: nodes whose base geometry is outside viewport
      but whose effect expansion (shadow, blur) extends into viewport must
      still be drawn.

11. **Minimize Canvas State Changes**
    - Reuse transforms and paints.
    - Precompute common values like DPI × Zoom × ViewMatrix.

12. **Tight Bounds for `save_layer` Operations**
    - Always provide explicit bounds to `save_layer` calls.
    - Unbounded `save_layer` creates full-canvas offscreen buffers (~100x
      larger than necessary).
    - Compute tight bounds including effect expansion (shadow offset +
      spread + 3x blur radius).
    - Critical for blend mode isolation and render surface sizing.

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

| Effect                         | Notes                                                  |
| ------------------------------ | ------------------------------------------------------ |
| Fills (solid, gradient, image) | Pure paint operations                                  |
| Strokes (all variants)         | Computed from path + stroke params                     |
| Drop shadows                   | Extends bounds — cached image must include expansion   |
| Inner shadows                  | Clipped to shape; operates on own content only         |
| Noise effects                  | Blends with fills within same surface                  |
| Layer blur                     | `save_layer` with image filter — reads own buffer only |
| Opacity                        | Standard alpha compositing                             |
| Clip paths                     | Restricts visible area                                 |
| Mask groups                    | Self-contained, cached as a unit                       |

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
        ZoomOnly,   // zoom changed, translation did not
        PanAndZoom, // both changed (pinch gesture)
    }
    ```

    Computed once per frame, threaded through the pipeline so every stage
    can take the cheapest path.

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

## Zoom & Interaction Optimization

21. **Adaptive Interactive Resolution (LOD While Zooming)**
    - Maintain `interactive_scale` s in (0, 1]
    - Effective render resolution: `effective_dpr = device_dpr * s`
    - Drive `s` by zoom velocity, not zoom level
    - High velocity → lower `s` (faster), near-zero → ramp to 1 (sharpen)
    - Hysteresis to avoid flicker

22. **Two-Phase Rendering: Fast Preview Then Refine**

    **During active zoom/pan:**
    - Reuse cached content at stale zoom (scale the texture)
    - Skip expensive effects (blur, shadow, noise)
    - Render at reduced resolution

    **After settle (50ms idle):**
    - Re-rasterize at full quality and correct zoom density
    - Progressive refinement: center-out ordering

    Chromium does this with pinch-zoom: discrete raster scale jumps,
    snap to existing tilings, refine when gesture ends.

23. **Effect LOD During Interaction**

    While zooming/panning, selectively degrade expensive operations:
    - Shadow: blur radius → 0 (sharp offset shadow, still visible)
    - Layer blur: radius / 4
    - Noise: skip entirely
    - Backdrop blur: reduced radius

    After settle: restore exact effects.

    Record two SkPicture variants per node (full quality, fast) and switch
    based on the `stable` frame flag.

24. **Progressive Refinement Ordering**

    When restoring full quality after interaction:
    1. Content near focal point (pinch center / cursor)
    2. Content in the visible viewport
    3. Content in a margin ring (prefetch)

25. **Snap Bounds to Reduce Thrash**

    Continuous zoom changes cause float differences that trigger re-raster.
    - Snap bounds to integer pixels in device space.
    - Quantize `effective_dpr` to a small set (e.g. `{0.5, 0.67, 0.75, 1.0}`)

26. **Temporal Throttling**

    During active zoom:
    - Rate-limit expensive re-raster to 30–60 Hz
    - Still update transform (scale) every frame for responsiveness
    - Refine pass runs only after settle

27. **Interaction Overlays at Full Resolution**

    Always render UI overlays at native resolution:
    - Selection bounds, handles, guides, cursor, rulers
    - Snapping hints, hover highlights

    Even if content is temporarily low-res, the tool feels precise.

---

## Image Optimization

28. **LoD / Mipmapped Image Swapping**
    - Use lower-res versions of images at low zoom.
    - Prevents high GPU bandwidth use at low visibility.

29. **ImageRepository with Transform-Aware Access**
    - Pick image resolution based on projected screen size.

---

## Text & Glyph Optimization

30. **Glyph Cache (Paragraph Caching)**
    - Cache rasterized or vector glyphs used across the document.
    - Prevents redundant layout or rendering of text.
    - Content-hash keyed to prevent memory leaks.

---

## Engine-Level

31. **Precomputed World Transforms**
    - Avoid recalculating transforms per draw call.
    - Essential for random-access rendering.

32. **Flat Table Architecture**
    - All node data (transforms, bounds, styles) stored in flat maps.
    - Enables fast diffing, syncing, and concurrent access.

33. **Scene Planner & Scheduler**
    - Builds the render pass list per frame.
    - Reacts to scene changes, memory pressure, frame budget.
    - Drives decisions to re-record, cache, evict, or degrade fidelity.

---

## Future: Worker-Thread Rasterization

34. **Multithreaded Rasterization**

    Move SkPicture recording and/or render surface rasterization to worker
    threads. This is the single largest performance gap vs. Chromium:
    - Chromium: 32 concurrent raster threads
    - Grida: 1 thread (main)

    2000 shadows at 220 µs each:
    - 1 thread: 440 ms (2 fps)
    - 32 threads: 14 ms (71 fps)

    Prerequisite: the render surface / effect tree architecture (item 6)
    which defines independent units of work that can be parallelized.

35. **BVH or Quadtree Spatial Index**
    - Build dynamic index from `world_bounds` for fast spatial queries.
    - Currently using R-tree (rstar crate).

36. **CRDT-Ready Data Stores**
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
