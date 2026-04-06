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
| `mod.rs`     | Public API: `render()`, `measure_content_height()`                   |
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

### Display & Layout

| CSS Property            | Status | Notes                                             |
| ----------------------- | ------ | ------------------------------------------------- |
| `display: block`        | ✅     | Via Taffy `Display::Block` with margin collapsing |
| `display: inline`       | ✅     | Merged into parent's Paragraph as InlineRunItem   |
| `display: none`         | ✅     | Subtree skipped                                   |
| `display: flex`         | ✅     | Via Taffy — direction, wrap, align, justify, gap  |
| `display: grid`         | ✅     | Via Taffy `Display::Grid`                         |
| `display: list-item`    | ✅     | Marker text generated (bullet/number)             |
| `display: table`        | ⚠️     | Falls back to block flow (no column grid)         |
| `display: inline-block` | ⚠️     | Treated as inline                                 |

### Box Model

| CSS Property               | Status | Notes                                     |
| -------------------------- | ------ | ----------------------------------------- |
| `width`, `height`          | ✅     | px and auto                               |
| `min-width`, `max-width`   | ✅     | Via Taffy                                 |
| `padding` (all sides)      | ✅     | px values                                 |
| `margin` (all sides)       | ✅     | px, auto; collapsing via Taffy block flow |
| `border-width/color/style` | ✅     | All sides; solid/dashed/dotted            |
| `border-radius`            | ✅     | Per-corner elliptical (separate rx/ry)    |
| `box-sizing`               | ✅     | Via Taffy                                 |

### Background

| CSS Property              | Status | Notes                               |
| ------------------------- | ------ | ----------------------------------- |
| `background-color`        | ✅     | Solid color with border-radius      |
| `linear-gradient()`       | ✅     | All directions + angles, multi-stop |
| `radial-gradient()`       | ✅     | Circle/ellipse                      |
| `conic-gradient()`        | ✅     | Sweep gradient                      |
| Multi-layer backgrounds   | ✅     | Stacked gradient + solid layers     |
| `background-image: url()` | ❌     |                                     |

### Text & Font

#### Color & Inheritance

| CSS Property | Status | Notes     |
| ------------ | ------ | --------- |
| `color`      | ✅     | Inherited |

#### Font Properties

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

#### Text Layout

| CSS Property                  | Status | Notes                                       |
| ----------------------------- | ------ | ------------------------------------------- |
| `line-height`                 | ✅     | normal, number, length                      |
| `letter-spacing`              | ✅     |                                             |
| `word-spacing`                | ✅     |                                             |
| `text-align`                  | ✅     | left, right, center, justify                |
| `text-align-last`             | ❌     |                                             |
| `text-justify`                | ❌     |                                             |
| `text-indent`                 | ❌     | Field defined in FontProps, not extracted   |
| `text-transform`              | ✅     | uppercase, lowercase, capitalize            |
| `white-space`                 | ✅     | normal, pre, pre-wrap, pre-line, nowrap     |
| `word-break`                  | ❌     |                                             |
| `overflow-wrap` / `word-wrap` | ❌     |                                             |
| `line-break`                  | ❌     |                                             |
| `hyphens`                     | ❌     |                                             |
| `hyphenate-character`         | ❌     |                                             |
| `hyphenate-limit-chars`       | ❌     |                                             |
| `tab-size`                    | ❌     |                                             |
| `text-overflow`               | ❌     | Enum defined (Clip/Ellipsis), not extracted |
| `text-wrap`                   | ❌     |                                             |
| `text-wrap-mode`              | ❌     |                                             |
| `text-wrap-style`             | ❌     |                                             |
| `hanging-punctuation`         | ❌     |                                             |
| `text-spacing-trim`           | ❌     |                                             |

#### Text Decoration

