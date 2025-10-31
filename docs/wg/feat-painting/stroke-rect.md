# Rectangular Stroke - `stroke-rect`

> Per-side stroke widths for rectangular shapes (CSS border equivalent)

| feature id    | status      | description                                       |
| ------------- | ----------- | ------------------------------------------------- |
| `stroke-rect` | in progress | Rectangular stroke rendering with per-side widths |

---

## Abstract

This working group defines the behavior and rendering model for **rectangular stroke painting**, including support for per-side widths, corner radii, and dashed/dotted styles. It aligns Grida's paint model with modern browser and Skia practices to ensure consistent rendering across vector, HTML, and canvas backends.

## Terminology Note

In this document and throughout Grida's implementation:

- **Stroke** is the graphics term used in our codebase (aligns with SVG `stroke`, Skia stroke primitives)
- **Border** is the common UI/CSS term for "stroke of a rectangular shape" (e.g., CSS `border-width`)

These terms are functionally equivalent when applied to rectangles:

- `border-width: 2px` (CSS) ≈ `stroke-width: 2` (graphics) on a rectangle
- The model described here applies to both contexts

We use "stroke" as the primary term since Grida is a graphics engine, but the rectangular stroke model is equivalent to CSS borders.

---

## Motivation

Rectangular strokes are ubiquitous in UI/layout design but become non‑trivial when considering:

- Per-side widths (`top/right/bottom/left`)
- Per-corner radii (elliptical)
- Stroke styles (solid, dashed, dotted)
- Cap/join semantics for open vs. closed paths
- Fidelity with CSS/Blink/Skia pipelines

We standardize Grida's rectangular stroke rendering so solid, dashed, and rounded cases render predictably and match CSS borders where applicable.

---

## Goals

1. Define a consistent rectangular stroke model that supports:
   - Solid, dashed, dotted styles
   - Per-side widths
   - Per-corner radii
2. Achieve visual parity with CSS border rendering (Chrome/Blink).
3. Optimize for GPU batching and caching (Skia or Rust backend).
4. Keep geometry math minimal and predictable.

---

## Terminology

| Term              | Meaning                                     | CSS Equivalent         |
| ----------------- | ------------------------------------------- | ---------------------- |
| **Outer Rect**    | External boundary of the stroke             | Border box             |
| **Inner Rect**    | Internal boundary (stroke ends here)        | Content box edge       |
| **Stroke Ring**   | Visible area between outer and inner rect   | Border band            |
| **Corner Radius** | Elliptical radius per corner (rx, ry)       | `border-radius`        |
| **Dash Pattern**  | Alternating painted/unpainted lengths       | `border-style: dashed` |
| **Clip Ring**     | Mask that confines paint to the stroke band | Border rendering mask  |

---

## Rendering Model

### 1) Solid Stroke

**Definition:** Fill the region between outer and inner rounded rectangles.

**Implementation (Skia):**

- Compute **outer** `RRect(ox, oy, ow, oh)` with per-corner radii.
- Compute **inner** rect by insetting each side by its stroke width:  
  `inner = inset(outer, left, top, right, bottom)`
- Compute **inner radii** by reducing each corner per adjacent side widths (clamp ≥ 0):
  - TL: `(max(0, rx_o - left), max(0, ry_o - top))`
  - TR: `(max(0, rx_o - right), max(0, ry_o - top))`
  - BR: `(max(0, rx_o - right), max(0, ry_o - bottom))`
  - BL: `(max(0, rx_o - left), max(0, ry_o - bottom))`
- Fill ring: `SkCanvas::drawDRRect(outer, inner, paint)`.

**CSS equivalent:** `border-style: solid; border-radius: ...; border-width: ...` (per-side widths).

---

### 2) Dashed & Dotted Strokes

Solid fills can't express dash/dot patterns; use **path stroking** with clipping to the stroke band.

#### Steps

1. **Path construction**

   - Build a **centerline path** around the rectangle:
     - For each side, the centerline lies at `side_offset = side_width / 2` from the outer edge.
     - Include **corner arcs** for rounded corners.
   - If widths differ per side, treat each side as an **independent open segment** between its corner arcs.

