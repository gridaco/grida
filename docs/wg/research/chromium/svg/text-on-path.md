---
title: "Chromium SVG Text on Path"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
---

# Chromium SVG Text on Path

How `<textPath>` is laid out and painted in Blink, with side-by-side notes on
how resvg/usvg solves the same problem and what Skia primitives are
available in `skia-safe`. Sister doc to [text.md](./text.md), which covers
the broader two-phase SVG text layout.

## Scope

In scope:

- Per-glyph position and rotation along an arbitrary path.
- `href` / `path` / `startOffset` / `side` / `method` / `spacing` attributes.
- Interaction with `text-anchor`, `<text>`-level x/y/dx/dy, and `<tspan>`.
- Drawing emission (CTM concat per glyph + standard text-blob).
- Edge cases: glyph past path end, multiple contours, missing href,
  closed paths, content before/after `<textPath>`.

Out of scope (covered elsewhere):

- The setup phases (DxDy / TextLength / XY / Anchoring) — see
  [text.md](./text.md). This doc only describes how `PositionOnPath` runs
  after them and what state it inherits.
- Shaping, BiDi, font fallback — Blink defers those to LayoutNG, usvg
  defers to rustybuzz; shaped glyph runs are treated as input.

## Source files

### Chromium (Blink)

| File                                                    | Role                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `core/svg/svg_text_path_element.{h,cc}`                 | DOM element. Owns `startOffset` (animated length), `method` (align/stretch enum), `spacing` (auto/exact enum), `path` (animated path data) |
| `core/layout/svg/layout_svg_text_path.{h,cc}`           | Layout object. Owns `LayoutPath()` (resolves href / inline path) and the `PathPositionMapper` class.                                       |
| `core/layout/svg/svg_text_layout_attributes_builder.cc` | Marks `anchored_chunk` at first char of textPath; suppresses x/y from cascade in the path-following axis; pushes `text_path_range_list_`.  |
| `core/layout/svg/svg_text_layout_algorithm.cc`          | The `PositionOnPath()` phase (lines 604-817). Runs after DxDy / TextLength / XY / Anchoring.                                               |
| `core/layout/inline/fragment_item.cc`                   | `BuildSvgTransformForTextPath()` — the per-glyph affine that paints rotate around the baseline center.                                     |
| `core/paint/text_fragment_painter.cc`                   | Per-fragment `ConcatCTM` + standard text-blob draw (line 456 onward).                                                                      |
| `platform/geometry/path.{h,cc}`                         | `Path::PointAndNormalAtLength()`, `Path::length()`, `Path::PositionCalculator` (sequential mapper). Wraps `SkPathMeasure`.                 |

### usvg / resvg (vendored at `third_party/usvg/`)

