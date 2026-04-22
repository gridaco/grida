---
name: canvas-docs-svg-kit
description: >
  Author SVG figures for canvas user docs at docs/editor/. Provides reusable
  primitives (selection chrome, size badges, anchor pins, resize cursors,
  click ripples), color/typography tokens, a starter template, and finished
  examples to crib from. Use when drawing diagrams that explain canvas UI
  behaviour — gestures, alignment, before/after states — that a screenshot
  alone can't capture. Trigger phrases: "svg diagram", "draw a figure",
  "visual for docs", "explain this gesture visually", "before/after diagram".
---

# Canvas Docs SVG Kit

A snippet library for drawing SVG figures used in canvas user docs.

**Companion to:** [`canvas-user-docs`](../canvas-user-docs/SKILL.md).
Use that skill for prose, this one for the visuals embedded inside it.

## Why SVG, not a screenshot

Screenshots are easy to capture but expensive over time:

- **Stale by default.** UI shifts; the screenshot keeps showing the old state until someone re-captures it. There is no diff, no warning, no test that fails.
- **Repo weight.** Every re-capture is a new binary blob in git history. WebP at 960 × 960 is ~30–80 KB each; PNG is multiples of that. Across years of captures it compounds, and old blobs never leave history.
- **Frozen in time.** A screenshot shows one moment of one configuration. A diagram explains the rule across configurations.

So: **when SVG can carry the meaning, prefer SVG.** SVGs are text — diff-able, hand-editable, version-controlled like code. Reserve screenshots for cases where the actual rendered chrome (real fonts, real pixels) is the point.

## When to draw an SVG figure

Reach for a custom SVG when a screenshot can't carry the story alone:

- A **gesture** (the clickable target isn't visible at rest — double-click, drag, hover).
- A **before / after** that needs the two states side-by-side.
- A **rule** that hinges on an invisible anchor or pivot (alignment, snapping, hit-testing).

If a single screenshot of the editor would communicate the whole point, use a screenshot. Don't redraw real UI in SVG when you don't have to.

## Hard constraints

These are baked into the kit. Don't fight them.

- **Inline `<style>` only.** Never reference an external stylesheet. Docusaurus serves docs SVGs via `<img src>`, which sandboxes the SVG: external CSS, scripts, and cross-file `<use href>` are all blocked.
- **No cross-file `<use>`.** Every reused fragment must physically live inside the SVG's own `<defs>`. Copy from `snippets/`, don't import.
- **Self-contained = SEO-safe.** Inline-styled SVGs are indexed as images. Inline React components in MDX are not — they become HTML.
- **Output size: 960 × 960.** The viewport for all figures, matching `docs/AGENTS.md` screenshot conventions. Use `viewBox="0 0 960 960" width="960" height="960"`.
- **Watermark every kit-produced SVG** (see below).
- **No emojis. No marketing voice.** Same neutral tone as the prose.

## Watermark every kit-produced SVG

So we can enumerate, audit, and migrate kit assets later without reading each file, **every SVG produced via this kit must carry two markers**:

1. A top-level XML comment immediately before the root `<svg>` (grep-friendly):

   ```xml
   <!-- @generated-by: canvas-docs-svg-kit v1 -->
   ```

2. A `<metadata>` element as the first child of `<svg>` (SVG-spec-native, survives minification and SVGO passes that strip comments):

   ```xml
   <metadata>canvas-docs-svg-kit/v1</metadata>
   ```

Both markers are present in `snippets/template.svg`, so they propagate automatically when you copy from the template. If you start a figure from scratch, paste both before composing anything else.

**Versioning.** Bump `v1 → v2` only on a breaking change to tokens or primitives (e.g. selection blue changes hex, or anchor pin geometry changes). Same-version figures are guaranteed visually consistent.

**Enumerate kit assets:**

```sh
grep -rl "canvas-docs-svg-kit" docs/editor/
```

When the kit changes, walk the grep output and update each file.

## Workflow

1. **Start from the template.** Copy [`snippets/template.svg`](snippets/template.svg) — it has the canvas, fonts, all `<defs>`, all class tokens, and shadow filters wired up.
2. **Browse [`snippets/primitives.svg`](snippets/primitives.svg)** for the bird's-eye catalog of every primitive. For deeper inspection of a specific family, open the focused chunk file (see _Snippet files_ below).
3. **Compose your figure** inside the marked region of the template, using the existing classes. Don't reinvent stroke widths, colors, or fonts — that's how visuals drift.
4. **Crib structure from [`examples/`](examples/).** Two finished figures live there:
   - `text-node-auto-size-edges.svg` — two-column before/after with hot edges, ripples, cursors, size badges, and a legend card.
   - `text-node-auto-size-alignment.svg` — three-column comparison with anchor pins and ghost outlines.
5. **Save to `docs/editor/resources/`.** Name: `<feature>-<description>.svg`, kebab-case.
6. **Embed via Markdown.** `![alt text](../resources/your-figure.svg)` from a doc under `docs/editor/features/`. The `alt` should describe what the figure shows, not name the file.

## Snippet files

`snippets/` is structured as **one overview catalog plus focused per-family files**:

| File             | Role                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `template.svg`   | **Starter** — copy this to begin a new figure. Has every CSS class, def, filter, and symbol pre-wired.                    |
| `primitives.svg` | **Index / overview catalog** — every primitive in one tall canvas. Skim here first.                                       |
| `cursors.svg`    | **Cursors** — pointer, move, grab, grabbing, rotate, h-resize, v-resize, crosshair, text. With sizes and hotspot offsets. |
| `meters.svg`     | **Meters** — `.badge` (size, blue) and `.badge-distance` (measurement, red) variants side-by-side.                        |
| `handles.svg`    | **Handles & pins** — square `.handle`, `#ft-handle` (circle), `#anchor-pin`.                                              |
| `keycap.svg`     | **Keycap** — modifier-key pill variants (single letter, glyph, multi-char, combos).                                       |

**When to look in which:**

- Quick scan of "what exists" → `primitives.svg`.
- Picking a specific cursor / badge variant / handle / keycap → the per-family file. They show variants, sizes, hotspots, and source references that the index can only hint at.

> **Note on canvas size.** Snippet files exceed the 960 × 960 figure mandate (e.g. `cursors.svg` is 960 × 720, `primitives.svg` is 960 × 1400). That mandate applies to **doc figures** — kit reference catalogs are not embedded in docs and may be tall.

## What's in the kit

### Primitives (in `snippets/template.svg` defs)

| Primitive                 | How to use                                                                                       | Where it shines                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **Selection chrome**      | `<rect class="sel-outline">` + four `<rect class="handle">` corners + `class="baseline"`         | Showing a selected node                                  |
| **Size badge**            | `<rect class="badge">` + `<text class="badge-text">` with `filter="url(#badge-shadow)"`          | Live `w × h` readout under selection                     |
| **Anchor pin**            | `<g transform="translate(cx,cy)"><use href="#anchor-pin"/></g>` + `filter="url(#pin-shadow)"`    | A point that stays fixed across states                   |
| **Resize cursor**         | `<use href="#cursor-h">` or `<use href="#cursor-v">`                                             | Edges/handles that respond to a drag                     |
| **Click ripple**          | Two concentric `<circle class="ripple">` / `class="ripple-2">`                                   | Marking a tap or double-click target                     |
| **Hot edge**              | `<line class="edge-hot">`                                                                        | The edge a gesture targets                               |
| **Ghost outline**         | `<rect class="ghost">`                                                                           | Where the bounds used to be                              |
| **Arrow (gray)**          | `<line class="arrow" marker-end="url(#ah)">`                                                     | Generic flow / step transitions                          |
| **Arrow (red)**           | `<line class="arrow-red" marker-end="url(#ah-red)">`                                             | Motion or change being highlighted                       |
| **Legend card**           | `<rect class="legend-box">` rounded panel                                                        | Symbol key at the bottom of a figure                     |
| **Distance meter**        | `<rect class="badge-distance">` + `<text class="badge-text">` with `filter="url(#badge-shadow)"` | Measurement readout (red variant of size badge)          |
| **Keycap**                | `<rect class="kbd-bg">` + `<text class="kbd-text">` (h≈20, rx=3, px=8)                           | Modifier-key pill (Alt, Shift, ⌘) in interaction figures |
| **Free-transform handle** | `<g transform="translate(cx,cy)"><use href="#ft-handle"/></g>`                                   | Circular corner grip — rotate / scale gesture target     |
| **Cursor — pointer**      | `<use href="#cursor-pointer">`                                                                   | Default arrow cursor                                     |
| **Cursor — move**         | `<use href="#cursor-move">`                                                                      | 4-direction translate gesture                            |
| **Cursor — grab**         | `<use href="#cursor-grab">` / `<use href="#cursor-grabbing">`                                    | Drag affordance (open/closed hand)                       |
| **Cursor — rotate**       | `<use href="#cursor-rotate">` (wrap in `transform="rotate(θ)"` to orient)                        | Rotation drag at a corner                                |

### Color tokens

| Class / value | Hex       | Use                                                               |
| ------------- | --------- | ----------------------------------------------------------------- |
| canvas bg     | `#ECECEC` | Page background (matches editor canvas)                           |
| selection     | `#0D99FF` | Selection outline, handles, baseline, size badge                  |
| hot           | `#FF3B30` | Hot edges, anchor pin, motion arrows                              |
| measurement   | `#f44336` | Distance badge — `WorkbenchColors.red`, the canonical product red |
| text          | `#0a0a0a` | Headings, node text content                                       |
| caption       | `#6b7280` | Subtitles, captions, legend captions                              |
| ghost         | `#b5b5b5` | Dashed outline of original/previous bounds                        |
| keycap bg     | `#f1f5f9` | Keycap pill background (`bg-muted` from kbd.tsx)                  |
| keycap border | `#cbd5e1` | Keycap pill border                                                |
| keycap text   | `#475569` | Keycap label text (`text-muted-foreground`)                       |
| panel border  | `#e5e5e5` | Legend card border, cell borders in catalog                       |

> **Slight drift, intentional.** The kit's `selection` (`#0D99FF`) is Figma blue; the product's canonical `WorkbenchColors.sky` is `#00a6f4`. Same for `hot` (`#FF3B30`) vs `WorkbenchColors.red` (`#f44336`). The new `measurement` token uses the canonical product red. A future kit pass may harmonise these — for now, the difference is visually negligible (~3% off) and keeps existing figures stable.

### Typography tokens

| Class          | Spec                                         | Use                           |
| -------------- | -------------------------------------------- | ----------------------------- |
| `.doc-heading` | 26px, 600, `-0.3px` letter-spacing           | Figure title                  |
| `.col-title`   | 16–18px, 600                                 | Column or section heading     |
| `.step-label`  | 11px, 500, uppercase, `0.6px` letter-spacing | Eyebrow above column titles   |
| `.caption`     | 13–14px, `#6b7280`                           | Subtitles and captions        |
| `.badge-text`  | 10–11px, SF Mono, 600                        | Inside size / distance badges |
| `.kbd-text`    | 11px, 500, `0.2px` letter-spacing            | Keycap label                  |
| `.label-mono`  | 12–14px, SF Mono                             | Inline code in labels         |
| `.node-text`   | 22–28px, `-0.3px` letter-spacing             | Text rendered inside a node   |

Font stack: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif` for prose; `'SF Mono', Menlo, Consolas, monospace` for code/badges.

## Ground truth in the editor

The kit's primitives are stylised — close to the product but not pixel-clones. When a primitive is unclear or you need to match the actual UI more carefully, go to source:

| Primitive                    | Source file (in `editor/`)                                                            | What to read for                                         |
| ---------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Selection chrome / handles   | `grida-canvas-react/viewport/surface.tsx`                                             | Handle sizes, hover states, modifier behaviour           |
| Size meter (live readout)    | `grida-canvas-react/viewport/ui/meter.tsx`                                            | Badge geometry, position relative to selection           |
| Distance meter (measurement) | `grida-canvas-react/viewport/ui/measurement.tsx`, `vector-measurement.tsx`            | What measurement actually shows (distance, axis-aligned) |
| Workbench colours            | `grida-canvas-react/ui-config.ts` → `WorkbenchColors`                                 | Canonical hex values: `sky #00a6f4`, `red #f44336`, etc. |
| Keycap                       | `components/ui/kbd.tsx`                                                               | Pill geometry, font, fg/bg tokens                        |
| Image-paint editor handles   | `grida-canvas-react/viewport/ui/surface-image-editor.tsx`                             | Translate / scale / rotate handle layout, cursors        |
| Cursor PNG asset set         | `public/assets/css-cursors-macos/*.png` (move, grab, grabbing, \*-rotate, pointer, …) | Reference look for cursors the kit doesn't ship          |
| Custom rotate cursor SVG     | `components/cursor/cursor-data.ts` → `template_rotate_svg(angle)`                     | The kit's `#cursor-rotate` symbol is lifted from here    |

Rule of thumb: if you find yourself inventing a primitive that maps to a real product UI element, check the source first — the names and tokens above are usually nearby.

## Common pitfalls

- **Anchor-pin offset bug.** The pin must use `<g transform="translate(cx, cy)"><use href="#anchor-pin"/></g>` — not `<use x y>` on a `<symbol>` with negative viewBox. The latter shifts the visual centre by half the use-box and breaks alignment.
- **Crisp rendering.** Use `shape-rendering: crispEdges` and `.5` half-pixel offsets on 1px strokes (e.g. `x="0.5" y="0.5" width="279"`). Otherwise borders go fuzzy.
- **Badge padding.** Badge width = `text_width + ~20px`. Tight badges look amateur. Recentre `<g translate>` after resizing badges.
- **Symbol coordinates trap.** A `<symbol viewBox="-12 -12 24 24">` placed with `<use x="0" y="0" width="24" height="24">` puts the symbol's `(0,0)` at use-box centre `(12, 12)`. Prefer plain `<g id="...">` placed with `transform="translate"` for primitives that need a precise anchor point.
- **Don't tile multiple SVGs into one.** One figure per file. Two SVGs side-by-side in the doc beats one giant 1920px figure.
- **Render check.** Always render with `resvg` before committing (see _Verify before publishing_). Browsers are forgiving; resvg is not.
- **XML strictness traps that resvg catches but browsers ignore.** Two real ones the kit has hit:
  - **No `<` characters inside `<style>` content** unless the block is wrapped in `<![CDATA[ ... ]]>`. So `/* foo <kbd> bar */` inside the CSS block will fail with `expected 'kbd' tag, not 'style'`. Either CDATA-wrap the whole block, or rephrase the comment to drop the `<`.
  - **No `--` inside `<!-- ... -->` comments** (XML spec). A "nested comment" like `<!-- inside <!-- here --> -->` parses as `comment contains '--'`. If you need to show comment syntax inside a comment, use an alternative marker (`:::`, `###`, etc.).

## Verify before publishing

**SVG composition is geometry — never ship without verifying it.** The kit's most common bugs (anchor pin shifted by 12px, badge text flush against pill edges, baseline missing the right edge) have all been caught only because someone looked at the rendered figure. Type-checking won't help you here.

**Tier 1: render with `resvg`, then look.** (Always do this.)

Editing an SVG without rendering it is editing blind. The geometry-by-arithmetic bugs in this kit (anchor pin offset, badge padding, container overflow) repeatedly slip through when you reason about coordinates without seeing the result. `resvg` is the standard SVG rasteriser used elsewhere in the project — already installed and what `cg-reftest` uses for golden comparisons. It's the right tool here too.

```sh
resvg path/to/figure.svg /tmp/check.png
```

Then open `/tmp/check.png` and inspect:

1. **Containment.** Every text element sits _inside_ its container `<rect>` with visible breathing room on all four sides. Watch especially for hex/code labels at the bottom of legend or token panels — text baselines plus descenders frequently overshoot the panel by a few pixels. The container `<rect>` doesn't clip, so overflow looks like "text touches the panel edge" rather than getting cut off.
2. **Anchor pins.** Each pin's red dot lands exactly on the intended edge or point. Off-by-12px errors come from `<symbol>`/`<use>` viewBox arithmetic.
3. **Badge padding.** At least ~10px of background visible to the left and right of badge text glyphs.
4. **Crisp strokes.** 1px lines should be sharp, not fuzzy. If they're soft, the shape is missing its `.5` half-pixel offset.
5. **Balance.** Top vs bottom padding inside containers should be roughly equal. Heavily top-loaded or bottom-loaded panels read as broken.

After every meaningful edit, re-run `resvg` and re-inspect. Don't skip this step on "small" tweaks — moving a `y` by a few pixels inside a container is exactly when overflow happens.

**Then check the doc page** in Docusaurus dev (`pnpm --filter docs start`) and confirm the figure embeds cleanly with the `alt` text.

**Tier 2: agent-assisted visual review.**

For complex figures, render with `resvg` (Tier 1) and feed the resulting PNG into the [`vision`](../vision/SKILL.md) skill — that sidesteps loading the image into your own context and gets a fresh pair of eyes on it:

```sh
resvg figure.svg /tmp/figure.png
# then ask vision:
#   "Do all anchor pins sit exactly on the marked edges? Do badges have
#    visible padding around the text? Any text touching container edges?"
```

Trust your own eyes over the vision model for final sign-off, but it's good at catching the things you'd otherwise have to scrutinise pixel-by-pixel.

**Tier 3: programmatic (write a validator when bugs recur).**

When the same kind of bug surfaces in two or three figures, build a small validator script (`scripts/svg-kit-lint.mjs`). Two complementary approaches:

- **Static lint over the SVG source.** Parse each `*.svg` and assert: watermark comment + `<metadata>` element present, `viewBox="0 0 960 960"`, no external `<link>`/`<style src>`/cross-file `<use href>`, every `<use href="#anchor-pin">` wrapped in a `<g transform="translate(...)">`. Cheap, no rendering needed.
- **Render-and-diff via `resvg`.** Rasterise each figure and either (a) byte-compare against a checked-in golden PNG, or (b) hand it to `vision` with a fixed prompt and parse pass/fail. Catches geometry bugs that the static lint can't reason about.

We don't have this validator yet — add it the first time you find yourself fixing the same bug twice.

**Pre-publish checklist:**

- [ ] Watermark comment present (`@generated-by: canvas-docs-svg-kit v1`)
- [ ] `<metadata>canvas-docs-svg-kit/v1</metadata>` is the first child of `<svg>`
- [ ] Inline `<style>` only — no external stylesheet references
- [ ] No `<use href="other.svg#…">` — all referenced ids exist in this file
- [ ] Viewport is `960 × 960`
- [ ] Colors and fonts come from token classes, not ad-hoc values
- [ ] Strokes are crisp (half-pixel offsets where needed)
- [ ] Badges have ~10px horizontal padding inside the pill
- [ ] Anchor pins land exactly on the intended point (not shifted by viewBox)
- [ ] Tier 1 visual review passed
- [ ] Embedded with descriptive `alt` text, not the filename

## Graduating beyond copy-paste

If this skill's snippets are being copied into 5+ figures across the docs and starting to drift, that's the signal to build a small templating script (`pnpm docs:svg`) that expands placeholders like `<MeterBadge w="280" h="90"/>` into inlined SVG. Until then, copy-paste keeps things lean and predictable.
