---
title: "feImage with internal element references"
tags:
  - internal
  - research
  - chromium
  - rendering
  - svg
  - filters
  - feImage
---

# `<feImage>` with internal element references

How Chromium/Blink and resvg/usvg implement `<feImage xlink:href="#elementId">` —
the case where the filter primitive's source is _another SVG element in the
same document_ rather than an externally-loaded raster image. The spec
says to render the referenced element as if it were the only thing in the
document and use the resulting paint as the primitive's output.

## Scope

This doc covers:

- The spec model (Filter Effects 1 §15.21, SVG 2 §6.10).
- Blink's `FEImage` two-mode design (external raster vs. internal LayoutObject).
- `FEImage::CreateImageFilterForLayoutObject` — the Skia-recording path.
- usvg/resvg's "bake the referenced subtree into a pseudo-image" approach.
- The skia-safe APIs that mirror Blink's recording path (`PictureRecorder`,
  `image_filters::picture`).
- A worked walkthrough of the `link-to-an-element` fixture.

It does **not** cover: external `<image>` href fetching, `data:` URI
decoding, or `SVGImage`-as-container-size mechanics (Blink's
`SVGImageForContainer` — relevant only when the href targets a _different_
SVG document).

## Source files

### Blink (`~/Documents/GitHub/chromium`)

| File                                                                       | Purpose                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `third_party/blink/renderer/core/svg/svg_fe_image_element.{h,cc,idl}`      | DOM element, href observation, builds `FEImage`                       |
| `third_party/blink/renderer/core/svg/graphics/filters/svg_fe_image.{h,cc}` | `FEImage` filter effect, both image- and element-backed variants      |
| `third_party/blink/renderer/core/paint/svg_object_painter.{h,cc}`          | `PaintResourceSubtree` — repaints any LayoutObject into a record      |
| `third_party/blink/renderer/platform/graphics/paint/paint_recorder.h`      | `cc::PaintCanvas` recorder used by `CreateImageFilterForLayoutObject` |
| `third_party/blink/renderer/platform/graphics/paint/record_paint_filter.h` | `RecordPaintFilter` — wraps a `PaintRecord` as a `cc::PaintFilter`    |

### resvg / usvg

| File                                                          | Purpose                                                                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `third_party/usvg/src/parser/filter.rs` (this repo, vendored) | `convert_image_inner` — recursively converts the href target into a `Group` baked into the filter primitive |
| `third_party/usvg/src/tree/filter.rs`                         | `filter::Image { root: Group }` data model — primitive owns the rendered subtree                            |
| `~/Documents/GitHub/resvg/crates/resvg/src/filter/mod.rs:854` | `apply_image` — rasterizes the baked `Group` into a `tiny_skia::Pixmap` per filter invocation               |

### Spec

- Filter Effects Module 1 §15.21 (`feImage`):
  https://drafts.fxtf.org/filter-effects-1/#feImageElement
- SVG 2 §6.10 (filters): https://svgwg.org/svg2-draft/filters.html

### skia-safe

- `skia_safe::PictureRecorder` (`core/picture_recorder.rs`) — start/stop a
  recorder, returns an `SkPicture`.
- `skia_safe::image_filters::picture(pic, target_rect)` — wraps an `SkPicture`
  as an `ImageFilter`. Defined in `skia-safe-0.93.1/src/effects/image_filters.rs:476-487`.

## Spec model

### Output of `feImage`

Per Filter Effects 1 §15.21:

> The `feImage` filter primitive fetches image data from an external source
> and provides the pixel data as output (meaning if the external source is an
> SVG image, it is rasterized).

Two source flavors:

1. **External image** (raster bitmap, or external SVG document loaded as an
   image): rasterized at the primitive's subregion size, then placed into the
   subregion using `preserveAspectRatio`.
2. **Internal element reference** (`href="#someId"` resolves to an element
   in the _same_ document): the referenced element is rendered as if it were
   the only thing in the document, and the resulting paint becomes the primitive's
   output. Its position is the element's natural user-space coordinates,
   _not_ fitted into the primitive subregion via `preserveAspectRatio` —
   `preserveAspectRatio` does not apply to internal references.

The "natural" size and position of the internal-ref output is determined by
the referenced element's geometry in the same coordinate space as the filtered
element — i.e. user space. A `<rect x="36" y="36" width="120" height="120">`
referenced by `feImage` produces an image at `(36,36)` of size `120×120`,
regardless of the `feImage`'s `x`/`y`/`width`/`height` attributes (subject
only to crop-to-subregion at compose time).

