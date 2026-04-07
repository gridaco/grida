---
title: "Chromium Effect Optimizations"
format: md
tags:
  - internal
  - research
  - chromium
  - compositing
  - performance
---

# Chromium Effect Optimizations

How Chromium optimizes visual effects (blur, shadow, opacity, blend modes,
backdrop filters, rounded corners) at the compositor and renderer levels.
Chromium uses the same Skia backend we do, so the optimizations here are
architectural — they minimize how often Skia's expensive codepaths are hit.

For render surface fundamentals see [render-surfaces.md](./render-surfaces.md).

---

## Summary

Chromium's effect optimization strategy has five pillars:

1. **Avoid render surfaces entirely when possible** (fast rounded corners,
   single-child opacity folding, render pass bypass).
2. **Demote image filters to color filters** when the filter chain contains
   only per-pixel color math (no spatial dependency).
3. **Skip re-rendering undamaged render passes** using damage tracking and
   the `cache_render_pass` / `has_damage_from_contributing_content` system.
4. **Downscale backdrop filter input** via `backdrop_filter_quality` to
   reduce the pixel count processed by expensive filters.
5. **Batch tile draws and break batches only when effects demand it**,
   so unaffected content stays on the fast path.

---

## 1. Render Surface Avoidance

Render surfaces (offscreen textures) are the single most expensive
consequence of effects. Each surface requires:

- Allocating a GPU texture
- Drawing the subtree into it (extra draw pass)
- Reading it back when compositing into the parent (texture sample)

Chromium aggressively avoids them.

### Fast Rounded Corners

When a layer has `border-radius` and `is_fast_rounded_corner` is true,
no render surface is created. Instead, the rounded corner is applied as a
`MaskFilterInfo` on the `SharedQuadState`, which Skia handles as a
per-quad clip — no offscreen texture needed.

The fast path is used when:

- The layer has at most **one** drawing descendant, OR
- The rounded corner is set at a level where the compositor can guarantee
  correct clipping without isolation.

When `is_fast_rounded_corner` is false (multiple overlapping children that
need correct corner clipping), a render surface is created with
`RenderSurfaceReason::kRoundedCorner`.

Source: `cc/trees/property_tree_builder.cc` (line 369),
`cc/trees/effect_node.h` (`is_fast_rounded_corner`)

### Opacity Without Render Surface

Opacity does NOT always create a render surface. The condition is:

```cpp
bool may_have_transparency =
    layer->EffectiveOpacity() != 1.f ||
    HasPotentiallyRunningOpacityAnimation(mutator_host, layer);
bool at_least_two_layers = num_descendants_that_draw_content > 0 &&
    (layer->draws_content() || num_descendants_that_draw_content > 1);

if (may_have_transparency && at_least_two_layers)
    return RenderSurfaceReason::kOpacity;
```

A layer with opacity 0.5 but **zero or one** drawing descendants gets
no render surface. The opacity is folded into the draw quad's
`SharedQuadState::opacity` and applied as a simple alpha multiply at draw
time — a per-quad operation, not a per-surface operation.

This is a major optimization: most animated opacity (e.g. fade transitions)
affects a single composited layer, so no surface is needed.

Source: `cc/trees/property_tree_builder.cc` (lines 394–405)

### Render Pass Bypass

When a render pass contains **exactly one quad**, the renderer can bypass
the render pass entirely. Instead of:

1. Draw quad into offscreen texture
2. Draw offscreen texture into parent with effects

It does:

1. Draw the single quad directly into the parent, composing the render
   pass's effects onto the quad's paint/transform.

The `CalculateBypassParams()` function merges the inner quad's transform,
opacity, and sampling with the outer render pass's effects. The result is
a single draw call instead of two passes.

Three bypass modes:

- `kSkip`: the content is fully transparent and the blend mode doesn't
  affect transparent black — skip entirely.
- `kDrawTransparentQuad`: the content is transparent but the blend mode
  processes transparent black (e.g. some backdrop filters) — draw a
  transparent quad.
- `kDrawBypassQuad`: draw the inner quad directly with merged parameters.

Source: `components/viz/service/display/skia_renderer.cc`
(`CalculateBypassParams`, line 2120; `BypassMode` enum, line 624)

---

## 2. Filter Classification and Demotion

### CSS Filter to Skia Mapping

`RenderSurfaceFilters::BuildImageFilter()` converts the
`FilterOperations` chain into a tree of Skia `PaintFilter` objects. The
mapping:

| CSS/CC Filter           | Skia Mechanism                                | Spatial? |
| ----------------------- | --------------------------------------------- | -------- |
| `grayscale()`           | 4x5 color matrix via `ColorFilterPaintFilter` | No       |
| `sepia()`               | 4x5 color matrix                              | No       |
| `saturate()`            | 4x5 color matrix                              | No       |
| `hue-rotate()`          | 4x5 color matrix                              | No       |
| `invert()`              | 4x5 color matrix                              | No       |
| `brightness()`          | 4x5 color matrix                              | No       |
| `contrast()`            | 4x5 color matrix                              | No       |
| `opacity()` (as filter) | 4x5 color matrix                              | No       |
| `blur()`                | `BlurPaintFilter` (Skia gaussian blur)        | **Yes**  |
| `drop-shadow()`         | `DropShadowPaintFilter`                       | **Yes**  |
| `zoom()`                | `MagnifierPaintFilter`                        | **Yes**  |
| `reference()`           | Arbitrary `PaintFilter`                       | Depends  |

Source: `cc/paint/render_surface_filters.cc` (lines 165–299)

### Image Filter to Color Filter Demotion

After building the `SkImageFilter` chain, the renderer attempts to
simplify it:

```cpp
SkColorFilter* color_filter_ptr = nullptr;
if (rpdq_params.image_filter->asAColorFilter(&color_filter_ptr)) {
    rpdq_params.color_filter.reset(color_filter_ptr);
}
```

`asAColorFilter()` is a Skia API that succeeds when the entire image
filter chain contains only per-pixel operations (no spatial dependency).
When this succeeds, the filter is applied as a `SkColorFilter` on the
paint instead of requiring a `saveLayer`.

**Why this matters:** A color filter is a per-pixel shader operation
applied during the draw. It does not require:

- An intermediate texture (no `saveLayer`)
- Reading neighboring pixels (no expanded bounds)
- A separate compositing pass

So a chain like `brightness(1.2) contrast(1.1) saturate(1.3)` — which
would naively require a render surface, an offscreen texture, and a
`saveLayer` — gets collapsed into a single color matrix applied
directly on the draw quad's paint. The render pass can even be **batched**
with other quads.

Source: `components/viz/service/display/skia_renderer.cc` (lines 3128–3135)

### Paint vs Canvas for Effects

The renderer has two paths for applying effects:

1. **Paint path** (`PreparePaintOrCanvasForRPDQ`): Effects are set on the
   `SkPaint` object. This is the fast path. Used when:
   - No backdrop filter
   - No bypass clip needed, or no complex image filter

2. **Canvas path** (`PrepareCanvasForRPDQ`): Effects require a
   `saveLayer`. This is the expensive path. Required when:
   - Backdrop filter is present (always requires `saveLayer`)
   - Complex image filter + bypass clip (spatial filter needs isolation)

On the paint path:

- Color filters are composed with existing color filters via
  `makeComposed()`.
- Image filters with opacity are combined:
  `SkImageFilters::ColorFilter(MakeOpacityFilter(opacity), image_filter)`
  so opacity is uniform across overlapping filter output.

Source: `components/viz/service/display/skia_renderer.cc`
(`PreparePaintOrCanvasForRPDQ`, lines 1739–1804)

---

## 3. Damage Tracking for Effects

### Render Pass Skip

The most impactful optimization: **skip re-rendering undamaged render
passes entirely.** The cached texture from the previous frame is reused.

```cpp
if (render_pass->cache_render_pass ||
    allow_undamaged_nonroot_render_pass_to_skip_) {
    if (render_pass->has_damage_from_contributing_content ||
        !render_pass->copy_requests.empty()) {
        return false;  // cannot skip — has damage
    }
    return IsRenderPassResourceAllocated(render_pass->id);  // skip if cached
}
```

A render pass is skipped when:

- It is marked `cache_render_pass`, OR the renderer allows undamaged
  non-root passes to skip
- There is NO damage from contributing content
- There are no pending copy requests
- The GPU texture from the previous frame still exists

This means a layer with `backdrop-filter: blur(10px)` that hasn't changed
(no content damage, no property changes) reuses its previous frame's
texture with **zero GPU work** for that subtree.

Source: `components/viz/service/display/direct_renderer.cc` (lines 820–836)

### Damage Propagation Through Effects

The `DamageTracker` computes per-surface damage. Key mechanisms:

1. **Layer damage propagation**: When a layer changes (property or
   content), its visible rect in the target surface's space is added to
   that surface's damage.

2. **Surface damage propagation**: When a child surface has damage, the
   damage is transformed into the parent surface's space and accumulated.

3. **Pixel-moving filter expansion**: When a surface with a pixel-moving
   backdrop filter (e.g. `backdrop-filter: blur()`) intersects damage
   from content underneath it, the damage rect is **expanded** to cover
   the entire surface:

   ```cpp
   if (has_pixel_moving_backdrop_filters) {
       expanded_damage_rect.Union(contributing_surface.rect_in_target_space);
   }
   ```

   This is because a blur reads neighboring pixels — any change in the
   input region affects the entire blurred output.

4. **Surface property change**: When a surface's own properties change
   (opacity, transform), the **entire content rect** becomes damaged.
   This is the worst case — the entire subtree must be re-rendered.

5. **Filter rect mapping**: After computing raw damage, the damage rect
   is expanded through the surface's filters:
   ```cpp
   damage_rect = render_surface->Filters().MapRect(damage_rect, ...);
   ```
   A blur with sigma=10 expands the damage rect by ~30px in each
   direction (3x sigma).

Source: `cc/trees/damage_tracker.cc` (lines 186–270, 386–489)

### Effect Change Detection

The `EffectNode` has an `effect_changed` flag. When opacity, filters,
blend mode, or other effect properties change, this flag is set. The
damage tracker uses this to determine that the render surface needs
re-rendering.

Source: `cc/trees/effect_node.h` (line 192)

---

## 4. Backdrop Filter Optimizations

Backdrop filters are the most expensive effect in the compositor. They
require reading the parent surface's already-drawn content, filtering it,
and compositing the result. Chromium has several optimizations.

### Downscaled Backdrop via `backdrop_filter_quality`

The `EffectNode` carries a `backdrop_filter_quality` field (default 1.0).
When the renderer calls `saveLayer`, it passes this quality factor:

```cpp
current_canvas_->saveLayer(SkCanvasPriv::ScaledBackdropLayer(
    &bounds, &layer_paint, rpdq_params.backdrop_filter.get(),
    rpdq_params.backdrop_filter_quality, 0));
```

`ScaledBackdropLayer` is a Skia-internal API that downscales the backdrop
content before applying the filter. A quality of 0.5 means the backdrop
is read at half resolution, filtered at half resolution, then upscaled.
This reduces the pixel count by 4x for the filter pass.

This is controllable per-element. For large blurs, lower quality is
acceptable because the blur already destroys high-frequency detail.

Source: `components/viz/service/display/skia_renderer.cc` (line 1729),
`cc/trees/effect_node.h` (line 89)

### Backdrop Filter Bounds Clipping

Before applying the backdrop filter, the renderer clips the canvas to the
intersection of the draw quad bounds and any defined
`backdrop_filter_bounds`:

```cpp
rpdq_params.SetBackdropFilterClip(current_canvas_, params);
```

This ensures Skia only reads and filters the minimal region of the parent
surface. Without this, Skia would process the entire `clip_rect` of the
shared quad state.

The bounds can be a rect, an rrect (rounded rect), or an arbitrary path.
For rrect/rect cases, the bounds are transformed directly. For path cases,
the path is transformed and used as a clip.

Source: `components/viz/service/display/skia_renderer.cc`
(`SetBackdropFilterClip`, line 828; bounds computation, lines 3166–3255)

### Edge Mode for Backdrop Filters

When the backdrop filter's input bounds extend beyond the drawn content,
the renderer composes a `SkShaderImageFilter` as an inner filter to handle
edge pixels:

```cpp
rpdq_params.backdrop_filter = SkImageFilters::Compose(
    /*outer=*/std::move(rpdq_params.backdrop_filter),
    /*inner=*/edge_filter);
```

This uses either `kMirror` or `kClampToBlack` edge mode to avoid
artifacts at the edges of the backdrop region.

Source: `components/viz/service/display/skia_renderer.cc` (lines 3236–3248)

### `intersects_damage_under` Optimization

Each render surface with backdrop filters tracks whether it intersects
damage from content drawn before it (content "under" it). If there is no
damage in the backdrop region, the backdrop filter can potentially be
skipped or its cached result reused.

```cpp
if (!surface->intersects_damage_under() ||
    has_pixel_moving_backdrop_filters) {
    if (!valid || rect_in_target_space.Intersects(expanded_damage_rect)) {
        surface->set_intersects_damage_under(true);
    }
}
```

