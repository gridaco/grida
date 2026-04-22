---
title: "HTML+CSS Embed Renderer"
format: md
tags:
  - internal
  - wg
  - feat-2d
  - htmlcss
---

# HTML+CSS Embed Renderer

Renders HTML+CSS to a Skia Picture for opaque embedding on the canvas
(HTMLEmbedNode).

**Source:** `crates/grida-canvas/src/htmlcss/`

---

## Architecture

Three-phase pipeline inspired by Chromium's Style → Layout → Paint separation.
All Skia object construction is deferred to phase 3 because Stylo's global
DOM slot corrupts Skia objects built during `borrow_data()` traversal.

```
Phase 1: Collect (collect.rs)     Phase 2: Layout (layout.rs)     Phase 3: Paint (paint.rs)
┌──────────────────────┐   tree   ┌──────────────────────┐  tree  ┌──────────────────────┐
│ csscascade (Stylo)   │ ──────►  │ Taffy (block/flex/   │ ────►  │ Skia PictureRecorder │
│ ComputedValues →     │ Styled   │ grid layout)         │ Layout │ Canvas draw ops      │
│ StyledElement tree   │ Element  │ + MeasureFunc for    │ Box    │ Paragraph, Paint,    │
│ (plain Rust, no Skia)│          │ text (Skia Para)     │        │ RRect, Shader        │
└──────────────────────┘          └──────────────────────┘        └──────────────────────┘
```

**Module structure:**

| File         | Purpose                                                              |
| ------------ | -------------------------------------------------------------------- |
| `mod.rs`     | Public API: `render()`, `measure_content_height()`, `ImageProvider`  |
| `types.rs`   | CSS-specific enums (Display, Position, Overflow, FlexDirection, ...) |
| `style.rs`   | StyledElement IR, reusing cg primitives where aligned                |
| `collect.rs` | Stylo DOM → StyledElement tree (no Skia objects)                     |
| `layout.rs`  | StyledElement → Taffy → LayoutBox tree (positioned)                  |
| `paint.rs`   | LayoutBox → Skia Picture (backgrounds, borders, text, gradients)     |

---

## CG type reuse

Types from `cg::prelude` reused where they 100% align with CSS semantics:

| cg type               | CSS property                          |
| --------------------- | ------------------------------------- |
| `CGColor`             | color, background-color, border-color |
| `EdgeInsets`          | padding (resolved px)                 |
| `BlendMode`           | mix-blend-mode                        |
| `TextAlign`           | text-align                            |
| `FontWeight`          | font-weight                           |
| `TextTransform`       | text-transform                        |
| `TextDecorationStyle` | text-decoration-style                 |

---

## CSS Property Support

**Status key:** ✅ supported | ⚠️ partial | ❌ not yet

### Display & Box Generation

| CSS Property            | Status | Notes                                             |
| ----------------------- | ------ | ------------------------------------------------- |
| `display: block`        | ✅     | Via Taffy `Display::Block` with margin collapsing |
| `display: inline`       | ✅     | Merged into parent's Paragraph as InlineRunItem   |
| `display: inline-block` | ⚠️     | Treated as inline                                 |
| `display: none`         | ✅     | Subtree skipped                                   |
| `display: flex`         | ✅     | Via Taffy — direction, wrap, align, justify, gap  |
| `display: inline-flex`  | ❌     |                                                   |
| `display: grid`         | ✅     | Via Taffy `Display::Grid` — full property support |
| `display: inline-grid`  | ❌     |                                                   |
| `display: list-item`    | ✅     | Marker text generated (bullet/number)             |
| `display: table`        | ⚠️     | Falls back to block flow (no column grid)         |
| `display: table-row`    | ⚠️     | Falls back to flex (faux-table)                   |
| `display: table-cell`   | ⚠️     | Falls back to flex item                           |
| `display: contents`     | ❌     |                                                   |
| `display: flow-root`    | ❌     |                                                   |

### Box Model