### Failure / fallback

> A href reference that is an empty image (zero width or zero height), that
> fails to download, is non-existent, or that cannot be displayed (e.g.
> because it is not in a supported image format) fills the filter primitive
> subregion with transparent black.

Cyclic references (an element whose paint walk would re-enter the same
`<filter>`) are handled by the host's general SVG resource cycle detection,
not by `FEImage` itself. In Blink, `SVGResource::FindCycle` (called once per
client-resource pair, cached on `SVGResourceClient::ResourceClientEntry`) is
the gate. See `third_party/blink/renderer/core/svg/svg_resource.cc:140-148`.

### `preserveAspectRatio`

For external images, `preserveAspectRatio` selects between letterboxing modes
when fitting the image's intrinsic dimensions into `(x, y, width, height)` of
the primitive — see `FEImage::CreateImageFilter` at lines 263-271, which calls
`preserve_aspect_ratio_->TransformRect(dst_rect, src_rect)`.

For **internal element refs**, `preserveAspectRatio` is ignored — the
referenced element keeps its own coordinates. Blink reflects this: in
`CreateImageFilterForLayoutObject` no `preserveAspectRatio` math runs;
instead, the rect mapping is purely the element's repaint rect intersected
with the primitive's crop rect.

## Blink's internal-reference path

### Element binding (DOM side)

`SVGFEImageElement::BuildPendingResource` (svg_fe_image_element.cc:103-120)
classifies the href on every change:

```cpp
Element* target = ObserveTarget(target_id_observer_, *this);
if (!target) {
  if (!SVGURLReferenceResolver(HrefString(), GetDocument()).IsLocal())
    FetchImageResource();   // external URL → ImageResourceContent
} else if (auto* svg_element = DynamicTo<SVGElement>(target)) {
  AddReferenceTo(svg_element);  // local SVG element → live dependency edge
}
```

So either `cached_image_` (external image bytes) is populated, or the target
is registered as a dependency (no image bytes; resolved live during build).
`Build` (line 170-181) chooses which `FEImage` constructor to invoke:

```cpp
FilterEffect* SVGFEImageElement::Build(SVGFilterBuilder*, Filter* filter) {
  if (cached_image_) {
    scoped_refptr<Image> image =
        cached_image_->ErrorOccurred() ? nullptr : cached_image_->GetImage();
    return MakeGarbageCollected<FEImage>(filter, image, ...);
  }
  return MakeGarbageCollected<FEImage>(filter, TargetElement(), ...);
}
```

`TargetElement()` (lines 163-168) re-resolves `xlink:href` on every call —
the cached `target_id_observer_` is for _invalidation_, not for storage.

### `FEImage::CreateImageFilter` dispatch

`FEImage::CreateImageFilter` (svg_fe_image.cc:247-278) is the entry point
called by the filter graph builder. It branches first on
`ReferencedLayoutObject()`:

```cpp
sk_sp<PaintFilter> FEImage::CreateImageFilter() {
  gfx::RectF crop_rect    = gfx::SkRectToRectF(GetCropRect().value_or({}));
  gfx::RectF dst_rect     = GetFilter()->MapLocalRectToAbsoluteRect(
                                FilterPrimitiveSubregion());
  if (const auto* layout_object = ReferencedLayoutObject()) {
    return CreateImageFilterForLayoutObject(*layout_object, dst_rect, crop_rect);
  }
  // … else: external image path or transparent-black fallback …
}
```

`ReferencedLayoutObject()` walks `element_` (held as `Member<const SVGElement>`)
to its `LayoutObject*` — `nullptr` if the element is unrendered (e.g. inside
`<defs>` with no resolved layout, or genuinely missing).

### `CreateImageFilterForLayoutObject` (the key function)

Lines 222-245:

```cpp
sk_sp<PaintFilter> FEImage::CreateImageFilterForLayoutObject(
    const LayoutObject& layout_object,
    const gfx::RectF& dst_rect,
    const gfx::RectF& crop_rect) {
  const AffineTransform transform =
      SourceToDestinationTransform(layout_object, dst_rect);
  const gfx::RectF src_rect =
      transform.MapRect(GetLayoutObjectRepaintRect(layout_object));
  // Intersect with the (transformed) source rect to remove "empty" bits.
  const gfx::RectF cull_rect = gfx::IntersectRects(crop_rect, src_rect);

  PaintRecorder paint_recorder;
  cc::PaintCanvas* canvas = paint_recorder.beginRecording();
  canvas->concat(transform.ToSkM44());
  {
    PaintRecordBuilder builder;
    SVGObjectPainter(layout_object, nullptr)
        .PaintResourceSubtree(builder.Context());
    builder.EndRecording(*canvas);
  }
  return sk_make_sp<RecordPaintFilter>(
      paint_recorder.finishRecordingAsPicture(),
      gfx::RectFToSkRect(cull_rect));
}
```

