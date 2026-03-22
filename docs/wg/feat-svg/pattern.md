---
title: SVG Pattern Support
format: md
---

# SVG Pattern Support

> Pattern fills for SVG shapes — tiling a subtree as a repeating paint

| feature id    | status      | description                               | PR  |
| ------------- | ----------- | ----------------------------------------- | --- |
| `svg-pattern` | not started | SVG `<pattern>` element as a paint server | —   |

---

## Abstract

SVG `<pattern>` defines a paint server: a rectangular tile of vector content
that repeats to fill a shape's `fill` or `stroke`. It is referenced via
`fill="url(#id)"`, the same mechanism as gradients.

The SVG spec defines `<pattern>` in the _Gradients and Patterns_ chapter
alongside `<linearGradient>` and `<radialGradient>`. All three are paint
servers — they produce a paint value, not a visual node.

Figma has a similar concept as the `PATTERN` paint type in its fills/strokes
array, but its pattern content is always a raster image rather than an
arbitrary vector subtree.

---

## Current State in Grida

### What works

- **usvg (vendored)** fully parses `<pattern>` with all attributes
  (`patternUnits`, `patternContentUnits`, `patternTransform`, `viewBox`,
  `preserveAspectRatio`, `xlink:href` chain resolution). The parsed tree
  stores `Paint::Pattern(Arc<Pattern>)` with a `Group` subtree as content.

### What does not work

- **`SVGPaint` enum** has no `Pattern` variant. Only `Solid`,
  `LinearGradient`, and `RadialGradient` exist.

- **SVG-to-IR conversion** drops patterns silently, falling back to
  `SVGPaint::TRANSPARENT` (tagged `[MODEL_MISMATCH]` in the source).

- **Runtime `Paint` enum** has no `Pattern` variant.

- **Grida file format** (FlatBuffers) has no pattern paint type.

- **No rendering code** exists for patterns.

### Related infrastructure

`ImagePaintFit::Tile` handles image-based tiling with `ImageRepeat` modes. Its
documentation explicitly references SVG `<pattern>` and CSS `background-repeat`
semantics. This infrastructure covers the image-tile case but not arbitrary
vector subtrees.

---

## How Upstream Projects Handle Pattern

### Chromium

Chromium treats `<pattern>` as a **paint server** — a hidden resource container
that produces a tiling shader. Full analysis:
[`docs/wg/research/chromium/svg-pattern.md`](../research/chromium/svg-pattern.md).

Key points:

- `LayoutSVGResourcePattern` inherits from `LayoutSVGHiddenContainer`. It does
  not appear in the visual tree or compositor layer tree.
- Tile content is recorded into a `PaintRecord` (vector display list), not a
  bitmap.
- The recording is wrapped into a `PaintShader` via
  `PaintShader::MakePaintRecord` with `SkTileMode::kRepeat`.
- The shader is set on the geometry's `cc::PaintFlags` — the pattern is applied
  as paint, not composited as a node.
- `patternTransform` becomes the shader's `local_matrix`.
- Per-client shader caching handles `objectBoundingBox` units (tile size varies
  per client shape).

### resvg / usvg

usvg stores `Pattern` as a paint variant (`Paint::Pattern(Arc<Pattern>)`), not
a scene graph node. The struct holds `transform`, `rect`, optional `view_box`,
and a `root: Group` subtree.

Unit resolution is deferred: `objectBoundingBox` cannot be resolved during
parse (text bounding boxes are unknown). A post-processing pass
(`Paint::to_user_coordinates()`) resolves everything to `userSpaceOnUse` after
the full SVG is parsed.

resvg renders patterns by **pre-compositing the tile to a bitmap** at the
current transform's scale, then using it as a `tiny_skia::Pattern` shader with
`SpreadMode::Repeat`. This is simpler than Chromium's approach but
resolution-dependent.

### Skia

Skia supports creating a tiling shader from a vector recording via
`SkPicture::makeShader(tmx, tmy, filter, localMatrix, tileRect)`. In
rust-skia: `Picture::to_shader(...)`.

Internally, Skia rasterizes the picture into a **cached image** (max
2048x2048 = ~4M pixels) at a resolution determined by the current CTM, then
tiles the image using standard GPU texture wrap modes. The API is vector-in but
the execution is raster. The cache is keyed by `(colorSpace, colorType,
pictureID, tileRect, scale, surfaceProps)` and re-rasterizes when the scale
changes.

### Figma

Figma models pattern as a paint type (`PATTERN` in the `PaintType` enum)
alongside `SOLID`, `GRADIENT_LINEAR`, etc. Pattern content is always a raster
image from the image fills system with tiling parameters. There is no separate
pattern node in Figma's scene graph.

