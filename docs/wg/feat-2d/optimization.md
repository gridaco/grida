---
title: Rendering Optimization Strategies
---

# Rendering Optimization Strategies

A summary of all discussed optimization techniques for achieving high-performance rendering (e.g., 144fps with large design documents).

---

## Transform & Geometry

1. **Transform Cache**

   - Store `local_transform` and derived `world_transform`.
   - Use dirty flags and top-down updates.

2. **Geometry Cache**

   - Cache `local_bounds`, `world_bounds`.
   - Used for culling, layout, and hit-testing.

3. **Flat Scene Graph + Parent Pointers**

   - Flat arena with parent/children relationships.
   - Enables O(1) access and traversal.

---

## Rendering Pipeline

4. **GPU Acceleration (Skia Backend::GL/Vulkan)**

   - Use hardware compositing, filters, transforms.

5. **Scene-Level Picture Caching**

   - Use `SkPicture` to record full-scene vector draw ops.
   - Serves as the always-up-to-date canonical snapshot.
   - Resolution-independent; ideal for rerendering or tile regeneration.

6. **Tile-Based Raster Cache (Hybrid Rendering)**

   - Render the full viewport, take snapshot. debounced (after no more changes. e.g. 150ms)
   - Divide the snapshot into fixed-size tiles (e.g., 512×512).
   - When new area discovered, render the cached, non-overlapping parts with tile cache. only render newly discovered area.
   - Repeat step 1.
   - Optional padding per tile to account for effects (blur, shadows).

7. **Dynamic Mode Switching (Picture vs Tile)**

   - Render from `SkPicture` directly during normal zoom or active edits.
   - Fallback to raster tiles for zoomed-out or complex views.
   - Tile invalidation/redraw is driven by zoom level, camera transform, or frame budget.

8. **Dirty & Re-Cache Strategy**

   - Nodes marked dirty will trigger re-recording of affected picture regions or tiles.
   - Use change tracking to only re-record minimum needed areas.
   - Recording large subtrees is expensive—optimize granularity based on tree structure.

9. **Scene Cache Config / Strategy**

   - Defines how scene caching is organized.
   - Properties include:

     - `depth`:

       - `0` → Entire scene is one cache.
       - `1` → Cache per top-level container.
       - `n` → Cache at depth `n`, chunking deeper layers.

     - `mode`: `AlwaysPicture`, `Hybrid`, `AlwaysTile`

     - `tile_size`, `tile_padding`

     - `zoom_threshold_for_tiles`

     - `frame_budget_threshold_ms`

     - `use_bbh`, `enable_lod`, etc.

   - Cache accessors like `get_picture_cache_by_id()` support scoped re-rendering.

10. **Will-Change Optimization**

    - Nodes marked with "will-change" are expected to become dirty soon.
    - Examples:

      - Image node waiting on async src resolution
      - Text node waiting on font availability

    - Tree holders of such nodes are chunked for localized re-recording.
    - Prevents re-recording full subtrees—minimizes recording cost.

11. **Flattened Render Command List**

    - Scene is compiled into a flat list of `RenderCommand` structs with resolved:

      - Transform
      - Clip bounds
      - Opacity
      - Z-order

    - Enables non-recursive rendering and independent layer recording.
    - Required for tiling at arbitrary depths and for caching subtrees.

    **Example:**

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

    - Each command can be grouped and recorded separately into its own `SkPicture`.
    - Nesting is preserved logically via sort order, but rendering is flat.
    - This model is essential for dynamic caching, parallel planning, and GPU-aware scheduling.

12. **Dirty-Region Culling**

    - Use camera’s `visible_rect` to cull `world_bounds`.
    - Optional: accelerate with quadtree or BVH.

13. **Minimize Canvas State Changes**

- Reuse transforms and paints.
- Precompute common values like DPI × Zoom × ViewMatrix.

14. **Tight Bounds for `save_layer` Operations**

- Always provide explicit bounds to `save_layer` calls instead of using unbounded layers.
- Unbounded `save_layer` creates full-canvas offscreen buffers, which can be 100× or more larger than necessary.
- Compute tight bounds that include all visual content:
  - Base shape bounds (in local coordinates)
  - Effect expansions (drop shadows: offset + spread + 3× blur radius)
  - Transform to world coordinates before passing to `save_layer`
- **Critical for blend mode isolation**: Blend modes require `save_layer` for isolation semantics. Using tight bounds reduces offscreen buffer size dramatically.
- **Coordinate space consistency**: Ensure bounds are in the correct coordinate space (world space) when `save_layer` is called, accounting for transforms applied before the layer.
- **Future optimization**: Consider pre-computing blend mode isolation bounds in the geometry stage alongside render bounds for unified geometry computation.

15. **Text & Path Caching**

- Cache laid-out paragraphs and SVG paths keyed by node ID.
- Each entry stores a hash of the text/style or path string and the current
  font repository generation.
- Caches are invalidated when fonts or the original data change.
- Hit testing reuses these paths for `path.contains` checks.

16. **Render Pass Flattening**

- Group nodes with same blend/composite states.
- Sort draw calls for fewer GPU flushes.

---

## Zoom & Interaction Optimization

Scaling-specific optimization tricks for real-world authoring UX (zoom/pinch).

17. **Adaptive Interactive Resolution (LOD While Zooming)**

- Maintain `interactive_scale` s ∈ (0, 1]
- Effective render resolution: `effective_dpr = device_dpr * s`
- Drive `s` by zoom velocity, not zoom level:
  - High `|d(zoom)/dt|` → lower `s` (faster)
  - Near-zero velocity → ramp `s` → 1 (sharpen)

**Practical heuristics:**

