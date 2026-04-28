---
title: "feTile: Source-Tile Selection and Subregion Chaining"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
  - filters
---

# `<feTile>`: Source-Tile Selection and Subregion Chaining

How Blink (and resvg/usvg) decide **which rectangle to repeat** and
**where to repeat it** when rendering `<feTile>`, with particular
attention to how the upstream primitive subregion travels from
`feFlood` → `feOffset` → `feTile` and what the spec says about each
hop's default subregion.

This is a focused companion to
[resources-and-effects.md](./resources-and-effects.md) — feTile is the
one primitive whose default subregion is **not** the union of its
inputs (spec §15.7) but a special-case carve-out, and that carve-out
is what makes the typical "feFlood + feTile" pattern render across the
whole filter region instead of degenerating to a single tile.

## Source files

```
# Blink (Chromium)
third_party/blink/renderer/platform/graphics/filters/
  fe_tile.{h,cc}
  fe_offset.{h,cc}
  filter_effect.{h,cc}
  filter.{h,cc}
  paint_filter_builder.{h,cc}
third_party/blink/renderer/core/svg/
  svg_filter_primitive_standard_attributes.cc   # the default-subregion logic

# Skia
include/effects/SkImageFilters.h                # ::Tile factory
src/effects/imagefilters/SkCropImageFilter.cpp  # ::Tile body (built from two crops)

# resvg / usvg
crates/usvg/src/parser/filter.rs                # resolve_primitive_region (default = filter region)
crates/resvg/src/filter/mod.rs                  # apply_inner, apply_offset, apply_tile
```

## 1. Spec model — source-tile vs target region

> Filter Effects 1 §17 (feTile) — "The 'feTile' filter effect fills the
> target rectangle with a repeated, tiled pattern of the input image."

Two rectangles, both expressed in filter user-space:

| Rect            | What it is                                                | Where it comes from                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source tile** | One unit of the pattern. Sampled and repeated infinitely. | The input primitive's **filter primitive subregion**. For `SourceGraphic`/`SourceAlpha`/etc. (i.e. any `kFilterEffectTypeSourceInput`) it is the **filter region** instead — those inputs have no declared subregion of their own.                                                                                                                                                                                                                               |
| **Target rect** | The rectangle filled by the tiled pattern.                | feTile's **own filter primitive subregion**. Per Filter Effects §15.7, x/y/width/height default to 0%/0%/100%/100% of an inherited region. The inherited region for feTile is **specifically the filter region**, _not_ the union of input subregions (this is the §15.7 special case for feTile — see [§3](#3-the-chained-default-subregion-the-trick-part)). When feTile declares its own x/y/w/h, those override per axis; otherwise it is the filter region. |

There is no separate "tile size" attribute. `feTile` does not have its
own `x`/`y`/`width`/`height` semantics that mean anything other than the
standard primitive-subregion attributes — they only affect the **target
rect**. The source-tile geometry is entirely derived from the chain.

## 2. Blink — the implementation

### 2.1 `FETile::CreateImageFilter`

`fe_tile.cc:44-56`:

```cpp
sk_sp<PaintFilter> FETile::CreateImageFilter() {
  sk_sp<PaintFilter> input(paint_filter_builder::Build(
      InputEffect(0), OperatingInterpolationSpace()));
  if (!input) return nullptr;
  gfx::RectF src_rect =
      GetFilter()->MapLocalRectToAbsoluteRect(GetSourceRect());
  gfx::RectF dst_rect =
      GetFilter()->MapLocalRectToAbsoluteRect(FilterPrimitiveSubregion());
  return sk_make_sp<TilePaintFilter>(gfx::RectFToSkRect(src_rect),
                                     gfx::RectFToSkRect(dst_rect),
                                     std::move(input));
}
```

