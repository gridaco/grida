---
title: "htmlcss::svg — Design Study"
format: md
tags:
  - internal
  - wg
  - feat-2d
  - svg
  - design
  - study
---

# htmlcss::svg — Design Study

The structure-and-semantics study that informs the Skia-backed SVG
renderer at `crates/grida/src/htmlcss/svg/`. Companion to the module's
`crates/grida/src/htmlcss/svg/README.md`.

The renderer's lineage is **Blink** (Chromium). usvg and resvg are
secondary references — usvg as a parse-time normalization model, resvg
as a one-pass renderer model. Each section below ends with an explicit
**Adopt** / **Differ** line so a reader can audit our deviations from
Blink in one pass.

## Why this study exists

The htmlcss module already accepts SVG content in two places, but both
delegate to Skia's built-in `svg::Dom` (`SkSVGDOM`). Chromium
**deliberately does not use** `SkSVGDOM`; per
[`docs/wg/research/chromium/svg/index.md`](../research/chromium/svg/index.md)
lines 87–89, Skia's DOM is _"for embedders that need standalone SVG
rendering without DOM/CSS/JS integration"_. Grida is becoming such an
embedder, but with a sharper goal: parity with Chromium for static SVG,
validated against the resvg-test-suite (1,679 fixtures already on disk
at `fixtures/local/resvg-test-suite/`).

This study captures the design decisions before code lands. Implementation
proceeds per-feature through
`.agents/skills/dev-render-htmlcss-feature/SKILL.md`.

---

## S1. Chromium / Blink — the lead reference

**Anchors**:
[`docs/wg/research/chromium/svg/{index, pipeline, coordinate-systems, paint-servers, resources-and-effects, path-geometry, text, use-and-foreign-object, svg-as-image}.md`](../research/chromium/svg/).

### Pipeline shape

Blink's SVG pipeline is **parsing → style → layout → paint → composite**
(`pipeline.md` §3, lines 88–124). The composite phase (cc property trees,
GPU raster) is Chromium's compositor; we don't replicate it. The first
four phases are what we mirror.

The bridge between CSS layout and the SVG coordinate system is
`LayoutSVGRoot extends LayoutReplaced`. The outer `<svg>` element is a
CSS replaced element with a CSS box; that box is the SVG viewport. Inside,
geometry is in user units mapped via `viewBox` + `preserveAspectRatio`
to the viewport rect.

### CSS-cascade integration

`SVGComputedStyle` rides alongside `ComputedStyle`. SVG-specific
properties (`fill`, `stroke`, `stroke-dasharray`, `marker-*`, `stop-color`,
`paint-order`, `clip-rule`, `fill-rule`, `flood-color`, etc.) live in
`SVGComputedStyle` and are accessed via `style.SvgStyle()`. The cascade
itself is the same code path as for HTML.

The crucial detail: SVG **presentation attributes** (`fill="red"`,
`stroke-width="2"`) are translated to CSS values and inserted into the
cascade at presentation-attribute specificity (lower than rules, higher
than UA defaults). The bridge is `SVGAnimatedLength::CssValue()` and the
`CSSPropertyID` argument wired into each `SVGAnimated*` constructor
(`pipeline.md` lines 52–69).

This is _the_ Blink pattern we copy: it's why we reuse Stylo. Selector
matching, cascade order, custom-property resolution, `currentColor`
fallback — all come for free.

### Layout tree

```
LayoutSVGRoot                  extends LayoutReplaced; CSS box ↔ SVG viewport
├── LayoutSVGContainer         <g>, <symbol>, etc.
│   ├── LayoutSVGTransformableContainer  <g transform=…>
│   ├── LayoutSVGViewportContainer       nested <svg>
│   ├── LayoutSVGHiddenContainer         <defs>, <clipPath>, <mask>, <filter>, <marker>
│   │   └── LayoutSVGResourceContainer   base for all resource containers
│   │       ├── LayoutSVGResourcePaintServer
│   │       │   ├── LayoutSVGResourcePattern
│   │       │   └── LayoutSVGResourceGradient
│   │       ├── LayoutSVGResourceClipper
│   │       ├── LayoutSVGResourceMasker
│   │       ├── LayoutSVGResourceFilter
│   │       └── LayoutSVGResourceMarker
├── LayoutSVGShape             <path>, <rect>, <circle>, <ellipse>, <line>, <polygon>, <polyline>
├── LayoutSVGImage             <image>
└── LayoutSVGForeignObject     <foreignObject>
LayoutSVGText                  <text>
└── LayoutSVGInline            <tspan>, <textPath>
    └── LayoutSVGInlineText
```