| File                                                  | Role                                                                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/parser/text.rs`                                  | `resolve_text_flow()` resolves `<textPath href>` to a kurbo/tiny-skia path; resolves `startOffset` (length or %); produces `TextFlow::Path`. |
| `src/text/layout.rs::resolve_clusters_positions_path` | Per-cluster placement loop: takes (point, tangent) from `collect_normals` and writes `cluster.transform`.                                    |
| `src/text/layout.rs::collect_normals`                 | Walks the path segment-by-segment, converts each to a `kurbo::CubicBez`, accumulates arc length, calls `inv_arclen()` per glyph offset.      |
| `src/text/layout.rs::process_anchor`                  | Pre-bakes `text-anchor` into the start offset before walking the path.                                                                       |

### Skia bindings (in skia-safe)

| File                                    | Role                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `skia-safe/src/core/contour_measure.rs` | `ContourMeasure::pos_tan(distance)` returns `Option<(Point, Vector)>`. `length()`, `is_closed()`. |
| `skia-safe/src/core/path_measure.rs`    | Older single-contour `PathMeasure` wrapper.                                                       |

## Architecture overview

Blink's textPath implementation lives entirely inside the SVG-text post-pass
(`SvgTextLayoutAlgorithm::PositionOnPath`), the last of six layout phases.
By the time this phase runs, every addressable character has a candidate
`(x, y)` and `inline_size` from the linear layout — the path pass simply
**reinterprets that x as an arc-length offset** along the path, and rewrites
both position and rotation. There is no separate path-aware shaping; glyphs
keep their original advances, font, kerning, and so on.

usvg makes the same choice. It runs `resolve_clusters_positions_linear()`
first to lay clusters out as if the path were a straight line, then
`resolve_clusters_positions_path()` rewrites each cluster's transform with
`pre_translate(x, y)` + `pre_rotate_at(angle, half_width, 0)`. After this,
the renderer doesn't know or care that a path was ever involved — it just
draws clusters at their (now-curved) transforms.

The arc-length parameterization is the only nontrivial geometry. Blink
delegates it to `SkPathMeasure` (wrapped as `Path::PositionCalculator`);
usvg open-codes it with kurbo (`CubicBez::arclen` / `inv_arclen`) because
tiny-skia-path has no `SkPathMeasure` equivalent.

## Pipeline (Blink's PositionOnPath)

By the time the path phase runs, `result_[i]` for each addressable character
holds the linearly-laid-out `(x, y)`, the shaped `inline_size`, an optional
per-character `rotate` (from the `rotate=` attribute), and an `anchored_chunk`
flag. `text_path_range_list_` maps each `<textPath>` element to a
`(start_index, end_index)` range over `result_`.

The numbered steps below mirror the spec's [Position on path procedure][spec],
keeping the spec's variable names where Blink does.

[spec]: https://svgwg.org/svg2-draft/text.html#TextLayoutAlgorithm

### Step 0 — Prep done in earlier phases

`SvgTextLayoutAttributesBuilder::Build` (lines 244-356) does three things
that matter for textPath:

1. **Open `<textPath>`** → `first_char_in_text_path = true`,
   `in_text_path = true`, `text_path_start = addressable_index`.
2. **Per character inside a textPath**:
   - `data.anchored_chunk = true` for the first character (always).
   - In horizontal writing mode, **`y` from any ancestor `<text>`/`<tspan>`
     x/y list is dropped** (`data.y = SvgCharacterData::EmptyValue()`); in
     vertical, `x` is dropped. The first character also gets `x = 0` (or
     `y = 0` in vertical) so that subsequent `dx`/anchor math has a known
     baseline.
3. **Close `<textPath>`** → push `(textPath layout obj, start, end)` into
   `text_path_range_list_`. Sets `first_char_in_text_path = false`.

In `ApplyAnchoring` (line 499 onward), Blink also clamps each anchored
chunk's range so it does **not cross a textPath boundary** (line 527). This
matters because `<text>` content following a `</textPath>` is treated as
its own anchored chunk and laid out with `path_end_x`/`path_end_y` shifts.

### Step 1 — Iterate addressable characters

```cpp
// svg_text_layout_algorithm.cc:626
for (unsigned index = 0; index < result_.size(); ++index) {
  auto& info = result_[index];
  if (range_index < ranges.size() &&
      index >= ranges[range_index].start_index &&
      index <= ranges[range_index].end_index) {
    // ... character is INSIDE a textPath ...
  } else if (in_path) {
    // ... character just EXITED a textPath ...
  }
}
```

State carried across iterations:

- `range_index` — index into `text_path_range_list_`.
- `in_path` / `after_path` — boolean flags driving the post-textPath shift.
- `path_end_x` / `path_end_y` — accumulated offset to apply to characters
  that follow a `</textPath>` until the next anchored chunk.
- `path_mapper` — current `PathPositionMapper`, lazily created when
  entering a new textPath range.

### Step 2 — Inside a textPath: compute mid arc length

```cpp
// 670
const float char_offset = IsHorizontal()  ? *info.x
                          : IsVerticalDownward() ? *info.y
                                                 : -*info.y;
const float mid =
    (char_offset + info.inline_size / 2) / scaling_factor + offset;
