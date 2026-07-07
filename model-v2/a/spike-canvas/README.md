# anchor-spike — E10, the feel spike

A native Skia canvas driven end-to-end by the `anchor` model
([`../lab`](../lab) — consumed as a library, the same relationship the
phase-4 migration will have). Two goals, owner-stated: **feel it** and
**be the textbook** for the legacy migration
([`TEXTBOOK.md`](./TEXTBOOK.md)).

## Run

```sh
cd model-v2/a/spike-canvas
cargo run --release            # the window
cargo run --release -- --bench # resolve+paint timings
cargo run --release -- --shot out.png [crosszero|ungroup|rot45]
```

First build reuses the repo's compiled skia via the shared target dir
(`.cargo/config.toml`).

## The feel checklist

- **pan/zoom** — scroll pans, ⌘-scroll / pinch zooms about the cursor,
  space-drag or middle-drag pans, ⌘0 fits, ⌘= / ⌘- zooms. Zero writes —
  the camera is host state.
- **select** — click; clicking group content selects the OUTERMOST
  group (GROUP.md transparent-select). Esc deselects.
- **move** — drag a card inside the flex row: layout owns position, the
  log shows the typed wall if an axis refuses (drag the amber bar
  sideways: `x: Err(AxisOwnedBySpan)`); drag the green badge: its End
  pin negates the delta in the log.
- **rotate** — the stick above the selection; 1 write (watch the log),
  shift snaps to 15°. Under DEC-0 (visual-only) rotation is PAINT: the
  row does not reflow, overlap is correct behavior, and the HUD readout
  explains box vs INK. Rotating the `chips` group is the 3-write
  center-feel gesture.
- **resize** — corner/edge handles; drag an edge THROUGH the opposite
  edge: the mirror flips (`flip-x: false -> true` in the log, 2–3
  writes), out-and-back restores the document exactly (E-A14).
- **artboard** — select it, drag its right edge: the badge and the bar
  respond with ZERO writes of their own.
- **structure** — ⌫ deletes, ⌘⇧G ungroups (bake writes logged), arrows
  nudge (⇧ = 10px), ⌘Z / ⌘⇧Z undo/redo (document snapshots).
- **the IR** — right panel, live canonical print; edit it and hit
  apply: the canvas updates; a bad IR is a typed parse error in place.

## Scope fence (named, not silent)

No images/vectors/bools; text renders via the default typeface but is
MEASURED by the lab stub (visible mismatch = open DEC-4/B-1, on
purpose); no marquee multi-select, snapping, rulers, persistence beyond
the IR, or wasm. DEC-0 is decided (visual-only, CSS-pure —
[`../dec0-visual-only.md`](../dec0-visual-only.md)); DEC-1/2/3 are
closed n/a by it — fill never fights rotation here, by construction.
