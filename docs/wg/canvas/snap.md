---
title: Snap
description: Gesture-time alignment — the snap family (geometry, space, pixel grid) as interpretation stages, with the guide chrome that explains them.
tags:
  - internal
  - wg
  - editor
format: md
---

**Snap** adjusts what a gesture _means_: as content is dragged,
resized, or drawn, the interpreted values are corrected toward nearby
alignments before they are applied. The family has three members:

1. **Snap to geometry** — magnetic alignment to the bounds of
   neighboring content and to [guides](./ruler.md), within a
   screen-space threshold. Applies to **translate** (the union's nine
   points) and to **resize** (the moving edges only — see below).
2. **Snap to space** — equal-gap distribution: uniform gaps among
   _direction-aligned_ neighbors project candidate positions that
   give the agent an equal-spacing slot to lock onto. Applies to
   **translate**.
3. **Snap to pixel grid** — quantization: the result rounds to the
   unit lattice ([pixel-grid.md](./pixel-grid.md)), so a translate
   commits `x = 61`, never `x = 61.11319999`.

A fourth member — snapping **vector geometry** (anchor points,
segments, curve intersections) while vector-editing — is a distinct
system with its own agents and chrome:
[snap-vector.md](../feat-vector-network/snap-vector.md) (placeholder; deferred with the
vector-edit feature).

Snapping is **interpretation, not interaction**: the HUD emits raw
gesture geometry and stays snap-blind ([hud.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/hud.md), the one
law); the host's interpretation module applies snapping between
intent and mutation. It is gesture-time only — it shapes previewed
and committed values and leaves no other trace in the document.

Doctrine sources: the engine is `cmath.ext.snap`
(`@grida/cmath/_snap`), already ported as `math2::snap`
(`axis`/`spacing`/`canvas` modules); the pipeline shape is proven in
`@grida/svg-editor` — the one implementation carrying the whole
family (`core/snap/session.ts` for translate + resize-moving-edge
snapping, `core/translate-pipeline` and `core/resize-pipeline` for
the stage orders); thresholds, sources, and modifiers in the main
editor.

## The pipeline

Interpretation applies stages **in order**, per gesture kind:

| Gesture           | Stages                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------- |
| translate (drag)  | axis-lock → geometry + space snap → quantize                                           |
| resize            | axis/aspect constraints → geometry snap (moving edges only) → quantize (moving corner) |
| insert (drag-out) | geometry snap → quantize                                                               |
| guide drag        | geometry snap → quantize ([ruler.md](./ruler.md))                                      |
| nudge (arrows)    | quantize only — never geometry snap                                                    |
| rotate            | angle quantize (modifier-held, 15° steps)                                              |

Order matters: the content snaps correct the value first,
quantization rounds whatever survives. Nudge deliberately skips
geometry snap — a keyboard step is an exact instruction, and having
it captured by a nearby edge would fight the user.

## The session

Geometry snap runs against a **session** frozen at gesture start:

- **Agent** — the union bounds of the moving content, reduced to its
  nine points (four corners, four edge midpoints, center).
- **Anchors** — the _neighborhood_: the parent's bounds and every
  visible sibling's bounds (a group sibling contributes its own
  bounds and its leaves), plus the scene's guides. With large anchor
  counts, a proximity pre-filter and a spacing-snap cutoff (reference
  limit 64) keep the per-move cost bounded.

Both are captured once and reused every pointer-move: mid-gesture
document changes (the previews themselves) never feed back into the
anchor set, so a gesture cannot chase its own snapping.

Per move, each axis snaps independently: the agent's nine points
against the anchors' points, the strongest hit within threshold wins,
and the corrected delta carries the hit indices so chrome can show
_why_.

**Space snap** extends the same per-axis pass with distribution
geometry, and is deliberately narrower than geometry snap:

- **Direction-aligned anchors only.** For an x-axis candidate, only
  anchors whose _y ranges overlap the agent's_ participate (and
  symmetrically for y): equal spacing is a claim about objects in a
  row, not about everything on the canvas. The overlap test uses the
  agent at its geometry-corrected position for the current move.