That's all of it. Two rects, both lifted from filter user-space into
absolute (Skia) space via `MapLocalRectToAbsoluteRect` (a uniform scale,
[`filter.cc:57-59`](#)).

`GetSourceRect` (`fe_tile.cc:37-42`):

```cpp
gfx::RectF FETile::GetSourceRect() const {
  const FilterEffect* input = InputEffect(0);
  if (input->GetFilterEffectType() == kFilterEffectTypeSourceInput)
    return GetFilter()->FilterRegion();
  return input->FilterPrimitiveSubregion();
}
```

So **`src` = the producer's subregion** (the SVG-spec-declared
primitive-subregion field, _not_ the producer's painted bounds, _not_
its `MapEffect`-propagated rect). Carried verbatim through the chain.

`dst` = feTile's own subregion (whatever `FilterPrimitiveSubregion()`
returns after the `SetStandardAttributes` pass below).

### 2.2 `FETile::MapInputs`

`fe_tile.cc:33-35`:

```cpp
gfx::RectF FETile::MapInputs(const gfx::RectF& rect) const {
  return AbsoluteBounds();
}
```

Override — feTile **doesn't propagate** its input's rect. It claims its
absolute bounds (= `FilterPrimitiveSubregion()` ∩ filter region, lifted
to absolute). The base class `MapInputs` (filter_effect.cc:57-67)
unions input rects via `MapRect`; feTile short-circuits because the
output of a tile is independent of the spatial extent of the input —
the input is sampled and repeated to fill `AbsoluteBounds()`.

This matters for downstream primitives: the _paint rect_ propagated
through feTile to its consumer is feTile's own subregion. So a
`feTile → feGaussianBlur` chain blurs feTile's subregion box, not the
infinite tiled plane.

### 2.3 The default-subregion machinery (`SetStandardAttributes`)

`svg_filter_primitive_standard_attributes.cc:116-165` is where every
`fe*` element gets its `FilterPrimitiveSubregion` filled in. The
`DefaultFilterPrimitiveSubregion` helper (lines 116-141):

```cpp
static gfx::RectF DefaultFilterPrimitiveSubregion(FilterEffect* filter_effect) {
  // <feTurbulence>, <feFlood> and <feImage> don't have input effects, so use
  // the filter region as default subregion. <feTile> does have an input
  // reference, but due to its function (and special-cases) its default
  // resolves to the filter region.
  if (filter_effect->GetFilterEffectType() == kFilterEffectTypeTile ||
      !filter_effect->NumberOfEffectInputs())
    return filter_effect->GetFilter()->FilterRegion();

  // "x, y, width and height default to the union (i.e., tightest fitting
  // bounding box) of the subregions defined for all referenced nodes."
  gfx::RectF subregion_union;
  for (const auto& input_effect : filter_effect->InputEffects()) {
    // "If ... one or more of the referenced nodes is a standard input
    // ... the default subregion is 0%, 0%, 100%, 100%, where as a
    // special-case the percentages are relative to the dimensions of the
    // filter region..."
    if (input_effect->GetFilterEffectType() == kFilterEffectTypeSourceInput)
      return filter_effect->GetFilter()->FilterRegion();
    subregion_union.Union(input_effect->FilterPrimitiveSubregion());
  }
  return subregion_union;
}
```

Then x/y/width/height each override only when explicitly specified
(lines 155-162):

```cpp
gfx::RectF subregion = DefaultFilterPrimitiveSubregion(filter_effect);
gfx::RectF primitive_boundaries = ResolveRectangle(...);
if (x()->IsSpecified())      subregion.set_x(primitive_boundaries.x());
if (y()->IsSpecified())      subregion.set_y(primitive_boundaries.y());
if (width()->IsSpecified())  subregion.set_width(primitive_boundaries.width());
if (height()->IsSpecified()) subregion.set_height(primitive_boundaries.height());
filter_effect->SetFilterPrimitiveSubregion(subregion);
```

That's the full subregion-chaining behaviour. Three rules to remember:

1. If the primitive **has no input effects** (`feFlood`, `feImage`,
   `feTurbulence`) → default = filter region.
2. If the primitive **is `feTile`** → default = filter region (by
   special case).
