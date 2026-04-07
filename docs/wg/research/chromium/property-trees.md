---
title: "Chromium Property Trees"
format: md
tags:
  - internal
  - research
  - chromium
  - compositing
  - rendering
---

# Chromium Property Trees

The compositor stores layer properties (transform, effect, clip, scroll) in
four separate trees rather than on individual layers. Each layer references
nodes in these trees by integer index. This separation enables efficient
property inheritance, change tracking, and cache invalidation.

For how these trees drive render surface creation, see
[render-surfaces.md](./render-surfaces.md). For how changes propagate through
the damage system, see [damage-tracking.md](./damage-tracking.md).

---

## The Four Trees

| Tree            | Node Type       | What It Stores                                              |
| --------------- | --------------- | ----------------------------------------------------------- |
| `TransformTree` | `TransformNode` | Local transform, origin, scroll offset, to-screen cache     |
| `EffectTree`    | `EffectNode`    | Opacity, blend mode, filters, render surface reason         |
| `ClipTree`      | `ClipNode`      | Clip rects, clip expansion for pixel-moving filters         |
| `ScrollTree`    | `ScrollNode`    | Container bounds, content bounds, scroll offsets, snap data |

All four trees are held in a single `PropertyTrees` container.

Source: `cc/trees/property_tree.h`, `cc/trees/transform_node.h`,
`cc/trees/effect_node.h`, `cc/trees/clip_node.h`, `cc/trees/scroll_node.h`

---

## Generic Tree Structure

All four trees share a common `PropertyTree<T>` base. Nodes are stored in a
flat `std::vector<T>`. Node IDs are integer indices into this vector. The
tree parent relationship is encoded by each node's `parent_id` field.

```
PropertyTree<T>:
  nodes_: std::vector<T>          // flat arena, O(1) access by index
  needs_update_: bool
  element_id_to_node_index_: flat_map<ElementId, int>
```

An `element_id_to_node_index_` map allows direct lookup from a compositor
`ElementId` to the node index without going through layers.

Key node ID constants:

| Constant                       | Value | Meaning                       |
| ------------------------------ | ----- | ----------------------------- |
| `kInvalidPropertyNodeId`       | -1    | No node                       |
| `kRootPropertyNodeId`          | 0     | Root of every property tree   |
| `kSecondaryRootPropertyNodeId` | 1     | Contents root / viewport root |

Source: `cc/trees/property_tree.h` (lines 65-158),
`cc/trees/property_ids.h` (lines 11-17)

---

## TransformNode

Each node stores the local transform and metadata needed to compute the
screen-space transform.

### Fields

| Field                                           | Type             | Purpose                                                     |
| ----------------------------------------------- | ---------------- | ----------------------------------------------------------- |
| `id`                                            | `int`            | Index in the transform tree vector                          |
| `parent_id`                                     | `int`            | Parent node index                                           |
| `local`                                         | `gfx::Transform` | Local transform matrix                                      |
| `origin`                                        | `gfx::Point3F`   | Transform origin                                            |
| `post_translation`                              | `gfx::Vector2dF` | Post-transform translation                                  |
| `to_parent`                                     | `gfx::Transform` | Combined local-to-parent (computed)                         |
| `scroll_offset`                                 | `gfx::PointF`    | Scroll offset applied to this transform                     |
| `snap_amount`                                   | `gfx::Vector2dF` | Pixel-snapping correction amount                            |
| `sorting_context_id`                            | `int`            | 3D rendering context (0 = none)                             |
| `maximum_animation_scale`                       | `float`          | Max scale during current animation                          |
| `needs_local_transform_update`                  | `bool`           | Dirty flag for `to_parent` recomputation                    |
| `node_and_ancestors_are_animated_or_invertible` | `bool`           | Cached ancestor check                                       |
| `has_potential_animation`                       | `bool`           | Whether a transform animation may run                       |
| `is_currently_animating`                        | `bool`           | Whether a transform animation is currently running          |
| `to_screen_is_potentially_animated`             | `bool`           | Whether this node or any ancestor has a potential animation |
| `flattens_inherited_transform`                  | `bool`           | Whether to flatten the inherited 3D transform               |
| `node_and_ancestors_are_flat`                   | `bool`           | Whether all ancestors and this node are flat                |
| `scrolls`                                       | `bool`           | Whether this node scrolls                                   |
| `should_be_snapped`                             | `bool`           | Whether to snap to pixel grid                               |
| `will_change_transform`                         | `bool`           | Whether `will-change: transform` is set                     |
| `node_or_ancestors_will_change_transform`       | `bool`           | Propagated will-change flag                                 |

