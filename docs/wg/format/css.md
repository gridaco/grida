# CSS Property Mapping

CSS → Grida IR property mapping table and TODO tracker.

**Status key:** ✅ mapped | ⚠️ partial | 🔧 IR exists, not wired | ❌ IR missing | 🚫 out of scope

**Import pipelines:** HTML import (`crates/grida-canvas/src/html/`), SVG import (via usvg, `crates/grida-canvas/src/svg/`).

---

## Box Model & Sizing

| CSS Property          | Grida IR Field                                    | Status | Notes                                 |
| --------------------- | ------------------------------------------------- | ------ | ------------------------------------- |
| `width`               | `LayoutDimensionStyle.layout_target_width`        | ✅     | px only; % not resolved               |
| `height`              | `LayoutDimensionStyle.layout_target_height`       | ✅     | px only                               |
| `min-width`           | `LayoutDimensionStyle.layout_min_width`           | ✅     |                                       |
| `min-height`          | `LayoutDimensionStyle.layout_min_height`          | ✅     |                                       |
| `max-width`           | `LayoutDimensionStyle.layout_max_width`           | ✅     |                                       |
| `max-height`          | `LayoutDimensionStyle.layout_max_height`          | ✅     |                                       |
| `padding` (all sides) | `LayoutContainerStyle.layout_padding`             | ✅     | EdgeInsets (top/right/bottom/left)    |
| `margin`              | --                                                | ❌     | Not in `LayoutChildStyle`             |
| `box-sizing`          | --                                                | ⚠️     | Assumed border-box; no explicit field |
| `aspect-ratio`        | `LayoutDimensionStyle.layout_target_aspect_ratio` | 🔧     | Field exists, CSS import not wired    |

## Display & Layout

| CSS Property                                  | Grida IR Field                                   | Status | Notes                                          |
| --------------------------------------------- | ------------------------------------------------ | ------ | ---------------------------------------------- |
| `display: flex`                               | `LayoutContainerStyle.layout_mode = Flex`        | ✅     |                                                |
| `display: block`                              | `layout_mode = Flex` (column)                    | ⚠️     | Approximated as flex column                    |
| `display: none`                               | (element skipped)                                | ✅     | Node not emitted                               |
| `display: inline`                             | --                                               | ❌     | Treated as block                               |
| `display: grid`                               | --                                               | ❌     | No grid in `LayoutMode`                        |
| `flex-direction` (row/column)                 | `layout_direction`                               | ✅     |                                                |
| `flex-direction` (row-reverse/column-reverse) | `layout_direction`                               | ⚠️     | Reverse info lost                              |
| `flex-wrap`                                   | `layout_wrap`                                    | ✅     |                                                |
| `flex-wrap: wrap-reverse`                     | `layout_wrap`                                    | ⚠️     | Reverse info lost                              |
| `align-items`                                 | `layout_cross_axis_alignment`                    | ✅     | start/center/end/stretch                       |
| `justify-content`                             | `layout_main_axis_alignment`                     | ✅     | start/center/end/between/around/evenly/stretch |
| `flex-grow`                                   | `LayoutChildStyle.layout_grow`                   | ✅     |                                                |
| `flex-shrink`                                 | --                                               | ❌     | Not in `LayoutChildStyle`; Taffy hardcodes 0.0 |
| `flex-basis`                                  | --                                               | ❌     | Not in IR                                      |
| `align-self`                                  | --                                               | ❌     | Not in `LayoutChildStyle`                      |
| `order`                                       | --                                               | ❌     | Not in IR                                      |
| `gap` / `row-gap` / `column-gap`              | `LayoutContainerStyle.layout_gap`                | ✅     | Direction-aware mapping                        |
| `position: absolute`                          | `LayoutChildStyle.layout_positioning = Absolute` | ✅     |                                                |
| `position: relative`                          | `LayoutChildStyle.layout_positioning = Auto`     | ✅     |                                                |
| `position: fixed/sticky`                      | --                                               | ❌     | No viewport-relative positioning               |
| `top/right/bottom/left`                       | --                                               | ❌     | No offset in `LayoutChildStyle`                |

## Background & Paint

