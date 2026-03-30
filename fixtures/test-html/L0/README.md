## `fixtures/test-html/L0`

Baseline HTML fixtures for the HTML→IR conversion pipeline (`crates/grida-canvas/src/html/`). Each file tests a specific CSS property group using only features the pipeline currently supports.

### Naming Convention

| Prefix     | Scope                                                  |
| ---------- | ------------------------------------------------------ |
| `layout-*` | Display modes, flex layout, visibility                 |
| `box-*`    | Dimensions, padding                                    |
| `paint-*`  | Backgrounds, borders, shadows, opacity                 |
| `text-*`   | Font properties, color, alignment, spacing, decoration |
| `mixed-*`  | Integration tests combining multiple properties        |

### Fixture Files (21)

**Layout**

- `layout-block.html` — block flow, padding, overflow clip
- `layout-flex-row.html` — flex row: space-between, wrap, flex-grow
- `layout-flex-column.html` — flex column: all 6 justify-content variants
- `layout-display-none.html` — display:none skips elements

**Box Model**

- `box-dimensions.html` — width, height, min/max constraints
- `box-padding.html` — uniform, horizontal, vertical, asymmetric padding

**Paint**

- `paint-background-solid.html` — background-color (hex, rgb, rgba, named)
- `paint-gradient-linear.html` — linear-gradient directions and multi-stop
- `paint-gradient-radial.html` — radial-gradient, stacked on solid
- `paint-border-style.html` — border width, color, style (solid/dashed/dotted), per-side
- `paint-border-radius.html` — uniform, pill, circle, single-corner, elliptical
- `paint-shadow.html` — box-shadow: drop, blur+spread, inset, combined
- `paint-opacity.html` — element opacity (1.0, 0.75, 0.5, 0.25)

**Text**

- `text-font-properties.html` — font-size, font-weight, font-family, font-style
- `text-color.html` — color (hex, rgb, rgba, named, inherited)
- `text-align.html` — text-align (left, right, center, justify)
- `text-line-height.html` — line-height (unitless, px)
- `text-letter-spacing.html` — letter-spacing (0, 2px, 5px)
- `text-decoration.html` — underline, overline, line-through

**Mixed**

- `mixed-card.html` — realistic card with flex, padding, gap, bg, radius, border, shadow, typography
- `mixed-inline-style.html` — style="" attribute overriding stylesheet rules

### Authoring Rules

1. **One concept per file** — each fixture targets a specific property group.
2. **Supported features only** — no margin, grid, tables, viewport units, position, or other unsupported CSS. See `crates/grida-canvas/src/html/TODO.md` for the unsupported list.
3. **Dark theme** — `background: #030712` on body, light text (`#e2e8f0`).
4. **Self-contained** — no external resources, no `<script>`, no `<link>`.
5. **Flex-only layout** — use `display: flex` + `flex-wrap: wrap` for grid-like arrangements.
6. **Full doctype** — every file starts with `<!doctype html>`.
7. **Font stack** — `font-family: system-ui, sans-serif`.

### Constraints (features NOT used in L0)

These are intentionally excluded because the IR does not support them:

- `margin` (no margin in IR)
- `display: grid` / `grid-template-*` / `place-items`
- `position: absolute/relative/fixed/sticky`
- `<table>`, `<ol>`, `<ul>`, `<dl>` and related elements
- `vh`, `vw` viewport units
- `transform`
- `background-image: url(...)`
- `-webkit-background-clip: text`

### Verification

```sh
# All fixtures parse without error
cargo test -p cg --lib -- html::tests --test-threads=1

# Visual check via grida-dev
cargo run -p grida-dev -- fixtures/test-html/L0/mixed-card.html
```