```

`offset` is `path_mapper->StartOffset()` (`<textPath startOffset>` resolved
to user units). `char_offset` is the x position the linear-layout phases
produced for this glyph — so `text-anchor: middle` already moved the chunk
by `-width/2` and that shift now lives inside `char_offset`.

`(char_offset + inline_size/2)` is the **arc-length position of the glyph's
center**, not its left edge. Adding `offset` (startOffset) gives the
absolute distance along the path.

### Step 3 — Map mid → (point, tangent)

```cpp
// 695
PointAndTangent point_tangent;
PathPositionMapper::PositionType position_type =
    path_mapper->PointAndNormalAtLength(mid, point_tangent);
if (position_type != PathPositionMapper::kOnPath) {
  info.hidden = true;
}
```

`PathPositionMapper::PointAndNormalAtLength` (`layout_svg_text_path.cc:39`)
returns one of `kOnPath` / `kBeforePath` / `kAfterPath`. Anything but
`kOnPath` marks the glyph hidden.

The mapper is a thin wrapper over `Path::PositionCalculator` which itself
wraps `SkPathMeasure`. The calculator caches `accumulated_length_` and
the underlying `path_measure_` so sequential lookups (the common case —
glyphs march forward along the path) are O(amortized 1) per glyph; only
backwards lookups force a `setPath` reset.

### Step 4 — Combine path tangent with per-character rotate

```cpp
// 701
point_tangent.tangent_in_degrees += info.rotate.value_or(0.0f);
if (IsVerticalDownward()) {
  point_tangent.tangent_in_degrees -= 90;
} else if (IsVerticalUpward()) {
  point_tangent.tangent_in_degrees += 90;
}
info.rotate = point_tangent.tangent_in_degrees;
```

The `<text rotate="...">` per-character supplemental rotation is **added** to
the path tangent; vertical writing-modes get a constant ±90° offset baked
into `info.rotate`.

### Step 5 — Write back position

The hot path (when total rotation is nonzero):

```cpp
// 727 — non-axis-aligned path tangent
info.baseline_shift = IsHorizontal()  ? *info.y
                      : IsVerticalDownward() ? *info.x
                                             : -*info.x;
info.x = point_tangent.point.x() * scaling_factor;
info.y = point_tangent.point.y() * scaling_factor;
```

Two things to notice:

1. `info.x/y` are set to the **point on the path**, not the glyph's
   eventual top-left. The glyph's `inline_size/2` recentering and the
   `baseline_shift` are deferred to the painter via
   `BuildSvgTransformForTextPath` (see [Drawing](#drawing) below).
2. `baseline_shift` captures whatever was in the original `info.y` (the
   inline-layout baseline shift from `dominant-baseline`, `dy`, etc.) so
   the painter can re-apply it perpendicular to the path tangent.

The cold axis-aligned path (when `info.rotate == 0`) bakes the
`-inline_size/2` into `info.x` directly so that no transform is needed at
paint time:

```cpp
// 708
if (IsHorizontal()) {
  info.x = point_tangent.point.x() * scaling_factor - info.inline_size / 2;
  info.y = point_tangent.point.y() * scaling_factor + *info.y;
}
```

### Step 6 — Exiting a textPath: compute path_end shift

When the loop visits a character whose index is past the end of the current
textPath range, Blink switches to `after_path` mode (lines 749-797). It
samples the **endpoint** of the path:

```cpp
// 766
path_mapper->PointAndNormalAtLength(path_mapper->length(), point_tangent);
path_end_x = ClampTo<float>(point_tangent.point.x() * scaling_factor - *info.x);
path_end_y = ClampTo<float>(point_tangent.point.y() * scaling_factor - *info.y);
```

`(path_end_x, path_end_y)` is then added to `result_[index].(x,y)` for
every following character until an anchored chunk boundary (lines 800-810).
This is the SVG 2 behavior where text after `</textPath>` "continues from
the path's end point" rather than from the last glyph's advance — see the
illustration before [TextRenderingOrder][textorder] in the spec. The
comment in the source explicitly notes this differs from legacy WebKit
behavior and affects the `textOnPath`/`textOnPath2` reftests in the Batik
suite.

[textorder]: https://svgwg.org/svg2-draft/text.html#TextRenderingOrder

### Step 7 — Middle-cluster glyphs

For multi-glyph clusters (e.g. ligatures), only the first glyph (`!middle`)
is positioned via the path; subsequent middle glyphs inherit the previous
glyph's `x`, `y`, and `rotate` (lines 738-744). usvg does the same thing
implicitly — clusters are always indivisible in its model, so the question
doesn't arise.

## Per-glyph placement formula

For a horizontal-mode glyph `i` in a textPath:

```
let advance_i  = result_[i].inline_size                         // shaped advance
let x_linear_i = result_[i].x                                   // from anchored chunk
let offset     = path_mapper.start_offset                       // <textPath startOffset>
let mid_i      = (x_linear_i + advance_i / 2) / scale + offset  // arc-length, glyph center

