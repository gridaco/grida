# CSS Longhand → Grida IR Property Mapping

Status legend:
- [x] Clear 1:1 mapping exists
- [~] Partial or approximate mapping (noted)
- [ ] No direct mapping / needs design decision
- [n/a] Not applicable to static rendering

---

## Container (ContainerNodeRec)

Maps from: `<div>`, `<section>`, `<article>`, `<header>`, `<footer>`, `<main>`, `<nav>`, `<aside>`, and any block/flex/grid element with children.

### Display & Layout Mode

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `display` | `Node` type + `LayoutMode` | [x] | `block`→Container(Normal), `flex`→Container(Flex), `inline`→TextSpan context, `none`→exclude, `grid`→Container(Flex) approximate |
| `flex-direction` | `layout_direction` | [x] | `row`→Horizontal, `column`→Vertical |
| `flex-wrap` | `layout_wrap` | [x] | `nowrap`→NoWrap, `wrap`→Wrap |
| `justify-content` | `layout_main_axis_alignment` | [x] | `flex-start`→Start, `center`→Center, `space-between`→SpaceBetween, etc. |
| `align-items` | `layout_cross_axis_alignment` | [x] | `flex-start`→Start, `center`→Center, `stretch`→Stretch |
| `align-content` | — | [~] | Multi-line flex alignment; no direct equivalent yet |
| `gap` / `row-gap` / `column-gap` | `layout_gap` | [x] | `row-gap`→cross_axis_gap, `column-gap`→main_axis_gap (depends on direction) |
| `overflow-x` / `overflow-y` | `clip` | [x] | `hidden`/`scroll`/`auto`→`clip: true`, `visible`→`clip: false` |

### Position & Sizing

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `position` | `LayoutPositioningBasis` | [x] | `static`/`relative`→layout child, `absolute`/`fixed`→Cartesian |
| `top` / `right` / `bottom` / `left` | `LayoutPositioningBasis::Cartesian` or `Constraints` | [x] | For positioned elements |
| `width` | `layout_dimensions.width` | [x] | px→Fixed, %→Relative, `auto`→Hug |
| `height` | `layout_dimensions.height` | [x] | Same as width |
| `min-width` / `min-height` | `layout_dimensions.min_*` | [x] | |
| `max-width` / `max-height` | `layout_dimensions.max_*` | [x] | |
| `aspect-ratio` | — | [~] | Could be enforced during layout |

### Box Model

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `margin-top` | layout constraint | [x] | Applied during layout pass, not stored on node |
| `margin-right` | layout constraint | [x] | |
| `margin-bottom` | layout constraint | [x] | |
| `margin-left` | layout constraint | [x] | |
| `padding-top` | `padding.top` | [x] | |
| `padding-right` | `padding.right` | [x] | |
| `padding-bottom` | `padding.bottom` | [x] | |
| `padding-left` | `padding.left` | [x] | |
| `box-sizing` | layout computation | [x] | `border-box` vs `content-box` affects how width/height are interpreted during layout |

### Visual — Fill & Background

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `background-color` | `fills[0]` → `SolidPaint` | [x] | |
| `background-image` | `fills[n]` → `LinearGradientPaint` / `RadialGradientPaint` / `ImagePaint` | [x] | Multiple backgrounds → stacked paints |
| `background-position-x` / `-y` | gradient/image transform | [~] | Via paint transform |
| `background-size` | `ImagePaint.fit` | [~] | `cover`→Cover, `contain`→Contain, explicit→transform |
| `background-repeat` | `ImagePaint.fit` → Tile | [~] | `repeat`→Tile, `no-repeat`→Cover/Contain |
| `background-clip` | — | [ ] | `border-box`/`padding-box`/`content-box`; needs clip rect adjustment |
| `background-origin` | — | [~] | Affects coordinate origin for background-position |
| `background-attachment` | — | [n/a] | `scroll`/`fixed`; no viewport scrolling in static render |

### Visual — Border & Outline

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `border-top-width` | `stroke_width` → `Rectangular.stroke_top_width` | [x] | |
| `border-right-width` | `stroke_width` → `Rectangular.stroke_right_width` | [x] | |
| `border-bottom-width` | `stroke_width` → `Rectangular.stroke_bottom_width` | [x] | |
| `border-left-width` | `stroke_width` → `Rectangular.stroke_left_width` | [x] | |
| `border-top-color` | `strokes[0..3]` → per-side solid paint | [x] | If all same → single stroke; if different → 4 strokes |
| `border-right-color` | `strokes` | [x] | |
| `border-bottom-color` | `strokes` | [x] | |
| `border-left-color` | `strokes` | [x] | |
| `border-top-style` | `stroke_style` | [~] | `solid`→Solid, `dashed`→dash_array, `dotted`→dash_array, `none`→no stroke |
| `border-top-left-radius` | `corner_radius.top_left` | [x] | |
| `border-top-right-radius` | `corner_radius.top_right` | [x] | |
| `border-bottom-right-radius` | `corner_radius.bottom_right` | [x] | |
| `border-bottom-left-radius` | `corner_radius.bottom_left` | [x] | |
| `border-image-*` | — | [ ] | Complex; skip for now |
| `outline-width` / `outline-color` / `outline-style` | secondary stroke or effect | [~] | Could map to additional stroke with offset |
| `outline-offset` | — | [~] | |

