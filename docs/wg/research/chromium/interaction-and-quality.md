---
title: "Chromium Interaction and Quality Management"
tags:
  - internal
  - research
  - chromium
  - rendering
  - compositing
---

# Chromium Interaction and Quality Management

How Chromium maintains smooth interaction (scroll, pinch-zoom) even when
tile rasterization cannot keep up with the viewport changes.

## TreePriority During Scroll

During active scroll or pinch gestures, the compositor switches to
`SMOOTHNESS_TAKES_PRIORITY` mode. This affects the raster queue ordering:

| TreePriority                   | Behavior                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `SAME_PRIORITY_FOR_BOTH_TREES` | Normal idle state. Active and pending tree tiles have equal priority.                                               |
| `SMOOTHNESS_TAKES_PRIORITY`    | Active scroll/pinch. Active tree NOW tiles are rasterized before pending tree tiles. Keeps existing display smooth. |
| `NEW_CONTENT_TAKES_PRIORITY`   | After persistent checkerboarding. Pending tree tiles get priority to fill missing content.                          |

The priority is set by `ProxyImpl::SetTreePrioritiesAndScrollState()`. A
timer is started when the gesture begins. When the timer expires (gesture
ends), the system returns to `SAME_PRIORITY_FOR_BOTH_TREES`.

Source: `cc/trees/proxy_impl.cc`, `cc/tiles/tile_priority.h`

## Pinch-Zoom Raster Scale

During pinch-to-zoom gestures, Chromium deliberately avoids continuously
recalculating the raster scale. Instead:

1. The raster scale changes in **discrete jumps** (multiples of
   `kMaxScaleRatioDuringPinch`).
2. The scale snaps to the nearest **existing** tiling scale rather than
   creating new tilings (`kSnapToExistingTilingRatio`).
3. When zooming out, new tilings are preemptively created at lower
   resolution.
4. When zooming in, the existing tiling is reused (scaled up) until the
   jump threshold is reached.

The visual effect: during fast pinch, content appears at a slightly wrong
resolution (blurry when zooming in, oversharp when zooming out). When the
gesture ends, the raster scale snaps to the ideal value and tiles are
re-rasterized at the correct density.

This is a deliberate quality-for-smoothness trade-off. Re-rasterizing all
tiles at every zoom increment would stall the compositor.

Source: `cc/layers/picture_layer_impl.cc` (`RecalculateRasterScales`,
`ShouldAdjustRasterScale`)

## Checkerboarding

Checkerboarding occurs when a frame is drawn with missing tiles (tiles that
have not yet been rasterized). Rather than blocking the frame and causing
jank, Chromium draws the frame without the missing tiles.

### What the User Sees

Missing tiles are typically drawn as the background color or as nothing
(transparent). The name comes from historical behavior where a literal
checkerboard pattern was shown.

### Tracking and Response

Each frame tracks whether checkerboarding occurred:

- `append_quads_data->checkerboarded_needs_raster` is set when visible tiles
  are missing
- `consecutive_checkerboard_animations_` counts consecutive frames with
  checkerboarding during animation

If too many consecutive frames checkerboard during an animation, the
scheduler enters `ForcedRedrawOnTimeoutState::WAITING_FOR_COMMIT`. This
triggers a synchronous commit from the main thread to deliver fresh content,
sacrificing smoothness to avoid prolonged visual artifacts.

Source: `cc/scheduler/scheduler_state_machine.cc`,
`cc/trees/layer_tree_host_impl.cc`

### Relaxed Activation During Smoothness

When `SmoothnessTakesPriority()` is true and the last frame was
checkerboarded, activation requirements are relaxed. The pending tree can
activate even if not all tiles are rasterized. This trades visual
completeness for lower latency during active interaction.

Source: `cc/layers/picture_layer_impl.cc` (`AllTilesRequiredForActivation*`)

## Checker-Imaging

Separate from tile checkerboarding, Chromium has a mechanism for
**large images within tiles**: the `CheckerImageTracker`.

1. During rasterization, images that are too large to decode synchronously
   are identified and marked as checker-imaged.
2. The tile is rasterized without those images (placeholder shown).
3. Images are decoded asynchronously by the `ImageController`.
4. When decoding completes, affected tiles are invalidated and
   re-rasterized with the full image content.

The decision to checker-image is based on image size, decode speed,
animation state, and whether the image is critical for first paint.

Source: `cc/tiles/checker_image_tracker.cc`,
`cc/tiles/checker_image_tracker.h`

## The Skewport: Predictive Pre-Rasterization

The **skewport** is a velocity-extrapolated rectangle that predicts where
the user will scroll next. It extends the visible rect in the scroll
direction based on scroll velocity and a target time constant.

Computation:

1. Record the visible rect position for each frame
2. Compute scroll velocity from the oldest recorded position to the current
3. Extrapolate the visible rect forward by `skewport_target_time`

Tiles that fall within the skewport get `SOON` priority and are rasterized
before tiles further away. This means content that is about to scroll into
view is already available when it arrives.

Source: `cc/tiles/picture_layer_tiling_set.cc` (`ComputeSkewport`)

## Idle Behavior

When interaction stops:

**Immediate (next frame):** `SMOOTHNESS_TAKES_PRIORITY` timer expires.
TreePriority returns to `SAME_PRIORITY_FOR_BOTH_TREES`. Pending tree tiles
get equal scheduling priority.

**Short-term:** Any remaining SOON and EVENTUALLY tiles are rasterized as
the worker threads become idle. The full prepaint area fills in.

**Long-term (5 minutes of inactivity):**
`ScheduleReduceTileMemoryWhenIdle()` begins evicting tiles below NOW
priority to reclaim GPU memory. `TrimPrepaintTiles()` evicts EVENTUALLY
tiles that haven't been used recently.

Source: `cc/tiles/tile_manager.cc`, `cc/trees/proxy_impl.cc`

## Layer Promotion

Not every DOM element becomes a composited layer. Only elements with
specific compositing reasons are promoted. There are approximately 40
reasons, organized into categories:

### Transform-related

- 3D transforms (`k3DTransform`, `k3DScale`, `k3DRotate`, `k3DTranslate`)
- Trivial 3D transforms
- `perspective` with 3D descendants
- `preserve-3d` with 3D descendants

### Animation

- Active transform/opacity/filter/backdrop-filter animations

### `will-change`

- `will-change: transform` / `opacity` / `filter` / `backdrop-filter`
- Also: scale, rotate, translate, clip-path, mix-blend-mode

### Special elements

- `<iframe>`, `<video>`, `<canvas>`, plugins
- Fixed/sticky/anchor positioning
- `backdrop-filter`
- Composited overflow scrolling

### Implicit

- `kOverlap` — overlapping with another composited layer (determined
  post-paint, to prevent content from being composited behind something
  that should be in front)

**Simple elements (e.g., a `<div>` with a `box-shadow`) are NOT promoted.**
They are painted into the parent layer's tiles as part of normal
rasterization. Only the structural/animation/interaction reasons listed
above cause promotion.

Source: `third_party/blink/renderer/platform/graphics/compositing_reasons.h`,
`third_party/blink/renderer/core/paint/compositing/compositing_reason_finder.cc`