let (P_i, θ_i) = path.point_and_tangent_at_arc_length(mid_i)    // P in user units
                                                                 // θ in degrees
let φ_i        = θ_i + result_[i].rotate                        // + per-char rotate
```

Position written to `result_[i]`:

```
result_[i].x = P_i.x * scale
result_[i].y = P_i.y * scale
result_[i].baseline_shift = original_y          // saved for paint-time
result_[i].rotate = φ_i
```

The transform applied at paint time around the glyph's anchor `(x, y)`:

```
T  =  translate(P_i)
   *  rotate(φ_i)
   *  translate(-advance_i / 2, baseline_shift)   // recenter + reapply shift
```

So the **point on the path is the glyph's baseline center** (horizontal:
on the baseline, halfway across the advance). For vertical writing modes
the recenter axis flips and `baseline_shift` lives on the other axis, but
the structure is identical.

`text-anchor` is fully baked into `x_linear_i` by the earlier `ApplyAnchoring`
phase — the path phase does not look at `text-anchor` directly. So
`text-anchor: middle` on `<textPath>` works because the chunk's combined
width was centered around 0 before the path walk began, and `startOffset`
then shifts the centered window along the path.

## Path resolution

`LayoutSVGTextPath::LayoutPath()` (in `layout_svg_text_path.cc:65`) is the
single source of truth for "what path is walked along":

```
1. If the SVG 2 `path=` attribute is enabled and non-empty:
     path = svg_text_path.path()->CurrentValue()->GetStylePath()->GetPath();
     author_path_length = NaN  // no pathLength attribute applies inline
2. Else, resolve href (xlink:href or href, both work):
     target = SVGURIReference::TargetElementFromIRIString(href, scope);
     if target is not <path>: return nullptr
     path_data = target->AsMutablePath();
     // Apply the referenced <path>'s `transform` attribute:
     path_data.Transform(target->CalculateTransform(kIncludeMotionTransform));
     path = path_data.Finalize();
     author_path_length = target->AuthorPathLength();  // <path pathLength>
3. computed_path_length = path.length()
   offset_scale = computed_path_length / author_path_length  (if author)
                  else 1
4. Resolve startOffset:
     start_offset = svg_text_path.startOffset()
         ->CurrentValue()->Value(conversion_data, author_path_length);
     start_offset *= offset_scale
5. return PathPositionMapper(path, computed_path_length, start_offset)
```

Notes:

- The referenced `<path>`'s own `transform=` attribute **applies** to the
  text path (line 103). So `<text><textPath href="#p"/></text>` with
  `<path id="p" transform="rotate(45)" .../>` actually rotates the text
  path's geometry — even though the `<path>` element itself isn't
  rendered.
- `pathLength` on the referenced `<path>` rescales `startOffset` so that
  if the author claims the path is 100 units but it's actually 250,
  `startOffset="50"` advances 125 user units along the geometric path.
- `startOffset` accepts user-units (`50`), percentage (`50%` of
  `author_path_length`, or `computed_path_length` if no `pathLength`), or
  the keywords `start` / `middle` / `end` per CSS Values level 4 — but
  Blink's SVG length parser only handles numeric+unit, so the keywords
  are not supported here and resolve to 0. (Major browsers agree.)
- `<textPath>` may reference any element resolvable by `SVGURIReference`,
  but Blink's `LayoutPath` rejects anything that isn't a `<path>`. The
  spec allows other basic-shape elements (`<rect>`, `<circle>`, …) but
  Blink does not yet — the comment on line 87 makes the limitation
  explicit. usvg has the same limitation (`super::shapes::convert` only
  handles paths in `resolve_text_flow`).
- `<textPath>` cannot be nested. Both Blink's attribute builder
  (line 284 comment) and usvg's parser (`text.rs:187` — child of
  non-`<text>` parent is dropped) enforce this.

### `side` attribute

Blink **does not implement** `side="right"` (comment on line 653 of the
algorithm: `// ==> We don't support 'side' attribute yet.`). The
`SVGTextPathSideType` enum exists in IDL for completeness, but the path
is never reversed.

