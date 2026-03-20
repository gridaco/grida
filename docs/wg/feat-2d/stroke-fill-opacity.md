---
title: "Stroke-Fill Opacity Compositing"
---

# Stroke-Fill Opacity Compositing

How node-level opacity interacts with fill and stroke paint when they
overlap. Defines the correct compositing behavior and the per-paint-alpha
optimization with its validity conditions.

Related:

- [Rendering Optimization Strategies](./optimization.md) — item 6b
- Chromium source: `third_party/blink/renderer/core/paint/svg_shape_painter.cc`
- Chromium source: `third_party/blink/renderer/core/paint/svg_object_painter.cc`
- SVG 2 Specification, Chapter 3: Rendering Model

---

## Two Kinds of Opacity

There are two distinct opacity mechanisms, operating at different levels:

| Property                                             | Scope                     | Compositing                                               | Isolation? |
| ---------------------------------------------------- | ------------------------- | --------------------------------------------------------- | ---------- |
| **Node opacity** (`opacity`)                         | Entire element as a group | `save_layer(opacity)` → draw fill+stroke at 1.0 → restore | **Yes**    |
| **Paint opacity** (`fill-opacity`, `stroke-opacity`) | Individual paint only     | Baked into `paint.alpha`                                  | **No**     |

This matches the SVG/CSS specification and Chromium's implementation.

### Node opacity (group isolation)

When a node has `opacity < 1.0`, the entire element — fill, stroke,
markers, effects — is rendered into an **offscreen surface at full
opacity**, then the surface is composited onto the canvas at the
specified opacity.

```
save_layer_alpha(bounds, opacity)   ← offscreen surface
  draw_fill(color, fill_opacity=1.0)
  draw_stroke(color, stroke_opacity=1.0)
restore                              ← composite at `opacity`
```

This ensures fill and stroke compose correctly in the overlap region.
The overlap shows only the topmost paint (stroke), blended once at
`opacity` against the background. No double-blending.

### Paint opacity (per-paint alpha)

`fill-opacity` and `stroke-opacity` are multiplied directly into the
paint color's alpha channel. No offscreen surface. Each paint is drawn
independently:

```
draw_fill(color * fill_opacity)
draw_stroke(color * stroke_opacity)
```

In the overlap region, the fill shows through at `fill_opacity`, then
the stroke composites on top at `stroke_opacity`. This is intentional —
paint-level opacity controls the individual paint's transparency, not
the element as a group.

---

## Chromium Implementation Reference

Chromium's SVG renderer handles this with two separate code paths:

### 1. `opacity` → Effect paint property → `SaveLayerAlphaOp`

When `style.Opacity() != 1.0f`, an **Effect paint property node** is
created in the paint property tree:

```
// paint_property_tree_builder.cc:1630
if (style.Opacity() != 1.0f)
  return true;  // needs Effect node

// paint_property_tree_builder.cc:1784
state.opacity = style.Opacity();
```

During rasterization, this Effect node becomes a `SaveLayerAlphaOp`:

```
// paint_chunks_to_cc_layer.cc:697
save_layer_id = push<cc::SaveLayerAlphaOp>(effect.Opacity());
```

All fill/stroke draws happen INSIDE this save_layer.

### 2. `fill-opacity` / `stroke-opacity` → paint color alpha

In `SVGObjectPainter::PreparePaint()`:

```
// svg_object_painter.cc:142
const float alpha =
    apply_to_fill ? style.FillOpacity() : style.StrokeOpacity();

// svg_object_painter.cc:176
flag_color.SetAlpha(flag_color.Alpha() * alpha);
flags.setColor(flag_color.toSkColor4f());
```

No offscreen surface. Alpha is baked directly into the paint.

### 3. Combined: `opacity=0.5` on element with fill+stroke

Rendering order:

1. `SaveLayerAlpha(0.5)` — start offscreen buffer
2. Draw fill (red, at full opacity)
3. Draw stroke (blue, at full opacity)
4. `Restore` — composite offscreen buffer at 50% opacity

The overlap region shows **only** the stroke color at 50% opacity
against the background. No fill bleed-through.

---

## The Per-Paint-Alpha Optimization

