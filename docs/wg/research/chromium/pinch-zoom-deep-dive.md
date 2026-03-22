---
title: "Chromium Pinch-Zoom Deep Dive"
format: md
---

# Chromium Pinch-Zoom Deep Dive

Complete mechanism for how Chromium handles pinch-to-zoom: the immediate
low-resolution response, how stale tiles are stretched via GPU texture
sampling, how the system settles to full quality after the gesture ends,
and the compositor-vs-main-thread split that makes it all feel instant.

For the raster scale stepping algorithm see
[resolution-scaling-during-interaction.md](./resolution-scaling-during-interaction.md).
For tiling fundamentals see [tiling-deep-dive.md](./tiling-deep-dive.md).

---

## Summary: Why Pinch Feels Instant

Pinch-zoom is an **entirely compositor-side** operation. The page scale
change and scroll adjustment happen on the impl thread without waiting for
the main thread. The visual result is:

1. The page scale transform node in the property tree is updated
   immediately on the active tree.
2. Existing tiles (rasterized at the old zoom level) are stretched by the
   GPU via texture sampling to fill the new viewport.
3. New tiles at the correct resolution are rasterized in the background.
4. As they complete, they progressively replace the stretched tiles.
5. After the gesture ends, old tilings are cleaned up.

The main thread is notified asynchronously via `SetNeedsCommit()` and
receives the page scale delta at the next commit. It does not participate
in the visual update.

---

## 1. The Page Scale Transform Node

### Transform Tree Hierarchy

The viewport has a specific hierarchy in the transform tree:

```
root_transform
  -> overscroll_elasticity_transform
    -> page_scale_transform         <-- holds Scale(psf, psf)
      -> inner_viewport_scroll
        -> outer_clip
          -> outer_viewport_scroll
```

The `page_scale_transform` node ID is stored in
`ViewportPropertyIds::page_scale_transform`. All layers that are
"affected by page scale" (`in_subtree_of_page_scale_layer = true`) are
descendants of this node and inherit the scaling.

### How the Scale Is Written

When `Viewport::PinchUpdate()` calls
`active_tree->SetPageScaleOnActiveTree(new_scale)`:

1. `SyncedProperty<ScaleGroup>::SetCurrent()` records the scale as a
   multiplicative delta from the main-thread base.
2. `DidUpdatePageScale()` calls `UpdatePageScaleNode()`.
3. `draw_property_utils::UpdatePageScaleFactor()` sets:

   ```
   page_scale_node->local = Scale(psf, psf)
   page_scale_node->needs_local_transform_update = true
   transform_tree.set_needs_update(true)
   ```

4. On the next `CalculateDrawProperties()`, `UpdateAllTransforms()`
   recomputes `to_screen` for every descendant node, incorporating the
   new scale.

Since the page scale is stored as a `SyncedProperty<ScaleGroup>` (a
multiplicative group: identity=1, combine=multiply, delta=divide), both
the active tree and pending tree share the same underlying object. Changes
on the active tree are immediately visible to the pending tree.

Source: `cc/trees/layer_tree_impl.cc` (lines 1288-1314, 1460-1489),
`cc/trees/draw_property_utils.cc` (lines 1743-1762),
`cc/base/synced_property.h`

---

## 2. The Anchor Point Mechanism

The pinch must keep the content point under the user's fingers fixed.
`Viewport::PinchUpdate()` achieves this:

```
Given:
  A = adjusted anchor point (screen pixels)
  S_old = page scale before this update
  S_new = S_old * magnify_delta (clamped to [min, max])

Step 1: Content-space position BEFORE scale change
  P_old = A / S_old

Step 2: Apply scale
  SetPageScaleOnActiveTree(S_new)

Step 3: Content-space position AFTER scale change (without scroll)
  P_new = A / S_new

Step 4: Required scroll delta (content space)
  delta = P_old - P_new = A * (1/S_old - 1/S_new)

Step 5: Convert to physical pixels and scroll the inner viewport
  Pan(delta * S_new)
```

On the first pinch update, if the anchor is within 100 dips of a screen
edge, it is snapped to the edge. This makes it easy to pinch-zoom into
`position: fixed` elements near screen edges.

Only the **inner viewport** (visual viewport) is scrolled during pinch.
The outer viewport (layout viewport) is not moved. This is consistent
with the visual viewport specification.

The max scroll offset for the inner viewport depends on the page scale
factor, so it is recalculated after every scale change:

