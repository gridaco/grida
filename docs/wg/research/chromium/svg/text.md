---
title: "Chromium SVG Text"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Text

SVG text is the most intricate part of SVG rendering because it combines:

- HTML-style inline layout (line breaking, text shaping, font metrics).
- SVG per-character positioning (`x`, `y`, `dx`, `dy`, `rotate` — all can
  be space-separated lists addressing individual code points).
- Text anchoring (`text-anchor: start | middle | end`).
- Text on path (`<textPath>`).
- Length adjustment (`textLength` + `lengthAdjust`).

Blink's approach is **two-phase layout**:

1. Run the HTML inline layout engine (LayoutNG) to produce glyph runs as if
   the text were laid out horizontally.
2. Run `SvgTextLayoutAlgorithm` to rewrite per-glyph positions according to
   SVG's per-character addressing model.

## Class hierarchy

```
LayoutSVGBlock
  └── LayoutSVGText              <text> — the block container for SVG text

LayoutInline
  └── LayoutSVGInline            <tspan>, <textPath>
        └── (tree of tspans)

LayoutText
  └── LayoutSVGInlineText        text runs inside the above
```

`LayoutSVGText` extends `LayoutSVGBlock`, which in turn reuses LayoutNG's
inline layout primitives (`NGInlineNode`, `NGFragmentItems`). This lets SVG
text benefit from all the HTML text shaping, font selection, and line-break
infrastructure for free.

```cpp
// third_party/blink/renderer/core/layout/svg/layout_svg_text.h
class LayoutSVGText final : public LayoutSVGBlock {
 public:
  explicit LayoutSVGText(Element* element);
  void SubtreeStructureChanged(LayoutInvalidationReasonForTracing);
  void SetNeedsPositioningValuesUpdate();
  void SetNeedsTextMetricsUpdate();
  static LayoutSVGText* LocateLayoutSVGTextAncestor(LayoutObject*);
};
```

## `SvgTextLayoutAlgorithm`

After LayoutNG produces the horizontal layout, Blink runs a separate pass
that walks the resulting `FragmentItems` and rewrites glyph positions:

```cpp
// third_party/blink/renderer/core/layout/svg/svg_text_layout_algorithm.h
class SvgTextLayoutAlgorithm {
 public:
  PhysicalSize Layout(const String& ifc_text_content,
                      FragmentItemsBuilder::ItemWithOffsetList& items);

 private:
  void AdjustPositionsDxDy(…);
  void ApplyTextLengthAttribute(…);
  void AdjustPositionsXY(…);
  void ApplyAnchoring(…);
  void PositionOnPath(…);

  struct SvgPerCharacterInfo {
    std::optional<float> x, y, rotate;
    bool hidden = false;
    bool middle = false;
    float inline_size = 0.0f;
    float length_adjust_scale = 1.0f;
    // …
  };
  Vector<SvgPerCharacterInfo> result_;
};
```

### Phases

Blink's phase ordering roughly matches the SVG 1.1 text layout spec:

1. **Set up** — build the per-character info vector from the laid-out
   fragments. Each "addressable" character (non-surrogate, not in a
   `<textPath>`-gap, etc.) gets an index.
2. **AdjustPositionsDxDy** — apply per-character relative offsets from the
   `dx` / `dy` attribute lists, which cascade from containing `<text>` and
   `<tspan>` elements.
3. **ApplyTextLengthAttribute** — if `textLength` is set, compute a per-
   character scale (`lengthAdjust="spacing"`) or a per-glyph x-scale
   (`lengthAdjust="spacingAndGlyphs"`) so the total width matches.
4. **AdjustPositionsXY** — apply absolute per-character positions from the
   `x` / `y` attribute lists. If a character doesn't have an explicit x or
   y, it inherits the previous character's position + its advance.
5. **ApplyAnchoring** — shift runs by the `text-anchor` of their container:
   `start` (no-op), `middle` (shift by −width/2), `end` (shift by −width).
   Anchoring is applied per-anchored-chunk (a run that ends before the
   next explicit x/y or the end of the text).
6. **PositionOnPath** — for text inside `<textPath>`, walk the referenced
   path, compute cumulative arc length, and map each glyph's x position
   to a (point, tangent) on the path. Each glyph is then translated to
   the point and rotated to match the tangent. If a glyph runs past the
   end of the path, it is hidden.

The result vector `result_` replaces the fragments' original positions.

## Text-on-path

`<textPath href="#path-id">` attaches text to a path. Implementation points:

- The referenced `<path>`'s geometry is retrieved as a `Path` (same one used
  for rendering).
- Blink uses `PathPositionMapper` (or an internal equivalent) to convert
  arc-length → `(point, tangent_angle)`.
- Each glyph's **center** (not left edge) is placed at its arc-length
  position along the path, then rotated by the tangent angle.
- `startOffset` shifts the starting arc length.
- `path` attribute on `<textPath>` (SVG 2) provides inline path data
  without requiring a separate `<path>`.

Hidden glyphs: if a glyph extends past the path's end, it's marked `hidden`
and skipped during paint. Similarly for reversed paths under
`side="right"` (SVG 2).

## `<tspan>` cascade

`x`, `y`, `dx`, `dy`, `rotate` on a `<tspan>` (or on the outer `<text>`)
are **lists** — one entry per addressable character. The first N characters
of the `<tspan>` consume the first N entries; subsequent characters have no
explicit position for this attribute and fall back to the parent's list or
to "continue from previous character's advance."

## Painting

`SVGTextPainter` consumes the adjusted `FragmentItems`. Each glyph run
becomes a Skia `DrawTextBlob` with the computed transform (translate +
rotate). Per-glyph rotation (from `rotate` attribute or `textPath` tangent)
may require splitting a run into single-glyph blobs.

Fill and stroke obey the same paint-order and paint-server machinery as
shapes — `<text fill="url(#grad)">` resolves through
[paint-servers.md](./paint-servers.md).

## Why this differs from HTML text

- HTML text uses inline layout positions exclusively; SVG adds a per-
  character positioning layer on top.
- HTML text has no per-glyph rotation; SVG has `rotate` and `textPath`
  tangents.
- HTML text-anchor is `text-align`; SVG's `text-anchor` is applied per
  anchored chunk, not per line.
- HTML text does not support length adjustment; SVG's `textLength` stretches
  or compresses glyphs.

For standalone SVG text renderers (like usvg), the text layout is
typically **baked into outline paths at parse time**, erasing the
distinction between text and shape geometry — see
[comparison.md](./comparison.md#text-handling-strategies).

## Source files

| File                                          | Role                                               |
| --------------------------------------------- | -------------------------------------------------- |
| `core/layout/svg/layout_svg_text.h`           | `<text>` container                                 |
| `core/layout/svg/layout_svg_inline.h`         | `<tspan>`, `<textPath>`                            |
| `core/layout/svg/layout_svg_inline_text.h`    | Text runs                                          |
| `core/layout/svg/svg_text_layout_algorithm.h` | Per-character positioning pass                     |
| `core/layout/svg/svg_text_content_element.h`  | `textLength`, `lengthAdjust` support               |
| `core/layout/svg/layout_svg_text_path.h`      | `<textPath>` mapping                               |
| `core/paint/svg_text_painter.cc`              | Glyph paint recording                              |
| `platform/graphics/path.h`                    | `PathPositionMapper` (arc-length parameterization) |
