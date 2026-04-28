# htmlcss::svg — SVG Renderer

A Skia-backed SVG renderer that plugs into [`htmlcss`](../) for both
standalone `.svg` documents and inline `<svg>` in HTML. **Static-only**.
Companion to `htmlcss/{collect, layout, paint}`.

> **Style engine note.** The original plan ([`docs/wg/feat-2d/htmlcss-svg.md`](../../../../../docs/wg/feat-2d/htmlcss-svg.md))
> called for reusing the htmlcss-side Stylo session for SVG style
> resolution. That wiring was deferred — `style/stylesheet.rs` is an
> in-tree CSS matcher covering the selector forms exercised by the
> resvg-test-suite (universal, type, id, class, attribute, descendant
> / child combinators, `!important`, `@import`). Pseudo-classes,
> `@media`, `@supports`, and custom properties are not handled; a
> rule using one is dropped silently. Replacing the in-tree matcher
> with Stylo remains future work.

Not to be confused with:

- [`crates/grida/src/import/svg/`](../../import/svg/) — SVG → Grida canvas
  IR (uses usvg). Different role: _converter_.
- [`crates/grida/src/formats/svg/`](../../formats/svg/) — string-level SVG
  tooling (sanitize / optimize / parse via usvg). Different role: _format
  helpers_.

This module is a **renderer**.

## Lineage

The structure, semantics, and public interface follow **Blink** (Chromium's
rendering engine) directly. Module names mirror Blink's `core/svg/`,
`core/style/svg_computed_style`, `core/layout/svg/`, `core/paint/svg_*_painter`,
and `core/layout/svg/layout_svg_resource_*` families one-to-one. See the
lineage table below for the file-by-file Blink anchor for each module.