3. Otherwise → default = union of input subregions, but **collapses
   to filter region** the moment any input is `SourceGraphic` /
   `SourceAlpha` / `BackgroundImage` / `BackgroundAlpha` / `FillPaint` /
   `StrokePaint` (any `kFilterEffectTypeSourceInput`).

Specified x/y/w/h then override per axis on top of the default.

## 3. The chained-default subregion (the trick part)

For the `simple-case` fixture:

```svg
<filter id="filter1">              <!-- filterUnits=userSpaceOnUse implied because of x/y on rect -->
  <feFlood flood-color="seagreen" x="28" y="28" width="10" height="10"/>
  <feOffset dx="5" dy="5"/>
  <feTile/>
</filter>
<rect x="40" y="40" width="120" height="120" filter="url(#filter1)"/>
```

…with the default filter-region attributes (`-10% / -10% / 120% / 120%`
of the rect's bbox = (28, 28, 144, 144)), Blink's
`SetStandardAttributes` walks the chain and produces:

| Primitive  | DefaultSubregion(...)                                                               | x/y/w/h overrides   | Final `FilterPrimitiveSubregion` |
| ---------- | ----------------------------------------------------------------------------------- | ------------------- | -------------------------------- |
| `feFlood`  | filter region (no inputs)                                                           | x=28 y=28 w=10 h=10 | **(28, 28, 10, 10)**             |
| `feOffset` | union of inputs = `feFlood.FilterPrimitiveSubregion()` = (28, 28, 10, 10)           | none                | **(28, 28, 10, 10)**             |
| `feTile`   | filter region — **special case** (Tile branch in `DefaultFilterPrimitiveSubregion`) | none                | **(28, 28, 144, 144)**           |

Then `FETile::CreateImageFilter`:

- `src = GetSourceRect()` = `feOffset.FilterPrimitiveSubregion()` = **(28, 28, 10, 10)**
- `dst = FilterPrimitiveSubregion()` = **(28, 28, 144, 144)**

That's what makes the (28, 28, 10, 10) cell tile across the entire
filter region, even though feOffset never had an explicit subregion.
Without the §15.7 carve-out for `kFilterEffectTypeTile`, feTile would
inherit (28, 28, 10, 10) from its input-union default and the output
would be a single 10×10 cell.

So the choice the spec makes — feTile being special-cased so its `dst`
is the filter region rather than the union-of-inputs default — is what
makes the typical author intent ("repeat my flood across the entire
filter region") work without explicit subregions. feOffset _does_
propagate its input's subregion unchanged via the union default; the
offset's `dx/dy` shifts paint pixels, not the spec-declared subregion
field.

## 4. feOffset subregion propagation

`fe_offset.cc:53-58`:

```cpp
gfx::RectF FEOffset::MapEffect(const gfx::RectF& rect) const {
  gfx::RectF result = rect;
  result.Offset(GetFilter()->ApplyHorizontalScale(dx_),
                GetFilter()->ApplyVerticalScale(dy_));
  return result;
}
```

`MapEffect` shifts the _paint rect_ by (dx, dy) — this is the
absolute-bounds propagation used during filter dirty/region calculation.
It is **not** what feeds into `FilterPrimitiveSubregion()`.

The `SetFilterPrimitiveSubregion` field on the offset is set during
parsing by `SetStandardAttributes` and reflects only the SVG-declared
attributes (default = input union, with x/y/w/h overrides). That field
is what downstream `feTile` reads via `GetSourceRect` → `input->FilterPrimitiveSubregion()`.

So feOffset's _primitive subregion_ is its input's subregion (when no
explicit attrs) — **not shifted**. The shift happens on the pixel data
through `OffsetPaintFilter` at Skia level. The `FETile::GetSourceRect`
reading is independent of dx/dy.

This is intentional. The "tile" you sample is still the same logical
input region; the offset filter has already biased the pixel data inside
that region, and Skia's `Tile` resamples those biased pixels.

`fe_offset.cc:60-69` builds the Skia filter:

```cpp
sk_sp<PaintFilter> FEOffset::CreateImageFilter() {
  Filter* filter = GetFilter();
  std::optional<PaintFilter::CropRect> crop_rect = GetCropRect();
  return sk_make_sp<OffsetPaintFilter>(
      SkFloatToScalar(filter->ApplyHorizontalScale(dx_)),
      SkFloatToScalar(filter->ApplyVerticalScale(dy_)),
      paint_filter_builder::Build(InputEffect(0), OperatingInterpolationSpace()),
      base::OptionalToPtr(crop_rect));
}
```

`GetCropRect` (`filter_effect.cc:144-163`) is `FilterPrimitiveSubregion()`
intersected with `FilterRegion()`, mapped to absolute. So at Skia level
the offset is wrapped in a crop = (28, 28, 10, 10) (the input-inherited
subregion). The pixel image fed to the tile's `src` sampling is "seagreen
at (33, 33, 10, 10)" but cropped to (28, 28, 10, 10) → in practice a
5×5 corner of seagreen at (33, 33)–(38, 38), transparent elsewhere
within (28, 28)–(38, 38).

## 5. Worked example — `simple-case` end-to-end

Filter region (default `-10%/-10%/120%/120%` of rect (40,40,120,120)) =
**(28, 28, 144, 144)** in user-space.

### Spec-declared subregions (from §3 above)

| Primitive  | `FilterPrimitiveSubregion` |
| ---------- | -------------------------- |
| `feFlood`  | (28, 28, 10, 10)           |
| `feOffset` | (28, 28, 10, 10)           |
| `feTile`   | (28, 28, 144, 144)         |

### Skia paint-filter graph Blink emits

```
TilePaintFilter
  src = (28, 28, 10, 10)      // feOffset.FilterPrimitiveSubregion()
  dst = (28, 28, 144, 144)    // feTile.FilterPrimitiveSubregion()
  input =
    OffsetPaintFilter
      dx = 5, dy = 5
      crop = (28, 28, 10, 10)  // feOffset.GetCropRect()
      input =
        ShaderPaintFilter
          shader = solid seagreen
          crop   = (28, 28, 10, 10)  // feFlood.GetCropRect()
```

### What Skia does at raster time

`SkImageFilters::Tile(src, dst, input)` is implemented as
`Crop(dst, kDecal, Crop(src, kRepeat, input))`
(`SkCropImageFilter.cpp:114-122`):

1. Sample `input` over the absolute plane. The offset filter shifts the
   flood by (5, 5), but its own crop rect (28, 28, 10, 10) clips back to
   the original tile cell — final pixel data is seagreen in (33, 33)–(38, 38),
   transparent in the rest of (28, 28)–(38, 38), and undefined / empty
   outside that.
2. `Crop(src=(28,28,10,10), kRepeat, …)` turns that 10×10 tile into an
   infinite repeating pattern: a single seagreen 5×5 square per 10×10
   cell, offset to the bottom-right of each cell.
3. `Crop(dst=(28,28,144,144), kDecal, …)` clips the infinite plane to
   the filter region.

Result: a 14.4×14.4-cell grid, each cell containing a 5×5 seagreen
square in its bottom-right corner, exactly as `simple-case.png` shows.

### What goes wrong without §15.7 chaining

A naive implementation that defaults every primitive's subregion to
the filter region (rather than the union-of-inputs) would produce:

```
Tile(src = (28, 28, 144, 144), dst = (28, 28, 144, 144), input = Offset(... crop=(28,28,144,144)))
```

`src == dst == filter region` makes the tile a no-op crop — one copy of
the input within the filter region — so the visible output is the
single offsetted flood at (33, 33, 10, 10) with no repetition.

Two things have to be right to get the spec result: spec-correct
default-subregion chaining (feOffset's empty subregion must inherit
from feFlood, not from the filter region), and a special case for
feTile's own default (filter region, regardless of inputs).

## 6. usvg / resvg approach

usvg's parser does **not** implement §15.7 default-subregion chaining at
all. `resolve_primitive_region`
(`crates/usvg/src/parser/filter.rs:382-417`) defaults every primitive's
subregion to the **filter region** unconditionally, with `feFlood` /
`feImage` getting the bbox-mapped default in `objectBoundingBox` units.
This is acknowledged with a `// TODO: rewrite/simplify/explain/whatever`.

The renderer (`crates/resvg/src/filter/mod.rs:357-514`) then patches
some of this back in at draw time:

```rust
// `feOffset` inherits its region from the input.
if let usvg::filter::Kind::Offset(fe) = primitive.kind() {
    if let usvg::filter::Input::Reference(name) = fe.input() {
        if let Some(res) = results.iter().rev().find(|v| v.name == *name) {
            subregion = res.image.region;
        }
    }
}
```

Note this is **only when the input is a named reference** — for the
default `Previous` / `SourceGraphic` it falls back to the parser's
filter-region default. So resvg's "feOffset inherits from input"
override is actually quite narrow.

`apply_tile` (`mod.rs:830-852`) renders the tile manually in
tiny-skia rather than via an image-filter graph:

```rust
fn apply_tile(input: Image, region: IntRect) -> Result<Image, Error> {
    let subregion = input.region.translate(-region.x(), -region.y()).unwrap();
    let tile_pixmap = input.image.copy_region(subregion)?;
    let mut paint = tiny_skia::Paint::default();
    paint.shader = tiny_skia::Pattern::new(
        tile_pixmap.as_ref(),
        tiny_skia::SpreadMode::Repeat,
        tiny_skia::FilterQuality::Bicubic,
        1.0,
        tiny_skia::Transform::from_translate(subregion.x() as f32, subregion.y() as f32),
    );
    let mut pixmap = tiny_skia::Pixmap::try_create(region.width(), region.height())?;
    let rect = tiny_skia::Rect::from_xywh(0.0, 0.0, region.width() as f32, region.height() as f32).unwrap();
    pixmap.fill_rect(rect, &paint, tiny_skia::Transform::identity(), None);
    Ok(Image::from_image(pixmap, ...))
}
```

`input.region` here is the upstream primitive's resolved subregion (in
absolute pixels), shifted into the filter pixmap's local coords. The
copy-region carves the tile, the `SpreadMode::Repeat` pattern tiles it,
and the fill paints the entire filter region.

Two divergences from Blink worth flagging:

1. **`region` is the filter region**, not feTile's own subregion —
   resvg ignores feTile's primitive-subregion x/y/w/h attributes for
   the dst. Blink uses `FilterPrimitiveSubregion()` (which defaults to
   filter region but is overridable per axis).
2. **`feOffset` resets its `Image.region`** to the full pixmap on
   `apply_offset` (`mod.rs:661-686`) — `Image::from_image` sets
   `region = (0, 0, w, h)`. So if `feTile`'s input is `Previous` (the
   common case), `input.region` becomes the entire filter region, and
   the tile cell becomes the whole filter pixmap → resvg degenerates to
   a single tile in this case. (Confirmed by checking `with-subregion-*`
   fixtures: resvg only handles tile correctly when the upstream
   subregion is preserved through named references, not `Previous`.)

