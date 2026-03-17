---
title: "Chromium Damage Tracking"
format: md
---

# Chromium Damage Tracking

The damage tracking system computes the region of each render surface that
has changed since the last frame. This region is used to scissor what is
drawn to the screen, saving GPU computation and bandwidth.

For render surface fundamentals see [render-surfaces.md](./render-surfaces.md).
For property change detection see [property-trees.md](./property-trees.md).

---

## Summary

Damage is computed per render surface, bottom-up (leaves to root). Each
surface's `DamageTracker` accumulates changes from:

1. Layers whose properties or content changed
2. Child render surfaces with damage
3. Layers or surfaces that existed last frame but no longer exist (exposed
   regions)
4. Filter expansion (blur, drop-shadow extend damage beyond original bounds)

After the frame is drawn, all damage state is reset.

Source: `cc/trees/damage_tracker.h`, `cc/trees/damage_tracker.cc`

---

## DamageReason Enum

Chromium tracks specific reasons for damage to enable per-reason frame
interval optimization:

| Reason                       | Purpose                            |
| ---------------------------- | ---------------------------------- |
| `kUntracked`                 | Default / catch-all                |
| `kAnimatedImage`             | Animated image (GIF, APNG)         |
| `kScrollbarFadeOutAnimation` | Scrollbar fade (throttled to 20Hz) |
| `kVideoLayer`                | Video playback                     |
| `kCompositorScroll`          | Compositor-driven scroll           |

When all damage reasons are consumed (accounted for in frame interval
decisions), the `CompositorFrameMetadata` can signal that only content
frame interval updates are needed, enabling the display compositor to
optimize.

Source: `cc/trees/damage_reason.h` (lines 12-27)

---

## The DamageAccumulator

The `DamageAccumulator` is the core data structure — a bounding rect with
overflow protection and reason tracking:

- `Union(rect, reasons)` — expands the bounding rect and adds reasons
- `GetAsRect(rect*)` — returns false if integer overflow was detected
  (damage becomes invalid, treated as full-surface damage)
- `IsEmpty()` — true if no damage accumulated
- Stores `x_`, `y_`, `right_`, `bottom_` as `int` (not `gfx::Rect`) for
  precise overflow checking

When `GetAsRect()` detects overflow (e.g., astronomically large damage
rects from degenerate transforms), it marks the accumulator invalid. The
caller treats invalid damage as "everything is damaged."

Source: `cc/trees/damage_tracker.h` (lines 66-116)

---

## The Master Algorithm

`DamageTracker::UpdateDamageTracking()` is the static entry point, called
once per frame by `LayerTreeHostImpl::CalculateRenderPasses()`.

### Walk Order

Layers are visited in **draw order** (front-to-back within the layer tree).
As layers are visited, their damage is accumulated into their target
surface's `DamageTracker`. When all of a surface's contributors have been
visited, the surface's own damage is finalized and propagated to its parent
surface.

The algorithm uses `EffectTree::LowestCommonAncestorWithRenderSurface()` to
detect when the walk crosses surface boundaries. Surfaces are finalized in
**dependency order** (children before parents), ensuring that child surface
damage is available when computing parent surface damage.

### Initialization

Before the walk, each render surface's damage tracker calls
`PrepareForUpdate()`, which:

- Increments a `mailbox_id_` generation counter (for stale entry detection)
- Resets per-update damage accumulators
- Clears contributing surface list

Source: `cc/trees/damage_tracker.cc` (lines 33-164, 312-320)

---

## Per-Layer Damage (`AccumulateDamageFromLayer`)

There are two ways a layer can damage its target surface:

### Case 1: Property Change

When `layer->LayerPropertyChanged()` is true (transform changed, effect
changed, or full tree damaged):

- The layer's **new** visible rect in target space is added to damage
- The layer's **old** visible rect in target space is added to damage
  (the old position is now exposed)

Both rects are needed because a layer might have moved — the old position
must be repainted (it now shows different content) and the new position must
be painted with the layer's content.

### Case 2: Content Update

When the layer's content changed (`update_rect` or `GetDamageRect()` is
non-empty) but its properties didn't change:

- The damage rect is intersected with the layer bounds
- Transformed into target surface space
- Added to the surface's damage

This is the common case for paint-only changes (e.g., text editing, image
loading).

### What Constitutes a "Property Change"

`LayerImpl::LayerPropertyChanged()` returns true when any of:

- `layer_property_changed_not_from_property_trees_` — direct layer change
- `layer_property_changed_from_property_trees_` — layer change from trees
- `PropertyTrees::full_tree_damaged()` — nuclear option
- `TransformNode::transform_changed()` — on the layer's transform node
- `EffectNode::effect_changed` — on the layer's effect node

Source: `cc/trees/damage_tracker.cc` (lines 386-489),
`cc/layers/layer_impl.cc` (lines 479-529)

---

## Per-Surface Damage (`AccumulateDamageFromRenderSurface`)

Child render surfaces damage their parent surface similarly to layers:

### Property Change

When the child surface's properties changed (position, size, opacity, etc.):

- Both the old and new surface rects in the parent's space are added

### Content Damage

When the child surface has internal damage but its properties didn't change:

- The child's damage rect is transformed into the parent's space
- Intersected with the child's drawable bounds
- Added to the parent's damage

### Backdrop Filter Damage Expansion