| CSS Property              | Grida IR Field          | Status | Notes                           |
| ------------------------- | ----------------------- | ------ | ------------------------------- |
| `background-color`        | `Paint::Solid` in fills | ✅     | hex/rgb/rgba/named              |
| `linear-gradient()`       | `Paint::LinearGradient` | ✅     |                                 |
| `radial-gradient()`       | `Paint::RadialGradient` | ✅     |                                 |
| `conic-gradient()`        | `Paint::SweepGradient`  | ✅     |                                 |
| `background-image: url()` | `Paint::Image`          | 🔧     | IR exists, CSS import not wired |
| `background-size`         | --                      | ❌     | Not mapped                      |
| `background-position`     | --                      | ❌     | Not mapped                      |
| `background-repeat`       | --                      | ❌     | Not mapped                      |
| `background-clip: text`   | --                      | ❌     | No text-clip paint              |

## Opacity & Blend

| CSS Property     | Grida IR Field                     | Status | Notes        |
| ---------------- | ---------------------------------- | ------ | ------------ |
| `opacity`        | `node.opacity`                     | ✅     |              |
| `mix-blend-mode` | `LayerBlendMode::Blend(BlendMode)` | ✅     | All 16 modes |

## Border

| CSS Property                         | Grida IR Field                         | Status | Notes                              |
| ------------------------------------ | -------------------------------------- | ------ | ---------------------------------- |
| `border-width`                       | `StrokeWidth` (Uniform or Rectangular) | ✅     | Per-side widths                    |
| `border-color`                       | `Paints` (strokes)                     | ✅     | Single color for all sides         |
| `border-style` (solid/dashed/dotted) | `StrokeStyle.stroke_dash_array`        | ✅     |                                    |
| `border-radius`                      | `RectangularCornerRadius`              | ✅     | Per-corner, elliptical             |
| Per-side border colors               | --                                     | ⚠️     | Only first visible side color used |
| `border-image`                       | --                                     | ❌     | No gradient/image stroke           |

## Shadow & Effects

| CSS Property              | Grida IR Field                    | Status | Notes                                |
| ------------------------- | --------------------------------- | ------ | ------------------------------------ |
| `box-shadow`              | `FilterShadowEffect::DropShadow`  | ✅     | dx/dy/blur/spread/color              |
| `box-shadow: inset`       | `FilterShadowEffect::InnerShadow` | ✅     |                                      |
| `text-shadow`             | `FilterShadowEffect::DropShadow`  | ✅     | On TextSpan nodes; no spread         |
| `filter: blur()`          | `FeLayerBlur`                     | ✅     |                                      |
| `filter: drop-shadow()`   | `FilterShadowEffect::DropShadow`  | ✅     |                                      |
| `backdrop-filter: blur()` | `FeBackdropBlur`                  | 🔧     | Code exists; Stylo servo mode blocks |
| `filter: brightness()`    | --                                | ❌     | No IR for non-blur filters           |
| `filter: contrast()`      | --                                | ❌     |                                      |
| `filter: grayscale()`     | --                                | ❌     |                                      |
| `filter: sepia()`         | --                                | ❌     |                                      |
| `filter: hue-rotate()`    | --                                | ❌     |                                      |
| `filter: invert()`        | --                                | ❌     |                                      |
| `filter: saturate()`      | --                                | ❌     |                                      |

## Text

| CSS Property                | Grida IR Field                                | Status | Notes                                                            |
| --------------------------- | --------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `font-size`                 | `TextStyleRec.font_size`                      | ✅     |                                                                  |
| `font-weight`               | `TextStyleRec.font_weight`                    | ✅     |                                                                  |
| `font-family`               | `TextStyleRec.font_family`                    | ✅     |                                                                  |
| `font-style: italic`        | `TextStyleRec.font_style_italic`              | ✅     |                                                                  |
| `color`                     | `TextSpanNodeRec.fills` (Solid)               | ✅     | Inherited                                                        |
| `text-align`                | `TextAlign`                                   | ✅     | left/right/center/justify                                        |
| `line-height`               | `TextLineHeight` (Factor or Fixed)            | ✅     |                                                                  |
| `letter-spacing`            | `TextLetterSpacing::Fixed`                    | ✅     |                                                                  |
| `word-spacing`              | `TextWordSpacing::Fixed`                      | ✅     |                                                                  |
| `text-transform`            | `TextTransform`                               | ✅     | uppercase/lowercase/capitalize                                   |
| `text-decoration-line`      | `TextDecorationRec.text_decoration_line`      | ✅     | underline/overline/line-through                                  |
| `text-decoration-color`     | `TextDecorationRec.text_decoration_color`     | ✅     |                                                                  |
| `text-decoration-style`     | `TextDecorationRec.text_decoration_style`     | ✅     | solid/double/dotted/dashed/wavy                                  |
| `text-decoration-thickness` | `TextDecorationRec.text_decoration_thickness` | 🔧     | IR field exists; Stylo servo mode doesn't expose it (gecko-only) |
| `text-decoration-skip-ink`  | `TextDecorationRec.text_decoration_skip_ink`  | 🔧     | IR field exists; Stylo servo mode doesn't expose it (gecko-only) |
| `white-space`               | --                                            | ❌     | Not enforced                                                     |
| `text-overflow`             | --                                            | ❌     | No IR field                                                      |
| `vertical-align`            | --                                            | ❌     | No baseline offset                                               |
| `text-indent`               | --                                            | ❌     | No IR field                                                      |
| `font-variant`              | --                                            | ❌     | Not mapped                                                       |