### `to_parent` Computation

The comment in the source gives the exact formula:

```
to_parent = T_post_translation * T_origin * T_scroll * M_local * -T_origin
```

### Cached Screen-Space Transforms

The `TransformTree` maintains a parallel vector of `TransformCachedNodeData`:

```
TransformCachedNodeData:
  from_screen: gfx::Transform
  to_screen: gfx::Transform
  is_showing_backface: bool
```

These are computed by `TransformTree::UpdateAllTransforms()` and accessed
via `ToScreen(node_id)` and `FromScreen(node_id)`.

### Change Tracking

`TransformNode` has a private `transform_changed_` flag and a
`DamageReasonSet damage_reasons_` field. When `SetTransformChanged()` is
called, it records both the flag and the reason (e.g.,
`DamageReason::kCompositorScroll`). The damage tracker reads these to
determine which layers need redrawing.

Source: `cc/trees/transform_node.h` (lines 26-183)

---

## EffectNode

Each node stores visual effect properties and determines whether a render
surface is needed.

### `RenderSurfaceReason` Enum

```
kNone, kRoot, k3dTransformFlattening, kBackdropScope, kBlendMode,
kBlendModeDstIn, kOpacity, kOpacityAnimation, kFilter,
kFilterAnimation, kBackdropFilter, kBackdropFilterAnimation,
kRoundedCorner, kClipPath, kClipAxisAlignment, kMask,
kTrilinearFiltering, kCache, kCopyRequest, kMirrored,
kSubtreeIsBeingCaptured, kViewTransitionParticipant, kGradientMask,
k2DScaleTransformWithCompositedDescendants, kTest
```

24 reasons in total (excluding `kTest`).

### Key Fields

| Field                                    | Type                  | Purpose                                            |
| ---------------------------------------- | --------------------- | -------------------------------------------------- |
| `id`                                     | `int`                 | Index in the effect tree vector                    |
| `parent_id`                              | `int`                 | Parent node index                                  |
| `opacity`                                | `float`               | Local opacity (0.0-1.0)                            |
| `screen_space_opacity`                   | `float`               | Computed total opacity to screen                   |
| `filters`                                | `FilterOperations`    | Foreground filters (blur, shadow, etc.)            |
| `backdrop_filters`                       | `FilterOperations`    | Backdrop filters                                   |
| `backdrop_filter_quality`                | `float`               | Quality factor for backdrop filter (default 1.0)   |
| `blend_mode`                             | `SkBlendMode`         | Blend mode (default `kSrcOver`)                    |
| `render_surface_reason`                  | `RenderSurfaceReason` | Why a render surface exists (or `kNone`)           |
| `transform_id`                           | `int`                 | Associated transform node                          |
| `clip_id`                                | `int`                 | Associated clip node                               |
| `target_id`                              | `int`                 | Ancestor effect node with render surface           |
| `cache_render_surface`                   | `bool`                | Whether the render surface should be cached        |
| `effect_changed`                         | `bool`                | Dirty flag for damage tracking                     |
| `is_fast_rounded_corner`                 | `bool`                | Whether to use the fast rounded-corner path        |
| `is_drawn`                               | `bool`                | Whether this subtree is drawn                      |
| `subtree_hidden`                         | `bool`                | Whether this subtree is hidden                     |
| `has_potential_opacity_animation`        | `bool`                | Whether an opacity animation may run               |
| `has_potential_filter_animation`         | `bool`                | Whether a filter animation may run                 |
| `lcd_text_disallowed_by_filter`          | `bool`                | Whether ancestor filters disable LCD text          |
| `lcd_text_disallowed_by_backdrop_filter` | `bool`                | Whether ancestor backdrop filters disable LCD text |