When a child render surface has **pixel-moving backdrop filters** (e.g.,
`backdrop-filter: blur()`) and its rect intersects the current accumulated
damage:

- The **entire child surface rect** is added to damage

This is because a backdrop blur reads neighboring pixels from content
behind the surface. Any change in the backdrop region affects the entire
blurred output. Without this expansion, the backdrop filter would show
stale content in the non-damaged portion.

### `intersects_damage_under` Flag

Each render surface with backdrop filters tracks whether it intersects
damage from content drawn before it. This flag is set during the damage
walk and is used by the renderer to determine whether the backdrop filter
result needs updating.

Source: `cc/trees/damage_tracker.cc` (lines 491-572),
`cc/layers/render_surface_impl.h` (line 391)

---

## Surface Damage Finalization (`ComputeSurfaceDamage`)

After all contributors are visited, `ComputeSurfaceDamage()` finalizes the
surface's damage:

### Step 1: Leftover Rect Tracking

Entries in the rect history that were NOT updated this frame correspond to
layers or surfaces that no longer exist. Their previous-frame rects are
added as damage (the area is now exposed).

The `mailbox_id_` generation counter is used for efficient stale detection:
entries with a stale `mailbox_id_` are removed and their rects contribute
to damage. A memory shrink heuristic triggers when
`capacity > size * 4`.

### Step 2: Backdrop Filter Re-Expansion

Contributing surfaces with pixel-moving backdrop filters are checked again
against the finalized damage (including leftover rects). If the surface
intersects the expanded damage, its entire rect is added. This two-pass
approach ensures that newly exposed regions (from deleted layers) properly
trigger backdrop filter re-rendering.

### Step 3: Surface Property Change

If the surface's own properties changed (not from ancestors):

- The **entire content rect** becomes damaged
- This is the worst case — the entire subtree must be re-rendered

### Step 4: Filter Expansion

The damage rect is expanded through the surface's foreground filters:

```
damage_rect = Filters().MapRect(damage_rect, SurfaceScale())
```

For blur with sigma=10, this expands the rect by ~30px (3x sigma) in each
direction. For drop-shadow, it additionally offsets by the shadow position
and unions with the original rect.

### Step 5: Accumulation

The finalized damage is merged into `current_damage_`, which persists
across frames until `DidDrawDamagedArea()` resets it after the frame is
drawn.

Source: `cc/trees/damage_tracker.cc` (lines 186-270, 322-384)

---

## Render Pass Skipping

The most impactful optimization built on damage tracking: **non-root
render passes with no damage can be skipped entirely.** The cached GPU
texture from the previous frame is reused.

A render pass is skipped when:

1. It is marked `cache_render_pass`, OR the feature flag
   `kAllowUndamagedNonrootRenderPassToSkip` is enabled
2. `has_damage_from_contributing_content` is false
3. No pending copy requests
4. The GPU texture from the previous frame still exists

This means a layer with `backdrop-filter: blur(10px)` that hasn't changed
reuses its previous frame's texture with zero GPU work for that subtree.

Source: `components/viz/service/display/direct_renderer.cc` (lines 815-836)

---

## Root Damage and Scissoring

For the root render pass, damage is used for scissoring:

1. Start with the root render pass's damage rect
2. Union with overlay damage
3. Union with delegated ink damage
4. Expand for pixel-moving backdrop filters on child render passes
5. Expand for pixel-moving foreground filters on child render passes
6. Intersect with the device viewport

If partial swap is enabled and the root damage is empty, the root pass
draw is skipped entirely.

Source: `components/viz/service/display/direct_renderer.cc`
(lines 210-242, 930-1049)

---

## Early Damage Check

When `enable_early_damage_check` is true and a recent frame had no damage
(within the last `damaged_frame_limit = 3` frames), the compositor
performs an early damage check before doing full frame preparation:

1. Update draw properties
2. Run `DamageTracker::UpdateDamageTracking()`
3. Check `HasDamage()`
4. If no damage, skip the frame entirely without building render passes

This avoids the cost of `CalculateRenderPasses()` for idle frames.

Source: `cc/trees/layer_tree_host_impl.cc` (lines 3544-3563),
`cc/trees/layer_tree_settings.h` (lines 54-57)

---

## Damage Reset After Draw

After a frame is drawn, `DidDrawAllLayers()` calls:

1. `DidDrawDamagedArea()` on every render surface's damage tracker,
   resetting `current_damage_`
2. `ResetAllChangeTracking()` on the property trees, clearing all
   `transform_changed`, `effect_changed`, `surface_property_changed` flags
3. Clearing the `viewport_damage_rect_`

The next frame starts with a clean slate.

Source: `cc/trees/layer_tree_host_impl.cc` (lines 2996-3007)

---

## Source Files Referenced

- `cc/trees/damage_tracker.h`
- `cc/trees/damage_tracker.cc`
- `cc/trees/damage_reason.h`
- `cc/trees/effect_node.h`
- `cc/trees/transform_node.h`
- `cc/trees/property_tree.h`
- `cc/layers/layer_impl.cc`
- `cc/layers/render_surface_impl.cc`
- `cc/layers/render_surface_impl.h`
- `cc/trees/layer_tree_host_impl.cc`
- `cc/trees/layer_tree_settings.h`
- `components/viz/service/display/direct_renderer.cc`
