---
title: "Chromium Resolution Scaling During Interaction"
format: md
tags:
  - internal
  - research
  - chromium
  - rendering
  - performance
---

# Chromium Resolution Scaling During Interaction

Source-level analysis of how Chromium handles rendering resolution during
pinch-zoom, scroll, and fling gestures. Answers the question: does
Chromium actually render at lower resolution during interaction, or does
it reuse stale-resolution tiles?

For high-level overview see [interaction-and-quality.md](./interaction-and-quality.md).
For tiling fundamentals see [tiling-deep-dive.md](./tiling-deep-dive.md).

---

## Summary

Chromium does **not** explicitly render at lower resolution during
interaction. There is no "low quality mode" toggle. Instead, the system
produces lower-quality frames as an emergent property of three mechanisms:

1. **Stale-tile reuse.** Tiles rasterized at an old scale are drawn by the
   GPU compositor at the new scale, stretching or shrinking them via
   texture sampling. This produces blur (zoom in) or oversharpness (zoom
   out).
2. **Discrete scale jumps.** During pinch, raster scale changes in powers
   of 2 rather than continuously tracking the ideal. The raster scale can
   lag behind the ideal by up to 2x before being adjusted.
3. **Background rasterization.** New tiles at the correct scale are
   rasterized in the background. As they complete, they progressively
   replace stale tiles — a gradual sharpening effect.

---

## 1. Ideal Scale Computation

Every frame, `PictureLayerImpl::UpdateIdealScales()` computes the scale at
which the layer would ideally be rasterized:

```text
ideal_device_scale  = device_scale_factor()
ideal_page_scale    = current_page_scale_factor()  (if affected by page scale)
ideal_contents_scale = screen-space transform scale components
ideal_source_scale  = ideal_contents_scale / ideal_page_scale
```

The `ideal_contents_scale` is extracted from the layer's **screen space
transform**. During pinch-zoom it changes continuously as the page scale
factor changes. This is the target — the scale at which tiles should be
rasterized for pixel-perfect rendering.

Source: `cc/layers/picture_layer_impl.cc` (`UpdateIdealScales`, line 1868),
`cc/layers/layer_impl.cc` (`GetIdealContentsScale`, line 958)

---

## 2. When Raster Scale Is Adjusted

`ShouldAdjustRasterScale()` is the gatekeeper. It returns true only when
the raster scale needs to change. The full decision tree:

| Condition                                       | Result                             |
| ----------------------------------------------- | ---------------------------------- |
| Raster scale is zero                            | Adjust                             |
| Raster source size changed                      | Adjust                             |
| Directly composited image default scale changed | Adjust                             |
| Animation state changed (enter/exit)            | Adjust (with exceptions)           |
| **During pinch: raster scale > ideal**          | **Adjust** (need lower-res tiling) |
| **During pinch: ideal/raster ratio > 2.0**      | **Adjust** (too far from ideal)    |
| **During pinch: within 2x of ideal**            | **Skip**                           |
| Not pinching: raster != ideal page scale        | Adjust                             |
| Device scale changed                            | Adjust                             |
| Raster scale out of min/max bounds              | Adjust                             |
| Transform animating                             | Skip (unless raster is very stale) |
| `will-change: transform` and raster >= minimum  | Skip                               |
| Source scale matches ideal source scale         | Skip                               |

The critical pinch-zoom logic:

```cpp
bool is_pinching = layer_tree_impl()->PinchGestureActive();
if (is_pinching && raster_page_scale_) {
    float ratio = ideal_page_scale_ / raster_page_scale_;
    if (raster_page_scale_ > ideal_page_scale_ ||
        ratio > kMaxScaleRatioDuringPinch)   // 2.0
      return true;
}
```

During a gradual zoom-in, the raster scale can lag behind the ideal by
up to 2x before being updated. The layer shows tiles rasterized at up to
half the needed resolution, stretched by the GPU.

Source: `cc/layers/picture_layer_impl.cc` (`ShouldAdjustRasterScale`,
line 1426)

---

## 3. How Raster Scale Is Computed During Pinch