usvg also does not implement it (no `AId::Side` reference in
`parser/text.rs`; the parsed attribute is simply discarded).

The spec semantics are: reverse the entire path data before walking.
There's no per-glyph flip — glyphs go on the "other side" because they
follow the reversed tangent, which is rotated 180°.

### `method` and `spacing` attributes

`method="align"` (default) is what is described above — glyphs keep
their advances and the path determines position+rotation.

`method="stretch"` is supposed to interpolate glyph positions so the chunk
fills the path. Blink reads the attribute (`SVGTextPathMethodType` enum)
but `PositionOnPath` never branches on it — it's effectively unimplemented.

`spacing="auto"` vs `"exact"` similarly is parsed (`SVGTextPathSpacingType`)
but ignored. usvg ignores both.

## Edge cases

### Glyphs past the path end

The mapper returns `kBeforePath` if `mid < 0` (only possible with negative
`startOffset`) and `kAfterPath` if `mid > path_length`. Either way, Blink
sets `info.hidden = true` and the painter skips the glyph
(`SetSvgFragmentData(..., info.hidden)` at line 869). The glyph still
exists in the layout tree (so query APIs return it) but contributes no
pixels and no decoration.

usvg does the equivalent: `cluster.visible = false` for glyphs whose
offset doesn't fall within any segment's arc-length range
(`layout.rs:642-647` and the trailing fill loop at line 837).

### Multiple contours (`M ... M ...`)

`SkPathMeasure::nextContour()` advances to the next contour; Blink's
`CalculatePointAndNormalOnPath` (`path.cc:248`) walks contours sequentially
and treats the path as a single conceptual arc-length sequence — the
**total length is the sum of contour lengths**, with no gap between
contours. Glyphs that fall in the second contour by arc-length get
positioned on the second contour's geometry.

usvg's `collect_normals` walks segments of the single tiny-skia path with
the same accumulated-length pattern and gets the same behavior.

### Closed subpath text-anchor handling