### Computed Properties

The `EffectTree` computes several derived properties during
`UpdateEffects()`:

- `screen_space_opacity` — accumulated from root
- `is_drawn` — whether the node (and ancestors) will be drawn
- `has_masking_child` — whether any child has `kDstIn` blend mode
- `node_or_ancestor_has_fast_rounded_corner` — propagated flag

Source: `cc/trees/effect_node.h` (lines 32-236),
`cc/trees/property_tree.h` (lines 414-518)

---

## ClipNode

### Fields

| Field                                     | Type                            | Purpose                                           |
| ----------------------------------------- | ------------------------------- | ------------------------------------------------- |
| `id`                                      | `int`                           | Index in the clip tree vector                     |
| `parent_id`                               | `int`                           | Parent node index                                 |
| `clip`                                    | `gfx::RectF`                    | Clip rect in the space of `transform_id`          |
| `transform_id`                            | `int`                           | Transform node defining this clip's local space   |
| `pixel_moving_filter_id`                  | `int`                           | Effect node with pixel-moving filter (or invalid) |
| `cached_clip_rects`                       | `InlinedVector<ClipRectData,3>` | Per-target cached accumulated clips               |
| `cached_accumulated_rect_in_screen_space` | `gfx::RectF`                    | Accumulated clip to root in screen space          |

When `pixel_moving_filter_id` is valid, the clip node does not apply its
`clip` rect directly. Instead, it expands the accumulated clip to include
any pixels that can affect the rendering result through the pixel-moving
filter. This handles the case where blur or drop-shadow causes content to
extend beyond the normal clip bounds.

The `cached_clip_rects` field uses an inline vector of 3 entries (on the
stack). Since most pages have only one or a few render targets, this avoids
heap allocation for the common case.

Source: `cc/trees/clip_node.h` (lines 23-82)

---

## ScrollNode

### Fields

| Field                         | Type                          | Purpose                                           |
| ----------------------------- | ----------------------------- | ------------------------------------------------- |
| `id`                          | `int`                         | Index in the scroll tree vector                   |
| `parent_id`                   | `int`                         | Parent node index                                 |
| `container_bounds`            | `gfx::Size`                   | Visible scroll area (excluding non-overlay bars)  |
| `bounds`                      | `gfx::Size`                   | Total content size                                |
| `element_id`                  | `ElementId`                   | Element associated with this scroll container     |
| `transform_id`                | `int`                         | Transform node containing the scroll offset       |
| `container_origin`            | `gfx::Point`                  | Origin of container in parent transform space     |
| `main_thread_repaint_reasons` | `uint32_t`                    | Bitmask of reasons scroll requires main thread    |
| `overscroll_behavior`         | `OverscrollBehavior`          | `kNone`, `kAuto`, or `kContain`                   |
| `snap_container_data`         | `optional<SnapContainerData>` | CSS scroll snap configuration                     |
| `user_scrollable_horizontal`  | `bool`                        | Whether user can scroll horizontally              |
| `user_scrollable_vertical`    | `bool`                        | Whether user can scroll vertically                |
| `scrolls_inner_viewport`      | `bool`                        | Whether this is the inner viewport scroller       |
| `scrolls_outer_viewport`      | `bool`                        | Whether this is the outer viewport scroller       |
| `is_composited`               | `bool`                        | Whether scrolling is composited (not main-thread) |

### Main-Thread Scrolling Reasons

The `main_thread_repaint_reasons` bitmask includes:

