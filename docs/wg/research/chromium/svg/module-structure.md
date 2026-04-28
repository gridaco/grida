---
title: "Chromium SVG — Module Structure"
tags:
  - internal
  - research
  - chromium
  - svg
  - architecture
---

# Chromium SVG — Module Structure

How Blink's SVG implementation is split across `third_party/blink/renderer/`.
This is the directory-organization companion to
[`pipeline.md`](./pipeline.md): pipeline.md describes phase shape (parse →
style → layout → paint), this doc describes **where the code lives** and
**why** — names, file counts, and the asymmetries that surprise.

The headline fact: Blink does not have an `svg/` mega-module. SVG support
is split across **four directories** that each correspond to a pipeline
phase. Each directory has its own naming convention, dependency direction,
and file-shape rules. Mistaking one for another (e.g. putting a painter in
`core/svg/`) breaks the dependency graph.

## The four directories

```
third_party/blink/renderer/core/
├── svg/                       DOM + IDL bindings + parsing
│   ├── animation/             SMIL only
│   ├── graphics/              SVGImage host (standalone .svg as <img>)
│   ├── graphics/filters/      filter-effect graph builder (parse → FilterEffect)
│   ├── properties/            SVGAnimatedProperty<T>, tear-offs
│   └── svg_path_parser_corpus/  fuzz corpus
├── layout/svg/                LayoutObject tree for SVG (geometry pass)
└── paint/                     painters (filename prefix `svg_`)
                               + scoped_svg_paint_state, clip_path_clipper,
                                 marker_range_mapping_context
```

That's it. There is **no** `core/svg_paint/` or `core/paint_svg/` —
painters live next to HTML painters under a flat `core/paint/`,
distinguished only by the `svg_` filename prefix. There is **no**
`core/layout/` SVG file outside `core/layout/svg/`. The DOM/layout/paint
split is enforced by directory.

## `core/svg/` — DOM (327 top-level files)

One C++ class per SVG element type, named `SVG<Name>Element`, in files
named `svg_<name>_element.{h,cc,idl}`. Examples: `svg_circle_element.h`,
`svg_use_element.h`, `svg_text_path_element.h`. The `.idl` file is the
JS-binding IDL; the `.cc/.h` pair is the implementation.

**Subdirectory rules:**

- `animation/` — SMIL only (`<animate>`, `<set>`, `<animateMotion>`,
  `<animateTransform>`, `SMILTimeContainer`, `SVGSMILElement`). CSS / Web
  Animations on SVG attributes go through the shared
  `core/animation/` engine, not here.
- `graphics/` — the `<img src="…svg">` story: `SVGImage`,
  `SVGImageForContainer`, `IsolatedSVGDocumentHost`. Inline `<svg>` does
  not go through any of these.
- `graphics/filters/` — `SVGFilterBuilder` (walks `<filter>` children,
  produces a `FilterEffect` DAG). Lives under `svg/` not `paint/`
  because the DAG is built at parse/layout time and is data, not paint.
- `properties/` — `SVGAnimatedProperty<T>`, `SVGPropertyTearOff`. The
  baseVal/animVal infrastructure that makes SVG attributes JS-mutable.
- `svg_path_parser_corpus/` — fuzz corpus, ignore.

**`core/svg/` does not depend on `core/layout/svg/`.** Layout consumes the
DOM, not the other way around. Element classes know nothing about their
`LayoutObject`.

## `core/layout/svg/` — Layout tree (~30 files, no subdirs)

Three filename families:

| Family                  | Examples                                                                                                                                                                                                                                                                                                                                                                          | What it is                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `layout_svg_<shape>`    | `layout_svg_root`, `layout_svg_shape`, `layout_svg_path`, `layout_svg_rect`, `layout_svg_ellipse`, `layout_svg_image`, `layout_svg_foreign_object`, `layout_svg_text`, `layout_svg_text_path`, `layout_svg_inline`, `layout_svg_inline_text`, `layout_svg_container`, `layout_svg_block`, `layout_svg_hidden_container`, `layout_svg_model_object`, `layout_svg_filter_primitive` | Layout objects in the visible tree                                                                    |
| `layout_svg_resource_*` | `layout_svg_resource_container`, `layout_svg_resource_paint_server`, `layout_svg_resource_pattern`, `layout_svg_resource_gradient` (+ `_linear_`, `_radial_`), `layout_svg_resource_clipper`, `layout_svg_resource_masker`, `layout_svg_resource_filter`, `layout_svg_resource_marker`                                                                                            | Layout objects for resource containers (`<defs>` children)                                            |
| `svg_text_*`            | `svg_text_layout_algorithm`, `svg_text_layout_attributes_builder`, `svg_text_query`                                                                                                                                                                                                                                                                                               | Free-standing helpers, not `LayoutObject` subclasses (text is gnarly enough to deserve its own files) |

