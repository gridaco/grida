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

   - Divide the scene into fixed-size tiles (e.g., 512×512).
   - Each tile stores a rasterized `SkImage` generated from the scene-level `SkPicture`.
   - Blit tiles during zoomed-out views or under frame budget pressure.
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

14. **Text & Path Caching**

    - Cache laid-out paragraphs and SkPaths.
    - Avoid layout recomputation every frame.

15. **Render Pass Flattening**

    - Group nodes with same blend/composite states.
    - Sort draw calls for fewer GPU flushes.

---

## Image Optimization

16. **LoD / Mipmapped Image Swapping**

    - Use lower-res versions of images at low zoom.
    - Prevents high GPU bandwidth use at low visibility.

17. **ImageRepository with Transform-Aware Access**

    - Pick image resolution based on projected screen size.

---

## Text & Glyph Optimization

18. **Glyph Cache (Atlas or Paragraph Caching)**

    - Cache rasterized or vector glyphs used across the document.
    - Prevents redundant layout or rendering of text.
    - Essential for high-DPI or frequently zoomed views.

---

## Engine-Level

19. **Precomputed World Transforms**

    - Avoid recalculating transforms per draw call.
    - Essential for random-access rendering.

20. **Flat Table Architecture**

    - All node data (transforms, bounds, styles) stored in flat maps.
    - Enables fast diffing, syncing, and concurrent access.

21. **Callback-Based Traversal with Fn/FnMut**

    - Owner controls child behavior via inlined, zero-cost closures.

22. **Scene Planner & Scheduler**

    - A dynamic system that builds the flat render list per frame.
    - Reacts to scene changes, memory pressure, or frame budget changes.
    - Drives the decision to re-record, cache, evict, or downgrade fidelity.

---

## Optional Advanced

23. **Multithreaded Scene Update**

    - Parallelize transform/bounds resolution.

24. **CRDT-Ready Data Stores**

    - Flat table model enables future collaboration support.

25. **BVH or Quadtree Spatial Index**

    - Build dynamic index from `world_bounds` for fast spatial queries.

---

## With Compromises

> Practical, UX-safe tradeoffs that simplify implementation and improve performance, especially under load. These techniques sacrifice exactness for speed — but in ways users won’t notice.

---

- **Quantize Camera Transform**

  Instead of using fully continuous float precision for the camera position and zoom, round them to the nearest N units (e.g., 0.1 for position, 0.01 for zoom):

---

This list is designed to help evolve a renderer from minimal single-threaded mode to scalable, GPU-friendly real-time performance.