Layout produces **paths and bounding boxes in local coordinates plus a
`LocalToSVGParentTransform()` per node** — _not_ block fragments. Hidden
containers exist for bbox/resource resolution but are skipped during
paint.

### Painter family

One `*Painter` per `Layout*` class. Per-node setup:

- `ScopedSVGTransformState` — concats `LocalSVGTransform()` onto the
  `GraphicsContext` CTM (RAII).
- `ScopedSVGPaintState` — prepares fill/stroke `cc::PaintFlags`, applies
  paint servers, clips, masks, filters; decides isolation
  (`save_layer`).

Paint order inside a shape respects the `paint-order` property (default
`fill stroke markers`).

### Resource model

`LayoutSVGResource{PaintServer, Clipper, Masker, Filter, Marker}` plus
`SVGResources::GetClient()` for `url(#id)` resolution. Per-client cache
because `objectBoundingBox` units make shaders bbox-dependent.

### Filter graph

`SVGFilterBuilder` walks the `<filter>` children and builds a
`FilterEffect` graph (a DAG with named inputs/outputs). The graph is then
realized as a single `SkImageFilter` and set on the painted layer's
`SkPaint`. Skia's filter compiler does the heavy lifting; we mirror that
flow.

### Text

Two-phase. LayoutNG inline layout produces glyph runs (the same
machinery HTML uses). Then `SvgTextLayoutAlgorithm` rewrites per-glyph
positions for `x` / `y` / `dx` / `dy` / `rotate` / `textPath`. Text
stays semantic to paint (`DrawTextBlob`), not flattened.

### `<use>` / `<foreignObject>`

`<use>` is a runtime shadow-instance tree (`use-and-foreign-object.md`).
The target subtree is deep-cloned at the use site with the use element's
transform composed in. `<foreignObject>` recurses back into the HTML
layout/paint pipeline with a sub-canvas — a true HTML-in-SVG bridge.

### Adopt / Differ

**Adopt**: All of the above — pipeline shape, type taxonomy, public
interface, presentation-attribute → CSS aliasing, `LayoutSVGRoot extends
LayoutReplaced` viewport bridge, painter family, resource model with
per-client caches, filter graph, two-phase text.

**Differ**: No SMIL, no Web Animations, no scripting (no `ScriptWrappable`,
no tear-offs, no `baseVal`/`animVal` split — Grida is static, so each
attribute carries a single resolved value). No compositor property trees
(we emit a single `Picture`; Skia handles its own internal compositing).
No invalidation graph (single-shot renderer; nothing to invalidate). No
hit testing, no accessibility tree.

---

## S2. usvg — a parse-time normalization model (study, not a dependency)

**Anchors**: `resvg/crates/usvg/src/parser/`, `resvg/crates/usvg/src/tree/`,
summarized in [`comparison.md`](../research/chromium/svg/comparison.md)
lines 56–73.

usvg's job is to take a raw SVG document and normalize away every
ambiguity, producing a frozen tree where the renderer doesn't have to
ask "what does this inherit?" or "what units are these in?". The list
of normalizations:

| usvg normalization                      | Where in `htmlcss::svg`                                  | Phase              |
| --------------------------------------- | -------------------------------------------------------- | ------------------ |
| Inheritance flatten                     | `style/inherit.rs` (after Stylo cascade)                 | style              |
| `<use>` deep-clone                      | `layout/use_expand.rs`                                   | layout             |
| Basic-shape → path                      | `layout/shape.rs`                                        | layout             |
| Arc → cubic decomposition               | `dom/path_d.rs` (during `d=` parse)                      | parse              |
| `<switch>` resolution                   | `dom/parser.rs`                                          | parse              |
| `objectBoundingBox` → user space        | `resources/{gradient,pattern,clipper,masker,filter}.rs`  | paint (per-client) |
| Paint-server pool extraction            | `resources/mod.rs` (`ResourceTable`)                     | layout             |
| Pre-computed bboxes (`Group::abs_bbox`) | `layout/bbox.rs`                                         | layout             |
| Text shape + outline at parse           | **NOT adopted** — we keep text semantic (Blink approach) | n/a                |

### What usvg gives us as an idea

The principle of an **explicit normalized IR between parse and paint** is
what we copy from usvg. Resvg's renderer never sees `<use>`, never sees
`<switch>`, never sees percent units, never resolves inheritance — usvg
already did all that. Our pipeline does the same work, but spread across
parse / style / layout phases (not all at parse time, because Stylo
operates on the _unflattened_ DOM and we want to keep the cascade alive
through layout).