In short: resvg gets it right when authors are explicit (named results,
declared subregions); it degenerates when authors lean on defaults.
Blink is the cleaner reference.

## 7. Skia API semantics

`SkImageFilters::Tile(const SkRect& src, const SkRect& dst, sk_sp<SkImageFilter> input)`
(`include/effects/SkImageFilters.h:488-495`).

> @param src Defines the pixels to tile
> @param dst Defines the pixel region that the tiles will be drawn to
> @param input The input that will be tiled, if null the source bitmap is used instead.

Implementation in `src/effects/imagefilters/SkCropImageFilter.cpp:114-122`:

```cpp
sk_sp<SkImageFilter> SkImageFilters::Tile(const SkRect& src,
                                          const SkRect& dst,
                                          sk_sp<SkImageFilter> input) {
    // The Tile filter is simply a crop to 'src' with a kRepeat tile mode wrapped in a crop to 'dst'
    // with a kDecal tile mode.
    sk_sp<SkImageFilter> filter = SkImageFilters::Crop(src, SkTileMode::kRepeat, std::move(input));
    filter = SkImageFilters::Crop(dst, SkTileMode::kDecal, std::move(filter));
    return filter;
}
```

So `Tile` is sugar for two crops:

- Inner: `Crop(src, kRepeat, input)` — outside of `src`, sample `input`
  as if `src` were tiled infinitely in both axes (i.e. the pixel at
  `(x, y)` maps to `(src.x + (x - src.x) mod src.w, src.y + (y - src.y) mod src.h)`
  inside `src`).