- **Both sides.** Every uniform-gap pair among the aligned anchors
  projects candidates on both flanks: the agent's _leading_ edge
  snaps to positions extending the run after the pair, the _trailing_
  edge to positions extending it before, and cross-pair gaps forward
  onto each other so a chain of gaps offers each other's spacing.
- **Center fit.** An agent narrower than a gap also gets the centered
  candidate inside it — landing there makes the two flanking gaps
  equal.
- The winning correction is the strongest hit across geometry, guide,
  and space candidates on that axis (compared by magnitude —
  direction never gets priority); ties draw both chromes.

Shared knobs:

- **Threshold.** A screen-space constant (reference 5–6 px) divided
  by zoom into canvas units — the magnetic zone feels the same at
  every zoom.
- **Disable modifier.** The golden [input](./input.md)
  "disable snapping" configuration (ctrl in the web editor) bypasses
  the content snaps (geometry and space) live: hold to get raw values
  mid-gesture, release to re-engage (SURF-4 applies).

## Moving edges (resize)

A resize does not snap nine points — its agent is the **moving edge
scalar per axis**, derived from the dragged handle: an `E` drag moves
the right edge and nothing on y; an `NW` drag moves the left and top
edges; the anchored side is fixed by the gesture and must neither
move nor contribute candidates. Per axis, the moving edge snaps
against the anchors' three offsets (min / center / max) and the
guides on that axis — the same candidate set translate uses, reduced
to scalars.

The correction preserves the gesture's anchor: with the default
opposite-edge anchor, only the moving edge shifts (the size absorbs
the correction); under center-resize (alt), the correction applies
symmetrically so the center holds and the moving edge still lands
exactly on the alignment. Space snap does not run on resize
(objects-to-agent center-distribution during resize is named
deferred).

## Quantization

Snap-to-pixel-grid is pure arithmetic, applied last:

```
q(delta) = round((anchor + delta) / quantum) · quantum − anchor
```