## Transform

| CSS Property       | Grida IR Field    | Status | Notes                                         |
| ------------------ | ----------------- | ------ | --------------------------------------------- |
| `transform` (2D)   | `AffineTransform` | 🔧     | IR exists on every node; CSS import not wired |
| `transform` (3D)   | --                | ❌     | IR is 2D only                                 |
| `transform-origin` | --                | ❌     | No pivot point in IR                          |

## Overflow & Clip

| CSS Property                | Grida IR Field          | Status | Notes                     |
| --------------------------- | ----------------------- | ------ | ------------------------- |
| `overflow`                  | `ContainerNodeRec.clip` | ✅     | Single bool for both axes |
| `overflow-x` / `overflow-y` | `clip`                  | ⚠️     | Merged to single bool     |
| `clip-path`                 | --                      | ❌     | No arbitrary clip shape   |

## Visibility

| CSS Property           | Grida IR Field | Status | Notes                                            |
| ---------------------- | -------------- | ------ | ------------------------------------------------ |
| `visibility: hidden`   | --             | ❌     | Needs dedicated field; NOT opacity:0 (see below) |
| `visibility: collapse` | --             | ❌     | Same                                             |

> **Design note:** `visibility: hidden` keeps layout space, suppresses paint, blocks pointer events, and is **overridable by children** (`visibility: visible`). None of these semantics match `opacity: 0`. The IR needs a per-node `visible: bool` field. Chromium implements this as a paint-skip flag, not a compositing trick.

## Interaction (out of scope)

| CSS Property               | Status | Notes         |
| -------------------------- | ------ | ------------- |
| `cursor`                   | 🚫     | Runtime-only  |
| `pointer-events`           | 🚫     | Runtime-only  |
| `user-select`              | 🚫     | Runtime-only  |
| `transition` / `animation` | 🚫     | Static format |
| `@keyframes`               | 🚫     | Static format |

---

## IR Gaps

Properties blocked by missing schema fields, grouped by the change that would unblock them.

### 1. `LayoutChildStyle` expansion

**Unblocks:** `flex-shrink`, `flex-basis`, `align-self`, `margin`, `order`, `top`/`right`/`bottom`/`left`

Current `LayoutChildStyle` only has `layout_grow: f32` and `layout_positioning: LayoutPositioning`. Adding shrink, basis, self-alignment, and margins would complete the flex-child model.

### 2. Visibility field

**Unblocks:** `visibility: hidden`, `visibility: collapse`

Needs a per-node `visible: bool` (or enum). Must be inherited and child-overridable. Distinct from opacity and active.

### 3. Grid layout

**Unblocks:** `display: grid`, `grid-template-columns`, `grid-template-rows`, `grid-area`, `place-items`

Requires a new `LayoutMode::Grid` and track definition types.

### 4. Non-blur filter functions

**Unblocks:** `brightness()`, `contrast()`, `grayscale()`, `sepia()`, `hue-rotate()`, `invert()`, `saturate()`

Could be modeled as a color matrix or individual filter effect variants.

### 5. Transform origin

**Unblocks:** `transform-origin`

Currently transforms are applied around (0, 0). A pivot point field on `AffineTransform` or the node would enable center/corner-based transforms.

### 6. Flex direction reverse

**Unblocks:** `flex-direction: row-reverse` / `column-reverse`, `flex-wrap: wrap-reverse`

`Axis` enum only has `Horizontal`/`Vertical`. Needs reverse variants or a separate bool.