2. **Dash effect**

   - Apply a dash PathEffect (SVG semantics):
     - Normalize intervals: if odd length → duplicate once.
     - Preserve zeros; classify `[0, g]` as **invisible**; `[d, 0]` as **solid**.
     - `phase` ≈ `-stroke-dashoffset`.

3. **Clip to the stroke ring**

   - `clip(outer_rrect)` then `clip(inner_rrect, Difference)`.
   - Ensures dashes stay within the stroke band and corners remain clean.

4. **Caps & joins**

   - **Dashed:** `cap = Butt` (or `Square` for more CSS-like boxes).
   - **Dotted:** `cap = Round` with short “on” segments.
   - Joins are not visible if sides are treated as separate open segments; if stroking the full loop, use `join = Miter|Bevel`.

5. **Per-side painting**
   - With non-uniform widths or partial sides, stroke each side **independently** as an open path.
   - Optional: add tiny filled squares at joints to hide corner gaps (browser trick used in practice).

**CSS equivalent:** `border-style: dashed | dotted; border-radius: ...; border-width: ...`.

---

## Algorithm (Engine-Level)

```text
Input:
  rect (outer box), widths{t,r,b,l}, radii{tl,tr,br,bl}, color, dash{intervals, phase | none}

1) Build rr_outer = RRect(rect, radii)
2) Build inner rect = inset(rect, l, t, r, b)
3) Build rr_inner with radii reduced per adjacent widths (clamp ≥ 0)

If dash is None or intervals empty:
  drawDRRect(rr_outer, rr_inner, paint_fill(color))
  return

// dashed/dotted
clip(rr_outer); clipDiff(rr_inner)
for each side S in [top, right, bottom, left]:
  if widths[S] <= 0: continue
  path_S = open segment between corner arc tangency points on side S
  paint_S = stroke(width = widths[S], cap = Butt|Round, pathEffect = Dash(intervals, phase_mode))
  drawPath(path_S, paint_S)
```

**Phase mode**

- `per_side_reset = true` (closest to CSS dashed) → phase resets for each side.
- `continuous = true` → carry phase around the loop (marching-ants effect).

---

## Data Model

```ts
// Rectangular stroke configuration (CSS border equivalent)
interface RectangularStroke {
  widths: { top: f32; right: f32; bottom: f32; left: f32 };  // stroke-width per side
  radii:  { tl: (f32,f32); tr: (f32,f32); br: (f32,f32); bl: (f32,f32) };  // corner-radius
  color: Color;  // stroke color
  dash?: { intervals: f32[]; phase: f32; perSideReset?: bool };  // dash pattern
}

// CSS equivalents:
// widths → border-width: top right bottom left
// radii  → border-radius: tl tr br bl
// dash   → border-style: dashed / dotted
```

---

## Minimal Skia Reference (Rust / skia-safe)