Source: `cc/trees/damage_tracker.cc` (lines 207–221)

---

## 5. Filter Bounds Computation

### Pixel-Moving vs Non-Pixel-Moving Filters

Chromium classifies filters into two categories:

**Pixel-moving** (spatial dependency):

- `BLUR`, `DROP_SHADOW`, `ZOOM`, `OFFSET`, `REFERENCE`
- These read from neighboring pixels, so they expand the affected region.

**Non-pixel-moving** (per-pixel):

- `GRAYSCALE`, `SEPIA`, `SATURATE`, `HUE_ROTATE`, `INVERT`, `BRIGHTNESS`,
  `CONTRAST`, `OPACITY`, `COLOR_MATRIX`, `SATURATING_BRIGHTNESS`,
  `ALPHA_THRESHOLD`
- These operate on each pixel independently. No bounds expansion needed.

Source: `cc/paint/filter_operations.cc` (`HasFilterThatMovesPixels`,
lines 90–118)

### MapRect for Bounds Expansion

Each filter type knows how to compute its output bounds from input bounds.
`FilterOperation::MapRect()` handles the expansion:

- **Blur**: outsets by `3 * sigma` in each direction (the standard
  deviation spread).
- **Drop shadow**: outsets by `3 * sigma` AND offsets by the shadow
  offset. Union with original rect (shadow extends but doesn't remove
  the original).
- **Reference**: delegates to `SkImageFilter::MapRect()`.
- **Offset**: translates the rect.
- **All others**: return the rect unchanged.

The damage tracker and clip computation both use this to ensure
render surfaces are large enough to contain the filtered output.

Source: `cc/paint/filter_operation.cc` (`MapRectInternal`, lines 341–399)

---

## 6. Batching Interaction with Effects

### What Breaks Batching

The `SkiaRenderer` batches tile draws into single
`SkCanvas::experimental_DrawEdgeAAImageSet()` calls. A batch is flushed
when:

```cpp
bool MustFlushBatchedQuads(new_quad, rpdq_params, params) {
    if (batched_quads_.empty()) return false;
    if (rpdq_params) return true;  // any RPDQ with effects breaks batch
    if (not TileDrawQuad/TextureContent/AggregatedRenderPass) return true;
    if (blend_mode changed) return true;
    if (sampling changed) return true;
    if (scissor_rect changed) return true;
    if (mask_filter_info changed) return true;
    return false;
}
```

Key insight: **render pass draw quads with effects always break the
batch** (line 2331: `if (rpdq_params) return true`). But render pass
quads without effects (created only for copy requests) are batchable:

```cpp
if (!rpdq_params.image_filter && !rpdq_params.backdrop_filter &&
    !rpdq_params.mask_shader && !rpdq_params.bypass_geometry) {
    AddQuadToBatch(content_image.get(), valid_texel_bounds, params);
    return;
}
```

Source: `components/viz/service/display/skia_renderer.cc`
(`MustFlushBatchedQuads`, lines 2323–2353; RPDQ batch path, lines 3432–3437)

### Effect Isolation

Because effects break batching, Chromium's architecture ensures effects
are **isolated to their render surface**. Tiles within an effect-bearing
layer are drawn into the render surface as a normal batch (no effects on
individual tiles). The effect is applied once when the surface's quad is
composited into the parent — a single non-batched draw that applies the
filter/blend/opacity to the pre-composited texture.

This means: N tiles with a blur filter = 1 batched draw (tiles into
surface) + 1 filtered draw (surface into parent). Not N filtered draws.

---

## 7. The `saveLayer` Cost and When It's Used

`saveLayer` is the expensive Skia operation that allocates an
intermediate texture, draws content into it, and composites it back.
Chromium uses it only when necessary:

| Scenario                                        | Uses `saveLayer`? | Notes                                                      |
| ----------------------------------------------- | ----------------- | ---------------------------------------------------------- |
| Color-only filters (brightness, contrast, etc.) | No                | Demoted to `SkColorFilter` on paint                        |
| Blur/drop-shadow filter                         | Yes               | Via `setImageFilter` on paint (implicit saveLayer by Skia) |
| Backdrop filter                                 | Yes               | Explicit `saveLayer` with `ScaledBackdropLayer`            |
| Opacity on single quad                          | No                | Alpha on `SkPaint`                                         |
| Opacity on multi-child subtree                  | Yes               | saveLayer via render surface                               |
| Blend mode (non-SrcOver)                        | Yes               | saveLayer via render surface                               |
| Rounded corner (fast)                           | No                | `MaskFilterInfo` clip                                      |
| Rounded corner (slow)                           | Yes               | Render surface                                             |
| Picture quad with blending                      | Yes               | saveLayer for correct alpha                                |

