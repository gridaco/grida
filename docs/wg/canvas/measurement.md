---
title: Measurement
description: The modifier-held spacing readout — hold alt and hover to measure the space between the selection and any other node.
tags:
  - internal
  - wg
  - editor
format: md
---

**Measurement** is the spacing readout: hold the measurement modifier
(alt/option) and hover a node, and the canvas shows the distances
between the current selection and the hovered target — one labeled
line per side of separation. It is the fastest way to read a layout
without touching it, and it touches nothing: measurement is a pure,
instantaneous derivation with no state, no history, and no hit
regions.

Doctrine sources: the engine is `cmath.measure`
(`@grida/cmath/_measurement`), already ported as
`math2::measurement`; the chrome is the `measurement-guide` primitive
of `@grida/canvas-hud`; the trigger discipline is proven in
`@grida/svg-editor` and the main editor.

## Trigger

Measurement is active exactly when **all** of these hold:

- the measurement modifier is held;
- no gesture is active (the HUD is idle);
- the selection is non-empty;
- the pointer is over a pickable target.

The subjects are **A = the union bounds of the selection** and
**B = the bounds of the topmost node under the cursor** — including a
container picked through its empty interior, which is how "measure to
the frame edges" falls out of the ordinary pick rather than a special
mode. If A and B are identical rects there is nothing to measure and
nothing renders.

There is no dwell timer: the readout appears on the first hover with
the modifier held and disappears the instant any trigger condition
fails — modifier released, a gesture starts, or the selection empties.
It updates live as the hover moves.

One ambiguity is resolved by the idle condition: the same modifier
configures other gestures (clone-on-drag, center-origin — golden
[input](./input.md)). Held while idle it measures; held
during a gesture it configures that gesture. The two never overlap.

## The measure

`measure(a, b)` reduces the pair to a **reference box** plus four
distances `[top, right, bottom, left]`, by spatial relation:

- **Disjoint** — the box is A; distances are the gaps from A's sides
  toward B.
- **Intersecting** — the box is the intersection; distances reach the
  outer extremities of the pair.
- **Contained** — the box is the inner rect; distances are the insets
  to the container's sides (the padding readout).

Sides with zero distance are omitted. All values are canvas units,
independent of zoom.

## The chrome

For each non-zero side, the readout draws a solid **spacing line**
from the midpoint of the box's side, extending outward by the
distance, labeled with the value (one decimal, in a pill); where the
spacing line's far end does not land on B's edge, a dashed
**auxiliary line** projects it to B, showing what the measurement is
anchored against. Both subject rects get a thin outline.

The chrome is **decorative only** — no hit regions, ever
([hud.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/hud.md) two-backend taxonomy). It rides the host-extras
slot of the HUD draw list, in the same layer band as snap guides, and
recomputes per event from (modifier, hover, selection) — there is no
retained measurement state to invalidate. Showing, moving, and
dismissing it accrue overlay damage only ([frame.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/frame.md)).

## What it is not

- **Not snapping.** Snap guides show where a *gesture* aligned;
  measurement reads distances while nothing moves. They share line-
  and-label chrome primitives and nothing else.
- **Not persistent.** Nothing is stored; release the modifier and it
  never existed. (Figma-style pinned/red-line annotations would be a
  separate, document-attached feature.)
- **Not a hover replacement.** Hover and pick behave exactly as
  without the modifier (HUD-8); measurement only adds a readout on
  top.

Deferred, named: measuring between two arbitrary nodes without
selecting one (A defaults to selection in v1), sub-node measurement
(vector segments, text baselines), pinned annotations.

## Contracts

- **MEAS-1** Trigger truth-table: the readout is present exactly when
  modifier ∧ idle ∧ selection non-empty ∧ hover target exists ∧
  A ≠ B; dropping any conjunct dismisses it within the same
  dispatched event.
- **MEAS-2** Read-only: with measurement active, document, history,
  selection, and hover are bit-for-bit what they would be without it,
  and no measurement chrome registers a hit region.
- **MEAS-3** Distance correctness: for disjoint, intersecting, and
  contained pairs, the four distances equal the geometric gaps of the
  relation as specified above, in canvas units, at every zoom.
- **MEAS-4** Zero omission: sides with zero distance draw nothing;
  identical rects draw nothing.
- **MEAS-5** Liveness: moving the hover to a different target updates
  the readout in the same event — subjects, distances, and labels
  always describe the current (selection, hover) pair.
- **MEAS-6** Determinism: the readout chrome is a pure function of
  (selection bounds, hover bounds, camera) — equal inputs, identical
  draw list (refines SURF-5).