[`usvg`](https://github.com/linebender/resvg/tree/main/crates/usvg) and
[`resvg`](https://github.com/linebender/resvg/tree/main/crates/resvg) are
read as **auxiliary references only** — usvg for its parse-time
normalization list, resvg for its one-pass renderer patterns
(isolate-on-effect, named-result filter table). Neither is linked.

We diverge from Blink only where Grida's static, single-pass, no-JS
context permits a smaller surface (no SMIL, no Web Animations, no
scripting, no compositor property trees, no invalidation graph, no
accessibility tree).

For the full design study, see
[`docs/wg/feat-2d/htmlcss-svg.md`](../../../../../docs/wg/feat-2d/htmlcss-svg.md).

## Pipeline

V1 is a direct render pipeline with Chromium-shaped responsibilities:

```text
xml bytes ──▶ DemoDom + ResourceTable ──▶ direct paint walk ──▶ Skia Canvas
                 ▲                            ▲
                 │                            │
        SVG CSS subset + ids          geometry / viewport /
        collected once                effects resolved by
                                      focused helper modules
```

| Area                    | Module       | Responsibility                                                                                                                        |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Host boundary           | `context.rs` | Images, external CSS, and font lookup for one render pass.                                                                            |
| DOM view                | `dom/`       | `DemoDom` navigation, element-kind dispatch, typed attribute parsing, path-data parsing.                                              |
| Style subset            | `style/`     | Temporary in-tree matcher for SVG `<style>` blocks and `@import`; not Stylo.                                                          |
| Geometry/layout helpers | `layout/`    | Viewport/viewBox matrices, object bboxes, transform-origin resolution. These are helper services in V1, not a persistent layout tree. |
| Resources               | `resources/` | `id` table plus paint-server/filter/clip/mask resource resolution.                                                                    |
| Paint                   | `paint/`     | DFS paint walk, element dispatch, effect layer setup, and concrete shape/text/image/pattern/marker painters.                          |

The intended long-term target is still Blink's parse → style → layout →
paint model with a persistent render tree. Until that lands, do not add
new behavior to placeholder `LayoutSvg*` files unless it is actually
called by the direct render path. Prefer adding focused helper modules
with narrow inputs/outputs.

## How it integrates with htmlcss

| Entry                              | Routes through                        |
| ---------------------------------- | ------------------------------------- |
| `htmlcss::render_svg` (.svg input) | `svg::render_to_picture`              |
| `htmlcss::paint::paint_inline_svg` | `svg::render_into`                    |
| reftest / custom hosts             | `svg::render_to_picture_with_context` |

The outer `<svg>`'s CSS box (from htmlcss's normal Stylo+Taffy pass)
becomes this renderer's `LayoutSvgRoot` viewport — exactly mirroring
Blink's `LayoutSVGRoot extends LayoutReplaced`.

> **Status:** the wiring is swapped. Both `render_svg` and
> `paint_inline_svg` route through this in-tree renderer. There is no
> fallback to `skia_safe::svg::Dom` — features still under construction
> render as best-effort gaps, with new ones landing via
> [`.agents/skills/dev-render-htmlcss-feature/SKILL.md`](../../../../../.agents/skills/dev-render-htmlcss-feature/SKILL.md).

## What's in scope

The SVG static-rendering surface, modeled on Blink's coverage:

- **Structural**: `<svg>`, `<g>`, `<defs>`, `<symbol>`, `<use>`, `<switch>`.
- **Shapes**: `<path>`, `<rect>`, `<circle>`, `<ellipse>`, `<line>`,
  `<polyline>`, `<polygon>`.
- **Text**: `<text>`, `<tspan>`, `<textPath>`. Semantic glyph runs (not
  flattened to paths).
- **Paint servers**: `<linearGradient>`, `<radialGradient>`, `<pattern>`.
- **Effects**: `<clipPath>`, `<mask>`, `<filter>`, `<marker>`.
- **Filter primitives**: full set mapped to `skia_safe::ImageFilter` —
  see the table in `resources/filter_effect.rs`.
- **Coordinate systems**: `viewBox`, `preserveAspectRatio`, nested `<svg>`,
  `transform=` attribute.
- **Style**: temporary SVG CSS subset. Full Stylo integration remains
  the target before this module should be treated as architecturally
  complete.
- **Image**: `<image>` via [`crate::htmlcss::ImageProvider`].
- **`<foreignObject>`**: recurses back into htmlcss's layout/paint
  (phased — see "Limitations").

## What's out of scope

- **SMIL animation** (`<animate>`, `<set>`, etc.). Static rendering only.
- **CSS animations / Web Animations** on SVG. Same reason.
- **Scripting** (`<script>`, JS-driven mutations). No DOM mutation surface.
- **Hit testing and `pointer-events`**. Documented in
  [`docs/wg/research/chromium/svg/hit-testing.md`](../../../../../docs/wg/research/chromium/svg/hit-testing.md);
  may land later as a sibling module.
- **Per-resource invalidation graph** (`docs/wg/research/chromium/svg/index.md`
  §"SVG resource invalidation"). The renderer is single-shot; nothing to
  invalidate.
- **Accessibility tree integration**.

## Why not Skia's `SkSVGDOM`?

Same reason Blink doesn't use it
([`docs/wg/research/chromium/svg/index.md`](../../../../../docs/wg/research/chromium/svg/index.md)
lines 87–89). `SkSVGDOM` is for embedders without DOM/CSS/JS integration.
Grida's htmlcss has Stylo already; SVG content is part of the same
document and must participate in the same cascade. The previous
delegation to `skia_safe::svg::Dom` was a placeholder.

## Why not usvg?

usvg is excellent — and we explicitly study it (see
[`docs/wg/feat-2d/htmlcss-svg.md`](../../../../../docs/wg/feat-2d/htmlcss-svg.md)
§"usvg as a parse-time normalization model"). But linking it would pull a
parallel ecosystem into the htmlcss runtime: fontdb (vs our
`FontRepository`), simplecss (vs Stylo), tiny-skia-path (vs `SkPath`). We
already have the more capable half of every pair. We use usvg as a
_reference_, not a _dependency_.

## Verification

Reftest corpus:
[`fixtures/local/resvg-test-suite/`](../../../../../fixtures/local/resvg-test-suite/)
— 1,679 SVGs across 7 categories (`filters/`, `masking/`, `paint-servers/`,
`painting/`, `shapes/`, `structure/`, `text/`).

Run via:

```bash
cargo run -p grida_dev --bin reftest -- \
  --suite fixtures/local/resvg-test-suite \
  --renderer htmlcss
```

Output: `target/reftests/resvg-test-suite.htmlcss/report.json`.

Gate (`L0.exact`): `floor=1.0, threshold=0, aa=off` (per
[`.agents/skills/dev-render-htmlcss-feature/SKILL.md`](../../../../../.agents/skills/dev-render-htmlcss-feature/SKILL.md)
phase 5). Coverage tier (`L0.coverage`): per-category floors documented
in the suite's score budget.

For Chromium parity on inline `<svg>` in HTML, additional reftests live
under the existing htmlcss reftest suites (rendered via Playwright
Chromium as the oracle).

## Module map (Grida ↔ Blink)

| Grida file (`crates/grida/src/htmlcss/svg/`) | Blink anchor (`third_party/blink/renderer/`)                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `error.rs`                                   | (Grida-only) renderer error type                                                |
| `context.rs`                                 | host hooks (image / font / css providers)                                       |
| `dom/element.rs`                             | `core/svg/svg_*_element.{h,cc}` (one per tag)                                   |
| `dom/attrs.rs`                               | `core/svg/svg_animated_*.{h,cc}` (typed; static, no animVal)                    |
| `dom/path_d.rs`                              | `core/svg/svg_path_*` parser family                                             |
| `dom/parser.rs`                              | `core/svg/svg_parser_utilities.cc` + Blink XML parser frontend                  |
| `dom/href.rs`                                | `core/svg/svg_uri_reference.{h,cc}`                                             |
| `style/stylesheet.rs`                        | `core/css/parser/css_parser_impl.cc` (a tiny in-tree subset; see note above)    |
| `style/stylo_bridge.rs`                      | (placeholder) future Stylo cascade entry point                                  |
| `geometry/basic_shape.rs`                    | `core/css/basic_shape_functions.{h,cc}` + `core/style/basic_shapes.{h,cc}`      |
| `layout/bbox.rs`                             | scattered `core/layout/svg/*::ObjectBoundingBox` overrides                      |
| `layout/transform.rs`                        | `core/layout/svg/transform_helper.{h,cc}`                                       |
| `layout/viewport.rs`                         | `core/layout/svg/layout_svg_viewport_container.{h,cc}` + viewBox math           |
| `layout/layout_svg_element.rs`               | (bridge type) thin wrapper paint/resources see for "an SVG element"             |
| `paint/svg_painter.rs`                       | (trait) uniform painter contract (Blink: `*Painter::Paint(PaintInfo)`)          |
| `paint/scoped_svg_paint_state.rs`            | `core/paint/scoped_svg_paint_state.{h,cc}`                                      |
| `paint/svg_object_painter.rs`                | `core/paint/svg_object_painter.{h,cc}`                                          |
| `paint/svg_root_painter.rs`                  | `core/paint/svg_root_painter.{h,cc}`                                            |
| `paint/svg_container_painter.rs`             | `core/paint/svg_container_painter.{h,cc}`                                       |
| `paint/svg_shape_painter.rs`                 | `core/paint/svg_shape_painter.{h,cc}`                                           |
| `paint/svg_text_painter.rs`                  | `core/layout/svg/svg_text_layout_algorithm.{h,cc}` + HTML inline-text painter   |
| `paint/svg_image_painter.rs`                 | `core/paint/svg_image_painter.{h,cc}`                                           |
| `paint/svg_use_painter.rs`                   | `core/svg/svg_use_element.{h,cc}` shadow-tree expansion                         |
| `paint/svg_marker_painter.rs`                | `core/paint/marker_range_mapping_context.{h,cc}` + svg_shape_painter:256–323    |
| `paint/clip_path_clipper.rs`                 | `core/paint/clip_path_clipper.{h,cc}`                                           |
| `paint/effects.rs`                           | (helpers) opacity, filter resolution, font-size resolution                      |
| `resources/svg_resources.rs`                 | `core/layout/svg/svg_resources.{h,cc}` + `layout_svg_resource_container.{h,cc}` |
| `resources/svg_resource_container.rs`        | (trait) uniform resource-container contract                                     |
| `resources/cache.rs`                         | (placeholder) per-client cache, mirrors `SVGElementResourceClient`              |
| `resources/paint_server.rs`                  | `core/layout/svg/layout_svg_resource_paint_server.{h,cc}`                       |
| `resources/gradient.rs`                      | `core/layout/svg/layout_svg_resource_gradient.{h,cc}` (+ linear/radial)         |
| `resources/pattern.rs`                       | `core/layout/svg/layout_svg_resource_pattern.{h,cc}`                            |
| `resources/clipper.rs`                       | `core/layout/svg/layout_svg_resource_clipper.{h,cc}`                            |
| `resources/masker.rs`                        | `core/layout/svg/layout_svg_resource_masker.{h,cc}`                             |
| `resources/filter.rs`                        | `core/layout/svg/layout_svg_resource_filter.{h,cc}`                             |
| `resources/svg_filter_builder.rs`            | `core/svg/graphics/filters/svg_filter_builder.{h,cc}` + `FilterEffect` family   |

## Cross-references

- [`docs/wg/research/chromium/svg/`](../../../../../docs/wg/research/chromium/svg/) — Source of pipeline shape.
- [`docs/wg/research/chromium/svg/comparison.md`](../../../../../docs/wg/research/chromium/svg/comparison.md) — Chromium / Servo / resvg cross-engine compare.
- [`docs/wg/feat-2d/htmlcss-svg.md`](../../../../../docs/wg/feat-2d/htmlcss-svg.md) — Grida-side study + design notes.
- [`crates/grida/src/htmlcss/`](../) — The host pipeline.
- [`crates/grida/src/import/svg/`](../../import/svg/) — SVG → canvas IR (different role).
- [`crates/grida/src/formats/svg/`](../../formats/svg/) — string-level SVG tooling (different role).
- [`.agents/skills/dev-render-htmlcss-feature/SKILL.md`](../../../../../.agents/skills/dev-render-htmlcss-feature/SKILL.md) — Feature loop (per-feature work).
- [`.agents/skills/render-reftest/SKILL.md`](../../../../../.agents/skills/render-reftest/SKILL.md) — Reftest gate.