### Why we don't link usvg

usvg is a great library; using it in the _runtime_ would be wrong because
it pulls a parallel ecosystem:

- **fontdb** vs our `FontRepository` — two font registries fighting for
  the same fonts.
- **simplecss** vs Stylo — usvg's CSS support is intentionally minimal
  (no custom properties, no `:hover`, no media queries); Stylo is the
  full thing.
- **tiny-skia-path** vs `SkPath` — duplicate path representations
  inside the same crate.

We already have the more capable half of every pair. We re-implement
usvg's normalization ideas against our Blink-shaped IR.

### Adopt / Differ

**Adopt**: The normalization _list_ and the principle of a frozen IR.
Pre-computed absolute bboxes for cull-rect skipping. Arc-to-cubic at
parse time (no style dependence). `<switch>` at parse time (no style
dependence). Basic-shape → path at layout time.

**Differ**: We do not consume `usvg::Tree`. We re-implement these
normalizations against our own IR using Stylo for the cascade and Skia's
`Font` / `Paragraph` machinery for text. Text is kept semantic (Blink's
strategy), not flattened to paths.

---

## S3. resvg — a one-pass renderer model

**Anchors**: `resvg/crates/resvg/src/{render.rs, path.rs, filter/mod.rs}`.

resvg is "render a usvg::Tree to a tiny-skia Pixmap". Static, CPU-only,
single-pass, no caches beyond what the IR already provides. Its
simplicity is instructive — Blink's equivalents are heavier than they
need to be for a static renderer, and we steal the simpler shape where
correctness allows.

### Patterns we adopt

- **Isolate-on-effect group rule**: a Group needs a `save_layer` only
  when it has opacity < 1, a non-default blend mode, a filter, a mask,
  or a non-trivial clip. resvg encodes this as a single boolean per
  group; Blink reaches the same outcome via `PaintLayer` stacking-context
  rules. We use the resvg formulation — simpler, sufficient for static
  rendering.
- **Named-result filter table**: filter primitives walked in document
  order, reading from / writing to a `HashMap<&str, Image>`
  (`SourceGraphic`, `SourceAlpha`, `BackgroundImage`, plus `result=`
  outputs). resvg does this on tiny-skia pixmaps; we do it on
  `skia_safe::ImageFilter` nodes — same control flow, different leaf
  nodes.
- **Pattern-as-recorded-shader**: render the pattern definition once
  into an `SkPicture`, wrap as `image_shader`. resvg renders to a
  per-use bitmap; Skia gives us shader-from-picture for free, so we
  record once and reuse across all clients.

### Where resvg is wrong (and we follow Blink instead)

- **`color-interpolation-filters`** default. SVG spec says `linearRGB`
  for `<filter>` content; resvg gets this wrong on several tests.
  Chromium handles it correctly by wrapping filter graphs in sRGB↔linear
  conversion at graph boundaries. We mirror Chromium.
- **Text flattening**. resvg flattens text to paths at parse time. This
  loses selectability (no editor copy/paste), inflates picture size,
  and breaks animations on text content. Blink keeps text semantic. We
  follow Blink.

### Adopt / Differ

**Adopt**: Isolate-on-effect group rule, named-result filter table,
pattern-as-recorded-shader.