```rust
pub fn draw_rectangular_stroke_min(
    canvas: &mut Canvas,
    rect: Rect,
    widths: StrokeWidths,  // per-side stroke widths
    radii: CornerRadii,
    color: Color4f,
    dash: Option<(&[f32], f32)>, // (intervals, phase)
) {
    let rr_outer = RRect::new_rect_radii(rect, &[radii.tl, radii.tr, radii.br, radii.bl]);
    let inner = Rect::new(
        rect.left + widths.left,
        rect.top + widths.top,
        rect.right - widths.right,
        rect.bottom - widths.bottom,
    );
    let rr_inner = RRect::new_rect_radii(inner, &[
        ((radii.tl.0 - widths.left).max(0.0),  (radii.tl.1 - widths.top).max(0.0)),
        ((radii.tr.0 - widths.right).max(0.0), (radii.tr.1 - widths.top).max(0.0)),
        ((radii.br.0 - widths.right).max(0.0), (radii.br.1 - widths.bottom).max(0.0)),
        ((radii.bl.0 - widths.left).max(0.0),  (radii.bl.1 - widths.bottom).max(0.0)),
    ]);

    // Solid
    if dash.is_none() || dash.unwrap().0.is_empty() {
        let mut paint = Paint::default();
        paint.set_anti_alias(true);
        paint.set_style(PaintStyle::Fill);
        paint.set_color4f(color, None);
        canvas.draw_drrect(rr_outer, rr_inner, &paint);
        return;
    }

    // Dashed/Dotted
    let (intervals_in, phase) = dash.unwrap();
    let mut intervals = intervals_in.to_vec();
    if intervals.len() % 2 == 1 { let c = intervals.clone(); intervals.extend_from_slice(&c); }

    canvas.save();
    canvas.clip_rrect(rr_outer, skia_safe::ClipOp::Intersect, true);
    canvas.clip_rrect(rr_inner, skia_safe::ClipOp::Difference, true);

    let mut stroke_side = |x0: f32, y0: f32, x1: f32, y1: f32, w: f32| {
        if w <= 0.0 || ((x0 - x1).abs() + (y0 - y1).abs()) < 1e-6 { return; }
        let mut path = Path::new();
        path.move_to((x0, y0));
        path.line_to((x1, y1));
        let mut paint = Paint::default();
        paint.set_anti_alias(true);
        paint.set_style(PaintStyle::Stroke);
        paint.set_stroke_width(w);
        paint.set_color4f(color, None);
        paint.set_stroke_cap(PaintCap::Butt); // Round for dotted
        if let Some(pe) = PathEffect::dash(&intervals, phase) { paint.set_path_effect(pe); }
        canvas.draw_path(&path, &paint);
    };

    let (x0, x1, y0, y1) = (rect.left, rect.right, rect.top, rect.bottom);
    let (tl, tr, br, bl) = (radii.tl, radii.tr, radii.br, radii.bl);

    // Top
    if widths.top > 0.0 { let y = y0 + widths.top * 0.5; stroke_side(x0 + tl.0, y, x1 - tr.0, y, widths.top); }
    // Right
    if widths.right > 0.0 { let x = x1 - widths.right * 0.5; stroke_side(x, y0 + tr.1, x, y1 - br.1, widths.right); }
    // Bottom
    if widths.bottom > 0.0 { let y = y1 - widths.bottom * 0.5; stroke_side(x1 - br.0, y, x0 + bl.0, y, widths.bottom); }
    // Left
    if widths.left > 0.0 { let x = x0 + widths.left * 0.5; stroke_side(x, y1 - bl.1, x, y0 + tl.1, widths.left); }

    canvas.restore();
}
```

---

## Design Summary

| Case                    | Technique                            | Skia Primitive             | CSS Equivalent           |
| ----------------------- | ------------------------------------ | -------------------------- | ------------------------ |
| Solid, uniform width    | Stroked rrect (or DRRect)            | `drawRRect`/`drawDRRect`   | `border: 2px solid`      |
| Solid, per-side width   | Fill ring                            | `drawDRRect(outer, inner)` | `border-width: 1px 2px`  |
| Dashed/Dotted, uniform  | Stroke centerline path + clip ring   | `strokePath` + `clip`      | `border: 2px dashed`     |
| Dashed/Dotted, per-side | Stroke per-side segments + clip ring | `strokePath` + `clip`      | Multi-side dashed border |

---

## References

- **Chromium Blink / BoxBorderPainter** — [Chromium Source](https://chromium.googlesource.com/chromium/blink/+/refs/heads/main/Source/core/paint/BoxBorderPainter.cpp)
- **Skia Canvas API** — [`SkCanvas::drawDRRect`](https://api.skia.org/classSkCanvas.html#ad7149e359d4d0cfd2ad708e905f0d8c6), [`SkCanvas::drawRRect`](https://api.skia.org/classSkCanvas.html#ab50290cf9da84da457652d73ea09c0f5), [`SkDashPathEffect`](https://api.skia.org/classSkDashPathEffect.html)
- **CSS Visual Formatting Model** — [MDN: `border`](https://developer.mozilla.org/en-US/docs/Web/CSS/border)
- **Skia in Blink** — [Skia paint pipeline overview](https://skia.org/docs/user/api/skpaint_overview/)