The spec defines special hidden-glyph rules for closed paths under
different `(text-anchor, direction)` combinations (5.1.2.9 in the spec).
Blink's comment at line 690 says: `==> Major browsers don't support the
special handling for closed paths.` and skips it entirely.

### Zero-length path / empty path / missing href

`LayoutPath()` returns `nullptr`. In the algorithm, when `path_mapper` is
null, every glyph in the textPath range is marked `hidden`
(line 648-650), and the post-path `path_end` shift falls back to
"continue from the last drawn character's advance" rather than from the
path endpoint (lines 772-797). usvg does the same — `resolve_text_flow`
returns `None` and the parser drops the `<textPath>` and all its
descendants from the layout entirely (so usvg renders nothing for the
range, vs. Blink which still walks the range to compute `path_end`).

### Content before/after `<textPath>` inside the same `<text>`

Per spec, text outside the `<textPath>` is laid out normally, not on the
path. Blink confirms this: the path range only covers
`[start_index, end_index]`, and the iteration at `index = end_index + 1`
falls into the `else` branch (`!in textPath range`) and runs the
`after_path` shift logic.

The trailing shift means that following text positions itself relative to
the path's endpoint (not the last glyph's right edge). This is the SVG 2
behavior. To turn this off for the test corpus where Batik-style
"continue from last glyph" is expected, the algorithm has a fallback
branch (line 772) that activates only if `path_mapper` is null.

### `text-anchor` interaction

Anchoring runs **before** the path walk and clamps anchored-chunk ranges
to not cross textPath boundaries (line 527 of `ApplyAnchoring`). So:

- `text-anchor: middle` on `<text>` outside the textPath → only affects
  pre-textPath and post-textPath text.
- `text-anchor: middle` on `<text>`/`<tspan>` inside the textPath →
  centers the chunk's combined width around 0, then `startOffset` shifts
  along the path.
- `text-anchor` is anchored at `result_[i].x = 0` for the first character
  in a textPath (because the attribute builder sets it explicitly,
  line 334). So even with `text-anchor: end`, the chunk anchors at
  arc-length `startOffset` — the anchor only moves which **end** of the
  chunk is at that arc-length.

### `<text>` x/y/dx/dy attribute lists

In horizontal mode, the **y** list is suppressed for characters inside a
textPath (`SvgCharacterData` strips `y` at line 343). dy is still applied
(adds to the original y), and that y becomes `info.baseline_shift` in the
path phase, which the painter re-applies perpendicular to the tangent.
So `<textPath><tspan dy="5">x</tspan></textPath>` lifts the glyph 5 user
units **off** the path.

The **x** list and **dx** list are **applied** in horizontal mode — they
extend the linearly-laid-out x, which the path phase then interprets as
arc-length offset. So `<textPath><tspan dx="10">x</tspan></textPath>`
moves `x` 10 units further along the path.

Vertical writing mode is symmetric (x/y swap roles).

### `<tspan>` inside `<textPath>`

Subdivides spans for fill/stroke/font/baseline-shift purposes, but does
not subdivide the path walk — the path walk operates on the combined
`addressable_index` range of the entire `<textPath>`. Within that range,
each span retains its own paint attributes for the per-glyph draw.

## Drawing

After `SvgTextLayoutAlgorithm` writes positions back into the
`FragmentItems`, painting goes through the standard text fragment painter
with one extra step: the **per-fragment CTM concat**.

In `text_fragment_painter.cc` (line 446-463):

```cpp
if (svg_inline_text) {
  TextPainter::SvgTextPaintState& svg_state = ...;
  if (scaling_factor != 1.0f) {
    state_saver.SaveIfNeeded();
    context.Scale(1 / scaling_factor, 1 / scaling_factor);
    svg_state.EnsureShaderTransform().Scale(scaling_factor);
  }
  if (text_item.HasSvgTransformForPaint()) {
    state_saver.SaveIfNeeded();
    const auto fragment_transform = text_item.BuildSvgTransformForPaint();
    context.ConcatCTM(fragment_transform);
    svg_state.EnsureShaderTransform().PostConcat(fragment_transform.Inverse());
  }
}
```

`HasSvgTransformForPaint()` is true whenever the fragment has a non-zero
`angle`, a non-1 length-adjust scale, or `in_text_path == true`. So:

- **Horizontal text on path with non-axis-aligned tangent** → CTM concat
  with `BuildSvgTransformForTextPath` (translates to point, rotates,
  recenters around glyph center, applies baseline shift).
- **Horizontal text on path with axis-aligned tangent** → no transform
  (Blink baked the recenter into `info.x` in step 5's cold path).
- **Linear text with `rotate=` on a glyph** → CTM concat with
  `BuildSvgTransformForBoundingBox` (translates to baseline, rotates,
  un-translates).

`BuildSvgTransformForTextPath` from `fragment_item.cc:694`:

```
transform = identity
transform.Rotate(svg_data.angle)               // path tangent + rotate=
let (x, y) = (rect.x, rect.y)                  // info.x/y from layout = point on path
y += font_metrics.ascent(baseline)             // move from x-height to baseline
transform.Translate(-rect.width/2, baseline_shift)  // recenter, re-apply dy
transform.PreConcat(length_adjust)             // textLength scaling
transform.SetE(transform.E + x)                // |
transform.SetF(transform.F + y)                // | translate-rotate-translate-back
transform.Translate(-x, -y)                    // |  pivot = point on baseline
return transform
```

The resulting matrix when composed with the standard text-blob
draw-at-(rect.x, rect.y) places the glyph correctly. Note that the
**rotation pivot is the point on the baseline** (the spec center, after
ascent adjustment), which is what the SVG 2 spec mandates ("the center
of the baseline").

After CTM concat, glyphs are drawn through Blink's standard `TextPainter`
path — no per-glyph splitting, no special blob construction. Each
**fragment** is a single text-blob; if a single textPath contains multiple
fragments (typically one per glyph due to per-glyph rotation), each gets
its own save/concat/draw/restore.

### Text decoration on textPath

Blink's `TextDecorationPainter` is called from the same fragment loop and
inherits the same CTM. So underlines/overlines/line-throughs on a
textPath glyph become straight horizontal segments in the **rotated**
glyph local space — they appear as small tangent-aligned segments under
each glyph rather than a single curved line. This matches Firefox.

usvg explicitly disables decoration aggregation on textPath glyphs
(`cluster.has_relative_shift = true` at `layout.rs:651`) so each glyph
gets its own decoration segment instead of one continuous line — same
visible behavior.

### `<textPath>` with paint servers

A `url(#grad)` fill on textPath text is rendered with the gradient
**oriented in the original (pre-rotation) text local space**. This is why
`EnsureShaderTransform().PostConcat(fragment_transform.Inverse())` is
called — the shader is generated in pre-rotation space and the inverse
keeps it stable while the glyph rotates around it. So a horizontal
gradient stays horizontal across the path's curve, not curving with it.

## usvg's approach

`resolve_clusters_positions_path` (`layout.rs:615`) is much simpler than
Blink's algorithm because everything is pre-baked at parse time:

```rust
let chunk_offset = match writing_mode {
    WritingMode::LeftToRight => chunk.x.unwrap_or(0.0),
    WritingMode::TopToBottom => chunk.y.unwrap_or(0.0),
};
let start_offset = chunk_offset
    + path.start_offset
    + process_anchor(chunk.anchor, clusters_length(clusters));

let normals = collect_normals(text, chunk, clusters, &path.path,
                              char_offset, start_offset);
for (cluster, normal) in clusters.iter_mut().zip(normals) {
    let (x, y, angle) = match normal {
        Some(normal) => (normal.x, normal.y, normal.angle),
        None => { cluster.visible = false; continue; }
    };
    let half_width = cluster.width / 2.0;
    cluster.transform = Transform::default();
    cluster.transform = cluster.transform.pre_translate(x - half_width, y);
    cluster.transform = cluster.transform.pre_rotate_at(angle, half_width, 0.0);
    // ... apply dy + baseline_shift + rotate= + lengthAdjust ...
}
```

Two observations worth borrowing:

1. **`process_anchor` is pre-baked into `start_offset`.** No anchoring
   runs after path walk. usvg computes `clusters_length(clusters)` (the
   sum of cluster advances), then shifts the start offset by 0 / -w/2 / -w
   for start/middle/end anchor. This is equivalent to Blink's pre-anchor
   then add to char_offset, but flatter — one pass instead of two phases
   that have to coordinate.
2. **The transform is built explicitly with `pre_rotate_at(angle,
half_width, 0)`.** No deferred painter-side computation. The cluster's
   `transform` field IS the final glyph-local-to-user-space matrix.

### Arc-length without `SkPathMeasure`

`collect_normals` (`layout.rs:713`) doesn't use any arc-length API from
tiny-skia-path (which has none). Instead it walks segments and converts
each to a kurbo `CubicBez`:

- `LineTo(p)` → degree-elevate to a cubic via `eval(0.33)` / `eval(0.66)`.
- `QuadTo(p1, p)` → `kurbo::QuadBez::raise()` to cubic.
- `CubicTo(...)` → direct.
- `Close` → degree-elevate the closing line.

For each cubic, it uses `kurbo::CubicBez::arclen(accuracy)` to compute the
segment's arc length and accumulates a running total. For each glyph
offset that falls within `[length, length + curve_len]`, it uses
`CubicBez::inv_arclen(offset - length, accuracy)` to get the parameter
`t ∈ [0, 1]`, then `eval(t)` and `deriv().eval(t)` to get position and
tangent.

The accuracy is scaled by the text's transform scale:

```rust
let arclen_accuracy = base_arclen_accuracy / (sx * sy).sqrt().max(1.0);
```

This is a clever heuristic — when the text is drawn at large scale, the
arc-length integration needs more precision because pixel-level errors
become visible.

The algorithm is **single-pass linear in glyph count** (assuming offsets
are monotonically increasing, which they are when laying out a single
chunk left-to-right). The two state variables `length` (cumulative arc
length) and `prev_x/prev_y` (current pen position) carry across segments.

Catch: if a glyph's offset falls **before** the current `length` (e.g.
because of a negative `dx` reversing direction), the inner loop just
skips it — it never falls into the `if *offset >= length && *offset <=
length + curve_len` branch. The trailing `for _ in 0..(offsets.len() -
normals.len())` push-None loop catches any unresolved normals, marking
them as hidden. So negative dx within a textPath silently hides the
glyph in usvg, where Blink would still place it (because Blink's
`Path::PositionCalculator` rewinds when `length < accumulated_length_`).

