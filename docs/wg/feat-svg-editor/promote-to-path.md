---
title: "Promote-to-Path — vector editing of non-path shapes"
description: "RFD for editing the non-path SVG shapes (rect, circle, ellipse, line, polyline, polygon) as vector geometry: native writeback while the tag can express the edit, promotion to <path> when it cannot — the timing, target, conic representation, and round-trip invariants that keep the conversion honest."
keywords:
  - svg
  - svg-editor
  - vector-edit
  - promotion
  - policy-class
  - round-trip
tags:
  - internal
  - svg
  - wg
format: md
---

# Promote-to-Path — vector editing of non-path shapes

## Summary

The editor lets a user open a `<path>`, `<polyline>`, or `<polygon>` in
vector-edit mode and manipulate its vertices, segments, and tangents. The
primitive shapes — `<rect>`, `<circle>`, `<ellipse>` — are excluded,
because their parameterisations have no addressable interior vertices to
edit (a circle is two numbers and a centre; a rect is a box). To edit one
as free vector geometry, the shape must first be re-typed into a form that
_has_ editable vertices. This is **promotion**.

This RFD specifies promotion of primitive shapes to `<path>` for the
purpose of vector editing: **when** the document is actually re-typed,
**what** it is re-typed to, **how** a curved primitive's geometry is
represented as path data, and the **round-trip invariants** that keep the
conversion from becoming the kind of silent damage this editor exists to
avoid.