| CSS Property                  | Status | Notes                                                       |
| ----------------------------- | ------ | ----------------------------------------------------------- |
| `text-decoration` (shorthand) | ✅     | underline, line-through, overline (bitfield — simultaneous) |
| `text-decoration-line`        | ✅     |                                                             |
| `text-decoration-style`       | ⚠️     | Field defined, not extracted from Stylo                     |
| `text-decoration-color`       | ⚠️     | Field defined, not extracted from Stylo                     |
| `text-decoration-thickness`   | ❌     |                                                             |
| `text-decoration-skip-ink`    | ❌     |                                                             |
| `text-underline-position`     | ❌     |                                                             |
| `text-underline-offset`       | ❌     |                                                             |

#### Text Emphasis

| CSS Property             | Status | Notes |
| ------------------------ | ------ | ----- |
| `text-emphasis`          | ❌     |       |
| `text-emphasis-style`    | ❌     |       |
| `text-emphasis-color`    | ❌     |       |
| `text-emphasis-position` | ❌     |       |

#### Text Shadow

| CSS Property  | Status | Notes              |
| ------------- | ------ | ------------------ |
| `text-shadow` | ❌     | Not in type schema |

#### Writing Modes & BiDi

| CSS Property           | Status | Notes |
| ---------------------- | ------ | ----- |
| `direction`            | ❌     |       |
| `writing-mode`         | ❌     |       |
| `unicode-bidi`         | ❌     |       |
| `text-orientation`     | ❌     |       |
| `text-combine-upright` | ❌     |       |

#### Inline Layout & Alignment

| CSS Property         | Status | Notes                       |
| -------------------- | ------ | --------------------------- |
| `vertical-align`     | ❌     | Enum defined, not extracted |
| `dominant-baseline`  | ❌     |                             |
| `alignment-baseline` | ❌     |                             |
| `baseline-shift`     | ❌     |                             |
| `initial-letter`     | ❌     |                             |

#### Ruby

| CSS Property    | Status | Notes |
| --------------- | ------ | ----- |
| `ruby-position` | ❌     |       |
| `ruby-align`    | ❌     |       |

### Inline Elements

| Feature                            | Status | Notes                                                              |
| ---------------------------------- | ------ | ------------------------------------------------------------------ |
| `<strong>`, `<em>`, `<b>`, `<i>`   | ✅     | Bold/italic via font properties                                    |
| `<u>`, `<ins>`                     | ✅     | Underline decoration                                               |
| `<s>`, `<del>`, `<strike>`         | ✅     | Line-through decoration                                            |
| `<small>`                          | ✅     | Smaller font size                                                  |
| `<code>`, `<kbd>`, `<mark>`        | ✅     | Background, border, border-radius, padding via InlineBoxDecoration |
| Inline box padding as layout space | ✅     | Skia placeholders at OpenBox/CloseBox boundaries                   |
| Text wrapping with inline boxes    | ✅     | Taffy MeasureFunc with Skia Paragraph                              |

### Lists