### Visual — Effects

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `opacity` | `opacity` | [x] | Direct 1:1 |
| `mix-blend-mode` | `blend_mode` | [x] | `normal`→Normal, `multiply`→Multiply, etc. |
| `filter` | `effects` | [~] | `blur()`→`FeLayerBlur`, `drop-shadow()`→shadow; others need work |
| `backdrop-filter` | `effects.backdrop_blur` | [~] | `blur()`→`FeBackdropBlur` |
| `box-shadow` | `effects.shadows` | [x] | Each shadow → `FilterShadowEffect` (DropShadow or InnerShadow via `inset`) |
| `clip-path` | `mask` → `Geometry` | [x] | |
| `mask-image` | `mask` → `Image` | [~] | |
| `visibility` | `active` | [x] | `visible`→true, `hidden`→false |
| `isolation` | `blend_mode` | [~] | `isolate`→Blend(Normal) (forces isolation) |

### Transform

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `transform` | `transform` / position adjustment | [x] | Decompose to `AffineTransform` |
| `transform-origin` | transform computation | [x] | Applied when building the AffineTransform |
| `rotate` | `transform` | [x] | Folded into AffineTransform |
| `scale` | `transform` | [x] | Folded into AffineTransform |
| `translate` | `transform` | [x] | Folded into AffineTransform |

### Flex Child

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `flex-grow` | `layout_child.flex_grow` | [x] | |
| `flex-shrink` | `layout_child.flex_shrink` | [x] | |
| `flex-basis` | `layout_child.flex_basis` | [x] | |
| `align-self` | `layout_child.align_self` | [x] | |
| `order` | child ordering | [x] | Reorder children before layout |

---

## TextSpan (TextSpanNodeRec)

Maps from: text content inside elements. An element with text children produces a TextSpan (or Container + TextSpan children for mixed content).

### Font Properties

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `font-family` | `text_style.font_family` | [x] | First available family |
| `font-size` | `text_style.font_size` | [x] | Already computed to px |
| `font-weight` | `text_style.font_weight` | [x] | 100–900 → FontWeight |
| `font-style` | `text_style.font_style_italic` | [x] | `italic`/`oblique`→true, `normal`→false |
| `font-stretch` | `text_style.font_width` | [~] | % value → `wdth` axis |
| `font-optical-sizing` | `text_style.font_optical_sizing` | [x] | `auto`→Auto, `none`→None |
| `font-variation-settings` | `text_style.font_variations` | [x] | Direct axis/value pairs |
| `font-variant-caps` | `text_style.font_features` | [~] | Map to OpenType `smcp`, `c2sc` features |
| `font-language-override` | — | [~] | OpenType `locl` feature |
| `font-synthesis-weight` | — | [n/a] | Rendering engine concern |

### Text Layout

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `text-align` | `text_align` | [x] | `left`→Left, `right`→Right, `center`→Center, `justify`→Justify |
| `vertical-align` | `text_align_vertical` | [~] | Only for text container: `top`→Top, `middle`→Center, `bottom`→Bottom |
| `line-height` | `text_style.line_height` | [x] | `normal`→Normal, px→Fixed, number→Factor |
| `letter-spacing` | `text_style.letter_spacing` | [x] | px→Fixed |
| `word-spacing` | `text_style.word_spacing` | [x] | px→Fixed |
| `text-indent` | — | [ ] | First-line indent; no IR equivalent |
| `white-space-collapse` | text processing | [x] | Applied when building text content (collapse/preserve whitespace) |
| `text-wrap-mode` | width constraint | [x] | `wrap`→set width, `nowrap`→no width constraint |
| `text-overflow` | `ellipsis` | [x] | `ellipsis`→Some("..."), `clip`→None |
| `word-break` | layout engine | [~] | Affects line breaking behavior |
| `overflow-wrap` | layout engine | [~] | `break-word` behavior |
| `writing-mode` | — | [ ] | `horizontal-tb` only for now |
| `direction` | — | [~] | `rtl` affects text-align default |

### Text Decoration

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `text-decoration-line` | `text_style.text_decoration` | [x] | `underline`→Underline, `line-through`→LineThrough, `overline`→Overline |
| `text-decoration-color` | `text_style.text_decoration.color` | [~] | If decoration struct supports color |
| `text-decoration-style` | — | [~] | `solid`/`dashed`/`dotted`/`wavy`; partial support |
| `text-transform` | `text_style.text_transform` | [x] | `uppercase`→Uppercase, `lowercase`→Lowercase, `capitalize`→Capitalize |
| `text-shadow` | `effects.shadows` | [x] | Same as box-shadow but on text |