| CSS Property                  | Status | Notes                                           |
| ----------------------------- | ------ | ----------------------------------------------- |
| `width`, `height`             | ✅     | px and auto                                     |
| `width`, `height` (%)         | ⚠️     | % not resolved against parent                   |
| `min-width`, `max-width`      | ✅     | Via Taffy                                       |
| `min-height`, `max-height`    | ✅     | Via Taffy                                       |
| `aspect-ratio`                | ⚠️     | Via Taffy; broken in flex layouts ([taffy#804]) |
| `inline-size`, `block-size`   | ✅     | Stylo cascade maps to width/height (LTR)        |
| `min-inline-size`, etc.       | ✅     | Stylo cascade maps to min/max width/height      |
| `padding` (all sides)         | ✅     | px values                                       |
| `margin` (all sides)          | ✅     | px, auto; collapsing via Taffy block flow       |
| `box-sizing`                  | ✅     | Via Taffy                                       |
| `overflow`                    | ✅     | hidden/clip via canvas clip_rect                |
| `overflow-x`, `overflow-y`    | ⚠️     | Mapped to single overflow axis                  |
| `overflow-clip-margin`        | ✅     | px expands the clip rect when `overflow: clip`  |
| `overflow-wrap` / `word-wrap` | ❌     |                                                 |
| `resize`                      | ❌     |                                                 |

### Positioning

| CSS Property                     | Status | Notes                                                                               |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `position: static`               | ✅     | Default                                                                             |
| `position: relative`             | ✅     | Via Taffy                                                                           |
| `position: absolute`             | ✅     | Via Taffy                                                                           |
| `position: fixed`                | ❌     |                                                                                     |
| `position: sticky`               | ❌     |                                                                                     |
| `top`, `right`, `bottom`, `left` | ✅     | Extracted as CssLength (px/%/auto)                                                  |
| `inset` (shorthand)              | ❌     |                                                                                     |
| `inset-block`, `inset-inline`    | ✅     | Stylo cascade maps to top/right/bottom/left (LTR)                                   |
| `z-index`                        | ✅     | Sibling paint order (§9.9.1 subset; no stacking contexts for opacity/transform yet) |
| `float`                          | ❌     | Recognized in collect, no layout effect                                             |
| `clear`                          | ❌     | Recognized in collect, no layout effect                                             |

### Flexbox

| CSS Property      | Status | Notes                                   |
| ----------------- | ------ | --------------------------------------- |
| `flex-direction`  | ✅     | Via Taffy                               |
| `flex-wrap`       | ✅     | Via Taffy                               |
| `flex-flow`       | ✅     | Shorthand; direction + wrap             |
| `align-items`     | ✅     | Via Taffy                               |
| `align-self`      | ✅     | Via Taffy                               |
| `align-content`   | ✅     | Via Taffy                               |
| `justify-content` | ✅     | Via Taffy                               |
| `justify-items`   | ✅     | Via Taffy (grid)                        |
| `justify-self`    | ✅     | Via Taffy (grid)                        |
| `place-content`   | ✅     | Shorthand — cascades to align + justify |
| `place-items`     | ✅     | Shorthand — cascades to align + justify |
| `place-self`      | ✅     | Shorthand — cascades to align + justify |
| `flex-grow`       | ✅     | Via Taffy                               |
| `flex-shrink`     | ✅     | Via Taffy                               |
| `flex-basis`      | ✅     | Via Taffy                               |
| `flex`            | ✅     | Shorthand                               |
| `gap`             | ✅     | Via Taffy                               |
| `row-gap`         | ✅     | Via Taffy                               |
| `column-gap`      | ✅     | Via Taffy                               |
| `order`           | ❌     |                                         |

### Grid

| CSS Property             | Status | Notes                                             |
| ------------------------ | ------ | ------------------------------------------------- |
| `grid-template-columns`  | ✅     | px, %, fr, minmax(), fit-content(), repeat()      |
| `grid-template-rows`     | ✅     | px, %, fr, minmax(), fit-content(), repeat()      |
| `grid-template-areas`    | ❌     | Not collected from Stylo (named areas not mapped) |
| `grid-template`          | ❌     | Shorthand                                         |
| `grid-auto-columns`      | ✅     | Implicit track sizing                             |
| `grid-auto-rows`         | ✅     | Implicit track sizing                             |
| `grid-auto-flow`         | ✅     | row, column, dense                                |
| `grid-column-start/end`  | ✅     | Line numbers, span                                |
| `grid-row-start/end`     | ✅     | Line numbers, span                                |
| `grid-column`            | ✅     | Shorthand                                         |
| `grid-row`               | ✅     | Shorthand                                         |
| `grid-area`              | ❌     | Named area placement not supported                |
| `grid`                   | ❌     | Shorthand                                         |
| `repeat(auto-fill, ...)` | ✅     | Via Taffy                                         |
| `repeat(auto-fit, ...)`  | ✅     | Via Taffy                                         |
| Named grid lines         | ❌     | Line names ignored; numeric placement only        |
| `subgrid`                | ❌     | Taffy does not support subgrid                    |

### Sizing Keywords

| CSS Property                 | Status | Notes                     |
| ---------------------------- | ------ | ------------------------- |
| `min-content`, `max-content` | ❌     | Intrinsic sizing keywords |
| `fit-content`                | ❌     |                           |
| `contain-intrinsic-size`     | ❌     |                           |

### Background

| CSS Property                          | Status | Notes                                                                                                                                                                                                   |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background-color`                    | ✅     | Solid color with border-radius                                                                                                                                                                          |
| `background-image: url()`             | ✅     | Via `ImageProvider` trait                                                                                                                                                                               |
| `linear-gradient()`                   | ✅     | All directions + angles, multi-stop, px / % / currentcolor stops                                                                                                                                        |
| `radial-gradient()`                   | ✅     | Shape (circle/ellipse), extent keywords, explicit radii, position                                                                                                                                       |
| `conic-gradient()`                    | ✅     | `from <angle> at <position>`, repeating variant                                                                                                                                                         |
| `repeating-*-gradient()`              | ✅     | Px and % stops both tile correctly                                                                                                                                                                      |
| Gradient `color-interpolation-method` | ⚠️     | Extraction + Skia wiring done; explicit `in <space>` syntax gated by Stylo's `layout.css.gradient-color-interpolation-method` pref (default off). Auto path (sRGB vs Oklab based on stop colors) works. |
| Multi-layer backgrounds               | ✅     | Stacked gradient + solid + URL layers                                                                                                                                                                   |
| `background-position`                 | ✅     | Per-layer, px/%/keyword per axis                                                                                                                                                                        |
| `background-size`                     | ✅     | `cover`/`contain`/`auto`/explicit (with aspect preservation)                                                                                                                                            |
| `background-repeat`                   | ✅     | `repeat`/`no-repeat`/`repeat-x`/`repeat-y`/`space`/`round`; `space` distributes whitespace between edge-pinned copies, `round` scales tile to fit integer copies                                        |
| `background-origin`                   | ✅     | `border-box`/`padding-box`/`content-box`                                                                                                                                                                |
| `background-clip`                     | ✅     | `border-box`/`padding-box`/`content-box`; border-box clip honors radius                                                                                                                                 |
| `background-attachment`               | ❌     |                                                                                                                                                                                                         |
| `background-blend-mode`               | ❌     | Different from `mix-blend-mode`                                                                                                                                                                         |
| `background` (shorthand)              | ✅     | Color, gradient, url(), size, position, repeat, clip, origin layers                                                                                                                                     |

### Border

| CSS Property               | Status | Notes                                                 |
| -------------------------- | ------ | ----------------------------------------------------- |
| `border-width` (all sides) | ✅     |                                                       |
| `border-color` (all sides) | ✅     |                                                       |
| `border-style` (all sides) | ✅     | All 9 styles painted                                  |
| `border-style: groove`     | ✅     | Per-side darken/lighten (50% shade)                   |
| `border-style: ridge`      | ✅     | Per-side lighten/darken (inverse of groove)           |
| `border-style: inset`      | ✅     | Top/left darker, bottom/right lighter                 |
| `border-style: outset`     | ✅     | Inverse of inset                                      |
| `border-style: double`     | ✅     | Two 1/3-width strokes with 1/3 gap                    |
| `border-radius`            | ✅     | Per-corner elliptical (separate rx/ry)                |
| `border` (shorthand)       | ✅     |                                                       |
| `border-image`             | ✅     | 9-slice via `ImageProvider`                           |
| `border-image-outset`      | ✅     | Extends border-image area                             |
| `border-image-repeat`      | ✅     | stretch/repeat/round/space                            |
| `border-image-slice`       | ✅     | px values; `fill` keyword                             |
| `border-image-source`      | ✅     | url() via `ImageProvider`                             |
| `border-image-width`       | ✅     | px values; falls back to border-width                 |
| `border-collapse`          | ❌     |                                                       |
| `border-spacing`           | ❌     |                                                       |
| Logical border properties  | ✅     | `border-block-*`, `border-inline-*` via Stylo cascade |

### Outline

| CSS Property     | Status | Notes                                                                            |
| ---------------- | ------ | -------------------------------------------------------------------------------- |
| `outline`        | ✅     | Shorthand; solid/dashed/dotted painted                                           |
| `outline-color`  | ✅     | currentcolor fallback                                                            |
| `outline-style`  | ✅     | solid/dashed/dotted/double painted; groove/ridge/inset/outset fall back to solid |
| `outline-width`  | ✅     |                                                                                  |
| `outline-offset` | ✅     | Positive (outward) and negative (inward)                                         |

### Box Shadow

| CSS Property         | Status | Notes                                |
| -------------------- | ------ | ------------------------------------ |
| `box-shadow` (outer) | ✅     | blur, spread, offset, border-radius  |
| `box-shadow: inset`  | ✅     | clip + EvenOdd frame via PathBuilder |
| Multiple shadows     | ✅     | All shadows stacked in order         |

### Color

| CSS Property          | Status | Notes                 |
| --------------------- | ------ | --------------------- |
| `color`               | ✅     | Inherited             |
| `opacity`             | ✅     | Via canvas save_layer |
| `color-scheme`        | ❌     |                       |
| `accent-color`        | ❌     |                       |
| `forced-color-adjust` | ❌     |                       |
| `print-color-adjust`  | ❌     |                       |

### Font

| CSS Property                | Status | Notes                                     |
| --------------------------- | ------ | ----------------------------------------- |
| `font` (shorthand)          | ❌     |                                           |
| `font-family`               | ✅     | Generic families mapped to platform names |
| `font-size`                 | ✅     | Computed px                               |
| `font-weight`               | ✅     | 100–900                                   |
| `font-style`                | ✅     | italic                                    |
| `font-stretch`              | ❌     |                                           |
| `font-size-adjust`          | ❌     |                                           |
| `font-kerning`              | ❌     |                                           |
| `font-optical-sizing`       | ❌     |                                           |
| `font-synthesis`            | ❌     | Shorthand                                 |
| `font-synthesis-weight`     | ❌     |                                           |
| `font-synthesis-style`      | ❌     |                                           |
| `font-synthesis-small-caps` | ❌     |                                           |
| `font-variant` (shorthand)  | ❌     |                                           |
| `font-variant-ligatures`    | ❌     |                                           |
| `font-variant-caps`         | ❌     |                                           |
| `font-variant-numeric`      | ❌     |                                           |
| `font-variant-east-asian`   | ❌     |                                           |
| `font-variant-alternates`   | ❌     |                                           |
| `font-variant-position`     | ❌     |                                           |
| `font-variant-emoji`        | ❌     |                                           |
| `font-feature-settings`     | ❌     |                                           |
| `font-variation-settings`   | ❌     |                                           |
| `font-language-override`    | ❌     |                                           |
| `font-palette`              | ❌     |                                           |

### Text Layout

| CSS Property                  | Status | Notes                                                                     |
| ----------------------------- | ------ | ------------------------------------------------------------------------- |
| `line-height`                 | ✅     | normal, number, length                                                    |
| `letter-spacing`              | ✅     |                                                                           |
| `word-spacing`                | ✅     |                                                                           |
| `text-align`                  | ✅     | left, right, center, justify                                              |
| `text-align-last`             | ❌     |                                                                           |
| `text-justify`                | ❌     |                                                                           |
| `text-indent`                 | ✅     | px + % resolved against container; negative (hanging) indent clamped to 0 |
| `text-transform`              | ✅     | uppercase, lowercase, capitalize                                          |
| `white-space`                 | ✅     | normal, pre, pre-wrap, pre-line, nowrap                                   |
| `white-space-collapse`        | ❌     |                                                                           |
| `word-break`                  | ❌     |                                                                           |
| `overflow-wrap` / `word-wrap` | ❌     |                                                                           |
| `line-break`                  | ❌     |                                                                           |
| `hyphens`                     | ❌     |                                                                           |
| `hyphenate-character`         | ❌     |                                                                           |
| `hyphenate-limit-chars`       | ❌     |                                                                           |
| `tab-size`                    | ❌     |                                                                           |
| `text-overflow`               | ❌     | Enum defined (Clip/Ellipsis), not extracted                               |
| `text-wrap`                   | ❌     |                                                                           |
| `text-wrap-mode`              | ❌     |                                                                           |
| `text-wrap-style`             | ❌     |                                                                           |
| `hanging-punctuation`         | ❌     |                                                                           |
| `text-spacing-trim`           | ❌     |                                                                           |
| `text-autospace`              | ❌     |                                                                           |
| `widows`                      | ❌     |                                                                           |
| `orphans`                     | ❌     |                                                                           |

### Text Decoration

| CSS Property                  | Status | Notes                                                          |
| ----------------------------- | ------ | -------------------------------------------------------------- |
| `text-decoration` (shorthand) | ✅     | underline, line-through, overline (bitfield — simultaneous)    |
| `text-decoration-line`        | ✅     |                                                                |
| `text-decoration-style`       | ✅     | solid/double/dotted/dashed/wavy via Skia `TextDecorationStyle` |
| `text-decoration-color`       | ✅     | `currentcolor` falls back to text color                        |
| `text-decoration-thickness`   | ❌     |                                                                |
| `text-decoration-skip-ink`    | ❌     |                                                                |
| `text-underline-position`     | ❌     |                                                                |
| `text-underline-offset`       | ❌     |                                                                |

### Text Shadow & Emphasis

| CSS Property             | Status | Notes                                                            |
| ------------------------ | ------ | ---------------------------------------------------------------- |
| `text-shadow`            | ✅     | Offset + blur + color; stacked, via Skia `TextStyle::add_shadow` |
| `text-emphasis`          | ❌     |                                                                  |
| `text-emphasis-style`    | ❌     |                                                                  |
| `text-emphasis-color`    | ❌     |                                                                  |
| `text-emphasis-position` | ❌     |                                                                  |

### Writing Modes & BiDi

| CSS Property           | Status | Notes |
| ---------------------- | ------ | ----- |
| `direction`            | ✅     | ltr/rtl — Skia paragraph base direction; also resolves logical `text-align: start/end` |
| `writing-mode`         | ❌     |       |
| `unicode-bidi`         | ❌     |       |
| `text-orientation`     | ❌     |       |
| `text-combine-upright` | ❌     |       |

### Inline Layout & Alignment

| CSS Property         | Status | Notes                       |
| -------------------- | ------ | --------------------------- |
| `vertical-align`     | ❌     | Enum defined, not extracted |
| `dominant-baseline`  | ❌     |                             |
| `alignment-baseline` | ❌     |                             |
| `baseline-shift`     | ❌     |                             |
| `initial-letter`     | ❌     |                             |

### Ruby

| CSS Property    | Status | Notes |
| --------------- | ------ | ----- |
| `ruby-position` | ❌     |       |
| `ruby-align`    | ❌     |       |
| `ruby-overhang` | ❌     |       |

### Lists

| Feature                        | Status | Notes                                         |
| ------------------------------ | ------ | --------------------------------------------- |
| `<ul>` with disc/circle/square | ✅     | Marker text prepended to list item content    |
| `<ol>` with decimal numbering  | ✅     | Auto-incrementing counter                     |
| `lower-alpha`, `upper-alpha`   | ✅     |                                               |
| `lower-roman`, `upper-roman`   | ⚠️     | Via HTML `<ol type="i">`/`"I"` attribute (Stylo servo can't parse the CSS form) |
| `list-style-type: none`        | ✅     |                                               |
| `list-style-image`             | ❌     |                                               |
| `list-style-position`          | ❌     |                                               |
| `list-style` (shorthand)       | ⚠️     | type only                                     |
| Nested lists                   | ✅     | Independent counters per list                 |

### Visual Effects

| CSS Property     | Status | Notes                          |
| ---------------- | ------ | ------------------------------ |
| `opacity`        | ✅     | Via canvas save_layer          |
| `visibility`     | ✅     | hidden/collapse skips painting |
| `mix-blend-mode` | ✅     | All CSS blend modes            |
| `isolation`      | ❌     |                                |

### Transform

| CSS Property          | Status | Notes                                                 |
| --------------------- | ------ | ----------------------------------------------------- |
| `transform`           | ✅     | 2D: translate, rotate, scale, skew, matrix            |
| `transform-origin`    | ✅     | Percentage-based origins (default 50% 50%)            |
| `transform-box`       | ❌     |                                                       |
| `transform-style`     | ❌     |                                                       |
| `translate`           | ✅     | Standalone longhand, applies before `transform:`      |
| `rotate`              | ✅     | Standalone longhand; 2D and z-axis-only 3D `rotate3d` |
| `scale`               | ✅     | Standalone longhand, uniform and `sx sy`              |
| `perspective`         | ❌     |                                                       |
| `perspective-origin`  | ❌     |                                                       |
| `backface-visibility` | ❌     |                                                       |

### Filter & Effects

| CSS Property      | Status | Notes                                                                                   |
| ----------------- | ------ | --------------------------------------------------------------------------------------- |
| `filter`          | ✅     | blur + 8 color filters + drop-shadow; `url()` SVG refs TODO                             |
| `backdrop-filter` | ❌     |                                                                                         |
| `clip-path`       | ✅     | `inset()` / `circle()` / `ellipse()` / `polygon()`; `url()` and `path()`/`shape()` TODO |
| `clip-rule`       | ❌     |                                                                                         |
| `mask`            | ❌     |                                                                                         |
| `mask-image`      | ❌     |                                                                                         |
| `mask-clip`       | ❌     |                                                                                         |
| `mask-composite`  | ❌     |                                                                                         |
| `mask-mode`       | ❌     |                                                                                         |
| `mask-origin`     | ❌     |                                                                                         |
| `mask-position`   | ❌     |                                                                                         |
| `mask-repeat`     | ❌     |                                                                                         |
| `mask-size`       | ❌     |                                                                                         |
| `mask-type`       | ❌     |                                                                                         |

### CSS Motion Path (Offset)

| CSS Property      | Status | Notes |
| ----------------- | ------ | ----- |
| `offset`          | ❌     |       |
| `offset-path`     | ❌     |       |
| `offset-distance` | ❌     |       |
| `offset-rotate`   | ❌     |       |
| `offset-anchor`   | ❌     |       |
| `offset-position` | ❌     |       |

### Multi-column Layout

| CSS Property   | Status | Notes                          |
| -------------- | ------ | ------------------------------ |
| `columns`      | ❌     |                                |
| `column-count` | ❌     |                                |
| `column-width` | ❌     |                                |
| `column-gap`   | ✅     | Via Taffy gap (flex/grid only) |
| `column-rule`  | ❌     |                                |
| `column-span`  | ❌     |                                |
| `column-fill`  | ❌     |                                |
| `break-before` | ❌     |                                |
| `break-after`  | ❌     |                                |
| `break-inside` | ❌     |                                |

### Table Layout

| CSS Property      | Status | Notes |
| ----------------- | ------ | ----- |
| `table-layout`    | ❌     |       |
| `border-collapse` | ❌     |       |
| `border-spacing`  | ❌     |       |
| `caption-side`    | ❌     |       |
| `empty-cells`     | ❌     |       |

### Generated Content & Counters

| CSS Property               | Status | Notes                             |
| -------------------------- | ------ | --------------------------------- |
| `content` (::before/after) | ❌     | Pseudo-elements not supported     |
| `counter-reset`            | ❌     | Internal counters for `<ol>` only |
| `counter-increment`        | ❌     |                                   |
| `counter-set`              | ❌     |                                   |
| `quotes`                   | ❌     |                                   |

### Scroll Snap

| CSS Property          | Status | Notes              |
| --------------------- | ------ | ------------------ |
| `scroll-snap-type`    | ❌     | Static render only |
| `scroll-snap-align`   | ❌     | Static render only |
| `scroll-snap-stop`    | ❌     | Static render only |
| `scroll-padding`      | ❌     |                    |
| `scroll-margin`       | ❌     |                    |
| `scroll-behavior`     | ❌     |                    |
| `overscroll-behavior` | ❌     |                    |

### Scrollbar

| CSS Property       | Status | Notes |
| ------------------ | ------ | ----- |
| `scrollbar-width`  | ❌     |       |
| `scrollbar-color`  | ❌     |       |
| `scrollbar-gutter` | ❌     |       |

### Contain & Content Visibility

| CSS Property         | Status | Notes |
| -------------------- | ------ | ----- |
| `contain`            | ❌     |       |
| `content-visibility` | ❌     |       |
| `will-change`        | ❌     |       |

### Image Rendering

| CSS Property        | Status | Notes                                                  |
| ------------------- | ------ | ------------------------------------------------------ |
| `image-rendering`   | ✅     | `auto` → bilinear; `pixelated`/`crisp-edges` → nearest |
| `image-orientation` | ❌     |                                                        |
| `object-fit`        | ✅     | Fill, Contain, Cover, None, ScaleDown                  |
| `object-position`   | ✅     | Per-axis px / % / keywords                             |
| `object-view-box`   | ❌     |                                                        |

### Shape (Floats)

| CSS Property            | Status | Notes |
| ----------------------- | ------ | ----- |
| `shape-outside`         | ❌     |       |
| `shape-margin`          | ❌     |       |
| `shape-image-threshold` | ❌     |       |

### SVG Presentation Attributes

| CSS Property          | Status | Notes                     |
| --------------------- | ------ | ------------------------- |
| `fill`                | ❌     | SVG elements not rendered |
| `fill-opacity`        | ❌     |                           |
| `fill-rule`           | ❌     |                           |
| `stroke`              | ❌     |                           |
| `stroke-width`        | ❌     |                           |
| `stroke-opacity`      | ❌     |                           |
| `stroke-dasharray`    | ❌     |                           |
| `stroke-dashoffset`   | ❌     |                           |
| `stroke-linecap`      | ❌     |                           |
| `stroke-linejoin`     | ❌     |                           |
| `stroke-miterlimit`   | ❌     |                           |
| `paint-order`         | ❌     |                           |
| `vector-effect`       | ❌     |                           |
| `marker`, `marker-*`  | ❌     |                           |
| `clip-rule`           | ❌     |                           |
| `color-interpolation` | ❌     |                           |
| `flood-color`         | ❌     |                           |
| `flood-opacity`       | ❌     |                           |
| `stop-color`          | ❌     |                           |
| `stop-opacity`        | ❌     |                           |
| `lighting-color`      | ❌     |                           |
| `text-anchor`         | ❌     |                           |
| `<svg>` inline        | ❌     |                           |

### Replaced Elements

| CSS Property          | Status | Notes                                             |
| --------------------- | ------ | ------------------------------------------------- |
| `<img>` rendering     | ✅     | Via `ImageProvider` trait; placeholder if missing |
| `object-fit`          | ✅     | Fill, Contain, Cover, None, ScaleDown             |
| `<video>`, `<canvas>` | ❌     |                                                   |

### Interaction & UI

| CSS Property     | Status | Notes                         |
| ---------------- | ------ | ----------------------------- |
| `cursor`         | ❌     | Not relevant for canvas embed |
| `pointer-events` | ❌     | Not relevant for canvas embed |
| `user-select`    | ❌     | Not relevant for canvas embed |
| `touch-action`   | ❌     | Not relevant for canvas embed |
| `caret-color`    | ❌     |                               |
| `appearance`     | ❌     |                               |

### Animation & Transition

| CSS Property                 | Status | Notes              |
| ---------------------------- | ------ | ------------------ |
| `transition`                 | ❌     | Static render only |
| `transition-property`        | ❌     | Static render only |
| `transition-duration`        | ❌     | Static render only |
| `transition-delay`           | ❌     | Static render only |
| `transition-timing-function` | ❌     | Static render only |
| `animation`                  | ❌     | Static render only |
| `animation-name`             | ❌     | Static render only |
| `animation-duration`         | ❌     | Static render only |
| `animation-delay`            | ❌     | Static render only |
| `animation-iteration-count`  | ❌     | Static render only |
| `animation-direction`        | ❌     | Static render only |
| `animation-timing-function`  | ❌     | Static render only |
| `animation-fill-mode`        | ❌     | Static render only |
| `animation-play-state`       | ❌     | Static render only |
| `animation-timeline`         | ❌     | Static render only |

### CSS Variables & Functions

| Feature                     | Status | Notes                |
| --------------------------- | ------ | -------------------- |
| Custom properties (`var()`) | ❌     | `var()` not resolved |
| `calc()`                    | ⚠️     | Stylo resolves to px |
| `clamp()`, `min()`, `max()` | ⚠️     | Stylo resolves to px |
| `env()`                     | ❌     |                      |

### Inline Elements (HTML)

| Feature                            | Status | Notes                                                              |
| ---------------------------------- | ------ | ------------------------------------------------------------------ |
| `<strong>`, `<em>`, `<b>`, `<i>`   | ✅     | Bold/italic via font properties                                    |
| `<u>`, `<ins>`                     | ✅     | Underline decoration                                               |
| `<s>`, `<del>`, `<strike>`         | ✅     | Line-through decoration                                            |
| `<small>`                          | ✅     | Smaller font size                                                  |
| `<code>`, `<kbd>`, `<mark>`        | ✅     | Background, border, border-radius, padding via InlineBoxDecoration |
| Inline box padding as layout space | ✅     | Skia placeholders at OpenBox/CloseBox boundaries                   |
| Text wrapping with inline boxes    | ✅     | Taffy MeasureFunc with Skia Paragraph                              |

---

## Key Design Decisions

### Subpixel layout

Taffy rounding is disabled (`taffy.disable_rounding()`) to match Chromium's
subpixel layout precision. Text intrinsic width is ceiled to prevent
subpixel-induced wrapping.

### Inline box model

Follows Chromium's `kOpenTag`/`kCloseTag` model. `InlineRunItem::OpenBox`
and `CloseBox` inject Skia placeholders that consume inline space matching
`padding + border` width. Decoration rects are painted using
`Paragraph::get_rects_for_range()`.

### Image loading (ImageProvider trait)

Images (`<img src>`, `background-image: url()`) are resolved via a host-provided
`ImageProvider` trait. The pipeline never blocks on image loads — missing `<img>`
elements render as placeholder rects, while missing `background-image` layers are
silently skipped. This mirrors Chromium's non-blocking resource loading pattern
(see `docs/wg/research/chromium/external-resource-loading.md`).

Three use cases:

- **Pre-resolved (CLI):** Host loads images before calling `render()`. Pass a
  `HashMap<String, Image>` wrapper as the provider.
- **Async drain (WASM):** Render with `NoImages` → inspect output → host fetches
  missing URLs → re-render with populated provider.
- **Canvas runtime:** `ImageRepository` implements `ImageProvider` directly.

### Root margin stripping

`<html>` and `<body>` margins are zeroed in the collector since the embed
container provides its own bounds. Author padding is preserved.

### Whitespace collapsing

Inter-element whitespace (newlines/spaces between block elements) is detected
and dropped during inline group flushing to prevent empty 24px-tall blocks.

<!-- Link references -->

[taffy#804]: https://github.com/DioxusLabs/taffy/issues/804