| Feature                        | Status | Notes                                         |
| ------------------------------ | ------ | --------------------------------------------- |
| `<ul>` with disc/circle/square | ✅     | Marker text prepended to list item content    |
| `<ol>` with decimal numbering  | ✅     | Auto-incrementing counter                     |
| `lower-alpha`, `upper-alpha`   | ✅     |                                               |
| `lower-roman`, `upper-roman`   | ❌     | Stylo servo-mode limitation (servo/stylo#349) |
| `list-style-type: none`        | ✅     |                                               |
| Nested lists                   | ✅     | Independent counters per list                 |

### Visual Effects

| CSS Property         | Status | Notes                               |
| -------------------- | ------ | ----------------------------------- |
| `opacity`            | ✅     | Via canvas save_layer               |
| `visibility`         | ✅     | hidden/collapse skips painting      |
| `overflow`           | ✅     | hidden/clip via canvas clip_rect    |
| `box-shadow` (outer) | ✅     | blur, spread, offset, border-radius |
| `mix-blend-mode`     | ✅     | All CSS blend modes                 |

### Positioning

| CSS Property         | Status | Notes                               |
| -------------------- | ------ | ----------------------------------- |
| `position: static`   | ✅     | Default                             |
| `position: relative` | ✅     | Via Taffy                           |
| `position: absolute` | ✅     | Via Taffy                           |
| `z-index`            | ⚠️     | Stored but not used for paint order |

### Grid Layout

| CSS Property                          | Status | Notes                                    |
| ------------------------------------- | ------ | ---------------------------------------- |
| `display: grid`                       | ⚠️     | Taffy `Display::Grid`, no grid props yet |
| `grid-template-columns`               | ❌     |                                          |
| `grid-template-rows`                  | ❌     |                                          |
| `grid-template-areas`                 | ❌     |                                          |
| `grid-auto-columns`, `grid-auto-rows` | ❌     |                                          |
| `grid-auto-flow`                      | ❌     |                                          |
| `grid-column`, `grid-row`             | ❌     |                                          |
| `gap` (row-gap, column-gap)           | ✅     | Flex/grid gap via Taffy                  |

### Flexbox (detail)

| CSS Property      | Status | Notes     |
| ----------------- | ------ | --------- |
| `flex-direction`  | ✅     | Via Taffy |
| `flex-wrap`       | ✅     | Via Taffy |
| `align-items`     | ✅     | Via Taffy |
| `align-self`      | ✅     | Via Taffy |
| `align-content`   | ✅     | Via Taffy |
| `justify-content` | ✅     | Via Taffy |
| `justify-items`   | ❌     |           |
| `justify-self`    | ❌     |           |
| `flex-grow`       | ✅     | Via Taffy |
| `flex-shrink`     | ✅     | Via Taffy |
| `flex-basis`      | ✅     | Via Taffy |
| `order`           | ❌     |           |

### Sizing & Intrinsic Keywords

| CSS Property                 | Status | Notes                            |
| ---------------------------- | ------ | -------------------------------- |
| `width`, `height` (%)        | ⚠️     | px and auto only; % not resolved |
| `aspect-ratio`               | ❌     |                                  |
| `min-content`, `max-content` | ❌     | Intrinsic sizing keywords        |
| `fit-content`                | ❌     |                                  |

### Background (extended)

| CSS Property              | Status | Notes |
| ------------------------- | ------ | ----- |
| `background-position`     | ❌     |       |
| `background-size`         | ❌     |       |
| `background-repeat`       | ❌     |       |
| `background-origin`       | ❌     |       |
| `background-clip`         | ❌     |       |
| `background-attachment`   | ❌     |       |
| `background-image: url()` | ❌     |       |

### Box Shadow (detail)

| CSS Property         | Status | Notes                               |
| -------------------- | ------ | ----------------------------------- |
| `box-shadow` (outer) | ✅     | blur, spread, offset, border-radius |
| `box-shadow: inset`  | ❌     |                                     |
| Multiple shadows     | ❌     | Only first shadow painted           |

### Positioning (extended)

| CSS Property                     | Status | Notes                                   |
| -------------------------------- | ------ | --------------------------------------- |
| `position: fixed`                | ❌     |                                         |
| `position: sticky`               | ❌     |                                         |
| `top`, `right`, `bottom`, `left` | ⚠️     | Stub in collect.rs, returns defaults    |
| `z-index`                        | ⚠️     | Stored but not used for paint order     |
| `float`                          | ❌     | Recognized in collect, no layout effect |
| `clear`                          | ❌     | Recognized in collect, no layout effect |

### Transform & 3D

| CSS Property          | Status | Notes |
| --------------------- | ------ | ----- |
| `transform`           | ❌     |       |
| `transform-origin`    | ❌     |       |
| `perspective`         | ❌     |       |
| `backface-visibility` | ❌     |       |

### Filter & Effects

| CSS Property      | Status | Notes |
| ----------------- | ------ | ----- |
| `filter`          | ❌     |       |
| `backdrop-filter` | ❌     |       |
| `clip-path`       | ❌     |       |
| `mask`            | ❌     |       |
| `mask-image`      | ❌     |       |

### Outline

| CSS Property     | Status | Notes |
| ---------------- | ------ | ----- |
| `outline`        | ❌     |       |
| `outline-offset` | ❌     |       |

### Table Layout

| CSS Property          | Status | Notes                           |
| --------------------- | ------ | ------------------------------- |
| `display: table`      | ⚠️     | Falls back to block flow        |
| `display: table-row`  | ⚠️     | Falls back to flex (faux-table) |
| `display: table-cell` | ⚠️     | Falls back to flex item         |
| `border-collapse`     | ❌     |                                 |
| `border-spacing`      | ❌     |                                 |
| `table-layout`        | ❌     |                                 |
| `caption-side`        | ❌     |                                 |

### Multi-column Layout

| CSS Property   | Status | Notes                          |
| -------------- | ------ | ------------------------------ |
| `columns`      | ❌     |                                |
| `column-count` | ❌     |                                |
| `column-gap`   | ✅     | Via Taffy gap (flex/grid only) |
| `column-rule`  | ❌     |                                |
| `column-span`  | ❌     |                                |
| `column-width` | ❌     |                                |

### Generated Content & Counters

| CSS Property               | Status | Notes                             |
| -------------------------- | ------ | --------------------------------- |
| `content` (::before/after) | ❌     | Pseudo-elements not supported     |
| `counter-reset`            | ❌     | Internal counters for `<ol>` only |
| `counter-increment`        | ❌     |                                   |
| `quotes`                   | ❌     |                                   |

### Interaction & UI

| CSS Property     | Status | Notes                         |
| ---------------- | ------ | ----------------------------- |
| `cursor`         | ❌     | Not relevant for canvas embed |
| `pointer-events` | ❌     | Not relevant for canvas embed |
| `user-select`    | ❌     | Not relevant for canvas embed |
| `resize`         | ❌     |                               |
| `caret-color`    | ❌     |                               |

### Animation & Transition

| CSS Property | Status | Notes              |
| ------------ | ------ | ------------------ |
| `transition` | ❌     | Static render only |
| `animation`  | ❌     | Static render only |

### CSS Variables & Functions

| Feature                     | Status | Notes                |
| --------------------------- | ------ | -------------------- |
| Custom properties           | ❌     | `var()` not resolved |
| `calc()`                    | ⚠️     | Stylo resolves to px |
| `clamp()`, `min()`, `max()` | ⚠️     | Stylo resolves to px |
| `env()`                     | ❌     |                      |

### Replaced Elements

| CSS Property          | Status | Notes                     |
| --------------------- | ------ | ------------------------- |
| `object-fit`          | ❌     |                           |
| `object-position`     | ❌     |                           |
| `<img>` rendering     | ❌     | Images not loaded/painted |
| `<svg>` inline        | ❌     |                           |
| `<video>`, `<canvas>` | ❌     |                           |

### Border (extended)

| CSS Property           | Status | Notes                                   |
| ---------------------- | ------ | --------------------------------------- |
| `border-style: groove` | ❌     | Enum defined, paint falls back to solid |
| `border-style: ridge`  | ❌     | Enum defined, paint falls back to solid |
| `border-style: inset`  | ❌     | Enum defined, paint falls back to solid |
| `border-style: outset` | ❌     | Enum defined, paint falls back to solid |
| `border-style: double` | ❌     | Enum defined, paint falls back to solid |
| `border-image`         | ❌     |                                         |

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

### Root margin stripping

`<html>` and `<body>` margins are zeroed in the collector since the embed
container provides its own bounds. Author padding is preserved.

### Whitespace collapsing

Inter-element whitespace (newlines/spaces between block elements) is detected
and dropped during inline group flushing to prevent empty 24px-tall blocks.