- `kHasBackgroundAttachmentFixedObjects` — `background-attachment: fixed`
- `kNotOpaqueForTextAndLCDText` — non-opaque background prevents LCD text
- `kPreferNonCompositedScrolling` — heuristic prefers main-thread scroll
- `kBackgroundNeedsRepaintOnScroll` — background must repaint on scroll

When any bit is set, scrolling falls back to the main thread for that
scroll container.

### ScrollTree State Management

The `ScrollTree` maintains per-element scroll offsets in a
`SyncedScrollOffsetMap` (for impl thread, tracking both main-thread and
impl-thread states) or a simple `ScrollOffsetMap` (for main thread). The
synced variant enables compositor-driven scrolling while keeping the main
thread informed of offset changes during commits.

Source: `cc/trees/scroll_node.h` (lines 28-76),
`cc/trees/property_tree.h` (lines 538-716),
`cc/input/main_thread_scrolling_reason.h`

---

## PropertyTrees Container

The `PropertyTrees` class holds all four trees and global state:

### State Flags

| Flag                | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `needs_rebuild`     | Tree structure changed (nodes added/removed)   |
| `changed`           | Any property changed since last tracking reset |
| `full_tree_damaged` | Everything must be re-rendered                 |
| `is_main_thread`    | Whether this is the main-thread copy           |
| `is_active`         | Whether this is on the active tree             |
| `sequence_number`   | Incremented on each commit for versioning      |

### Viewport Deltas

The container stores viewport-related deltas that affect layout:

- `inner_viewport_container_bounds_delta` — bounds change from browser
  controls showing/hiding
- `outer_viewport_container_bounds_delta` — outer viewport bounds change
- `transform_delta_by_safe_area_inset_bottom` — safe area adjustment

These deltas are applied to specific transform nodes during property
computation.

### Cached Data

The `PropertyTreesCachedData` struct stores:

- `animation_scales` — per-transform-node max animation scale
- `draw_transforms` — per-(transform, effect) pair draw transforms, lazily
  computed and cached with update numbers for invalidation

Source: `cc/trees/property_tree.h` (lines 720-964)

---

## Property Computation Pipeline

`CalculateDrawProperties()` runs the following steps in order:

1. **`UpdatePageScaleFactor`** — applies page scale to the designated
   transform node
2. **`UpdateElasticOverscroll`** — applies overscroll to the elasticity
   transform node
3. **`SetViewportClip`** — sets the clip tree root to the device viewport
4. **`SetRootScaleAndTransform`** — sets device scale and root transform
5. **`ComputeTransforms`** — calls `TransformTree::UpdateAllTransforms()`,
   which walks top-down computing `to_parent`, `to_screen`, and
   `from_screen` for every node
6. **`ComputeEffects`** — computes `screen_space_opacity`, `is_drawn`,
   backface visibility, filter flags for every effect node
7. **`UpdateRenderTarget`** — sets `target_id` on every effect node
   (pointing to the nearest ancestor with a render surface)
8. **`ComputeRenderSurfaceReason`** — determines which effect nodes need
   render surfaces
9. **`ComputeInitialRenderSurfaceList`** — builds the render surface list
   in dependency order
10. **`ComputeSurfaceContentRects`** — computes content rects for each
    render surface from its children
11. **`ComputeListOfNonEmptySurfaces`** — removes empty render surfaces
12. **`ComputeClips`** — computes accumulated clips for visible layers

Source: `cc/trees/draw_property_utils.h` (lines 33-116),
`cc/trees/draw_property_utils.cc`

---

## Source Files Referenced

- `cc/trees/property_tree.h`
- `cc/trees/property_ids.h`
- `cc/trees/transform_node.h`
- `cc/trees/effect_node.h`
- `cc/trees/clip_node.h`
- `cc/trees/scroll_node.h`
- `cc/trees/draw_property_utils.h`
- `cc/trees/draw_property_utils.cc`
- `cc/trees/damage_reason.h`
- `cc/input/main_thread_scrolling_reason.h`
- `cc/input/overscroll_behavior.h`
