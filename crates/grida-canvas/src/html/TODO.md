# HTML Import — TODO

Properties marked `[x]` are implemented and covered by L0 fixtures.
Properties marked `[ ]` are not yet supported.

## Layout

- [x] `display: block` — mapped to Flex column (not true block flow; approximation for correct flex-child sizing) — `layout-block.html`
- [x] `display: flex` — mapped to `LayoutMode::Flex` — `layout-flex-row.html`, `layout-flex-column.html`
- [x] `display: none` — element skipped entirely — `layout-display-none.html`
- [x] `flex-direction` (row, column) — `layout-flex-row.html`, `layout-flex-column.html`
- [x] `flex-wrap` — `layout-flex-row.html`
- [x] `align-items` (start, center, end, stretch) — `layout-flex-row.html`
- [x] `justify-content` (start, center, end, between, around, evenly) — `layout-flex-column.html`
- [x] `flex-grow` — `layout-flex-row.html`
- [x] `gap` (row-gap, column-gap) — `layout-flex-row.html`, `layout-flex-column.html`
- [ ] `display: grid` — grid layout mode not in IR (`LayoutMode` only has `Normal`/`Flex`)
- [ ] `grid-template-columns`, `grid-template-rows` — no grid track IR
- [ ] `place-items` (grid shorthand)
- [ ] `margin` — no margin in IR; only padding is mapped
- [ ] `position: absolute/relative/fixed/sticky` — no positioned layout
- [ ] `flex-shrink` — not mapped
- [ ] `align-self` — not mapped
- [ ] `order` — not mapped

## Box Model

- [x] `width`, `height` — `box-dimensions.html`
- [x] `min-width`, `min-height` — `box-dimensions.html`
- [x] `max-width`, `max-height` — `box-dimensions.html`
- [x] `padding` (all sides) — `box-padding.html`
- [x] `overflow` → clip bool — `layout-block.html`
- [ ] `box-sizing` — assumed border-box; no explicit handling
- [ ] `overflow-x` / `overflow-y` separately — mapped to single `clip` bool

## Background / Paint

- [x] `background-color` (hex, rgb, rgba, named) — `paint-background-solid.html`
- [x] `background-image: linear-gradient(...)` — `paint-gradient-linear.html`
- [x] `background-image: radial-gradient(...)` — `paint-gradient-radial.html`
- [x] `opacity` — `paint-opacity.html`
- [ ] `background-image: url(...)` — IR has `ImagePaint` but not wired
- [ ] `-webkit-background-clip: text` — gradient text fill not in IR
- [ ] `background-size`, `background-position`
- [x] `conic-gradient` — mapped to `Paint::SweepGradient`

## Border

- [x] `border` (width, color, style) — `paint-border-style.html`
- [x] `border-*-width` per-side — `paint-border-style.html`
- [x] `border-style: solid/dashed/dotted` — `paint-border-style.html`
- [x] `border-radius` (uniform, pill, per-corner, elliptical) — `paint-border-radius.html`
- [ ] per-side border colors — only first visible side color is used
- [ ] `border-image` / gradient borders — IR strokes only support solid paint; gradient stroke rendering would paint the gradient into the full shape bounds, not just the stroke path

## Shadow

- [x] `box-shadow` (drop shadow) — `paint-shadow.html`
- [x] `box-shadow: inset` (inner shadow) — `paint-shadow.html`
- [ ] `text-shadow` — only `box-shadow` is mapped

## Text

- [x] `font-size` — `text-font-properties.html`
- [x] `font-weight` — `text-font-properties.html`
- [x] `font-family` — `text-font-properties.html`
- [x] `font-style: italic` — `text-font-properties.html`
- [x] `color` (inherited) — `text-color.html`
- [x] `text-align` (left, right, center, justify) — `text-align.html`
- [x] `line-height` (unitless, px) — `text-line-height.html`
- [x] `letter-spacing` — `text-letter-spacing.html`
- [x] `text-decoration` (underline, overline, line-through) — `text-decoration.html`
- [x] `text-transform` (uppercase, lowercase, capitalize) — mapped to `TextTransform`
- [x] `word-spacing` — mapped to `TextWordSpacing::Fixed`
- [ ] `text-shadow`
- [ ] `white-space: pre` — whitespace preservation not enforced
- [ ] text background color (e.g. `<mark>`, `<code>`) — IR `TextSpan` has no background

## Inline Style

- [x] `style=""` attribute — parsed via Stylo cascade — `mixed-inline-style.html`

## Integration

- [x] Combined properties (flex + padding + gap + bg + radius + border + shadow + typography) — `mixed-card.html`

## HTML Elements — Unsupported

- [ ] `<table>`, `<tr>`, `<td>`, `<th>`, `<thead>`, `<tbody>` — no table IR
- [ ] `<ol>`, `<ul>`, `<li>` — no list marker generation
- [ ] `<dl>`, `<dt>`, `<dd>` — no definition list IR
- [ ] `<sup>` / `<sub>` — no baseline-offset / vertical-align
- [ ] `<img>` — walker skips; `ImageNodeRec` exists but `src` not wired
- [ ] inline `<svg>` — not delegated to `crate::svg` pipeline
- [ ] `<video>`, `<audio>` — no media IR
- [ ] `<input>`, `<button>`, `<select>`, `<textarea>` — no form control IR

## CSS — Unsupported

- [ ] `transform` — not mapped to `AffineTransform`
- [ ] viewport units (`vh`, `vw`) — depend on Stylo device config (default 1920×1080)