- Outer: `Crop(dst, kDecal, …)` — pixels outside `dst` are transparent.

Mental model: `src` is the **tile cell coordinates in the input's
coordinate system**, and `dst` is the **destination clip in the output's
coordinate system**. Both coordinates live in the same Skia abstract
space (`MapLocalRectToAbsoluteRect`-mapped from filter user-space in
Blink's pipeline).

The input is sampled across the entire infinite plane via `kRepeat`;
the input pixels outside `src` are _unused_ even if the input filter
produces non-trivial pixels there — `Crop(src, kRepeat, …)` first clips
the input to `src` then synthesizes neighbours by repetition. Anything
the input produces outside `src` is discarded. This is why Blink can
afford a sloppy crop on the offset filter: the tile's `src` re-clips it.

`skia-safe`'s wrapper: `image_filters::tile(src, dst, input) -> Option<ImageFilter>`
(`skia-safe-0.91.0/src/effects/image_filters.rs:537-546`). No `crop_rect`
parameter — the two args _are_ the crops.

## 8. Summary table

| Question                                                              | Answer                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does feTile have its own x/y/w/h subregion attrs?                     | Yes — the standard primitive-subregion attrs apply, defaulting to 0/0/100%/100% **of the filter region** (special case in §15.7, not the union-of-inputs default).                                              |
| What's the **source** rect for the tile?                              | The input's `FilterPrimitiveSubregion` (or filter region if the input is a `kFilterEffectTypeSourceInput`).                                                                                                     |
| What's the **target** rect?                                           | feTile's own `FilterPrimitiveSubregion` (defaults to filter region by special case).                                                                                                                            |
| Does `dx/dy` on feOffset shift its `FilterPrimitiveSubregion`?        | **No.** It shifts the paint pixels (`MapEffect` and `OffsetPaintFilter`) but the spec-declared subregion field is unchanged.                                                                                    |
| Does feOffset propagate its input's subregion?                        | Yes — `SetStandardAttributes` defaults its subregion to the union of input subregions (= just the input's subregion, when there's one input).                                                                   |
| What does Blink pass to `SkImageFilters::Tile`?                       | `src = MapLocalRectToAbsoluteRect(input.FilterPrimitiveSubregion)`; `dst = MapLocalRectToAbsoluteRect(this.FilterPrimitiveSubregion)`.                                                                          |
| Is `src` the rect to sample for one tile, and `dst` the rect to fill? | Yes. `Tile = Crop(src, kRepeat) ∘ Crop(dst, kDecal)`.                                                                                                                                                           |
| Does usvg/resvg implement the §15.7 default-subregion union?          | No — it defaults to the filter region for every primitive (with `// TODO`). Renderer patches a narrow case for `feOffset` with a named input reference. Otherwise it has the same bug we have on `simple-case`. |

## See also

- [resources-and-effects.md](./resources-and-effects.md) — the broader
  `<filter>` resource graph and how primitives are stitched into a
  single image-filter chain.
- [comparison.md](./comparison.md) — Blink vs Servo vs resvg for SVG
  rendering at large.