**Differ**: All draw ops to Skia (not tiny-skia). Filters compose into
`skia_safe::ImageFilter` graphs (Skia's own filter compiler), not a CPU
primitive loop. Shadow-tree `<use>` (Blink) instead of parse-time deep
clone (resvg) — leaves the door open for live-DOM scenarios later.
Text stays semantic.

---

## S4. Synthesis — the Grida pipeline

```
parse              style                            layout                paint
─────              ─────                            ──────                ─────
xml bytes  ──▶    SvgDocument with        ──▶    LayoutSvgRoot tree  ──▶ Skia Canvas
                  resolved SvgComputedStyle        (paths, transforms,
                  per element                      paint-server table,
                                                   pre-computed bboxes)
                                                       ▲                    ▲
                                                       │                    │
                                       Stylo cascade applied;       SkShaders +
                                       presentation attrs aliased   SkImageFilters
                                       to CSS; <use>/<switch>       resolved per-client
                                       resolved
```

### Phase responsibilities

**Parse** (`dom/`): XML → typed `SvgDocument` via `roxmltree`. One Rust
type per Blink `SVG*Element`. Path `d=` → `SvgPathCommands` (no Skia
type). Arc-to-cubic during parse. `<switch>` resolved during parse.

**Style** (`style/`): Reuse htmlcss's existing Stylo session.
Presentation attrs aliased to CSS. `<style>` blocks added as author
sheets. `style=""` applies normally. Output: every node carries a
fully-resolved `SvgComputedStyle`. Inheritance flattened so paint never
asks "inherit from parent?".

**Layout** (`layout/`): Top-down — outer CTM from `viewBox` +
`preserveAspectRatio` + viewport. Per-node `transform=` composed onto
parent CTM. Basic shapes → `SkPath`. Bottom-up — object/stroke/visual
bboxes per node. `<use>` shadow-instance expansion. Two-phase text:
shape via `skia_safe::textlayout`, then per-character positioning.

**Paint** (`paint/`): One DFS pass. `ScopedSvgTransformState` /
`ScopedSvgPaintState` per node. Isolate-on-effect group rule (resvg
formulation). Paint-order respected within shapes. Paint servers via
`ResourceTable` (gradients → `SkShader`, patterns → recorded `SkPicture`
wrapped as image-shader, filters → `SkImageFilter` graph). `<image>`
through `htmlcss::ImageProvider`.

### Integration with htmlcss core

Two wiring changes (not yet in place — happen as features land):

1. `htmlcss::render_svg` (`crates/grida/src/htmlcss/mod.rs`)
   becomes a thin wrapper around `htmlcss::svg::render_to_picture`. The
   `skia_safe::svg::Dom` call is removed.
2. `htmlcss::paint::paint_inline_svg` (`crates/grida/src/htmlcss/paint.rs`)
   becomes a wrapper around `htmlcss::svg::render_into`. The
   `skia_safe::svg::Dom` call is removed.

`htmlcss::collect::serialize_svg_subtree` and `detect_svg_element` stay
as-is — they already extract the `<svg>` subtree as XML, which is exactly
what `render_into` consumes. `ReplacedContent::svg_xml` stays.

### What this study deliberately does not specify

- A feature priority list. Per-feature ordering is for the implementation
  phase under
  `dev-render-htmlcss-feature`.
  The pipeline is designed holistically; features fill it in.
- Animation, scripting, hit-testing, accessibility surfaces. Documented
  as non-goals in the module README.
- A change to `crates/grida/src/import/svg/`
  or `crates/grida/src/formats/svg/`.
  Different role, different consumer; they continue to use usvg.

---

## S-clip-path. CSS `clip-path` and `<clipPath>` element

The `clip-path` subsystem covers both the SVG `<clipPath>` element
referenced via `url(#id)` and the CSS basic-shape forms (`circle()`,
`ellipse()`, `inset()`, `polygon()`, `path()`) per CSS Masking 1 §5.1
and CSS Shapes 1 §3.1. Blink classifies every clipPath child into one
of two strategies — **path union** (preferred, all `<shape>` children
composed via `SkOpBuilder` with `kUnion_SkPathOp`, capped at 42 ops)
and **mask raster** (fallback, used when any child is `<text>` or has
its own `clip-path` chain). The referencing element's
`ComputedStyle.ClipPath()` is one of `ReferenceClipPathOperation`,
`ShapeClipPathOperation`, or `GeometryBoxClipPathOperation`; per
SVG 2 §11.6 cycles and invalid references resolve to `clip-path: none`.

Per spec the per-child `clip-rule` (inherited via the CSS cascade)
sets each shape's `SkPath::FillType` before the union; basic shapes
build paths via `Path::MakeEllipse` / `MakeRoundedRect` / hand-rolled
`PathBuilder`; reference-box defaults to `fill-box` for SVG and
`border-box` for HTML; chained clipPaths compose via
`SkPath::Op(Intersect)` with a 500-verb cap.

**Reference**: [docs/wg/research/chromium/svg/clip-path.md](../research/chromium/svg/clip-path.md).

**Adopt**: Two-strategy classification (path union vs. mask raster);
`SkOpBuilder`-equivalent path union via `skia_safe::op(.., PathOp::Union)`
with an op cap; per-child `clip-rule` → `PathFillType` before union;
invalid-reference fallback to "no clip" (CSS Masking 1 §5.1); cycle
detection via a visited set on the resolution stack (SVG 2 §11.6);
chained-clipPath path-strategy intersect via `PathOp::Intersect` with
a verb cap; basic-shape `GetPath` ports per shape; SVG-default
reference-box (`fill-box` for `objectBoundingBox`); recursion budgets
(`kMaxOps = 42`, `kMaxVerbs = 500`).

**Differ**: Mask-raster fallback is deferred — failing path-strategy
cases render unclipped rather than being rastered into a `kDstIn`
mask layer. Empty `<clipPath>` renders unclipped (matches resvg)
rather than clip-everything (Blink/spec). HTML reference-box keywords
(`border-box`, `padding-box`, `content-box`, `margin-box`) are out of
scope — SVG-only renderer, no `<foreignObject>`. `<g>` walk is
shallow (one level), unlike usvg's full recursion or Blink's
zero-walk. No composited animation path
(`ClipPathPaintImageGenerator`). `polygon(round 12px ...)` rounding
not supported. `shape-outside`, `offset-path`, and CSS Shapes 2
`shape()` out of scope.

---

## S-text-path. `<textPath>` layout and painting

`<textPath>` lays out shaped glyphs along an arbitrary `<path>` by
reinterpreting each glyph's linear-layout x as an arc-length offset.
Blink runs this as `SvgTextLayoutAlgorithm::PositionOnPath`, the last
of six SVG-text phases, after DxDy / TextLength / XY / Anchoring;
usvg runs `resolve_clusters_positions_path` after a linear pass.
Both use the **glyph baseline center** as the point on the path,
queried via arc-length parameterization (Blink: `SkPathMeasure`;
usvg: kurbo `CubicBez::arclen`/`inv_arclen`); `skia-safe` exposes
this as `ContourMeasureIter` / `ContourMeasure::pos_tan`. The
referenced `<path>`'s own `transform=` applies to the geometry once
at resolve time, and `pathLength` rescales `startOffset` only.

Per spec the path tangent and any per-character `rotate=` are
additive; `text-anchor` clamps anchored-chunk ranges to not cross
textPath boundaries; in horizontal mode the cascaded per-character
`y` is dropped inside textPath (saved as `baseline_shift` and
re-applied perpendicular to the tangent at paint time); glyphs whose
mid arc-length is out of range are hidden.

**Reference**: [docs/wg/research/chromium/svg/text-on-path.md](../research/chromium/svg/text-on-path.md).

**Adopt**: Glyph-center placement at `(x_chunk + advance/2 +
startOffset)`; tangent angle via `tangent.y.atan2(tangent.x)` on
unit-length `pos_tan`; pre-baked `text-anchor` into start offset
(usvg's flatter single pass); stateful sequential mapper around
`ContourMeasureIter` for amortized O(1) glyph lookup; bake the
referenced `<path transform=>` into geometry once at resolve time;
`pathLength` rescaling of `startOffset`; hide-out-of-range glyphs;
build the final per-glyph transform at layout time
(`pre_rotate_at(angle, half_width, 0)`, then `pre_translate(0,
baseline_shift)`); additive path tangent + per-char `rotate`;
multiple contours treated as continuous arc-length; drop per-character
`y` from cascade in horizontal mode inside textPath; skip closed-path
special anchor handling (matches Blink and major browsers).

**Differ**: `method` and `spacing` parsed but ignored (matches Blink
and usvg). `side="right"` not implemented (matches Blink and usvg);
spec requires reversing the path before walking. SVG 2 "continue from
path endpoint" shift for trailing text deferred — text after
`</textPath>` resumes from origin (legacy WebKit behavior). No BiDi
inside textPath; glyphs laid out in logical order. Per-glyph
`draw_str` with save/concat/restore rather than batched `RSXform`
arrays (acceptable simplicity; revisit if profiling demands).

---

## References

- Module: `crates/grida/src/htmlcss/svg/`
- Module README: `crates/grida/src/htmlcss/svg/README.md`
- Chromium SVG research: [`docs/wg/research/chromium/svg/`](../research/chromium/svg/)
- Cross-engine compare: [`docs/wg/research/chromium/svg/comparison.md`](../research/chromium/svg/comparison.md)
- Reftest corpus: `fixtures/local/resvg-test-suite/` (1,679 SVGs)
- Reftest runner: `crates/grida_dev/src/reftest/`
- Feature loop: `.agents/skills/dev-render-htmlcss-feature/SKILL.md`
- Reftest gate: `.agents/skills/render-reftest/SKILL.md`
- resvg upstream: <https://github.com/linebender/resvg>
- usvg upstream: <https://github.com/linebender/resvg/tree/main/crates/usvg>
- Skia SVG module (reference only): `modules/svg/` in `google/skia`