## Skia API for arc-length parameterization

In `skia-safe`, arc-length lives in `core::contour_measure`. The Rust API
mirrors `SkContourMeasure` / `SkContourMeasureIter` (the modern
multi-contour API; `SkPathMeasure` is the older single-contour wrapper).

```rust
use skia_safe::{ContourMeasureIter, ContourMeasure, Point, Vector};

let iter = ContourMeasureIter::new(&path, /* force_closed */ false, /* res_scale */ None);
for contour in iter {                     // each contour = one moveTo subpath
    let len: f32 = contour.length();
    if let Some((point, tangent)) = contour.pos_tan(distance_within_contour) {
        // point: Point in path-local user units
        // tangent: Vector (unit-length 2D direction)
    }
    let is_closed: bool = contour.is_closed();
    if let Some(matrix) = contour.get_matrix(distance, MatrixFlags::GET_POS_AND_TAN) {
        // returns the 3x3 affine that translates (0,0) to point and
        // rotates +x onto the tangent — the full glyph-local-to-user
        // matrix in one call.
    }
}
```

API mapping:

| Operation                               | API                                                   |
| --------------------------------------- | ----------------------------------------------------- |
| Total path length (sum of contours)     | iterate, sum `contour.length()`                       |
| Position + tangent at arc-length `s`    | walk contours, find one containing `s`, `pos_tan(s')` |
| Multiple contours (`M ... M ...`)       | `ContourMeasureIter` yields one `ContourMeasure` each |
| Position-only (faster)                  | `get_matrix(s, MatrixFlags::GET_POSITION)`            |
| Closed path detection                   | `contour.is_closed()`                                 |
| Sub-path extraction (e.g. for stroking) | `contour.segment(start, stop, with_move_to)`          |

