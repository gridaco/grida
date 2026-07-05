---
title: Ruler & Guides
description: The edge rulers — screen-space frame chrome reading canvas coordinates — and the persistent per-scene guides they author.
tags:
  - internal
  - wg
  - editor
format: md
---

The **ruler** is frame chrome: two thin screen-space strips along the
top and left viewport edges that translate the camera into readable
canvas coordinates. **Guides** are the persistent, axis-aligned lines
the ruler authors: dragged out of a strip, stored in the document, and
offered to snapping as anchors. The ruler is pure view; guides are
document truth — that asymmetry organizes everything below.

Doctrine sources: the `ruler` primitive of
[`@grida/canvas-hud`](https://github.com/gridaco/grida/tree/main/packages/grida-canvas-hud)
(tick selection, marks, ranges, fade), the standalone `@grida/ruler`
package, and the main editor's guide gesture (creation threshold,
guide-drag snapping, document storage). The engine's built-in
`overlay::widgets::Ruler` is a _devtools_ full-viewport grid gated by
a debug flag — a different tool that shares the name; the editor ruler
specified here does not use it.

## The ruler

Two strips, top (x axis) and left (y axis), of a fixed screen-space
width (reference: 20 logical px), painted **top-most among chrome** —
above content and all canvas chrome, below panels. The strips sit
along the **canvas viewport's** top and left edges — the region the
host's panels leave uncovered — never the window's: strips and
panels must not overlap, in paint or in input. The host pushes the
viewport's origin into the HUD so the strip hit regions and the
delete-by-return zone (RUL-7) sit where the strips paint; a
full-window canvas pushes `(0, 0)`. The corner square at the L's
origin stays empty. The toggle (`ruler: on | off`) is
per-instance view state, bound to a command
([input](./input.md)); toggling accrues overlay damage
only.

What a strip paints, back to front:

- **Ticks and labels.** Major ticks at a step chosen from the 1-2-5
  series (`1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000…`):
  the smallest step whose on-screen spacing is ≥ 50 px. This keeps
  labels legible at every zoom — the step changes, never the density
  guarantee. Labels are canvas-unit coordinates. Optional minor
  subticks subdivide by the step's leading digit (1→10, 2→4, 2.5→5,
  5→5).
- **Selection ranges.** The selection's bounds project onto each axis
  as a highlighted range with boundary labels; overlapping ranges
  (multi-selection) merge before painting so shared boundaries don't
  double-label.
- **Guide marks.** Each guide on the strip's axis paints a full-strip
  accent tick labeled with its offset.
- **Fade.** Regular ticks fade out near guide marks and range
  boundaries (alpha proportional to distance within a threshold,
  reference 80 px) so authored positions win the label space.

The ruler is a pure function of (camera, viewport size, selection
bounds, guides) — it owns no state beyond the toggle.

### Axis orientation

The strip↔axis wiring is deliberately cross-wired, and getting it
wrong is the classic ruler bug — so it is stated once, in guide-axis
terms, and contracted (RUL-10):

- A strip **reads its own axis**: the top strip's ticks, labels,
  selection ranges, and guide marks are all x-axis facts. An axis-`x`
  guide (the vertical line `x = offset`) marks the **top** strip at
  its offset.
- A strip **authors its counter axis**: a create-drag out of the top
  strip travels in y and authors an axis-`y` guide — the horizontal
  line that runs parallel to the strip and follows the pointer.
  Mirrored for the left strip.
- A guide on axis `a` **repositions only along `a`** (the drag's
  counter component is ignored), which means the only strip its own
  motion can reach — the strip that deletes it by return (RUL-7) — is
  the one that authored it: the counter-axis strip.

The web host's own local naming trips over this wiring (its `marks.y`
feeds the x strip); the guide-axis phrasing above is the one that
stays unambiguous.

## Guides

A guide is an infinite axis-aligned line:

```
Guide { axis: x | y, offset: canvas units }
```