`RecalculateRasterScales()` contains the core algorithm. During pinch it
ignores the ideal scale entirely and operates in discrete steps:

```cpp
// During pinch we completely ignore the current ideal scale, and just use
// a multiple of the previous scale.
if (is_pinching && !old_raster_contents_scale.IsZero()) {
    bool zooming_out = old_raster_page_scale > ideal_page_scale_;
    float desired_contents_scale = max(old_raster_contents_scale.x/y);

    if (zooming_out) {
        while (desired_contents_scale > ideal_scale)
            desired_contents_scale /= kMaxScaleRatioDuringPinch;  // /2
    } else {
        while (desired_contents_scale < ideal_scale)
            desired_contents_scale *= kMaxScaleRatioDuringPinch;  // *2
    }

    // Snap to existing tiling if within 1.2x ratio
    if (auto* snapped = FindTilingWithNearestScaleKey(
            desired_contents_scale, kSnapToExistingTilingRatio)) {
        raster_contents_scale_ = snapped->raster_transform().scale();
    } else {
        raster_contents_scale_ = scaled old value;
    }
}
```

### Constants

| Constant                                         | Value   | Purpose                                           |
| ------------------------------------------------ | ------- | ------------------------------------------------- |
| `kMaxScaleRatioDuringPinch`                      | 2.0     | Scale jumps during pinch are powers of 2          |
| `kSnapToExistingTilingRatio`                     | 1.2     | Snap to existing tiling if within 20%             |
| `kMaxIdealContentsScale`                         | 10000.0 | Upper cap on ideal contents scale                 |
| `kMinScaleRatioForWillChangeTransform`           | 0.25    | Minimum ratio before will-change layers re-raster |
| `kRatioToAdjustRasterScaleForTransformAnimation` | 1.5     | Threshold for animation scale correction          |

### Behavior

- **Zooming out**: preemptively creates lower-res tiling (divides by 2
  until below ideal).
- **Zooming in**: creates higher-res tiling (multiplies by 2 until above
  ideal).
- **Snapping**: if an existing tiling is within 1.2x of the computed
  scale, reuse it instead of creating a new one.

Source: `cc/layers/picture_layer_impl.cc` (`RecalculateRasterScales`,
line 1557)

---

## 4. Multiple Tilings Coexist

The `PictureLayerTilingSet` maintains multiple tilings at different scales
simultaneously. Tilings are sorted largest-to-smallest by scale key.

### Resolution Classification

At any given time, exactly **one** tiling is marked `HIGH_RESOLUTION` —
the one at the current `raster_contents_scale`. All others are
`NON_IDEAL_RESOLUTION`.

```cpp
tilings_->MarkAllTilingsNonIdeal();
high_res = AddTiling(raster_contents_scale_);
high_res->set_resolution(HIGH_RESOLUTION);
```

Only `HIGH_RESOLUTION` tilings get new tiles rasterized. Old-scale tilings
are kept as fallback but no new tiles are created for them.

### Tiling Accumulation During Pinch

From the unit test `PinchGestureTilings`:

1. Start at scale 2.0 — 1 tiling
2. Zoom out to 1.8 — creates tiling at 1.0 (2.0 / 2.0). Now 2 tilings.
3. Zoom out to 0.525 — creates another tiling. Now 3 tilings.
4. Zoom in to 3.8 — creates tiling at 4.0 (multiplied by 2). Now 4 tilings.
5. Pinch ends — scale snaps to 4.0, old tilings cleaned up over time.

### Tiling Cleanup

`CleanUpTilings()` removes tilings outside the range
`[min(raster_scale, ideal_scale), max(raster_scale, ideal_scale)]`, but
only if they were not used in the last `AppendQuads()` call. Tilings that
are actively providing fallback tiles are kept.

Source: `cc/tiles/picture_layer_tiling_set.cc` (lines 240–266, 279–302,
344–360), `cc/layers/picture_layer_impl.cc` (line 1685)

---

## 5. Tile Selection at Draw Time

`TilingSetCoverageIterator` determines which tile is drawn for each screen
region. The algorithm:

1. **Find the ideal tiling**: the smallest-scale tiling whose scale is
   > = the ideal contents scale.
2. **Visit order**: ideal tiling first, then higher-scale tilings
   (decreasing order), then lower-scale tilings (increasing order).
3. **For each tile position**: if the tile is ready to draw, use it.
   Otherwise, accumulate the rect into a missing region and try the next
   tiling.
4. **No tile from any tiling**: the rect is returned with a null tiling.
   The caller draws a solid color (checkerboard).

This is the mechanism that produces "reduced quality" frames. When you
pinch-zoom to 3x but only have tiles rasterized at 2x, the iterator
finds the 2x tiling's tiles (they are ready to draw) and uses them. The
GPU compositor then scales these 2x tiles to fill the 3x viewport via
texture sampling — producing a blurry result.

### Tracking Non-Ideal Tiles

During `AppendQuads`, tiles drawn from non-ideal tilings are tracked:

```cpp
if (iter.resolution() != HIGH_RESOLUTION) {
    append_quads_data->approximated_visible_content_area +=
        visible_geometry_area;
}
```

Tiles that are at neither the raster scale nor the ideal scale are flagged:

```cpp
if (iter->contents_scale_key() != raster_contents_scale_key() &&
    iter->contents_scale_key() < ideal_contents_scale_key()) {
    append_quads_data->checkerboarded_needs_raster = true;
}
```

Source: `cc/tiles/tiling_set_coverage_iterator.h`,
`cc/layers/picture_layer_impl.cc` (`AppendQuads`, lines 435–568)

---

## 6. Smoothness Priority and Activation

During interaction, `SMOOTHNESS_TAKES_PRIORITY` is set. This affects
two things:

### Relaxed Activation

When smoothness priority is active and a layer only showed checkerboard
last frame, the pending tree can activate **without waiting for all tiles
to be rasterized**:

```cpp
bool can_require_tiles_for_activation =
    produced_tile_last_append_quads_ || RequiresHighResToDraw() ||
    !layer_tree_impl()->SmoothnessTakesPriority();
```

