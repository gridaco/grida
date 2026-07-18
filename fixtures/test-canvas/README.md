# `test-canvas` fixtures

On-disk [`.canvas`](https://github.com/gridaco/nothing/blob/main/docs/wg/format/canvas.md) bundles — a portable
directory of standalone SVG documents plus a `.canvas.json` manifest. Consumed by
`dotcanvas`. Two bundles cover the two editors: a `slides` deck and a `board`.

## `slides.canvas/`

The default happy-path deck. A valid `editor: "slides"` + `files: ["*.svg"]` bundle
exercising the load-bearing parts of the contract:

```text
slides.canvas/
├── .canvas.json    # manifest: order + ids + per-slide names + one layout + ext
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

## `board.canvas/`

The `board` counterpart — a valid `editor: "board"` + `files: ["*.svg"]` bundle,
the **freeform** surface where placement (not order) is primary:

```text
board.canvas/
├── .canvas.json    # manifest: 4 cards, each with a layout; z-ordered; no thumbnail
├── 001.svg         # "Kickoff notes"  (id "notes")
├── 002.svg         # "This sprint"    (id "tasks")
├── 003.svg         # "Palette"        (id "palette", z 1 — over notes)
└── 004.svg         # "Active boards"  (id "metric",  z 2 — on top)
```

What it covers (and where it differs from `slides.canvas`):

- **Editor = `board`** — exercises the second `editor`; the canvas view (`layout`)
  is the primary projection, not the slides order.
- **Layout on every document** — unlike the deck (where most slides have no
  `layout`), here all four cards are placed on a 2D plane.
- **z-order** — `palette` (z 1) and `metric` (z 2) overlap the cards beneath
  them; paint order is authored, not derived.
- **No thumbnail** — resolves to `thumbnail: null` (the deck has a cover; this
  one deliberately doesn't, covering the absent-thumbnail path).

The same list still has an order, so a viewer _could_ present it as slides — the
two views are projections of one list; `editor` only names which is primary.

## Using these

- **Tests:** read either through any `dotcanvas.ReadableFs` (e.g. a `node:fs`
  adapter). See `packages/dotcanvas/src/fixture.test.ts`.
- **Desktop:** open the folder — the app auto-detects `.canvas.json` and routes
  by `editor` (a deck opens as slides; a board as a freeform canvas).