Walking through:

1. **`SourceToDestinationTransform`** (lines 142-159) builds an affine that
   maps from the element's local SVG coordinate space into the primitive
   subregion's absolute space. For elements without viewport-percentage
   geometry this collapses to `Translate(dst_rect.origin) * Scale(filter_scale)` —
   essentially "scale by the device pixel ratio and shift to where the
   filtered element sits in absolute coords."
2. **`GetLayoutObjectRepaintRect`** (lines 118-122) pulls the element's
   `VisualRectInLocalSVGCoordinates`, mapped through its
   `LocalToSVGParentTransform` — the bounding box of where the element
   _would_ paint. For a `<rect x=36 y=36 width=120 height=120>`, this is
   `(36, 36, 120, 120)` in the parent's space.
3. **`PaintRecorder`** — creates a `cc::PaintCanvas` that records into a
   `cc::PaintOpBuffer` instead of rasterizing immediately. This is Blink's
   answer to "I need to paint the subtree into something I can later feed
   back as image data."
4. **`SVGObjectPainter::PaintResourceSubtree`** (svg_object_painter.cc:86-95):

   ```cpp
   PaintInfo info(context, CullRect::Infinite(), PaintPhase::kForeground,
                  layout_object_.ChildPaintBlockedByDisplayLock(),
                  PaintFlag::kOmitCompositingInfo |
                      PaintFlag::kPaintingResourceSubtree | additional_flags);
   layout_object_.Paint(info);
   ```

   This invokes the same `Paint()` that runs on the main paint walk, with
   `kPaintingResourceSubtree` set so painters know to skip live-only effects
   (composited transforms, viewport painting, hit-test items, etc.) and
   `CullRect::Infinite()` so nothing is culled.

5. **`RecordPaintFilter`** wraps the resulting picture into a `PaintFilter`
   with the cull rect as its drawable region. This is structurally identical
   to Skia's `SkImageFilters::Picture(picture, target_rect)` — `RecordPaintFilter`
   is Blink's `cc::PaintFilter` analog that compiles down to a Skia
   `SkImageFilter` of the same shape.

### Cycle detection

Cycle detection lives in `SVGResource::FindCycle` and `LayoutSVGResourceContainer::FindCycle`,
keyed on the _client → resource_ pair. By the time `FEImage::CreateImageFilter`
runs, the surrounding filter has already been confirmed non-cyclic at resource
build time. The filter graph builder also caps depth via `kMaxCountChildNodes`.

`feImage` itself doesn't add an extra layer of cycle protection — Blink trusts
the resource cycle gate and the LayoutObject's own paint walk. If you write
a `<filter id="f"><feImage href="#a"/></filter>` and `<rect id="a" filter="url(#f)"/>`,
Blink's resource cycle check refuses to apply the filter.

### Subtree fidelity

`PaintResourceSubtree` paints the _entire subtree_ under the referenced
LayoutObject — a `<g>` reference paints all children (including their own
`filter`/`mask`/`clip-path` resources, gradients, patterns, text, images, etc.).
This is "free" because it reuses the production paint walk verbatim.

The captured PaintRecord includes:

- All shape paint ops with their fill/stroke shaders pre-resolved.
- Nested `save_layer` ops for masks/filters/opacity/clip-path.
- Text glyph runs (already shaped).
- `<image>` ops (with the image already decoded, since the image's paint walk
  records a `DrawImage` op).

Hidden containers (`<defs>` with no rendered descendant) paint nothing because
`SVGHiddenContainer` returns early from `Paint`.

### Viewport-dependent edge case

`SourceToDestinationTransform` has special handling when the referenced
element has `HasViewportDependence()` (e.g. `<rect width="50%">`): it
re-scales by `target_size / viewport_size` so the percentage geometry maps
to the primitive subregion size rather than the document viewport. This is
gated behind a runtime feature `SvgFeImageSkipHiddenContainerViewportDependence`
that fixes a quirk where hidden containers (gradients/patterns inside `<defs>`)
were spuriously triggering this rescaling path. We can ignore this at v1 —
the relevant fixtures don't use viewport-percentage geometry.

## usvg / resvg's approach