If the layer was checkerboarded (didn't produce tiles) and smoothness is
priority, `can_require_tiles_for_activation` is false. The pending tree
activates immediately.

### Draw Abort Avoidance

When `RequiresHighResToDraw()` is true and tiles are missing, the draw
is aborted (`DrawResult::kAbortedMissingHighResContent`). But during
normal interaction, `RequiresHighResToDraw` is typically false — the
compositor draws whatever tiles are available.

Source: `cc/layers/picture_layer_impl.cc` (lines 632–651),
`cc/trees/layer_tree_host_impl.cc` (lines 1595–1601),
`cc/trees/proxy_impl.cc` (lines 540–571)

---

## 7. Guards Against Re-Rasterization During Interaction

`CanRecreateHighResTilingForLCDTextAndRasterTransform()` explicitly
prevents re-creating the high-res tiling during several interaction types:

```cpp
// Avoid re-rasterization during pinch-zoom
if (layer_tree_impl()->PinchGestureActive())
    return false;

// Avoid during scroll
if (layer_tree_impl()->GetActivelyScrollingType() !=
    ActivelyScrollingType::kNone)
    return false;

// Avoid during transform animation or will-change: transform
if (draw_properties().screen_space_transform_is_animating ||
    AffectedByWillChangeTransformHint())
    return false;
```

This means the HIGH_RESOLUTION tiling is NOT recreated for LCD text or
raster translation changes while the user is interacting. These
corrections are deferred until interaction ends.

Source: `cc/layers/picture_layer_impl.cc` (line 1304)

---

## 8. `will-change: transform` Effects

When a layer has `will-change: transform`:

- `AffectedByWillChangeTransformHint()` returns true (checks
  `node_or_ancestors_will_change_transform` on the transform node).
- Raster scale is pinned at the **native scale** (`device_scale *
page_scale`) or higher, not reduced below it. This keeps text legible.
- When exiting a transform animation, the raster scale is NOT adjusted
  downward — maximum resolution tiles are preserved.
- During `AdjustRasterScaleForTransformAnimation`, the raster scale is
  kept at max animation scale, and the preserved (old) raster scale is
  maintained if it's higher.

The net effect: `will-change: transform` layers are rasterized once at a
fixed scale and then GPU-composited at arbitrary transforms without
re-rasterization. This is resolution-independent GPU compositing.

Source: `cc/layers/picture_layer_impl.cc` (lines 871–876, 1544–1551,
1624–1627, 1713–1734)

---

## 9. Relevant Settings

From `LayerTreeSettings`:

| Setting                                             | Default                            | Purpose                                                     |
| --------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `tiling_interest_area_padding`                      | `kDefaultInterestAreaSizeInPixels` | Pre-raster padding beyond viewport (CSS px at ideal scale)  |
| `skewport_target_time_in_seconds`                   | 1.0 (SW) / 0.2 (GPU)               | Scroll prediction lookahead time                            |
| `skewport_extrapolation_limit_in_screen_pixels`     | 2000                               | Maximum skewport extent                                     |
| `max_preraster_distance_in_screen_pixels`           | 1000                               | Maximum pre-raster distance                                 |
| `gpu_rasterization_skewport_target_time_in_seconds` | 0.2                                | GPU raster predicts only 200ms ahead (GPU raster is faster) |
| `scheduled_raster_task_limit`                       | 32                                 | Max concurrent raster tasks                                 |

Source: `cc/trees/layer_tree_settings.h`

---

## 10. Complete Flow: Pinch-Zoom Frame by Frame

1. **User starts pinch.** `PinchGestureBegin()` sets
   `pinch_gesture_active = true`. Tree priority switches to
   `SMOOTHNESS_TAKES_PRIORITY`.

2. **Each frame during pinch:**
   - `UpdateIdealScales()` computes new `ideal_contents_scale` from the
     current page scale factor (changes continuously).
   - `ShouldAdjustRasterScale()` checks drift from ideal.
     - **Within 2x**: no change. Existing tiles reused. GPU stretches them.
     - **Beyond 2x**: `RecalculateRasterScales()` computes new scale
       (multiply/divide by 2, snap to existing if close).
   - `UpdateTilingsForRasterScaleAndTranslation()` creates a new
     HIGH_RESOLUTION tiling at the new scale if needed. Old tilings become
     NON_IDEAL_RESOLUTION.
   - Raster queue starts rasterizing tiles for the new HIGH_RESOLUTION
     tiling in background.

3. **At draw time (`AppendQuads`):**
   - `TilingSetCoverageIterator` covers the visible area starting with
     the ideal tiling.
   - For tiles not ready, falls back to other tilings (higher-scale
     first, then lower-scale).
   - Wrong-scale tiles are drawn as `TileDrawQuad`s — the GPU stretches
     them via texture sampling.
   - Completely missing regions become checkerboard (solid color).

4. **User ends pinch.** `PinchGestureEnd()` clears the active flag.
   - `ShouldAdjustRasterScale()` returns true (raster != ideal).
   - `RecalculateRasterScales()` sets raster to exactly the ideal scale.
   - New HIGH_RESOLUTION tiling created. Tiles rasterized.
   - As tiles complete, `AppendQuads` picks them up, replacing stale tiles.
   - Old tilings cleaned up by `CleanUpTilingsOnActiveLayer()`.

---

## Source Files Referenced

- `cc/layers/picture_layer_impl.cc/.h`
- `cc/layers/layer_impl.cc/.h`
- `cc/tiles/picture_layer_tiling_set.cc/.h`
- `cc/tiles/tiling_set_coverage_iterator.h`
- `cc/tiles/picture_layer_tiling.cc/.h`
- `cc/tiles/tile_priority.h`
- `cc/trees/layer_tree_impl.cc/.h`
- `cc/trees/layer_tree_host_impl.cc/.h`
- `cc/trees/layer_tree_settings.h`
- `cc/trees/proxy_impl.cc`
- `cc/layers/picture_layer_impl_unittest.cc`