A guide on axis `x` is the vertical line `x = offset`; on axis `y`,
the horizontal line `y = offset`. Guides are stored **per scene in
the document** (the web schema's `Guide2D[]`), which decides
everything about their lifecycle: guide edits are document mutations,
framed in history like any gesture (drag previews are silent, commit
is one entry, abort leaves nothing), and they replicate through
[sync](../feat-crdt/sync.md). The [document](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/document.md) mutation vocabulary
gains a guide domain for this — the one delta this document imposes
on the document spec. The axis is fixed at creation; a guide
repositions along its axis or is deleted, never re-axed.

File persistence is document truth's third leg, and it is a **named
gap** in the reference implementation: the `.grida` schema
(`format/grida.fbs`) already defines per-scene `Guide2D`s, but the
engine encoder the editor drives does not map them yet, so guides do
not survive a save/open round-trip there. History and sync are
unaffected — both ride the editor's own mutation wire, and the sync
welcome snapshot carries the guide set explicitly.

### Interactions

All guide interaction rides the intent seam ([hud.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/hud.md)): the
ruler strips and guide lines are tier-1 chrome regions, the HUD emits
a phased `guide` intent (axis, index-or-new, offset, on-strip,
phase), and the host interprets it into document mutations. The HUD
holds guides only as a host-pushed mirror, like the selection — which
is also how a drag previews: the interpreter's silent document
patches flow back down as mirror updates, so the moving guide is the
document moving, not a separate ghost. This extends the hud.md intent
table by one row; the one law is unchanged.

- **Create** — press inside a strip and drag into the canvas. The
  guide materializes only after the pointer moves past a threshold
  (reference 4 px); press-and-release inside the strip is a no-op —
  no zombie guide on a stray click. It materializes **at the
  pointer's (corrected) position**, not at the strip edge, on the
  strip's counter axis (see "Axis orientation").
- **Move** — drag an existing guide line. The grab region is fat
  (screen-space padding) while the visual stays a hairline — the
  two-backend rule ([hud.md](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/hud.md) HUD-5).
- **Delete** — a move that ends back on the authoring strip removes
  the guide; a create-drag that ends there leaves the document
  untouched. Esc cancels any guide gesture, restoring the prior
  state.
- **Snapping, both directions.** A dragged guide itself snaps: to the
  geometry of the scene's top-level content bounds (per-axis min /
  center / max, the web precedent) within the standard threshold —
  honoring the geometry toggle and the live disable modifier
  ([snap.md](./snap.md) SNAP-3; the web omits the modifier on guide
  drags, an inconsistency this spec does not adopt) — and its offset
  quantizes to the lattice **unconditionally**: a committed guide
  offset is an integer regardless of the pixel-grid snap toggle
  (guides are integer by construction, matching the web). Conversely,
  guides are snap _anchors_ for every other gesture
  ([snap.md](./snap.md)). The interpretation happens host-side, per
  the one law.

### Display coupling

Guides paint (full-viewport hairline + strip mark), hit-test, and
serve as snap anchors only while the ruler is on; turning the ruler
off hides and deactivates them without touching the document. The
snap-anchor half is deliberate and matches the web (its gesture
pipeline feeds guides to snapping only while the ruler is on):
snapping to an invisible line is indistinguishable from a snapping
bug. This matches the wider convention too (hiding rulers hides
guides). Document truth is unaffected either way — a synced peer with
its ruler on still sees a guide its author's ruler hides.

## What it is not

- **Not a snapping engine.** Guides feed [snap.md](./snap.md) as
  anchors; the threshold math and guide-line chrome during other
  gestures live there.
- **Not the devtools ruler.** The engine's debug overlay grid is
  unrelated.
- **Not a layout grid.** Per-frame column/row grids are
  document-attached content features, out of scope.

Guides carry a light emphasis vocabulary: the guide under the idle
pointer strokes heavier (grabbable), and the guide an active gesture
is editing reads as **selected — the selection accent (blue), not the
guide red** — line and strip mark both.

Deferred, named: per-guide context menu (lock, remove-all), guide
focus state with keyboard delete (the web's delete route: click
focuses a guide, Delete removes it — the focused guide keeps the
selected-blue accent outside the drag), guide labels while dragging
content, rulers reading a selected frame's local coordinates instead
of scene coordinates, subticks (the primitive supports them; the
reference host leaves them off).

## Contracts

- **RUL-1** Ruler purity: toggling the ruler mutates no document or
  editor state beyond the view toggle, and the strips are a pure
  function of (camera, viewport, selection bounds, guides) — equal
  inputs paint identically (refines SURF-5).
- **RUL-2** Tick legibility: at any zoom, the chosen step's on-screen
  tick spacing is ≥ the minimum (50 px reference) unless the largest
  step cannot satisfy it, in which case the largest step is used.
- **RUL-3** Selection ranges: each axis strip highlights exactly the
  selection's projected bounds, with overlapping ranges merged; empty
  selection paints no range.
- **RUL-4** Guides are document truth: create, move, and delete are
  document mutations — each commits exactly one history entry, undo
  restores the prior guide set, and guides replicate through sync
  (binds HISB-2/4 and SYNC to the guide domain).
- **RUL-5** Creation threshold: a press in the strip creates a guide
  only after the drag threshold; release before it leaves the
  document unchanged.
- **RUL-6** Guide-drag snapping: a dragged guide within the snap
  threshold of a top-level content bound commits the snapped offset,
  honoring the geometry toggle and the live disable modifier
  (SNAP-3); committed offsets are quantized to the lattice
  (integers) unconditionally — independent of the pixel-grid snap
  toggle.
- **RUL-7** Delete by return: a guide-move ending on the authoring
  strip removes the guide, as one history entry; a create-drag ending
  there records nothing; Esc mid-gesture aborts with no entry.
- **RUL-8** Display coupling: with the ruler off, no guide paints, no
  guide or strip region hit-tests, and no guide serves as a snap
  anchor — while the document's guide set is unchanged and other
  instances are unaffected.
- **RUL-9** Intent seam: every guide edit is attributable to a phased
  `guide` intent emitted by the HUD and committed by the host; the
  HUD never mutates the guide set (extends HUD-1/HUD-3).
- **RUL-10** Axis orientation: a guide on axis `a` is the line
  `a = offset`; it marks the strip that reads `a`, repositions only
  along `a`, and is authored from — and deleted by returning to —
  the counter-axis strip.