`pos_tan` returns `Option<(Point, Vector)>` because the underlying Skia
call returns false if the contour is empty or the distance is out of
range. Tangent is **unit-length** (verified in Skia source); the angle
is `tangent.y.atan2(tangent.x)`.

`force_closed = false` matches Blink's call (`SkPathMeasure measure(path_,
false)` at `path.cc:235`). Setting it to true would force the last
contour to close before measuring — useful for SVG stroking but wrong for
text on path.

For sequential glyph access (the common case), a `Path::
PositionCalculator`-equivalent stateful wrapper avoids paying O(N) per
glyph when walking forward. There's no ready-made one in `skia-safe`,
but a thin wrapper around `ContourMeasureIter` that materializes
contours lazily and keeps a `(current_contour, current_contour_start)`
state suffices.

## See also

- [text.md](./text.md) — the broader two-phase SVG text layout, dx/dy/x/y
  cascading, text-anchor, `SvgTextLayoutAlgorithm` overview.
- [path-geometry.md](./path-geometry.md) — how `<path d=>` becomes the
  `Path` (`SkPath`) walked along.
- [coordinate-systems.md](./coordinate-systems.md) — for `pathLength`
  rescaling rationale and how user/local units interact.
- SVG 2 spec [text layout algorithm](https://svgwg.org/svg2-draft/text.html#TextLayoutAlgorithm) —
  the spec text Blink's PositionOnPath comments cite verbatim.