The same discipline generalises to the **vertex tags** — `<line>`,
`<polyline>`, `<polygon>`. They already _have_ editable vertices, so a
straight vertex move stays in the native tag; but an edit that the tag
cannot express (a curve, or a topology change that escapes its canonical
form) promotes to `<path>` by the same rule. See
[Generalisation to the vertex tags](#generalisation-to-the-vertex-tags).

Promotion is not new vocabulary. It is one of the four legal solutions a
[Policy Class](./glossary/policy-class.md) may declare for an intent
(`refuse` / `native` / `promote` / `via-transform`). This document fills
in the `promote` cell for the vector-edit intent on the primitive-shape
classes, which the Policy Class glossary names as an open question and
defers.

## Motivation

Two forces meet here.

**The editor is honest about scope.** A `<circle>` that the user merely
selects, nudges, or recolours stays a `<circle>` — one attribute of diff,
no proprietary noise, byte-equal round trip. That guarantee (P1, file
sovereignty) is the product. Editors that silently turn circles into
four-cubic-Bézier paths on save are exactly what this editor is a reaction
to.

**But vector editing is a real, requested capability.** A user who
explicitly enters vertex-edit mode on a circle and drags an anchor is
asking for something a `<circle>` cannot express. The shape _must_ change
type to honor the gesture. The question is never "should the bytes change"
— editing geometry that the native form cannot hold always changes the
bytes. The question is whether the change is **explicit, user-initiated,
minimal, and reversible**, or **silent, ambient, and lossy**.

Promotion is the discipline that keeps it the former. The destructive
conversion the editor refuses to do _on save_ is exactly the conversion it
will do _on an explicit edit gesture_ — and only then.

## Grounding: why these shapes cannot be edited natively

Apply the [fork test](./glossary/policy-class.md#the-fork-test) for the
vector-edit intent:

- **`<circle>`, `<ellipse>`** — reject. Their parameterisation
  (centre + radii) exposes no interior vertices. There is nothing to
  select, move, or bend within the native attribute space. The only legal
  vector-edit solution is `promote`.
- **`<rect>`** — a rect _does_ have four corner points, but they are not
  addressable as interior vertices; they are reached through the resize
  gesture, and they carry the `axis_aligned` invariant. Making a single
  corner independently movable, or a single edge curved, violates that
  invariant. The legal vector-edit solution is `promote`.

In every case the native form is a constraint surface, and vector editing
is a gesture that leaves it. The only way to honor the gesture is to drop
the constraint by re-typing the element to its unconstrained sibling. The
universal unconstrained sibling — the form that can express any planar
vector geometry — is `<path>`.

## Decisions

### D1 — Promotion is lazy: the document re-types on first edit, not on mode entry

Entering vector-edit mode on a primitive shape **does not mutate the
document**. The editor projects a path-equivalent view of the shape and
presents the vertex/segment/tangent overlay over the still-native element.
The element is re-typed to `<path>` only at the **first geometry-committing
gesture**.

Consequences:

- **Enter-and-exit without editing is byte-equal.** A user who
  double-clicks a circle to inspect its anchors, then presses escape,
  leaves a document identical to the one they opened. The "open without
  edits → byte-equal" invariant holds even for shapes whose vector overlay
  was displayed. This is the decisive reason lazy is chosen over eager.
- **The promotion and the first edit are one history step.** The type swap
  is not independently undoable; undoing the first edit reverts the element
  to its original native form. There is never a document state that is
  "promoted but unedited" — such a state would be a gratuitous, lossy diff
  with no user intent behind it.
- **The overlay is computed, not stored.** While the shape is still native,
  the vector view is a derived projection. Nothing persists until a gesture
  commits.

The rejected alternative — **eager** promotion on mode entry — is simpler
(the session always operates on a real `<path>`), but it converts the
element the instant the user expresses _interest_ rather than _intent_,
breaking the byte-equal guarantee for the inspect-and-leave case. The
guarantee is worth the added care of running a path-form session over a
node that is still natively typed until the first commit.

### D2 — All three primitives promote to `<path>`

`<rect>`, `<circle>`, and `<ellipse>` all promote to `<path>`. There is a
single promotion target and a single downstream editing model.

The rejected alternative is a **split target**: promote `<rect>` to
`<polygon>` (its declared natural target — corners stay real vertices, no
curves are introduced, and the diff is arguably smaller for a plain
rectangle) while conics go to `<path>`. This honors the Policy Class fork
more precisely, but it buys two promotion targets, two downstream editing
capability sets, and a user-visible inconsistency (editing a rect yields a
different element type than editing a circle) in exchange for a marginally
cleaner diff on one shape. Vector editing is fundamentally about reaching
the full freedom of path geometry; routing one shape through a more
constrained type that the user will frequently promote _again_ on the next
curve gesture is a false economy. One target, one model.

> The `<rect> → <polygon>` route remains a legal Policy Class solution and
> may return as a separate, non-vector-edit "convert to polygon" intent if
> a product need appears. It is out of scope here.

### D3 — Conic geometry is represented as cubic Béziers, not arcs

When a `<circle>` or `<ellipse>` is promoted, its outline is written as
**four cubic-Bézier segments** with anchors at the four cardinal points
(the ends of the major and minor axes), not as elliptical-arc commands.

The control-handle length for a unit circle is the standard constant

```
k = (4/3) · tan(π/8) ≈ 0.5522847498
```

scaled by the respective radius on each axis; for an ellipse the same
construction is applied independently per axis. This is the well-known
four-segment cubic approximation of an ellipse.

Rationale — this is chosen _for the editing representation_, not merely for
ease of conversion:

- **Cardinal anchors are the natural grab points.** Four cubic segments
  give the user four anchor points at the cardinal extremes plus eight
  tangent handles — the representation a person expects to manipulate when
  they "edit a circle as a path." A two-arc representation exposes only two
  anchors and no tangent handles, which is a worse editing surface.
- **Arcs collapse on the first edit anyway.** The moment a user drags a
  tangent or bends a segment, an `A` command can no longer describe the
  result and must fall back to cubics. Promoting to arcs would produce a
  representation that survives exactly until the first gesture — the very
  gesture the user entered the mode to perform.
- **The approximation error is bounded and below perceptual threshold.**
  The four-segment cubic approximation deviates from a true ellipse by a
  fraction of a pixel at typical sizes. The user has chosen to convert the
  shape into editable geometry; an exact analytic ellipse is no longer the
  thing being edited.

The rejected alternative — **two elliptical-arc (`A`) commands** — yields
the smallest, most "circle-like" path data and is what a pure
shape-to-path _converter_ (as opposed to an _editor_) should emit. It is
the right choice for a non-editing "flatten to path" operation and the
wrong choice for entering an interactive vector-edit session, for the
reasons above.

> This is a deliberate, scoped acceptance of the four-cubic conic
> representation that the editor refuses to emit _silently on save_. The
> distinction is intent: here the cubics are the product of an explicit,
> reversible, user-initiated edit, not an ambient rewrite of an untouched
> shape.

### Rectangle geometry

A `<rect>` promotes to a closed four-segment path tracing its corners in
local space. A rect with corner rounding (`rx` / `ry`) promotes to a path
whose four corners are the corresponding rounded joins — the rounding is
**baked into the path geometry**, not dropped. A rect with no rounding
promotes to four straight segments and a close.

## Generalisation to the vertex tags

`<line>`, `<polyline>`, and `<polygon>` differ from the geometry primitives
in one way that matters: they already _have_ addressable vertices. A
polyline is a list of points; a line is two of them. Many vector edits on
them — moving a vertex, inserting one along a straight run — stay
expressible in the native tag. So promotion must not be all-or-nothing.

The rule is decided **per edit, not per tag**:

> Write the edit back to the source tag if the tag can still express the
> result; otherwise promote the element to `<path>`.

Concretely, for a vertex tag an edit stays native when the result is still
the tag's canonical form — a straight open chain for `<polyline>`, a
straight closed chain for `<polygon>`, two straight endpoints for `<line>`
— and promotes otherwise. The two ways to leave the canonical form:

- **Curvature.** A tangent drag or segment bend introduces a control
  handle. No vertex tag can carry a curve, so the element promotes to
  `<path>`. This is the headline case: _drag a point → stays a polyline;
  curve a segment → becomes a path._
- **Topology that escapes the tag.** Adding a vertex to a `<line>` (a line
  is exactly two points) escapes it; opening a `<polygon>` or closing a
  `<polyline>` escapes its canonical chain. Inserting a vertex _into_ a
  `<polyline>` does **not** escape — the result is still a straight open
  chain, so it stays a `<polyline>`.

This subsumes the geometry primitives under a single rule: `<rect>` /
`<circle>` / `<ellipse>` have **no** native vector form, so _every_ vector
edit fails the "can the tag still express it?" test and promotes. The
primitives are the degenerate case where the native-writeback branch is
never taken.

All the invariants below apply unchanged: native-writeback edits keep the
tag and its trivia; a promoting edit re-types to `<path>` as one reversible
step, restoring the original tag byte-for-byte on undo.

**Targets, deliberately uniform.** A vertex tag that escapes its form
always promotes to `<path>`, never to an intermediate vertex tag — a
`<line>` that gains a vertex becomes a `<path>`, not a `<polyline>`. The
intra-vertex promotions (`line → polyline`, `polyline ↔ polygon`) are legal
Policy Class solutions but are out of scope here; `<path>` is the single
target, matching the primitive case. A future "convert to polyline/polygon"
intent could add them without disturbing this rule.

### Fill fidelity: the `<line>` exception

Promotion must preserve the element's **rendered appearance**, not only its
attributes. For most shapes this is automatic: a shape that paints a fill in
its native form (`<polyline>`, `<polygon>`, `<rect>`, `<circle>`,
`<ellipse>`) paints the same fill as a `<path>`, because an open path closes
implicitly for the purpose of fill. So the default and any inherited fill
carry across the re-type unchanged.

`<line>` is the one exception. A line has no fill region, so its fill —
default `black`, or any value it inherits — **never paints**. A `<path>`
does paint it. A naive re-type would therefore make a curved line suddenly
show a fill it never had. To keep the re-typed path stroke-only like the
line, promotion pins the fill to `none` **when the line declares no fill of
its own**. A line that explicitly declares a fill keeps that authored value
(an explicit fill on a line is meaningless but is the author's, so it is
respected, not overridden). The pinned `none` is part of the re-type and is
removed on revert, so the round-trip stays byte-equal.

This is an instance of the general invariant — _re-type preserves rendered
appearance_ — surfacing on the only tag where a shape's default rendering
differs from a path's.

## Invariants

These hold for every promotion regardless of source shape.

1. **Round-trip until first edit (P1).** Displaying the vector overlay on a
   native primitive mutates nothing. Only a committed geometry gesture
   re-types the element.

2. **Minimal, intentional diff.** The diff of a promotion is: the element's
   tag changes to `path`; its native geometry attributes are consumed and
   replaced by a single `d` carrying the equivalent (D3) geometry; and the
   first edit's delta is folded in. Nothing else in the element changes,
   and nothing else in the document moves.

3. **Non-geometry content carries over verbatim.** Every attribute that is
   not part of the source shape's geometry parameterisation survives the
   re-type unchanged — identity, class, inline style, paint, stroke,
   `transform`, data attributes, and any unknown- or legacy-namespace
   attributes. The element's surrounding source trivia (comments,
   whitespace, attribute ordering of the carried attributes) is preserved.
   Promotion changes the shape's _type and geometry_, never its identity,
   styling, or position in the tree.

4. **Geometry attributes are fully consumed.** The source geometry —
   `cx`/`cy`/`r` for a circle, `cx`/`cy`/`rx`/`ry` for an ellipse,
   `x`/`y`/`width`/`height`/`rx`/`ry` for a rect — is entirely expressed by
   the resulting `d`. No orphaned geometry attribute is left on the
   promoted `<path>` (a leftover `cx` on a `<path>` would be dead noise).

5. **Reversible as one step.** The promotion is bracketed with the first
   edit into a single undoable unit. Undo restores the original native
   element, byte-for-byte, including its consumed geometry attributes and
   trivia.

6. **No automatic demotion.** Promotion is one-directional within the edit
   flow. The editor does not attempt to recognise that an edited path is
   "still circle-shaped" and re-type it back. Pattern recognition that
   re-derives a primitive from path data is the province of the separate,
   explicit structural-cleanup intent, never an ambient side effect of
   editing.

## The promotion operation (contract)

Stated at the level a second implementation must honor, independent of how
it is realised:

- **Input.** A node that is one of the promotable primitive shapes, and the
  first geometry edit to apply.
- **Effect.** Re-type the node to `<path>`; set its `d` to the geometry
  equivalent of the source shape (per D3 and the rectangle rule) with the
  edit applied; consume the source geometry attributes; carry all other
  attributes and surrounding trivia unchanged; record the whole thing as a
  single reversible unit.
- **Guarantee.** A consumer observing the document sees the node's type
  change from the source tag to `path` exactly once, accompanied by the
  edit it requested — never a bare type change with no edit, and never a
  type change that disturbs styling, identity, or unrelated nodes.

The downstream vector-edit session that drives subsequent vertex, segment,
and tangent gestures is the same one that already serves native `<path>`
content; promotion's job is solely to deliver a `<path>` for it to act on,
at the right moment, without collateral damage.

## Refusal taxonomy interaction

Promotion converts a former refusal into a success: the vector-edit intent,
previously refused on these shapes because no native solution existed, now
resolves via `promote`. Refusals that are _not_ about the missing target —
for example, a shape carrying an animation or an inline transform that the
editor declines to edit through — are orthogonal and continue to apply.
Promotion does not override a refusal grounded in a different invariant; it
only fills the gap that was "this shape has no editable vertices."

## Open questions

- **Promotion under a structural-safety refusal.** If a primitive carries a
  construct the editor refuses to edit through (e.g. a time-varying
  transform), entering vector edit should refuse _before_ any promotion is
  considered, so the user is never left with a promoted-but-unhonored
  shape. The precedence between "would refuse anyway" and "would promote"
  needs to be stated as a single ordering rule.
- **Multi-shape promotion.** When a vector-edit gesture applies to a
  selection containing more than one promotable primitive, is each promoted
  independently, or is the gesture refused for heterogeneous selections?
  Deferred until multi-selection editing is designed.
- **Rounded-rect fidelity.** The exact join construction for `rx`/`ry`
  rounded corners (cubic approximation vs. arc) follows the same
  editing-representation logic as D3 and should be pinned with the same
  rationale when the rectangle path builder is specified in detail.

## See also

- [`glossary/policy-class.md`](./glossary/policy-class.md) — the `promote`
  solution and why `<circle>`, `<ellipse>`, and `<rect>` admit it for the
  vector-edit intent. This RFD fills the `promote` cell that document
  leaves open.
- [`element-ir.md`](./element-ir.md) — the typed element model and refusal
  taxonomy that promotion plugs into.
- [`svg-editor-intent-matrix.md`](./svg-editor-intent-matrix.md) — the
  intent × element inventory; the vector-edit row for primitive shapes
  moves from "refuse" to "promote" with this work.
