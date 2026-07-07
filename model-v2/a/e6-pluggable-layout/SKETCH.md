# E6 — pluggable layout, the curiosity sketch

Status: **exploratory, non-binding** (triage #28: "never core — but I
would LOVE to see what lands if I picked 'core must anticipate'").
Nothing here is a commitment; this is the owed look down the road not
taken.

## The finding: the seam already exists

Building the E1/E4 resolver revealed that the anchor model already
contains a layout-plugin interface _by accident of its own discipline_.
Phase L's contract per container is exactly:

```
layout: (container content box, [child contributions]) → [slots]
child placement: box center := slot center
```

where a **contribution** is `(main, cross)` — already an abstraction, because
rotated children submit their AABB, not their box (E1). Flex never knows
whether it is placing a box, a rotated envelope, or a group union. That
is the whole plugin surface:

```
trait LayoutMode {
  fn measure(&self, children: &[Contribution], avail: Avail) -> Size;   // hug
  fn place(&self, children: &[Contribution], content: Size) -> Vec<Slot>;
}
```

`None` (bindings) and `Flex` (Taffy) are the two built-ins. Grid is a
third implementation of the same trait — which is why a.md could call
grid "an additive future mode variant" without hand-waving.

## What the exotic modes would look like

- **Radial**: slots on a circle; parameters `radius`, `start_angle`,
  `spread`. Child rotation-to-tangent is _not_ the layout's job — it
  writes nothing; a `follow: tangent` child flag would resolve rotation
  from the slot angle (a resolved-tier value, never serialized — the
  "derivable ⇒ not encodable" law extends cleanly).
- **Masonry**: `place` with per-column running heights — pure function of
  contributions, no new model concepts at all.
- **Text-on-path**: the one that _breaks_ the seam. Slots stop being
  rects (they become arc-length frames with tangents), and measurement
  couples to glyph shaping. This wants to live inside the `text` payload
  (a content concern), not in the container protocol. The seam's limit
  is: **slots are axis-aligned rects**; anything needing oriented slots
  is payload territory.

## Why it stays out of core (unchanged, now with reasons priced)

1. **E3 is the veto.** The model's proven superpower is that an LLM
   predicts geometry from a 150-line grammar. Every pluggable mode
   multiplies the grammar; a _user-definable_ mode (wasm hook?) destroys
   cold prediction entirely — resolution would no longer be closed-form
   from the document alone. That trade is not worth radial menus.
2. **Conformance surface.** Each mode adds a suite the size of L-\*.
   Flex is testable against Chromium; radial/masonry have no oracle but
   us (§9-style authored spec each time).
3. **Nothing is precluded.** `LayoutBehavior.mode` is an fbs enum/union —
   additive by the E2-verified evolution rules. The trait boundary above
   is an _internal_ engine shape; adopting it costs a refactor, not a
   format migration. Anticipation is therefore free — which is the best
   argument for not spending on it now.

## One sentence of verdict

The core should _stay_ two modes; but phase 4 should implement Phase L
against the `(contributions → slots)` trait anyway, because E1's rotated
AABBs already forced that abstraction into existence — the plugin door
comes free with the rotation feature, locked from the format side.