```
max_scroll = (content_size * page_scale - viewport_size) / page_scale
```

Source: `cc/layers/viewport.cc` (lines 238-288),
`cc/trees/property_tree.cc` (lines 1590-1616)

---

## 3. How Tiles Are Stretched by the GPU

### The SharedQuadState Transform

When `PictureLayerImpl::AppendQuads()` runs, it computes a draw transform
for the layer's tiles:

```
max_contents_scale = highest tiling scale available
scaled_draw_transform = target_space_transform * (1 / max_contents_scale)
```

The `target_space_transform` already includes the page scale factor (from
the page scale transform node). Dividing by `max_contents_scale` accounts
for the fact that tiles are rasterized at `max_contents_scale`, not at
the raw transform scale.

**Example:** If the page scale is 3x and the best available tiling is at
2x:

- `target_space_transform` = Scale(3, 3)
- `max_contents_scale` = 2
- `scaled_draw_transform` = Scale(3/2) = Scale(1.5, 1.5)

Every tile quad is drawn with this 1.5x transform, stretching the 2x
texture to fill the 3x viewport.

Source: `cc/layers/layer_impl.cc` (lines 232-267, 550-557)

### Coverage Iterator and Texture Rect Mapping

The `TilingSetCoverageIterator` iterates tiles in the visible area. For
each tile, it produces:

- **`geometry_rect`**: where to draw (in coverage space, scaled by
  `max_contents_scale`)
- **`texture_rect`**: what texels to sample from the tile's GPU texture

The mapping is computed via `coverage_to_content_`:

```
coverage_to_content_ = tiling.raster_transform * (1 / coverage_scale)
```

When a tile from a 2x tiling covers a region that was requested at 3x
coverage:

- `geometry_rect` = 300x300 pixels (in 3x coverage space)
- `texture_rect` = 200x200 texels (in 2x tile texture)
- The GPU's bilinear sampler stretches 200x200 texels to fill 300x300
  output pixels

The `TileDrawQuad` stores both `rect` (= `geometry_rect`) and
`tex_coord_rect` (= `texture_rect`). The display compositor's
`SkiaRenderer` draws the quad with the `SharedQuadState` transform,
and the GPU performs the texture stretch via its texture sampling unit.

Source: `cc/tiles/tiling_coverage_iterator.h` (lines 42-121),
`cc/layers/picture_layer_impl.cc` (lines 435-568)

### Fallback Tile Selection

The `TilingSetCoverageIterator` visits tilings in this order:

1. Ideal tiling (smallest scale >= ideal)
2. Higher-resolution tilings (decreasing order)
3. Lower-resolution tilings (increasing order)

For each tiling, if a tile is ready to draw, it is used. If not, the
tile's `geometry_rect` is accumulated into a `missing_region_`. After
exhausting a tiling, the iterator moves to the next and attempts to cover
only the missing region. This cascades until all regions are covered or
all tilings are exhausted (producing checkerboard).

When a tile from a NON_IDEAL_RESOLUTION tiling is used, it is tracked:

```cpp
if (iter.resolution() != HIGH_RESOLUTION) {
    append_quads_data->approximated_visible_content_area += area;
}
```

And if the tile's scale is below ideal:

```cpp
if (iter->contents_scale_key() < ideal_contents_scale_key()) {
    append_quads_data->checkerboarded_needs_raster = true;
}
```

This flag keeps the rasterization pipeline running to produce ideal-scale
tiles.

Source: `cc/tiles/tiling_set_coverage_iterator.h` (lines 131-217)

---

## 4. Raster Scale Stepping During Pinch

During an active pinch, `RecalculateRasterScales()` ignores the ideal
scale and operates in discrete power-of-2 steps:

```
Zooming in:  desired_scale = old_scale * 2 * 2 * ... (until >= ideal)
Zooming out: desired_scale = old_scale / 2 / 2 / ... (until <= ideal)
```

The computed scale is snapped to an existing tiling if within 20%
(`kSnapToExistingTilingRatio = 1.2`). This avoids creating redundant
tilings.

### When a new tiling is created

`ShouldAdjustRasterScale()` returns true during pinch only when:

- The raster scale is **above** the ideal (zooming out past current scale)
- OR the ratio `ideal / raster > 2.0` (too far from ideal)

This means the raster scale can lag behind the ideal by up to 2x before
triggering a new tiling. During a gradual zoom-in, users see tiles at
half the needed resolution, stretched by the GPU.