---

## Pattern-as-Node vs Pattern-as-Paint

The question: should Grida introduce pattern as a **scene graph node** or as
a **paint type**?

### What the distinction means

- **Node**: An element in the scene graph with its own transform, visibility,
  compositing properties. Participates in layout, hit-testing, and the
  compositor layer tree.
- **Paint**: A property of a fill or stroke. A shader/texture applied to
  geometry at paint time. Does not exist in the scene graph.

### Every upstream implementation chooses "paint"

| Question                                   | Chromium                        | resvg/usvg                     | Figma                   |
| ------------------------------------------ | ------------------------------- | ------------------------------ | ----------------------- |
| Does pattern appear in the visual tree?    | No (`LayoutSVGHiddenContainer`) | No (paint variant)             | No (paint type)         |
| Does it create a compositor layer?         | No                              | N/A                            | No                      |
| Is it a node in the scene graph?           | No — resource container         | No — `Arc<Pattern>` in `Paint` | No — paint type on node |
| How is it applied to geometry?             | Shader on `PaintFlags`          | Shader on `tiny_skia::Paint`   | Image paint with tiling |
| Does it participate in hit-testing/layout? | No                              | No                             | No                      |

### Why "paint" is the correct model

1. **SVG spec**: `<pattern>` is defined alongside `<linearGradient>` and
   `<radialGradient>` as a paint server. It is referenced via `fill="url(#id)"`
   — i.e. as a paint property value, not a structural element.

2. **Composition order**: The tile is composed _before_ it is applied to
   geometry. The tiled result is a texture/shader attached to a draw call, not
   an independent composited surface.

3. **Consistency with gradients**: Gradients are already paint types in Grida's
   IR. Patterns are the same category — a procedural fill referenced by URL.

4. **Performance**: Paint-level shaders enable GPU hardware tiling (texture
   wrap modes) without extra render surfaces or compositor layers.

---

## Implementation Options

### Option A: Pre-rasterize to Image, reuse `ImagePaintFit::Tile`

Render the pattern subtree into a Skia `Image` at an appropriate resolution,
then represent it as `Paint::Image` with `ImagePaintFit::Tile`.

This is what resvg does.

- **Pro**: Zero new types; leverages existing tiling infrastructure.
- **Pro**: Works immediately for SVG import.
- **Con**: Loses vector resolution independence (fixed raster resolution).
- **Con**: Cannot round-trip back to SVG `<pattern>` faithfully.

### Option B: `SVGPaint::Pattern` with `Picture::to_shader()`

Add a `Pattern` variant to `SVGPaint` that carries the pattern subtree. At
paint time, record the subtree into a Skia `Picture`, then use
`Picture::to_shader(TileMode::Repeat, ...)`.

This is what Chromium does.

- **Pro**: Resolution-independent (Skia re-rasterizes at appropriate zoom).
- **Pro**: Can round-trip to/from SVG.
- **Con**: More complex; requires painting SVG subtrees into Skia pictures.
- **Con**: `SVGPaint` would carry a subtree reference (breaks simple serde).

### Option C: Pattern definition store + `Paint::Pattern` reference

Store pattern definitions in a side table (like usvg's
`Tree::patterns: Vec<Arc<Pattern>>`), reference them by ID from
`Paint::Pattern(PatternRef)`. At paint time, look up the definition, record to
`SkPicture`, create a tiling shader.

This is closest to how both Chromium (`pattern_map_` per client) and usvg
(`Tree::patterns`) actually work.

- **Pro**: Clean separation of definition and usage.
- **Pro**: Shared definitions across multiple fills.
- **Pro**: Compatible with Figma's pattern paint model.
- **Con**: Requires a pattern definition registry in the render context.

---

## Files to Change

| File                                                     | Change                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `crates/grida-canvas/src/cg/svg.rs`                      | Add `SVGPatternPaint` struct and `SVGPaint::Pattern` variant |
| `crates/grida-canvas/src/svg/from_usvg.rs`               | Convert `usvg::Paint::Pattern` instead of discarding         |
| `crates/grida-canvas/src/cg/types.rs`                    | Possibly add `Paint::Pattern(...)` variant                   |
| `crates/grida-canvas/src/painter/paint.rs`               | Handle pattern shader creation                               |
| `crates/grida-canvas-wasm/lib/modules/svg-bindings.d.ts` | Update `SVGPaint` type                                       |
| `format/grida.fbs`                                       | Add pattern paint type (if persisting to file format)        |
