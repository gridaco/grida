# `test-canvas` fixtures

On-disk [`.canvas`](../../docs/wg/format/canvas.md) bundles — a portable
directory of standalone SVG documents plus a `canvas.json` manifest. Consumed by
`dotcanvas` and openable directly in the desktop app's slides editor.

## `demo.canvas/`

The default happy-path deck. A valid `type: "svg-slides"` bundle exercising the
load-bearing parts of the contract:

```text
demo.canvas/
├── canvas.json     # manifest: order + ids + per-slide names + one layout + ext
├── 001.svg         # Slide 1 — Title   (id "intro")
├── 002.svg         # Slide 2 — Chart   (id "chart", has a canvas-view layout)
├── 003.svg         # Slide 3 — Thanks  (id "thanks")
└── thumbnail.svg   # bundle cover, resolved by the filename convention
```

What it covers:

- **Order** — `documents[]` order is the slides view (001 → 002 → 003), 1-based
  to match the slide numbers a viewer shows.
- **Identity ≠ filename** — each doc's `id` (`intro`/`chart`/`thanks`) differs
  from its `src` stem, so it exercises the `id ?? src` identity rule.
- **Per-slide metadata** — `name` rides as a per-document field the format
  doesn't define but round-trips.
- **Canvas view** — slide 2 carries a `layout` (`x/y/w/h/z`).
- **Thumbnail by convention** — no explicit `thumbnail` field; `thumbnail.svg`
  is resolved by the filename convention (png > svg > jpg > jpeg).
- **App extension bag** — `ext["co.grida.svg-demo"].activeId` is the desktop /
  web slides editor's view-state, preserved verbatim.

The SVGs are minimal and high-contrast (white/black + the slide label) so the
deck is legible as thumbnails and in a presenter view.

### Using it

- **Desktop:** open the `demo.canvas/` folder — it routes to the slides editor
  (the app auto-detects `canvas.json`).
- **Tests:** read it through any `dotcanvas.ReadableFs` (e.g. a `node:fs`
  adapter). See `packages/dotcanvas/src/fixture.test.ts`.