### Multiple tilings coexist

The `PictureLayerTilingSet` maintains all created tilings simultaneously.
At any time, exactly one is `HIGH_RESOLUTION` (actively rasterized). All
others are `NON_IDEAL_RESOLUTION` (kept as fallback, no new tiles created).

From the unit test `PinchGestureTilings`:

1. Start at scale 2.0 -- 1 tiling
2. Zoom out to 1.8 -- creates tiling at 1.0 (2.0 / 2). Now 2 tilings.
3. Zoom out to 0.525 -- creates another. Now 3 tilings.
4. Zoom in to 3.8 -- creates tiling at 4.0 (2.0 \* 2). Now 4 tilings.
5. Pinch ends -- scale snaps to ideal, old tilings cleaned up.

Source: `cc/layers/picture_layer_impl.cc` (lines 1485-1619),
`cc/layers/picture_layer_impl_unittest.cc` (`PinchGestureTilings`)

---

## 5. The Complete Pinch Lifecycle

### Phase 1: Gesture Begins

`InputHandler::PinchGestureBegin()`:

1. Sets `pinch_gesture_active_ = true`
2. Latches to the outer viewport scroll node
3. Notifies browser controls manager (suppresses URL bar show/hide)
4. Calls `DidStartPinchZoom()`:
   - `RenewTreePriority()` sets `SMOOTHNESS_TAKES_PRIORITY` with a 250ms
     expiration timer
   - Starts `FrameSequenceTrackerType::kPinchZoom` for metrics

Source: `cc/input/input_handler.cc` (lines 752-785),
`cc/trees/layer_tree_host_impl.cc` (lines 307-310)

### Phase 2: Each Frame During Pinch

`InputHandler::PinchGestureUpdate(magnify_delta, anchor)`:

1. `Viewport::PinchUpdate()` applies the scale and scroll adjustment
   directly on the active tree (see sections 1-2)
2. `SetNeedsCommit()` queues an asynchronous main-thread notification
3. `SetNeedsRedraw()` triggers an immediate compositor draw
4. `RenewTreePriority()` resets the 250ms SMOOTHNESS timer

On the draw path:

5. `CalculateDrawProperties()` re-applies the page scale into the
   transform tree
6. `PictureLayerImpl::UpdateTiles()` runs:
   - `UpdateIdealScales()` computes new `ideal_contents_scale` from the
     updated page scale factor
   - `ShouldAdjustRasterScale()` checks if the scale drifted > 2x
   - If so: `RecalculateRasterScales()` creates a new tiling at the next
     power-of-2 step
7. `PictureLayerImpl::AppendQuads()` emits tile quads:
   - `TilingSetCoverageIterator` finds the best available tiles
   - Ready tiles from any tiling are used (stretched by GPU if needed)
   - Missing regions produce checkerboard

Source: `cc/input/input_handler.cc` (lines 787-799),
`cc/layers/picture_layer_impl.cc` (lines 592-667)

### Phase 3: Gesture Ends

`InputHandler::PinchGestureEnd()`:

1. Sets `pinch_gesture_active_ = false`
2. For wheel pinch: if scale is within 5% of minimum, animates back to
   minimum over 200ms (`kSnapToMinZoomAnimationDuration`)
3. `DidEndPinchZoom()` forces `needs_update_draw_properties` and requests
   a redraw
4. `SetNeedsCommit()` ensures the main thread gets the final scale

Source: `cc/input/input_handler.cc` (lines 801-816),
`cc/layers/viewport.cc` (lines 290-316)

### Phase 4: Settle and Refine

On the first frame after the gesture ends:

1. `ShouldAdjustRasterScale()` detects `raster_page_scale_ != ideal_page_scale_`
   (the raster scale was a stepped approximation, the ideal is the
   user's final zoom level)
2. `RecalculateRasterScales()` sets the raster scale to exactly the ideal:
   ```
   raster_contents_scale_ = ideal_contents_scale_
   ```
3. `UpdateTilingsForRasterScaleAndTranslation()`:
   - Marks all tilings as NON_IDEAL_RESOLUTION
   - Creates (or finds) a HIGH_RESOLUTION tiling at the exact ideal scale
   - Begins rasterizing tiles for the new tiling

As new ideal-scale tiles become `IsReadyToDraw()`:

4. The `TilingSetCoverageIterator` prefers them over stale tiles (they're
   at the ideal scale, which is the first tiling visited)
5. The old tilings stop appearing in `last_append_quads_tilings_`
6. `CleanUpTilingsOnActiveLayer()` removes old tilings outside the
   acceptable scale range `[min(raster, ideal), max(raster, ideal)]`

The SMOOTHNESS_TAKES_PRIORITY timer expires 250ms after the last gesture
update. After expiration, tree priority returns to
`SAME_PRIORITY_FOR_BOTH_TREES`, and pending tree activation proceeds
normally.

Source: `cc/layers/picture_layer_impl.cc` (lines 1352-1424, 1496-1500,
1583-1586, 1685-1711), `cc/tiles/picture_layer_tiling_set.cc`
(lines 240-266)

---

## 6. Tree Priority and Tile Scheduling During Pinch

### SMOOTHNESS_TAKES_PRIORITY Effects

When `SMOOTHNESS_TAKES_PRIORITY` is active:

| Mechanism                | Effect                                            |
| ------------------------ | ------------------------------------------------- |
| Tile rasterization order | Active tree NOW tiles before pending tree tiles   |
| Pending tree activation  | Postponed until all required tiles are ready      |
| Activation requirements  | Relaxed if only checkerboard was shown last frame |
| GPU resource readiness   | Tiles not marked ready until GPU work is complete |
| Image decode memory      | Kept locked (not released during idle)            |

### Relaxed Activation

During smoothness priority, if a layer only showed checkerboard last
frame, `can_require_tiles_for_activation` is false:

```cpp
can_require_tiles_for_activation =
    produced_tile_last_append_quads_ || RequiresHighResToDraw() ||
    !layer_tree_impl()->SmoothnessTakesPriority();
```

This means the pending tree can activate without waiting for all its
tiles — keeping the compositor responsive during the gesture. The active
tree continues showing stretched stale tiles.

### Tile Priority Ordering

Within the HIGH_RESOLUTION tiling, tiles are prioritized by:

1. `priority_bin`: NOW (visible) > SOON (skewport) > EVENTUALLY
2. `distance_to_visible`: Manhattan distance to viewport edge

The `resolution_` field (HIGH vs NON_IDEAL) is used for activation/draw
requirements but does not change the rasterization sort order.

Source: `cc/tiles/tile_manager.cc` (lines 1713-1718, 1943-1956),
`cc/layers/picture_layer_impl.cc` (lines 633-651),
`cc/tiles/picture_layer_tiling.cc` (lines 769-808)

---

## 7. Compositor-Side vs Main-Thread Split

### What the compositor does (immediate)

- Applies `page_scale_factor` to the page scale transform node
- Adjusts inner viewport scroll offset to keep anchor fixed
- Draws stretched stale tiles at the new scale
- Creates new tilings and begins background rasterization

### What the main thread does (asynchronous)

- Receives `page_scale_delta` at the next commit via `SyncedProperty`
- Applies the delta to Blink's page scale
- Runs layout/paint at the new scale
- Commits new content to the pending tree

The main thread's contribution is not needed for the visual result during
the gesture. The compositor's immediate response provides the feeling of
instant zoom, while the main thread catches up in the background.

### SyncedProperty Conflict Resolution

The `ScaleGroup` uses multiplicative deltas. If the impl thread zooms to
3x and the main thread was at 1x:

- Before commit: `active_base_ = 1.0`, `active_delta_ = 3.0`
- `PullDeltaForMainThread()` returns 3.0 to the main thread
- Main thread sets its page scale to 3.0
- On commit: `PushMainToPending(3.0)` -> `PushPendingToActive()`
- After commit: `active_base_ = 3.0`, `active_delta_ = 1.0` (current
  still = 3.0)

If the main thread independently set a page scale (e.g., via JavaScript),
the delta-based resolution ensures both changes are composed
multiplicatively without lost updates.

Source: `cc/base/synced_property.h`,
`cc/trees/layer_tree_host_impl.cc` (lines 5039-5042),
`cc/trees/layer_tree_host.cc` (lines 825-833, 1018-1081),
`cc/trees/layer_tree_impl.cc` (lines 1337-1358)

---

## 8. Browser Controls During Pinch

When `pinch_gesture_active_` is true in the `BrowserControlsOffsetManager`,
`ScrollBy` returns the full pending delta unconsumed:

```cpp
if (pinch_gesture_active_)
    return pending_delta;
```

This prevents the pinch gesture from accidentally hiding or showing the
URL bar. After `PinchGestureEnd()`, the browser controls manager re-enters
its normal scrolling state.

Source: `cc/input/browser_controls_offset_manager.cc` (lines 462-463,
561-573)

---

## 9. End-to-End Data Flow

```
User pinches on touchscreen
  |
  v
InputHandler::PinchGestureBegin(anchor, kTouchscreen)
  - pinch_gesture_active_ = true
  - Latch to outer viewport scroll node
  - SMOOTHNESS_TAKES_PRIORITY (250ms timer)
  |
  v  (each frame)
InputHandler::PinchGestureUpdate(magnify_delta, anchor)
  |
  v
Viewport::PinchUpdate(magnify_delta, anchor)
  |
  +-- SetPageScaleOnActiveTree(old_scale * delta)
  |     +-- page_scale_node->local = Scale(new_psf, new_psf)
  |     +-- transform_tree.set_needs_update(true)
  |     +-- Syncs to pending/recycle trees (shared SyncedProperty)
  |
  +-- Compute scroll adjustment to keep anchor fixed
  +-- Pan(delta) -- scroll inner viewport
  |
  v
SetNeedsCommit()     -- async main thread notification
SetNeedsRedraw()     -- immediate compositor frame
RenewTreePriority()  -- reset 250ms SMOOTHNESS timer
  |
  v  (draw path)
CalculateDrawProperties()
  +-- UpdatePageScaleFactor() -- re-applies psf to transform node
  +-- ComputeTransforms()     -- recomputes all to_screen transforms
  |
  v
PictureLayerImpl::UpdateTiles()
  +-- UpdateIdealScales()  -- ideal_contents_scale now reflects new psf
  +-- ShouldAdjustRasterScale()  -- within 2x? skip. beyond? adjust.
  +-- RecalculateRasterScales()  -- power-of-2 step, snap to existing
  +-- UpdateTilingsForRasterScaleAndTranslation()  -- new HIGH_RES tiling
  |
  v
PictureLayerImpl::AppendQuads()
  +-- SharedQuadState.transform = target_space_transform / max_tiling_scale
  |   (encodes the mismatch between tile raster scale and desired output)
  +-- TilingSetCoverageIterator visits: ideal -> higher -> lower tilings
  +-- For each tile region:
  |     if ready: emit TileDrawQuad(geometry_rect, texture_rect)
  |     if not:   add to missing_region, try next tiling
  +-- GPU stretches texture via bilinear sampling
  |
  v  (gesture ends)
InputHandler::PinchGestureEnd(anchor)
  - pinch_gesture_active_ = false
  - DidEndPinchZoom() -- forces draw property update
  |
  v  (next frame)
ShouldAdjustRasterScale() returns true (raster != ideal)
RecalculateRasterScales() sets raster = ideal exactly
New HIGH_RESOLUTION tiling created at ideal scale
Background rasterization begins
  |
  v  (progressive refinement)
As ideal-scale tiles complete:
  - TilingSetCoverageIterator picks them over stale tiles
  - Old tilings dropped from last_append_quads_tilings_
  - CleanUpTilingsOnActiveLayer() removes old tilings
  - 250ms after last gesture update: SMOOTHNESS timer expires
  - Tree priority returns to SAME_PRIORITY_FOR_BOTH_TREES
```

---

## Source Files Referenced

- `cc/input/input_handler.cc` / `.h`
- `cc/layers/viewport.cc`
- `cc/trees/layer_tree_impl.cc` / `.h`
- `cc/trees/draw_property_utils.cc`
- `cc/base/synced_property.h`
- `cc/layers/picture_layer_impl.cc` / `.h`
- `cc/layers/layer_impl.cc`
- `cc/tiles/tiling_set_coverage_iterator.h`
- `cc/tiles/tiling_coverage_iterator.h`
- `cc/tiles/picture_layer_tiling.cc`
- `cc/tiles/picture_layer_tiling_set.cc`
- `cc/tiles/tile_manager.cc`
- `cc/trees/proxy_impl.cc`
- `cc/trees/layer_tree_host.cc`
- `cc/trees/layer_tree_host_impl.cc`
- `cc/trees/property_tree.cc`
- `cc/input/browser_controls_offset_manager.cc`
- `cc/layers/picture_layer_impl_unittest.cc`
