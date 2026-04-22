# `fixtures/test-html/`

HTML+CSS fixtures for the `cg` htmlcss renderer and the refbrowser
reftest pipeline.

## Layout

```
fixtures/test-html/
├── L0/                # fixtures (source of truth, one concept per file)
├── _reftest/          # shared helper stylesheets (hide-text.css, …)
└── suites/            # suite manifests consumed by both producers
    ├── L0.exact.json      # must pass 100.00% byte-exact; CI gate
    └── L0.coverage.json   # aspirational scope; tracks progress
```

See [`.agents/skills/cg-reftest/SKILL.md`](../../.agents/skills/cg-reftest/SKILL.md)
for the reftest pipeline and suite schema. See
[`.agents/skills/fixtures/SKILL.md`](../../.agents/skills/fixtures/SKILL.md)
for general fixture authoring guidance (naming, one-concept-per-file,
checked-in vs `fixtures/local/`, etc.). This README only covers the
viewport convention specific to refbrowser.

## Viewport presets

Fixtures should target a **well-known viewport size** so the PNG
output of both producers is at a predictable dimension. This
eliminates the brittle "tune `viewport.height` per fixture to cg's
cull" dance and makes diffs cleaner (subject fills the canvas,
background doesn't inflate the score — see "Reading the score" in
the cg-reftest skill).

Recommended presets, ordered by typical use:

| Preset      | Width × Height | When to use                                                                 |
| ----------- | -------------- | --------------------------------------------------------------------------- |
| `canvas-md` | 600 × 800      | **Default.** Paint, layout, box-model, flex, grid, positioning tests.       |
| `canvas-sm` | 400 × 400      | Minimal single-feature demos (one shape, one swatch, probe-style).          |
| `mobile`    | 390 × 844      | Responsive/mobile-specific behavior (media queries, vh, env(safe-area-\*)). |
| `tablet`    | 768 × 1024     | Layout transitions at tablet-width breakpoints.                             |
| `desktop`   | 1280 × 720     | Wide compositions that don't fit in `canvas-md`.                            |

These are conventions, not enforced types. Pick the smallest preset
that exercises the behavior — small renders diff faster and fit on
review screens.

## Paint vs. layout fixtures — two authoring rules

Whether a fixture should force its own size depends on **what the
fixture is testing**. Get this wrong and your test measures the wrong
thing.

### Paint / visual-property fixtures — force the preset size

Fixtures that test color, opacity, border-radius, shadow, gradient,
background, transform, or any non-sizing visual property. The canvas
dimensions are **not** the subject; a known canvas just gives the
painted pixels room to sit.

**Pattern** — add to every such fixture's `<style>`:

```css
html,
body {
  min-height: 800px; /* match the suite's viewport.height */
  box-sizing: border-box;
}
```

cg then culls to exactly the preset height and Chromium produces the
same size under `full_page: true`. Both sides match without
per-fixture `viewport` in the suite.

**Why not `100vh`?** — cg's htmlcss engine currently resolves `vh`
against an internal viewport that may not match your target (observed:
100vh → 720px cull). Explicit pixel heights are deterministic across
both producers.

**Why `box-sizing: border-box`?** — without it, `min-height: 800px` +
body padding overflows the target height.

### Layout fixtures — never force a body size

Fixtures that test box-model math, padding/margin resolution,
flex/grid sizing, intrinsic sizing, `width`/`height`/`min-*`/`max-*`
on elements, positioning, aspect ratio, or anything whose **output
IS the rendered dimensions**. For these, the body's size IS the
measurement.

Forcing `min-height: 800px` on a layout fixture contaminates the test:
you've added a containing block constraint that the fixture's own
CSS now has to negotiate with. Whatever the fixture was really
testing becomes entangled with your min-height hack.

**Pattern** — no `html`/`body` min-height. Let the content size
itself naturally:

```css
body {
  margin: 0;
  padding: 24px;
  background: #fff;
  /* ...fixture-specific rules */
}
```

The suite entry then carries an explicit `viewport` matching cg's
natural cull:

```json
{
  "path": "../L0/box-dimensions.html",
  "viewport": { "width": 600, "height": 522 }
}
```

To find the right height, render the fixture once with
`golden_htmlcss --suite` and read the reported `WxH`. Update the
suite entry's `viewport.height` to match. Re-render refbrowser; both
sides should now be at identical dimensions.

**Dimension drift** — any change to a layout fixture's internal
layout changes its natural cull, invalidating `viewport.height` in
the suite. Re-measure and update.

## Adding a new fixture

1. **Name** — `<domain>-<property>[-<variant>].html`. The filename is
   the test id.
2. **Classify** — is this a **paint** fixture (color/border/shadow/
   opacity/etc.) or a **layout** fixture (sizing/padding/flex/grid)?
   - **Paint:** add `html, body { min-height: <preset>; box-sizing: border-box; }` so cg cull = preset height.
   - **Layout:** do **not** set any body `min-height`; let content size itself.
3. **Keep it minimal** — one property or behavior per file. See the
   fixtures skill for the full authoring checklist.
4. **Register it** — add an entry to `suites/L0.coverage.json`:
   - Paint fixtures: `{ "path": "../L0/<your-file>.html" }` (inherits `defaults.viewport`).
   - Layout fixtures: run `cargo run -p cg --example golden_htmlcss -- --suite …`, read the reported `WxH`, then
     ```json
     { "path": "../L0/<your-file>.html",
       "viewport": { "width": 600, "height": <natural cull height> } }
     ```
5. **Verify** — run both producers against the suite. The cg cull
   should equal the viewport in the suite, and the refbrowser
   screenshot should match pixel-for-pixel (or land somewhere in the
   coverage spectrum, with the diff image showing the real
   divergence).
6. **Promote** — once the fixture reaches 100.00% byte-exact parity
   with Chromium, move its entry from `L0.coverage.json` to
   `L0.exact.json`.

## Known constraints of the current pipeline

- Per-fixture `.reftest.json` sidecars are **gone**. All per-fixture
  config lives in the suite manifest.
- cg htmlcss does not currently resolve `vh` against the refbrowser
  viewport. Use explicit pixel heights.
- The refbrowser diff default is `--threshold 0` (pixelmatch
  strictest). See the cg-reftest skill for rationale and for the list
  of known Blink-vs-Skia divergence surfaces.
