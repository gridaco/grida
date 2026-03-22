---
title: "Chromium Render Surfaces"
---

# Chromium Render Surfaces

A render surface is an offscreen GPU texture that a subtree is composited
into before being drawn into its parent. It is Chromium's solution for
effects that cannot be applied per-quad or per-tile.

## When a Render Surface Is Created

The `EffectNode` in the property tree determines whether a render surface
is needed. The decision is made in `ComputeRenderSurfaceReason()` in
`cc/trees/property_tree_builder.cc`. A render surface is created for any
of these reasons:

| Reason                       | Trigger                                           |
| ---------------------------- | ------------------------------------------------- |
| `kRoot`                      | The root of the compositing tree (always)         |
| `kFilter`                    | Any CSS filter (`blur()`, `drop-shadow()`, etc.)  |
| `kBackdropFilter`            | `backdrop-filter` property                        |
| `kBlendMode`                 | `mix-blend-mode` other than `normal`              |
| `kBlendModeDstIn`            | `DstIn` blend mode (mask optimization)            |
| `kOpacity`                   | `opacity < 1.0` with 2+ drawing descendants       |
| `kRoundedCorner`             | `border-radius` with multiple drawing descendants |
| `kClipPath`                  | `clip-path` property                              |
| `k3dTransformFlattening`     | 3D transform that needs flattening                |
| `kMask`                      | Mask layer applied                                |
| `kBackdropScope`             | Defines scope for child backdrop/blend effects    |
| `kFilterAnimation`           | Animated filter                                   |
| `kOpacityAnimation`          | Animated opacity                                  |
| `kBackdropFilterAnimation`   | Animated backdrop filter                          |
| `kCache`                     | Explicitly cached surface                         |
| `kCopyRequest`               | Copy output request (screenshot, etc.)            |
| `kMirrored`                  | Mirrored layer                                    |
| `kTrilinearFiltering`        | Trilinear filtering requested                     |
| `kClipAxisAlignment`         | Non-axis-aligned clip with descendants            |
| `kGradientMask`              | Gradient mask                                     |
| `kViewTransitionParticipant` | View Transitions API                              |

The mapping is 1:1 — each `EffectNode` with a non-None reason gets exactly
one `RenderSurfaceImpl`.

Source: `cc/trees/effect_node.h` (`RenderSurfaceReason` enum),
`cc/trees/property_tree_builder.cc`

## How Render Surfaces Handle Effects

### Filters (blur, drop-shadow, etc.)

When a layer has a CSS filter, all its content (potentially many tiles) is
first drawn into the render surface's offscreen texture. The filter is then
applied to the **entire** texture when that surface is composited into its
parent render pass.

The filter is stored as `FilterOperations` on the `EffectNode`, copied
onto the `CompositorRenderPass`, and converted to an `SkImageFilter` at
draw time by the `SkiaRenderer`.

This means the filter is never applied per-tile. Tiles are drawn "raw"
into the render surface; the filter is a post-process on the composited
result.

Source: `cc/layers/render_surface_impl.cc` (`CreateRenderPassCommon`),
`components/viz/service/display/skia_renderer.cc`

### Clip Expansion for Pixel-Moving Filters

Filters like blur expand content beyond the original bounds. The compositor
handles this by expanding the clip rect for the render surface:

`RenderSurfaceImpl::CalculateExpandedClipForFilters()` calls
`Filters().ExpandRect()` to grow the clip by the filter's pixel expansion.
This is also done in `draw_property_utils.cc` via
`ExpandClipForPixelMovingFilter()`.

### Backdrop Filters

A backdrop filter reads from content that has already been drawn to the
parent render pass (the content "behind" the element).

The mechanism:

1. The element gets `RenderSurfaceReason::kBackdropFilter`.
2. Its `CompositorRenderPass` carries the `backdrop_filters`.
3. When the `SkiaRenderer` draws the `CompositorRenderPassDrawQuad` for
   this surface, it calls `SkCanvas::saveLayer` with a backdrop filter
   parameter (`SkCanvasPriv::ScaledBackdropLayer`).
4. Skia reads the current canvas content (everything already drawn into
   the parent pass), applies the backdrop filter, and uses the result as
   the initial layer content.
5. The element's own content is drawn on top.
6. On layer restore, the blended result is composited back into the parent.

This works because render passes are drawn in dependency order (children
before parents). By the time the backdrop element is drawn, all content
behind it has already been rendered into the parent pass.

Source: `components/viz/service/display/skia_renderer.cc`
(`PrepareCanvasForRPDQ`), `components/viz/service/display/software_renderer.cc`
(`GetBackdropBitmap`)

### Blend Modes

Any `mix-blend-mode` other than `normal` triggers a render surface. The
element's entire subtree is composited into the surface's offscreen
texture. When the surface is drawn into its parent, the blend mode is
applied via `SharedQuadState::blend_mode`.

This ensures the blend operates on the flattened content of the element
against the flattened content behind it — which is the correct CSS
semantics. Individual tiles or child layers cannot perform this blending
correctly because they don't have the full context of what's behind them.

Source: `cc/trees/property_tree_builder.cc`,
`cc/layers/render_surface_impl.cc` (`AppendQuads`)

### Opacity with Children

`opacity < 1.0` on an element with 2+ drawing descendants triggers a render
surface. The subtree is drawn at full opacity into the offscreen texture,
then the texture is composited into the parent at the reduced opacity.

Without the render surface, each child would be individually alpha-blended,
producing incorrect visual results where child content overlaps.

Source: `cc/trees/property_tree_builder.cc`

## The Render Surface Tree

The render surfaces form a tree that mirrors the EffectTree structure.
Each surface has a **target** — the parent surface it contributes to.

Construction:

1. `ComputeInitialRenderSurfaceList()` walks all visible layers. Each
   layer's target surface is added to the list. Parent surfaces are added
   before children (dependency order).

2. `ComputeSurfaceContentRects()` walks the list backwards (leaves to root).
   Each surface's content rect is computed from contributions of its
   children and layers.

3. `ComputeListOfNonEmptySurfaces()` removes surfaces with empty content.

Source: `cc/trees/draw_property_utils.cc`

## Drawing Render Surfaces

In `LayerTreeHostImpl::CalculateRenderPasses()`:

1. A `CompositorRenderPass` is created for each surface, in dependency
   order (leaves first, root last).

2. An `EffectTreeLayerListIterator` walks the tree front-to-back, visiting
   three states:
   - **Layer**: calls `layer.AppendQuads()` to emit tile quads into the
     layer's target render pass.
   - **TargetSurface**: the surface has received all its content.
   - **ContributingSurface**: emits a `CompositorRenderPassDrawQuad` into
     the parent render pass, referencing the child surface's pass.

3. The display compositor (viz) draws passes in list order (first to last).
   For each pass: bind the pass's offscreen texture, draw all quads. When
   a `RenderPassDrawQuad` is encountered, the child pass's texture is
   sampled and drawn with the appropriate filter/blend/opacity.

Source: `cc/trees/layer_tree_host_impl.cc` (`CalculateRenderPasses`),
`cc/layers/effect_tree_layer_list_iterator.cc`
