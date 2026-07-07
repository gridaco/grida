# E1 verdict — rotation-in-flow

**Decision: lock layout-visible.** A rotated in-flow child participates in
flex by its oriented AABB (`w' = |w·cosθ| + |h·sinθ|`), box center placed
at the slot center — exactly a.md §5. Conformance **R-3** and editor
**OP-ROT-2** graduate from `POL` to `INV` on the anchor column.

Run: 2026-07-07, `anchor-lab` @ `cargo run --bin e1` (metrics.csv is the
record; demo.html is the feel).

## Why (measured, in triage order)

1. **Canvas truth (#1).** The control arm produces up to **1830 px²** of
   sibling overlap that _no document field expresses_ — the document says
   "a list of three cards", the pixels say two of them collide. The anchor
   arm never overlaps, at any angle, by construction and by measurement
   (0 px² across the full sweep). This is the overlap-lie the triage's
   canvas-truth answer refuses.
2. **It feels continuous (#5's fear, retired).** The plausible objection
   to layout-visible rotation was jitter — layout reacting per frame.
   Measured: sibling displacement is smooth and bounded by the analytic
   envelope derivative (3.45 px per 2° observed vs 4.07 px bound; no
   discontinuity anywhere, including through 0°/90°/180°). Rotating a card
   in a list _reads as the list making room_, not as instability.
3. **The turn animates (#27).** The container breathes 56.6 px over a full
   spin (peaking at θ\* = atan(h/w) ≈ 59°). For a _gesture_ this is the
   point — the list visibly negotiates space. For _pure motion_ (a card
   spinning forever) breathing would be noise — which is precisely the
   spec's existing two-lane rule (§5): **motion rotation targets a lens
   channel; only intent rotation is layout-visible.** E1 turns that rule
   from doctrine into a measured necessity: the experiment _confirms_ the
   two-lane split rather than weakening layout-visible.
4. **No gesture tax.** Rotation stays a single-field write in flow in both
   arms (asserted every step of the sweep). Layout-visibility costs zero
   write amplification; the reflow is resolver work, not document work.
5. **Predictability (#17).** The arithmetic an agent needs is one formula
   (`|w·cosθ|+|h·sinθ|`); the E3 cold-prediction probe includes
   rotated-in-flow cases — see
   [`../e3-text-ir/verdict.md`](../e3-text-ir/verdict.md) for the scored
   result feeding this clause.

## Declared consequences (into the spec at phase 3)

- R-3 → INV: "siblings make room for the rotated AABB; contribution is
  computed from resolved size only, never position" (single-pass safety
  stays load-bearing).
- OP-ROT-2 → INV: rotate-in-flow = 1 write; the editor previews reflow
  live during the gesture.
- **Envelope-peak note for the editor layer**: the AABB maximum is at
  θ\* = atan(h/w), not 90° — a card is _widest_ mid-turn. HUD affordances
  (e.g. snapping readouts) should surface the envelope, or users will
  read the pre-90° maximum as a bug. Recorded as an editor.md follow-up,
  not a model change.
- Fixed-width containers don't breathe (measured identical displacement,
  zero container change) — breathing is a hug-container phenomenon only.

## What would have reversed this

If the sweep had shown displacement discontinuities (slot reordering
mid-turn), unbounded per-degree movement, or gesture write amplification,
the tilt would have flipped to visual-only + an explicit opt-in switch.
None occurred.
