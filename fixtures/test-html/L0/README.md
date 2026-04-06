## `fixtures/test-html/L0`

Baseline HTML fixtures for the HTML+CSS embed renderer (`crates/grida-canvas/src/htmlcss/`).
Each file exercises a narrow slice of CSS so regressions trace to a specific
rendering subsystem.

Reference: [`docs/wg/feat-2d/htmlcss.md`](../../../docs/wg/feat-2d/htmlcss.md)

---

### Naming Convention

```
<domain>-<property>[-<descriptor>].html
```

All segments are kebab-case. The directory is flat — the domain prefix replaces
what would otherwise be a subdirectory.

| Segment        | What it is                                      | Example                               |
| -------------- | ----------------------------------------------- | ------------------------------------- |
| `<domain>`     | Broad rendering subsystem (see table below)     | `paint`, `text`, `layout`             |
| `<property>`   | CSS property or concept name                    | `opacity`, `font-weight`, `flex-wrap` |
| `<descriptor>` | Specific value or variant under test (optional) | `50percent`, `column`, `elliptical`   |

When a property has only one fixture, the descriptor may be omitted:
`paint-opacity.html`. When multiple files test the same property, descriptors
distinguish them: `paint-gradient-linear.html`, `paint-gradient-radial.html`.

#### Domains

A small set of broad subsystems — not one domain per CSS property.

| Domain      | Scope                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout`    | `display`, `position`, `float`, `clear`, `overflow`, `visibility`, `z-index`                                                                                                                                                                      |
| `flex`      | `flex-direction`, `flex-wrap`, `align-*`, `justify-*`, `gap`, `order`, `flex-grow/shrink/basis`                                                                                                                                                   |
| `grid`      | `grid-template-*`, `grid-auto-*`, `grid-column/row`, `gap`                                                                                                                                                                                        |
| `box`       | `width`, `height`, `min-*`, `max-*`, `margin`, `padding`, `box-sizing`, `aspect-ratio`                                                                                                                                                            |
| `paint`     | `background-*`, gradients, `border-*`, `border-radius`, `box-shadow`, `opacity`, `mix-blend-mode`, `outline`                                                                                                                                      |
| `text`      | `color`, `font-*`, `text-align`, `text-transform`, `text-indent`, `text-overflow`, `text-shadow`, `line-height`, `letter-spacing`, `word-spacing`, `text-decoration-*`, `white-space`, `word-break`, `overflow-wrap`, `direction`, `writing-mode` |
| `inline`    | Inline element rendering (`<strong>`, `<em>`, `<code>`, inline box decoration)                                                                                                                                                                    |
| `list`      | `<ul>`, `<ol>`, `list-style-type`, counters, nested lists                                                                                                                                                                                         |
| `table`     | `display: table*`, `border-collapse`, `border-spacing`                                                                                                                                                                                            |
| `filter`    | `filter`, `backdrop-filter`                                                                                                                                                                                                                       |
| `transform` | `transform`, `transform-origin`, `perspective`                                                                                                                                                                                                    |
| `mask`      | `clip-path`, `mask`, `mask-image`                                                                                                                                                                                                                 |
| `mixed`     | Integration tests combining multiple domains                                                                                                                                                                                                      |

#### Naming examples

```
# --- paint ---
paint-background-solid.html             background-color
paint-gradient-linear.html              linear-gradient directions and multi-stop
paint-gradient-radial.html              radial-gradient
paint-gradient-conic.html               conic-gradient
paint-border-style.html                 solid, dashed, dotted
paint-border-style-double.html          double, groove, ridge
paint-border-radius.html                uniform, pill, circle, single-corner
paint-border-radius-elliptical.html     elliptical (rx ≠ ry)
paint-shadow.html                       outer box-shadow
paint-shadow-inset.html                 inset box-shadow
paint-shadow-multiple.html              multiple box-shadows
paint-opacity.html                      opacity values
paint-blend-mode.html                   mix-blend-mode values
paint-outline.html                      outline, outline-offset

# --- layout ---
layout-block.html                       block flow
layout-display-none.html                display: none skips elements
layout-position-relative.html           position: relative with offsets
layout-position-absolute.html           position: absolute
layout-overflow-hidden.html             overflow: hidden clip
layout-visibility-hidden.html           visibility: hidden/collapse

# --- flex ---
flex-row.html                           flex-direction: row
flex-column.html                        flex-direction: column
flex-align-items.html                   align-items values
flex-gap.html                           row-gap, column-gap

# --- box ---
box-dimensions.html                     width, height, min-*, max-*
box-margin.html                         margin all sides, collapsing, auto
box-padding.html                        padding all sides, shorthand