The critical distinction: Skia's `setImageFilter` on paint does an
implicit `saveLayer` internally, but it's more efficient than an explicit
one because Skia can optimize the allocation and composition. Chromium
prefers setting filters on the paint rather than wrapping in explicit
`saveLayer` calls when possible.

Source: `components/viz/service/display/skia_renderer.cc`
(lines 1699–1804, 2545–2549, 2603–2631)

---

## 8. Color Matrix Implementation

All color-based CSS filters (grayscale, sepia, saturate, hue-rotate,
invert, brightness, contrast, opacity-as-filter) are implemented as
**4x5 color matrices**. The matrix is applied via
`ColorFilterPaintFilter`, which Skia executes as a GPU shader.

The matrices are hardcoded following the CSS Filter Effects spec. For
example, grayscale:

```
[0.2126+0.7874*a  0.7152-0.7152*a  1-(m[0]+m[1])  0  0]
[0.2126-0.2126*a  0.7152+0.2848*a  1-(m[5]+m[6])  0  0]
[0.2126-0.2126*a  0.7152-0.7152*a  1-(m[10]+m[11]) 0  0]
[0                0                0               1  0]
```

Multiple color matrices in a filter chain are composed by Skia into a
single matrix multiplication — so `grayscale(0.5) contrast(1.2)
brightness(0.9)` is one shader operation, not three.

Source: `cc/paint/render_surface_filters.cc` (lines 26–161)

---

## 9. LCD Text Interaction with Effects

Effects that prevent LCD text rendering (subpixel anti-aliasing):

- `will-change: transform` → `LCDTextDisallowedReason::kWillChangeTransform`
- Transform animation → `kTransformAnimation`
- Any filter on ancestor → `lcd_text_disallowed_by_filter`
- Any backdrop filter on ancestor → `lcd_text_disallowed_by_backdrop_filter`

When LCD text is disallowed, text is rendered with grayscale
anti-aliasing. This is because LCD text depends on a known pixel grid
alignment, which transforms and effects can disrupt.

The flag `lcd_text_disallowed_by_filter` is propagated down the effect
tree — if any ancestor has a filter, all descendants lose LCD text.

Source: `cc/trees/effect_node.h` (lines 210–218),
`cc/layers/picture_layer_impl.cc` (`ComputeLCDTextDisallowedReason`)

---

## 10. Compositor vs Blink Effect Handling

### What the Compositor Handles

- Opacity compositing (render surface or paint alpha)
- CSS filters (via `SkImageFilter` / `SkColorFilter`)
- Backdrop filters (via `saveLayer` + backdrop)
- Blend modes (via render surface + `SkBlendMode`)
- Rounded corners (via `MaskFilterInfo` or render surface)
- Clip paths (via render surface)
- Masks (via render surface + mask shader)

### What Blink Handles (Pre-Compositor)

- `box-shadow`: painted into the layer's display list during recording.
  Skia's `SkDrawShadowRec` or `drawRRect` with blur mask filter handles
  the GPU-side rendering. **No compositor involvement** — it's just paint
  ops in the tile raster.
- `text-shadow`: same — painted during recording, rasterized per-tile.
- `filter: url(#svg-filter)`: SVG filters are resolved by Blink into a
  `REFERENCE` filter operation containing an `SkImageFilter`.
- Border rendering, outline, etc.: all paint-time, no compositor effect.

This division means: `box-shadow` is free from the compositor's
perspective (it's baked into tiles), while `filter: blur()` requires a
render surface and post-processing.

---

## Source Files Referenced

- `cc/trees/effect_node.h`
- `cc/trees/property_tree_builder.cc`
- `cc/trees/property_tree.cc`
- `cc/trees/draw_property_utils.cc`
- `cc/trees/damage_tracker.cc`
- `cc/paint/filter_operation.h/.cc`
- `cc/paint/filter_operations.cc`
- `cc/paint/render_surface_filters.cc`
- `cc/layers/render_surface_impl.cc`
- `components/viz/service/display/skia_renderer.cc`
- `components/viz/service/display/direct_renderer.cc`
