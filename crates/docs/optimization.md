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

8. **Dirty-Region Culling**

   - Use camera’s `visible_rect` to cull `world_bounds`.
   - Optional: accelerate with quadtree or BVH.

9. **Minimize Canvas State Changes**

   - Reuse transforms and paints.
   - Precompute common values like DPI × Zoom × ViewMatrix.

10. **Text & Path Caching**

    - Cache laid-out paragraphs and SkPaths.
    - Avoid layout recomputation every frame.

11. **Render Pass Flattening**

    - Group nodes with same blend/composite states.
    - Sort draw calls for fewer GPU flushes.

---

## Image Optimization

12. **LoD / Mipmapped Image Swapping**

    - Use lower-res versions of images at low zoom.
    - Prevents high GPU bandwidth use at low visibility.

13. **ImageRepository with Transform-Aware Access**

    - Pick image resolution based on projected screen size.

---

## Text & Glyph Optimization

14. **Glyph Cache (Atlas or Paragraph Caching)**

    - Cache rasterized or vector glyphs used across the document.
    - Prevents redundant layout or rendering of text.
    - Essential for high-DPI or frequently zoomed views.

---

## Engine-Level

15. **Precomputed World Transforms**

    - Avoid recalculating transforms per draw call.
    - Essential for random-access rendering.

16. **Flat Table Architecture**

    - All node data (transforms, bounds, styles) stored in flat maps.
    - Enables fast diffing, syncing, and concurrent access.

17. **Callback-Based Traversal with Fn/FnMut**

    - Owner controls child behavior via inlined, zero-cost closures.

---

## Optional Advanced

18. **Multithreaded Scene Update**

    - Parallelize transform/bounds resolution.

19. **CRDT-Ready Data Stores**

    - Flat table model enables future collaboration support.

20. **BVH or Quadtree Spatial Index**

    - Build dynamic index from `world_bounds` for fast spatial queries.

---

This list is designed to help evolve a renderer from minimal single-threaded mode to scalable, GPU-friendly real-time performance.

> Geometry is data. The renderer is a database. Speed is structure.