- **Hysteresis**: Enter low-res when `v > V_hi`, exit when `v < V_lo`
- **Settle timer**: After last zoom input, wait 80–150ms, then refine
- **Smoothing**: EMA on velocity to avoid flicker:
  - `v_smooth = lerp(v_smooth, v_raw, α)` (α≈0.2–0.4)

**Suggested scale mapping (simple, stable):**

- `s = clamp(1 / (1 + k * v_smooth), s_min, 1)`
- Typical: `s_min=0.25–0.5`, `k` tuned to device

18. **Two-Phase Rendering: "Fast Preview" Then "Refine"**

    **During active zoom:**

- Render coarse:
  - Reuse cached tiles even if they're "wrong density" and just scale them
  - Prefer nearest/linear sampling for speed
  - Skip expensive effects (see below)

**After settle:**

- Render final:
  - Regenerate tiles at full `effective_dpr` for the current zoom
  - Do it progressively (center first)

19. **Progressive Refinement Ordering (Perceptual Priority)**

When restoring full quality, update tiles in this order:

1.  Tiles near focal point (pinch center / cursor)
2.  Tiles in the visible viewport
3.  Tiles in a margin ring (prefetch)

**Implementation detail:**

- Compute `priority = distance(tile_center, focal_point)`
- Process in a min-heap / bucketed rings

20. **Crossfade to Hide "Pop"**

To avoid harsh swaps from blurry→sharp:

- Keep old tile texture around for ~80–120ms
- Blend old → new with a short fade (or swap on vsync boundaries)

This is especially important for text and thin strokes.

21. **Effect LOD: Degrade Expensive Passes Only While Scaling**

While zooming, selectively replace/skip heavy operations:

- Drop `saveLayer` + `ImageFilter` chains (blur, shadows, backdrop) → cheap placeholder
- Reduce blur sigma / shadow blur radius proportionally to `s`
- Replace complex paths with simplified geometry (optional)
- Clamp very thin strokes to a minimum pixel width to prevent shimmer

After settle: restore exact effects.

**Key point**: This is UX-acceptable because users perceive motion first, fidelity second.

22. **Stable Tile Identity: Cache in World-Space, Not Zoom-Space**

Avoid "cache per zoom level" keys. Prefer:

- Tile key based on world coordinates at a reference density
- During zoom:
  - Sample existing tiles (scaled)
  - Only re-render when zoom exceeds your density budget

If GPU supports it, use mipmaps for zoom-out so tiles remain usable.

23. **Snap Bounds to Reduce Thrash**

If zoom changes continuously, tiny float differences can cause re-raster storms.

- Snap tile bounds / layer bounds to integer pixels in device space
- Quantize `effective_dpr` to a small set (e.g. `{0.5, 0.67, 0.75, 1.0}`)

This greatly increases cache hit rate during pinch.

24. **Temporal Throttling: Don't Re-Render on Every Wheel Tick**

During active zoom:

- Rate-limit expensive re-raster to e.g. 30–60 Hz
- Still update transform (scale) every frame for responsiveness
- "Refine" pass runs only after settle

This keeps input feel crisp even on heavy documents.

25. **Text-First Refinement (Optional but Huge for Authoring Tools)**

People notice text blur more than shape blur.

After settle (or even during slow zoom), prioritize:

- Glyph atlas/text tiles
- Selection/caret overlays at full resolution

Even if the scene is still refining, the editor feels "sharp".

26. **Interaction Overlays Rendered at Full-Res**

Always render UI overlays separately at native resolution:

- Selection bounds, handles, guides, cursor, rulers
- Snapping hints, hover highlights

Even if content is temporarily low-res, the tool still feels precise.

---

## Image Optimization

27. **LoD / Mipmapped Image Swapping**

- Use lower-res versions of images at low zoom.
- Prevents high GPU bandwidth use at low visibility.

28. **ImageRepository with Transform-Aware Access**

- Pick image resolution based on projected screen size.
- _TODO_: currently we select mipmap levels solely by the size of the
  drawing rectangle. This is a temporary strategy until a proper cache
  invalidation mechanism based on zoom is introduced.

---

## Text & Glyph Optimization

29. **Glyph Cache (Atlas or Paragraph Caching)**

    - Cache rasterized or vector glyphs used across the document.
    - Prevents redundant layout or rendering of text.
    - Essential for high-DPI or frequently zoomed views.

---

## Engine-Level

30. **Precomputed World Transforms**

- Avoid recalculating transforms per draw call.
- Essential for random-access rendering.

31. **Flat Table Architecture**

- All node data (transforms, bounds, styles) stored in flat maps.
- Enables fast diffing, syncing, and concurrent access.

32. **Callback-Based Traversal with Fn/FnMut**

- Owner controls child behavior via inlined, zero-cost closures.

33. **Scene Planner & Scheduler**

- A dynamic system that builds the flat render list per frame.
- Reacts to scene changes, memory pressure, or frame budget changes.
- Drives the decision to re-record, cache, evict, or downgrade fidelity.

---

## Optional Advanced

34. **Multithreaded Scene Update**

- Parallelize transform/bounds resolution.

35. **CRDT-Ready Data Stores**

- Flat table model enables future collaboration support.

36. **BVH or Quadtree Spatial Index**

- Build dynamic index from `world_bounds` for fast spatial queries.

---

## With Compromises

> Practical, UX-safe tradeoffs that simplify implementation and improve performance, especially under load. These techniques sacrifice exactness for speed — but in ways users won’t notice.

---

- **Quantize Camera Transform**

  Instead of using fully continuous float precision for the camera position and zoom, round them to the nearest N units (e.g., 0.1 for position, 0.01 for zoom):

---

This list is designed to help evolve a renderer from minimal single-threaded mode to scalable, GPU-friendly real-time performance.