`save_layer` is the most expensive non-filter Skia GPU operation
(~57-60 µs per call, measured). For nodes with `opacity < 1.0`, we
can sometimes avoid it by folding the opacity into each paint's alpha.

### When per-paint-alpha is spec-correct (zero visual difference)

Per-paint-alpha produces identical output to save_layer when the
node's draw calls do NOT overlap on the canvas:

- **Fills only** (no stroke) — one `draw_path`, zero overlap
- **Strokes only** (no fill) — one `draw_path`, zero overlap
- **Fill + Outside stroke** — stroke geometry is entirely outside the
  fill area. Zero geometric overlap. Exact match.

### When per-paint-alpha is spec-incorrect (visible artifact)

When fill and stroke geometrically overlap, applying opacity
independently produces **double-blending** in the overlap region:

- **Fill + Inside stroke** — stroke fully overlaps the fill. The
  overlap region (entire stroke band) shows fill bleed-through.
  Max channel difference: ~64/255 at opacity=0.5.
- **Fill + Center stroke** — inner half of stroke overlaps the fill.
  Same artifact in the overlap band, but narrower.

The artifact magnitude scales with `stroke_width * (1 - opacity)`.

### Non-overlapping fill path optimization

Instead of falling back to `save_layer_alpha` for Inside/Center strokes,
we eliminate the overlap at layer construction time by computing:

```
non_overlapping_fill = fill_path.op(stroke_path, PathOp::Difference)
```

This subtracts the stroke region from the fill path. Drawing the
non-overlapping fill + original stroke with per-paint-alpha produces
output identical to `save_layer_alpha` — zero GPU surfaces, zero
artifacts.

`PathOp::Difference` is a CPU-side Skia boolean path operation (~5-15 µs
for simple shapes, ~20-40 µs for complex paths). This is consistently
cheaper than `save_layer_alpha` (~57-60 µs GPU surface allocation) and
the cost is paid once at layer construction, amortized across frames.

### Decision rule

```
can_use_per_paint_alpha(node):
  if node has noise effects       → NO  (always wrong, see optimization.md)
  if node has only fills          → YES (one draw call, no overlap)
  if node has only strokes        → YES (one draw call, no overlap)
  if node has fill + stroke:
    if stroke_align == Outside    → YES (no geometric overlap)
    if stroke_align == Inside:
      if non_overlapping_fill     → YES (overlap eliminated by PathOp)
      else                        → NO  (PathOp failed, use save_layer)
    if stroke_align == Center:
      if non_overlapping_fill     → YES (overlap eliminated by PathOp)
      else                        → NO  (PathOp failed, use save_layer)
```

When `save_layer` is required (PathOp fallback), always provide **tight
bounds** that include the stroke expansion (not just `shape.rect`).

### Save-layer bounds computation (fallback path)

The `save_layer` bounds must encompass all drawing that happens inside
it. For a node with strokes, this includes the stroke path which may
extend beyond `shape.rect`:

```
bounds = shape.rect
if has_stroke_path:
  bounds = bounds.union(stroke_path.bounds())
// also expand for shadow/blur effects
```

Without correct bounds, `save_layer` clips content outside
`shape.rect`, cutting off Outside/Center stroke geometry.

---

## Implementation Status

| Stroke Align | Overlap? | Strategy                                      | Pixel-correct? |
| ------------ | -------- | --------------------------------------------- | -------------- |
| Outside      | None     | Per-paint-alpha (fast)                        | ✅ Exact match |
| Inside       | Full     | Non-overlapping fill + per-paint-alpha (fast) | ✅ Exact match |
| Center       | Partial  | Non-overlapping fill + per-paint-alpha (fast) | ✅ Exact match |
| Fills only   | N/A      | Per-paint-alpha (fast)                        | ✅ Exact match |
| Strokes only | N/A      | Per-paint-alpha (fast)                        | ✅ Exact match |

The `stroke_overlaps_fill` flag on `PainterPictureShapeLayer` controls
overlap detection. The `non_overlapping_fill_path` field stores the
pre-computed fill path with stroke region subtracted. Both are set at
layer construction time.

If `PathOp::Difference` fails (degenerate geometry), the painter falls
back to `save_layer_alpha` with bounds expanded via
`compute_blend_mode_bounds_with_stroke()`.
