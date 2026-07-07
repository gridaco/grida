# Comparative study — peer systems

Facts we reason with, not designs we copy. Each system is read against the
problem catalog (P-refs) — what it stores, how it couples transform to
layout, and what its choice cost it. Confidence notes are explicit: most of
this is documented, stable behavior; Figma internals are partly inferred from
product behavior and the plugin API.

---

## CSS / HTML

- **Canonical geometry:** none stored — the box is layout _output_. `transform`
  is a separate property; **post-layout** by definition: a rotated element
  still occupies its untransformed box in flow; siblings never move (P5).
  `transform-origin` defaults to center.
- **Position basis:** normal flow, or `position:absolute` + TRBL insets.
  Over-constraint (left+width+right) resolved by _dropping a side_
  (direction-dependent) — a rulebook answer, not a schema answer (P2).
- **The flat-property price:** every property exists on every element; whether
  it _applies_ is defined per property per display type per context by the
  spec corpus. Flatness works because the rulebook is enormous and normative
  (P8, H6).
- **Two-tier values:** specified vs computed/used — the strongest precedent
  for an explicit intent/state wall (P4).
- **Late correction worth noting:** CSS Transforms Level 2 shipped individual
  `rotate` / `translate` / `scale` properties (~2022) because animators needed
  independently addressable channels the composite matrix couldn't give — the
  incumbent matrix system retrofitting scalar channels (P1, P10).
- Also relevant: CSS Anchor Positioning (2024–25 drafts) — the standards-track
  version of the WG feat-layout anchor vision (P2).

## SVG

- **Canonical geometry:** per-element attributes (`x/y/width/height`,
  `cx/cy/r`, `d`) **plus** a `transform` list. The authoring form is _named
  ops_ (`translate(10,20) rotate(30)` — and `rotate(a, cx, cy)` makes the
  pivot first-class syntax); `matrix()` is the escape hatch. Named-ops-first
  is the readability precedent (H1).
- **No layout.** SVG is the pure geometry-first pole — Grida's origin point.
  "Introduce a layout primitive to SVG" is a fair statement of this whole
  project (P3, P5).
- **Groups:** `<g transform>` — box-less, transform-holding, children in
  group-local space. Exactly the current Grida Group (P6).
- **Known wart:** `x/y` attributes _and_ `translate()` are two translation
  homes on one element — a small dual-source problem SVG never fixed (P1, H5).

## Flutter

- **Canonical geometry: nothing persisted** — geometry is per-frame layout
  output (constraints down, sizes up, parent positions child). A retained
  _document_ can't copy this, but the pipeline discipline (intent in, geometry
  out, never stored) is the pure form of P4's wall.
- **The rotation split, made explicit:** `Transform.rotate` = paint-only,
  arbitrary angle, alignment pivot, layout unaffected. `RotatedBox` =
  layout-visible, **quarter-turns only**. Flutter looked at arbitrary-angle
  layout-visible rotation and _restricted the domain_ rather than solve it
  (P5).
- `Transform` takes a full `Matrix4` — 3D/perspective lives in a wrapper
  widget, not in the box protocol (P9).
- Position idiom: `Positioned(TRBL)` inside `Stack` — insets as the
  absolute-positioning vocabulary (P2).

## SwiftUI

- Same family: proposal/response layout, nothing stored.
- `.rotationEffect(angle, anchor:)` — **paint-only**, anchor defaults center;
  the layout frame is unchanged (P5). `.offset` likewise paint-only.
- `.position(x, y)` is **center-based** — a mainstream system that rejected
  top-left as the position reference (P5-pivot, P7).
- Modern-declarative consensus with Flutter: arbitrary rotation is a visual
  effect; layout sees unrotated boxes.

## Figma

- **Canonical geometry:** `relativeTransform` (2×3, parent-relative) +
  `size (w, h)`. Rotation is **derived** (atan2-family) and exposed as a
  scalar lens; `x/y` are the matrix translation (P1, P4).
- **The matrix is under-used by its own product:** in practice transforms are
  rigid + flip — the scale tool bakes into `size`; skew is not authorable in
  the UI. Six floats carrying ~3 degrees of freedom (P1). _(Confidence:
  documented API shape + product behavior; not a spec quote.)_
- **Pivot legacy scar:** the UI rotates around the selection center by
  compensating translation; the model/API rotation applies around the node's
  own origin. The center-pivot everyone experiences is a gesture-level
  fiction over the stored form (P5).
- **Rotation is layout-visible:** a rotated child of an auto-layout frame
  participates via its rotated AABB — the frame hugs the rotated bounds
  (P5). Tractable because the AABB is `f(w, h, θ)`, independent of assigned
  position — single-pass survives. _(Confidence: observed product behavior.)_
- **Constraints store state, not intent:** stored `x/y` + per-axis constraint
  enum (Min/Max/Center/Stretch/Scale); "right: 10" is re-derived, never
  stored — the complaint recorded in `docs/wg/feat-layout/index.md` (P2, P4).
- **Groups:** transform-holding with a fitted, cached size; child edits
  trigger re-fit + compensation writes — the cross-node transaction cost
  named in P6.
- **Multiplayer:** property-atomic LWW; the transform merges as one value —
  no tearing, but concurrent move ∥ rotate = one user's intent lost (H3).

## tldraw (2023-era cleanroom, aside)

- Shape record: `x`, `y`, `rotation` scalars + typed `props` (w/h inside
  props). **No matrix, no skew**; scale bakes into size on commit.
- The one studied system designed _after_ multiplayer CRDTs were table
  stakes, and it chose decomposed scalars as canonical (P1, H3).
  _(Confidence: public schema; details of group rotation handling not
  re-verified.)_

---

## Cross-cutting observations

1. **Nobody stores both a matrix and scalars.** Every coherent system picks
   one canonical form and derives the other; the current Grida runtime is the
   only dual-source design in the room (P1).
2. **Nobody does arbitrary-angle layout-visible rotation "properly".** Figma
   feeds AABBs (measure-unrotated, wrap, pack); Flutter restricts to 90°;
   CSS/SwiftUI opt out entirely. The constraint-propagation-through-rotation
   problem (rotated text reflow) is universally dodged (P5).
3. **Flat property surfaces are paid for in rulebook.** CSS is the existence
   proof both that flatness works and that it costs a spec corpus (P8, H6).
4. **Center pivot is the modern consensus** for the _experienced_ rotation
   (CSS origin default, SwiftUI anchor default, Figma gesture), regardless of
   what the stored form does (P5).
5. **Full-power transforms live in wrappers** where they exist at all:
   WPF `TransformGroup` / `RenderTransform` vs `LayoutTransform` (the explicit
   pre/post split, named), Flutter's `Transform` widget, SVG's nested
   `<g transform>` (P9).