with `quantum = 1` canvas unit and **anchor = the frozen
gesture-start position** (the agent union's origin). Anchoring on the
gesture start means the rounding grid cannot drift mid-gesture: a
rect starting at a fractional position lands on the lattice on the
first correction and stays there.

Quantization rounds the gesture's **moving values** only: for a
translate that is the moved union origin (so every moved position
lands on the lattice); for a resize it is the **moving corner** — the
anchored edge is not a gesture-produced value and never rounds, so
resizing a fractionally-positioned rect leaves its anchored edge
exactly where it was (the moving edge lands on the lattice; the size
absorbs the fraction). Quantization is independent of the pixel
grid's _visibility_ (PXG-5), applies to gesture-produced values only
— a value typed into the properties panel is committed verbatim —
and is on by default in the reference editor (hosts like the SVG
editor default it off for source fidelity).

## The chrome

A snap that fired is explained visually, drawn from the hit indices
in the snap result:

- **Geometry (translate)** — point markers (small screen-fixed
  crosshair "X"es, centered on the hit) on the exact hits, plus a
  hairline through each set of two-or-more co-aligned points.
- **Geometry (resize)** — a full-length rule at each aligned offset
  (the moving edge is a scalar; a rule is its honest witness).
- **Guides** — a full-length rule at the guide's offset.
- **Space** — a labelled gap line for the new equal gap (from the
  projection origin to the landed edge) and, when the candidate
  extends an existing pair, a labelled line over that pair's gap —
  the label is the shared spacing value.

The chrome rides the host-extras slot of the HUD draw list, in the
same band as [measurement](./measurement.md), and is decorative only
— no hit regions. It appears while a hit is within threshold during a
drag, and vanishes with the gesture; quantization draws nothing.
Snap and measurement chrome share one stroke weight — a half-pixel
hairline (0.5 logical px, one device px on 2× displays), finer than
selection chrome — so the readouts stay legible without competing
with content.

## Engine notes

`math2::snap` already ports `snap1d`, `snap2d_axis_aligned`, the
spacing/distribution geometry (`plot_distribution_geometry`, both
projection flanks and the center fit), and a canvas-level
orchestration; `math2::measurement` is complete. The Rust canvas
orchestration returns only `{translated, delta}` — it drops the
hit-index detail guide chrome needs — so the reference editor owns
its own orchestration at the axis level
(`crates/grida_editor/src/snap.rs`), which is also where the TS
`guide.plot` (snap result → guide geometry) translation and the space
orchestration live (both-sides snap over the distribution projections
plus the direction-aligned anchor filter; the reference combines a
pair's two sides by strongest |distance| where the TS takes a plain
signed min — a quirk, not doctrine). Remaining engine gap, to be
closed editor-side or upstreamed to `math2` (not the engine crate):
point-anchor snapping — the vector system's engine
([snap-vector.md](../feat-vector-network/snap-vector.md)).

## What it is not

- **Not the HUD's job.** The HUD never snaps; it cannot, having no
  document or threshold knowledge (HUD-1). Snap guides enter the HUD
  only as host-fed draw data.
- **Not a constraint system.** Snapping nudges a value once, at
  interpretation time; it does not persist relationships. Undo of a
  snapped gesture restores the prior state, not the raw drag.
- **Not the pixel grid render.** See [pixel-grid.md](./pixel-grid.md)
  for the term split.

Deferred, named: vector vertex/point snapping
([snap-vector.md](../feat-vector-network/snap-vector.md)); snap to a rotated node's local
frame; objects-to-agent center-distribution snap during resize;
configurable quantum (sub-pixel grids).

## Contracts

- **SNAP-1** Placement: snapping happens in interpretation only — the
  HUD's emitted intents are identical with snapping on or off, and no
  snap code runs outside the interpretation module (extends HUD-1/7).
- **SNAP-2** Geometry snap: a translate ending within threshold of a
  sibling edge/center or a guide commits the aligned value; beyond
  threshold, the raw value (binds SURF-6).
- **SNAP-3** Disable modifier, live: holding the disable modifier
  mid-gesture yields raw values for subsequent previews; releasing it
  re-engages — within one event of the change (binds SURF-4).
- **SNAP-4** Quantization: with snap-to-pixel-grid on, every
  gesture-committed _moving value_ is an integer multiple of the
  quantum — the moved positions for a translate, the moving corner
  for a resize (a resize's anchored edge never rounds); the rounding
  anchor is fixed at gesture start (no drift across a gesture's
  previews); nudge steps commit exact integer deltas.
- **SNAP-5** Panel exemption: a value entered through the properties
  panel commits verbatim — quantization applies to gesture
  interpretation only.
- **SNAP-6** Nudge exemption: a nudge is never geometry-snapped, at
  any distance from any anchor. (A nudge that _lands_ on an alignment
  may still raise an advisory guide — that reveals the alignment, it
  does not correct toward one; owned by [nudge.md](./nudge.md),
  NUDGE-6.)
- **SNAP-7** Session freezing: the anchor set is captured at gesture
  start; the gesture's own previews never alter it (a drag cannot
  chase its own snap).
- **SNAP-8** Chrome honesty: whenever a geometry snap corrects a
  preview, guide chrome marks the alignment that caused it; when
  nothing snaps, no snap chrome paints. The chrome registers no hit
  regions. (One deliberate carve-out lives outside the gesture loop:
  a keyboard nudge that lands aligned flashes an advisory guide though
  nothing was corrected — feedback, not a snap; see [nudge.md](./nudge.md),
  NUDGE-6.)
- **SNAP-9** Threshold zoom-invariance: the snap capture distance,
  measured in _screen_ pixels, is constant across zoom levels.
- **SNAP-10** Resize snaps moving edges only: a moving edge ending
  within threshold of a neighbor edge/center or a guide commits the
  aligned value while the gesture's anchor (the opposite edge — or
  the center, under center-resize) holds exactly; the anchored side
  never contributes candidates, and an axis with no moving edge is
  never corrected.
- **SNAP-11** Space snap: a translate ending within threshold of an
  equal-spacing candidate — a gap extension on either flank, or the
  centered fit inside a wider gap — commits it; only anchors
  overlapping the agent on the counter axis project candidates, and
  the winning correction across geometry, guide, and space candidates
  is the strongest hit by magnitude.