# --- text ---
text-color.html                         color inheritance
text-align.html                         text-align values
text-font-properties.html               font-size, weight, family, style
text-font-weight.html                   font-weight: 100–900
text-line-height.html                   line-height: unitless, px
text-letter-spacing.html                letter-spacing values
text-decoration.html                    underline, overline, line-through
text-decoration-full.html               line + style + color combined
text-shadow.html                        text-shadow
text-whitespace-pre.html                white-space: pre, pre-wrap, pre-line

# --- inline ---
inline-elements.html                    <strong>, <em>, <code>

# --- list ---
list-unordered.html                     <ul> disc/circle/square
list-ordered.html                       <ol> decimal, alpha
list-nested.html                        nested list counters

# --- filter ---
filter-blur.html                        filter: blur()
filter-backdrop-blur.html               backdrop-filter: blur()

# --- transform ---
transform-2d.html                       translate, rotate, scale, skew
transform-origin.html                   transform-origin values

# --- mask ---
mask-clip-path.html                     clip-path shapes

# --- mixed ---
mixed-card.html                         realistic card combining many properties
mixed-inline-style.html                 style="" overriding stylesheet
```

---

### Authoring Rules

#### Structure

1. **One property per file.** When a single property needs multiple files,
   vary the descriptor segment.
2. **Self-contained** — no external resources, no `<script>`, no `<link>`.
3. **Full doctype** — every file starts with `<!doctype html>`.
4. **Minimal HTML** — only enough DOM to isolate the property.
5. **Title = domain + property** — e.g.
   `<title>Paint: Border Radius — Elliptical</title>`.
6. **Use flex for layout scaffolding** — `display: flex; flex-wrap: wrap; gap: …`
   to arrange specimens. Don't use the property under test for scaffolding
   unless the fixture _is_ testing layout.
7. **Font stack** — `font-family: system-ui, sans-serif`.

#### Color & Probe-Friendliness

Fixtures are designed for **headless testing** — pixel probing, hit-testing,
and heuristic image diffing — not human aesthetics. Every fixture should be
machine-verifiable without vision models.

8. **High contrast, minimal palette.** Default to black on white (or white on
   black). When the property under test requires color (gradients, blend modes),
   use distinct saturated primaries — never subtle or close shades.
9. **≤ 3 colors when possible.** Background + foreground + one accent is enough
   for most properties. More colors are acceptable when the fixture _is_ testing
   color, but keep decorative colors out.
10. **No opinionated styling.** No dark themes, no design-system tokens, no
    aesthetic choices. The fixture is a test instrument, not a demo.
11. **Round coordinates and sizes.** Use whole-pixel values for widths, heights,
    padding, margins, gaps. This avoids subpixel ambiguity at probe points.
12. **Label specimens with plain text.** A small text label per specimen is fine
    for human inspection. Keep labels minimal — they are not the thing under test.

### Template

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Domain: Property — Descriptor</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        background: #fff;
        color: #000;
        font-family: system-ui, sans-serif;
        font-size: 14px;
      }
      .label {
        font-size: 11px;
        color: #666;
        padding-bottom: 4px;
      }
      .grid {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 32px;
      }
      .cell {
        display: flex;
        flex-direction: column;
      }
      /* --- specimens below --- */
    </style>
  </head>
  <body>
    <div class="grid">
      <div class="cell">
        <div class="label">value-a</div>
        <div class="specimen" style="/* property: value-a */">…</div>
      </div>
      <div class="cell">
        <div class="label">value-b</div>
        <div class="specimen" style="/* property: value-b */">…</div>
      </div>
    </div>
  </body>
</html>
```

### Adding a Fixture

1. Pick the correct **domain** from the table.
2. Name the file `<domain>-<property>[-<descriptor>].html`.
3. Copy the template — fill in specimens that exercise distinct values.
4. Verify: `cargo test -p cg --lib -- htmlcss::tests --test-threads=1`
5. Visual-check: `cargo run -p grida-dev -- fixtures/test-html/L0/<file>.html`
6. Fixtures may test unsupported properties — L0 is a reference corpus, not a
   passing-test gate. Implementation status lives in
   [`docs/wg/feat-2d/htmlcss.md`](../../../docs/wg/feat-2d/htmlcss.md).

### Verification

```sh
# all fixtures parse without error
cargo test -p cg --lib -- htmlcss::tests --test-threads=1

# visual check via grida-dev
cargo run -p grida-dev -- fixtures/test-html/L0/mixed-card.html
```
