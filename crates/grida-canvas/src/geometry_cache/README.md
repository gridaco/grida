# Geometry Cache

A high-performance runtime store for managing per-node spatial data in a scene graph.

## Purpose

The Geometry Cache exists to store and maintain computed geometric properties of nodes in a scene, independent from the user-authored structure. It enables fast rendering, culling, and future hit-testing by treating transform and bounds as first-class cached data.

## Responsibilities

- Maintain **relative (local)** and **absolute (world)** transforms.
- Cache **local** and **world-space bounding boxes**.
- Propagate **dirty flags** on transform or geometry change.
- Support optional future features like path-based hit-testing.

## Philosophy

1. **Authoring is relative. Rendering is absolute.**

   - `local_transform` is the source of truth.
   - `world_transform` is cached and derived.

2. **Flat is fast.**

   - The scene is a tree; the cache is a flat map.

3. **Dirty flags are sacred.**

   - Only update what has changed.

4. **Query is constant-time.**

   - `get_world_bounds(node_id)` is always O(1) after update.

5. **No recursion at runtime.**

   - Updates are done top-down, in pre-sorted order or with explicit parent tracking.

## Core Data Structure

```rust
struct GeometryEntry {
    local_transform: Transform2D,
    world_transform: Transform2D,
    local_bounds: Rect,
    world_bounds: Rect,
    parent: Option<NodeId>,
    dirty_transform: bool,
    dirty_bounds: bool,
    // future: path: Option<SkPath>,
}

struct GeometryCache {
    entries: HashMap<NodeId, GeometryEntry>,
}
```

## Operations

- `mark_dirty(node_id)` — recursively mark transform + bounds dirty.
- `update(node_id)` — resolve world transform + world bounds.
- `get_world_transform(node_id)` — O(1) after update.
- `get_world_bounds(node_id)` — O(1) after update.

## Why Not a BVH?

This cache stores per-node spatial data. A BVH is a secondary structure built _from_ this cache — optimized for queries like ray intersections, pointer picking, and region invalidation.

---

**GeometryCache is not just a helper — it is the spatial truth of the engine.**

It is designed to be deterministic, cache-efficient, and ready for future integration with spatial indexing, GPU transform buffers, or collaborative scene systems.