### Text Fill

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `color` | `fills[0]` → SolidPaint | [x] | Inherited text color → text fill |

---

## Rectangle (RectangleNodeRec)

Maps from: elements that are purely visual boxes with no children (e.g. `<hr>`, empty styled `<div>`, replaced elements without explicit image).

Same property mapping as Container for: `background-*`, `border-*`, `border-radius`, `opacity`, `mix-blend-mode`, `box-shadow`, `filter`, `transform`, `visibility`.

Only difference: no layout/children properties.

---

## Image (ImageNodeRec)

Maps from: `<img>` elements, elements with `background-image: url(...)` as primary content.

| CSS Property | IR Target | Status | Notes |
|---|---|---|---|
| `width` / `height` | `size` | [x] | From layout-computed dimensions |
| `object-fit` | `fill.fit` | [x] | `cover`→Cover, `contain`→Contain, `fill`→Fill, `none`→actual size |
| `object-position` | paint transform | [~] | Offset within bounding box |
| `border-radius` | `corner_radius` | [x] | Clips the image |
| `opacity` | `opacity` | [x] | |
| `filter` | `effects` | [~] | |

---

## Properties NOT Mapped (static render irrelevant)

| CSS Property | Reason |
|---|---|
| `animation-*` (all 10) | No animation in static render |
| `transition-*` (all 4) | No transitions |
| `cursor` | No interactivity |
| `pointer-events` | No interactivity |
| `will-change` | GPU hint, no visual effect |
| `scroll-*` | No scrolling |
| `caret-color` | No text editing |
| `user-select` | No interactivity |
| `resize` | No interactivity |
| `-servo-*` | Servo internals |
| `view-transition-*` | No transitions |
| `position-area` | Anchor positioning (not supported yet) |
| `quotes` | Generated content — via pseudo-elements |
| `counter-increment` / `counter-reset` | Generated content |
| `list-style-*` | List markers — via `::marker` pseudo |
| `caption-side` | Table layout specific |
| `empty-cells` | Table layout specific |
| `table-layout` | Table layout specific |
| `border-collapse` / `border-spacing` | Table layout specific |
| `unicode-bidi` | Bidi algorithm |
| `color-scheme` | System preference hint |
| `contain` / `container-*` | Container queries — layout engine concern |
| `image-rendering` | Rasterizer hint |
| `backface-visibility` | 3D transform |
| `perspective` / `perspective-origin` | 3D transform |
| `transform-style` | 3D transform (`preserve-3d`) |

---

## Logical → Physical Resolution

CSS logical properties (block/inline) must be resolved to physical properties before mapping:

| Logical | Physical (horizontal-tb, ltr) |
|---|---|
| `margin-block-start` | `margin-top` |
| `margin-block-end` | `margin-bottom` |
| `margin-inline-start` | `margin-left` |
| `margin-inline-end` | `margin-right` |
| `padding-block-*` | `padding-top` / `padding-bottom` |
| `padding-inline-*` | `padding-left` / `padding-right` |
| `border-block-*` | `border-top-*` / `border-bottom-*` |
| `border-inline-*` | `border-left-*` / `border-right-*` |
| `inset-block-*` | `top` / `bottom` |
| `inset-inline-*` | `left` / `right` |
| `block-size` | `height` |
| `inline-size` | `width` |

Stylo already computes both; use the physical variants when mapping.

---

## Summary

| Category | Total Properties | Mapped [x] | Partial [~] | Unmapped [ ] | N/A |
|---|---|---|---|---|---|
| Display & Layout | 8 | 7 | 1 | 0 | 0 |
| Position & Sizing | 10 | 9 | 1 | 0 | 0 |
| Box Model (margin/padding) | 9 | 9 | 0 | 0 | 0 |
| Background & Fill | 8 | 3 | 3 | 1 | 1 |
| Border & Outline | 16 | 10 | 3 | 1 | 0 |
| Effects & Compositing | 10 | 6 | 3 | 0 | 0 |
| Transform | 5 | 5 | 0 | 0 | 0 |
| Flex Child | 5 | 5 | 0 | 0 | 0 |
| Font | 10 | 7 | 2 | 0 | 1 |
| Text Layout | 12 | 7 | 3 | 1 | 0 |
| Text Decoration | 5 | 3 | 2 | 0 | 0 |
| Text Fill | 1 | 1 | 0 | 0 | 0 |
| Image | 5 | 4 | 1 | 0 | 0 |
| **Subtotal (mapped)** | **104** | **76** | **19** | **3** | **2** |
| Not applicable | ~50 | — | — | — | 50 |