**`svg_resources.h`** is the cross-cutting glue: the static
`SVGResources` namespace + `SVGElementResourceClient` class. This is
where `url(#id)` lookup, per-client cache, and resource-invalidation
propagation live. It belongs here because it's a _layout-time_ concern
(layout decides what resources a node references; paint just reads the
cache).

**Notable file sizes** (handy when judging module density):

- `layout_svg_text.cc` — 443 LOC (just the LayoutObject, not the algorithm)
- `svg_text_layout_algorithm.cc` — the per-glyph x/y/dx/dy/rotate/textPath
  algorithm, in its own file. **Not** a `LayoutObject` subclass.

## `core/paint/` — Painters (flat with HTML painters)

SVG painters share a directory with HTML painters. They are identified
purely by the `svg_` filename prefix, **not** a subdirectory. The full
SVG-related set:

```
core/paint/
├── svg_root_painter.{h,cc}                root-level <svg>
├── svg_container_painter.{h,cc}           <g>, <symbol>, etc. (the DFS dispatcher)
├── svg_shape_painter.{h,cc}               <path>/<rect>/<circle>/<ellipse>/<line>/<polyline>/<polygon>
├── svg_image_painter.{h,cc}               <image>
├── svg_foreign_object_painter.{h,cc}      <foreignObject>
├── svg_object_painter.{h,cc}              shared base helpers
├── svg_model_object_painter.{h,cc}        shared base for non-root SVG objects
├── svg_mask_painter.{h,cc}                <mask> realization
├── svg_background_paint_context.{h,cc}    background-image: url(…svg) plumbing
├── scoped_svg_paint_state.{h,cc}          ScopedSVGTransformState + ScopedSVGPaintState (RAII)
├── clip_path_clipper.{h,cc}               CSS clip-path (basic shapes + url() refs)
├── marker_range_mapping_context.{h,cc}    walks path vertices to compute marker positions
└── styleable_marker_painter.{h,cc}        text underline/strike markers (NOT <marker>)
```

### Notable absences (and what's there instead)

These files **do not exist** — and the absences are architecturally
significant:

| Missing file                  | What handles that responsibility instead                                                                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svg_text_painter.{h,cc}`     | SVG text reuses the **HTML inline-text painter**. The SVG-specific work (per-glyph positioning) is done at layout time in `svg_text_layout_algorithm.cc`; by the time paint runs, the glyphs are positioned and the painter just draws them.                                  |
| `svg_marker_painter.{h,cc}`   | `LayoutSVGResourceMarker` _is_ the marker (it's a `LayoutSVGHiddenContainer` subclass); the painter walks the marker's children via `SVGContainerPainter`. Marker positions come from `marker_range_mapping_context`.                                                         |
| `svg_pattern_painter.{h,cc}`  | `LayoutSVGResourcePattern::ApplyShader` records the pattern's children into a Picture and wraps it as a tiled `cc::PaintShader`. Stays in `core/layout/svg/`, not paint.                                                                                                      |
| `svg_clipper_painter.{h,cc}`  | `LayoutSVGResourceClipper` resolves `<clipPath>` to an `SkPath` (path strategy) or paints into a mask layer (mask strategy). The CSS `clip-path` entry point is `clip_path_clipper.cc`.                                                                                       |
| `svg_gradient_painter.{h,cc}` | `LayoutSVGResourceGradient::ApplyShader` produces the `cc::PaintShader`. No painter; gradients are pure data → shader.                                                                                                                                                        |
| `svg_filter_painter.{h,cc}`   | The filter graph is built in `core/svg/graphics/filters/svg_filter_builder.cc` as a `FilterEffect` DAG, then realized as a `cc::PaintFilter` and set on the painted layer's flags. The realization is plumbed through paint properties (`PrePaint`), not a dedicated painter. |

### The pattern

Painters exist for **visible elements** (root, container, shape, image,
foreign-object). Resources (`<clipPath>`, `<mask>`, `<filter>`,
`<marker>`, `<linearGradient>`, `<radialGradient>`, `<pattern>`) do not
have painters of their own — they have **`LayoutSVGResource*` containers**
that produce a realized output (`SkPath`, `SkShader`, `cc::PaintFilter`,
mask layer) on demand. The visible painter consumes that output.

`<mask>` is the one resource that ends up driving paint operations
(`save_layer` with kDstIn), and that's why `svg_mask_painter.cc` exists —
it sits between the shape painter and the resource container.

## Cross-cutting infrastructure

### `ScopedSVGTransformState` / `ScopedSVGPaintState`

`scoped_svg_paint_state.h` defines two small RAII classes:

- **`ScopedSVGTransformState`** — concats the node's
  `LocalSVGTransform()` onto the canvas CTM and restores on destruction.
  Lifetime: one stack frame per node.
- **`ScopedSVGPaintState`** — manages the layer-effect bracket: prepares
  fill/stroke `cc::PaintFlags`, applies paint servers, opens
  `save_layer` for opacity / filter / mask / clip, closes them on
  destruction. Has a `PaintBehavior` enum (`kContent`, `kReferenceFilter`)
  to gate which components apply.

Both are `STACK_ALLOCATED()` and Drop-equivalent — Blink's invariant is
that you cannot forget to restore.

### `SVGResources` (in `core/layout/svg/`, not `core/paint/`)

`svg_resources.h` is a static-only namespace that owns:

- `GetClient(LayoutObject)` — the `(layout_object → resource_client)` map
- `ReferenceBoxForEffects(LayoutObject, GeometryBox)` — the per-element
  bbox used as resource coordinate space
- `Update*` / `Clear*` for paints / effects / markers
- `SVGElementResourceClient` — the per-client cache (gradient/pattern
  shaders, filter `PaintFilter`, clip `Path`)

Per-client caching is a hard requirement of the architecture, not an
optimization: `*Units="objectBoundingBox"` makes the realized form
bbox-dependent, so two references to the same gradient with different
shape bboxes are two different shaders. See parent doc for invalidation
flags ([`index.md` §SVG resource invalidation](./index.md#svg-resource-invalidation)).

## Dependency direction

```
core/dom/  ◄── core/svg/ (DOM)
                    ▲
                    │
       core/layout/svg/ (LayoutObjects + SVGResources)
                    ▲
                    │
                core/paint/svg_*  + scoped_svg_paint_state
                    ▲
                    │
                core/paint/clip_path_clipper, marker_range_mapping_context
                    ▲
                    │
                cc::PaintRecord
```

- DOM never imports layout. Layout never imports paint. Paint imports
  layout (to read `LayoutSVGShape::GetPath()` etc.) and DOM transitively
  through layout.
- Filter-graph code (`core/svg/graphics/filters/`) is a parse-side
  helper, not a painter — it lives next to the DOM because it consumes
  `SVGFilterElement`, not `LayoutSVGResourceFilter`.
- `core/paint/` knows about `core/layout/svg/` types directly; there is
  no abstraction layer between painters and `LayoutObject`s.

## File-density observations

For a static SVG renderer, the relevant Blink line counts (rough):

| Area                                                                                     | Files      | Notes                                                |
| ---------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------- |
| `core/svg/svg_*_element.{h,cc}`                                                          | ~140 pairs | One per element type, mostly thin                    |
| `core/layout/svg/layout_svg_*`                                                           | ~25 pairs  | Hierarchy + resource containers                      |
| `core/layout/svg/svg_text_*`                                                             | 3 pairs    | Text layout algorithm split out from `LayoutSVGText` |
| `core/paint/svg_*`                                                                       | 7 pairs    | Painters proper                                      |
| `core/paint/clip_path_clipper`, `scoped_svg_paint_state`, `marker_range_mapping_context` | 3 pairs    | Painter helpers                                      |

Note that **no single painter file is the "big" one**. Blink amortizes
SVG complexity across many small files, with text complexity pushed into
layout (`svg_text_layout_algorithm`) rather than paint. The painter side
of text is handled by HTML's inline-text painter — paint sees a
positioned `ShapeResult`, not raw characters.

## References

- `third_party/blink/renderer/core/svg/` — DOM
- `third_party/blink/renderer/core/layout/svg/` — layout objects + resources
- `third_party/blink/renderer/core/paint/svg_*` — painters
- `third_party/blink/renderer/core/paint/scoped_svg_paint_state.h` — RAII
- `third_party/blink/renderer/core/layout/svg/svg_resources.h` — resource client + cache
- `third_party/blink/renderer/core/svg/graphics/filters/svg_filter_builder.h` — filter graph
- Companion: [pipeline.md](./pipeline.md) for phase shape, [resources-and-effects.md](./resources-and-effects.md) for resource semantics