usvg and Blink diverge significantly. Instead of recording the subtree at
filter-build time, usvg **bakes the referenced element into the filter
primitive at parse time** — the converted `filter::Image` carries its own
`Group` subtree as data.

`third_party/usvg/src/parser/filter.rs:821-855`:

```rust
fn convert_image_inner(fe: SvgNode, filter_subregion: NonZeroRect, ...) -> Option<Kind> {
    if let Some(node) = fe.try_attribute::<SvgNode>(AId::Href) {
        // Internal element reference path.
        let mut state = state.clone();
        state.fe_image_link = true;
        let mut root = Group::empty();
        super::converter::convert_element(node, &state, cache, &mut root);
        return if root.has_children() {
            root.calculate_bounding_boxes();
            // … flatten id of single-child group …
            Some(Kind::Image(Image { root }))
        } else {
            None
        };
    }
    // … external href path …
}
```

The `state.fe_image_link = true` flag tells the converter that we're inside
a feImage subtree — used by the converter to suppress further filter
applications on the baked subtree (avoiding infinite expansion when an
element with a filter is referenced).

At render time, resvg's `apply_image`
(`crates/resvg/src/filter/mod.rs:854-882`) just rasterizes that pre-built
`Group`:

```rust
fn apply_image(fe: &usvg::filter::Image, region: IntRect, subregion: IntRect,
               ts: usvg::Transform) -> Result<Image, Error> {
    let mut pixmap = tiny_skia::Pixmap::try_create(region.width(), region.height())?;
    let (sx, sy) = ts.get_scale();
    let transform = tiny_skia::Transform::from_row(
        sx, 0.0, 0.0, sy, subregion.x() as f32, subregion.y() as f32);
    let ctx = crate::render::Context { /* ... */ };
    crate::render::render_nodes(fe.root(), &ctx, transform, &mut pixmap.as_mut());
    Ok(Image::from_image(pixmap, ColorInterpolation::SRGB))
}
```

Implications of usvg's approach:

- **Eager copy at parse time**: the referenced subtree is _cloned_ into the
  filter primitive. If the original element is mutated (animations, JS), the
  baked copy doesn't track it. usvg is a static SVG processor, so this is
  fine; for a live editor it would be wrong.
- **No live cycle detection at render time**: the cycle is broken by the
  parse-time `fe_image_link` flag suppressing filters on the baked clone.
- **One pixmap per filter invocation**: the rasterization happens per filter
  application, so identical feImages on different elements re-rasterize.
  resvg has no Picture caching.
- **Hits external image path uniformly**: resvg internally treats the baked
  `Group` and an actual external image both as `filter::Kind::Image` —
  everything downstream is "rasterize the input subtree at the filter region
  and use it as primitive output."

## Skia API for capturing a subtree

skia-safe 0.93.1 exposes the two pieces we need.

### `PictureRecorder`

```rust
let mut recorder = PictureRecorder::new();
let canvas = recorder.begin_recording(picture_bounds, false);
// … draw ops on `canvas` …
let picture: skia_safe::Picture = recorder.finish_recording_as_picture(
    Some(&picture_bounds))?;
```

`canvas` is a regular `&Canvas` — every draw op is recorded into the picture
rather than rasterized.

### `image_filters::picture`

`skia-safe-0.93.1/src/effects/image_filters.rs:476-487`:

```rust
/// Create a filter that produces the [`Picture`] as its output, clipped to both
/// 'target_rect' and the picture's internal cull rect.
pub fn picture<'a>(
    pic: impl Into<Picture>,
    target_rect: impl Into<Option<&'a Rect>>,
) -> Option<ImageFilter>
```

`target_rect` is the _output_ rect in the filter graph's coordinate space — the
region of the picture's content that should appear in the filter chain. When
omitted, the picture's own cull rect is used. Effectively this is Skia's
direct equivalent of Blink's `RecordPaintFilter` constructor: "wrap a recorded
op buffer as an image filter, with this clip."

### Comparison with raster surface alternative

| Strategy                                     | Memory             | Quality on resample          | Compose with downstream filters     |
| -------------------------------------------- | ------------------ | ---------------------------- | ----------------------------------- |
| `PictureRecorder` + `image_filters::picture` | Cheap (op buffer)  | Vector, exact at any zoom    | Native — Skia composes directly     |
| Render to `Surface` + `image_filters::image` | One pixmap upfront | Resampling on transform/zoom | Native, but pixels are lossy        |
| Inline expand into the calling filter chain  | None               | Exact                        | Not feasible for arbitrary subtrees |

The Picture path matches Blink and is structurally cleanest — Skia keeps the
input as resolution-independent draw ops until the final raster step, so
zoomed renders stay sharp. Memory is tiny compared to a pixmap because the
recorder stores op codes, not pixels.

## Worked example: `link-to-an-element` fixture

`fixtures/local/resvg-test-suite/tests/filters/feImage/link-to-an-element.svg`:

```svg
<svg viewBox="0 0 200 200" xmlns="…">
  <defs>
    <filter id="filter1">
      <feImage xlink:href="#rect3"/>
    </filter>
    <rect id="rect3" x="36" y="36" width="120" height="120" fill="green"/>
  </defs>
  <rect id="rect1" x="20" y="20" width="160" height="160" fill="red" filter="url(#filter1)"/>
  <rect id="rect2" x="40" y="40" width="120" height="120" fill="none" stroke="black"/>
  <rect id="frame" x="1" y="1" width="198" height="198" fill="none" stroke="black"/>
</svg>
```

Inputs:

- **Filtered element** — `rect1`, `(20, 20, 160, 160)`, `fill=red`,
  `filter=url(#filter1)`.
- **Filter** — `<filter id="filter1">` with default
  `filterUnits=objectBoundingBox` (so the filter region defaults to
  `(-10%, -10%, 120%, 120%)` of `rect1`'s bbox = `(4, 4, 192, 192)`) and
  default `primitiveUnits=userSpaceOnUse`.
- **Single primitive** — `<feImage href="#rect3"/>`, no `x/y/width/height`,
  so primitive subregion defaults to the filter region: `(4, 4, 192, 192)`.
  Per spec §15.7's union rule, source primitives default to the filter region.
- **Referenced element** — `rect3`, `(36, 36, 120, 120)`, `fill=green`,
  living inside `<defs>` (a hidden container, so it doesn't paint on the
  main pass — but `feImage` references it explicitly).

Expected output (described from the reference PNG):

1. The black image frame at `(1, 1, 198, 198)` — drawn on the main pass.
2. **Where rect1's red would have been**: nothing red. Instead, a green
   rectangle at `(36, 36, 120, 120)` — exactly rect3's geometry. This is
   the feImage primitive's output, which then becomes rect1's "rendered
   pixels" (the filter replaces the source completely).
3. Outside `(36, 36, 120, 120)` but inside the filter region `(4, 4, 192, 192)`:
   transparent — `feImage` only paints the referenced element's actual ink.
4. Outside the filter region: nothing rendered for rect1 (the filter region
   crops).
5. The black-stroked rect2 at `(40, 40, 120, 120)` overlays everything else
   (it's drawn after rect1 in document order). This visually confirms rect3
   sits at `(36, 36)` — slightly offset from rect2's `(40, 40)` outline.

Trace of what a Blink-shaped implementation produces:

```
filter region (user space) = (4, 4, 192, 192)
primitive subregion (crop) = filter region = (4, 4, 192, 192)
referenced element rect3:
  natural geometry = (36, 36, 120, 120), fill=green
  paint walk into PictureRecorder records:
    [DrawRect (36,36,120,120) Paint{fill=#008000}]
  finish_recording_as_picture → Picture P with cull rect = full primitive subregion
image_filters::picture(P, target_rect=Some(crop)) → ImageFilter F
final filter chain output = F (the only primitive, "previous" points at it)
save_layer(paint=F) … paint rect1 (red square) … restore
  Skia: rect1's draw ops feed F's input but F ignores SourceGraphic (it's
  a generator filter — same shape as feFlood / feTurbulence) and emits the
  recorded green rect, clipped to (4, 4, 192, 192).
```

The key insight: `feImage` is a _source-generator_ primitive (no input,
ignores `SourceGraphic`), so the red rect1 fill never appears. Only the
recorded green rect3 is visible within the filter's region.

## References

- Filter Effects 1 §15.21 `feImage`: https://drafts.fxtf.org/filter-effects-1/#feImageElement
- Blink `svg_fe_image.cc`: `third_party/blink/renderer/core/svg/graphics/filters/svg_fe_image.cc`
- Blink `svg_fe_image_element.cc`: `third_party/blink/renderer/core/svg/svg_fe_image_element.cc`
- Blink `svg_object_painter.cc:86` (`PaintResourceSubtree`)
- usvg `parser/filter.rs:821-855` (`convert_image_inner`)
- resvg `crates/resvg/src/filter/mod.rs:854` (`apply_image`)
- skia-safe `image_filters::picture` (`skia-safe-0.93.1/src/effects/image_filters.rs:476`)
