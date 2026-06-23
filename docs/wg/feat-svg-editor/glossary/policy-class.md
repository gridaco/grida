---
title: "Policy Class"
description: "Defined term — the minimal partition of editable SVG elements such that every editing intent admits the same set of legal solutions within a class."
keywords:
  - svg
  - svg-editor
  - policy-class
  - glossary
  - ir
  - editor
tags:
  - internal
  - svg
  - reference
format: md
---

# Policy Class

## Scope and assumptions

This document operates on a deliberately narrowed view of SVG. State it
once, here, so that every later section can stay terse.

**Resolved property values, not the cascade.** When this doc names an
element's attribute (`cx`, `width`, `points`, `transform`), it means the
**resolved, computed value** at the point the editor reads it. CSS
cascading, presentation-attribute precedence, inheritance from ancestor
styles, `currentColor`, and the `style=""` attribute are all assumed to
be _already resolved_ by the time the editor's policy logic runs. The
Policy Class partition is defined over **resolved geometry**, not over
the unresolved authored source.

**Local coordinate space, not document space.** Geometry parameters
(`x`, `cx`, `r`, vertex coordinates in `points`, the `d` attribute) are
read in the element's own local space, before its own `transform=` is
applied and before any ancestor `<svg>`/`<g>` transforms compose. Where
document-space reasoning is required (snap, hit-test, marquee), that
lives outside this doc.

**Known gaps this assumption buries.** The "resolved values" frame is
optimistic. The following spec corners are real and not yet modeled by
the partition; they are listed openly so the assumption never becomes a
silent excuse for a missing case. None of them invalidate the partition
itself — each, when addressed, lands as an explicit policy slot
somewhere in the matrix below.

- **SMIL animation** (`<animate>`, `<animateTransform>`, `<set>`) — the
  resolved value at time `t` differs from the authored attribute. The
  editor currently has no policy for editing animated targets.
- **CSS animations and transitions** — same observable, different
  mechanism.
- **`viewBox` / `preserveAspectRatio`** — a nested `<svg>` remaps its
  children's coordinate space. The editor's local-space view inside a
  nested viewport is correct as written; what's missing is a policy
  for editing _through_ a viewport remap (e.g. resizing a `<rect>` whose
  `width` is `50%` of an ancestor `<svg>`'s viewBox width).
- **Length units other than user units.** Percentages, `em`, `ex`,
  `pt`, `cm`, `vh`, `vw` — the editor assumes user units throughout.
  Resolved values in alternate units need normalization before policy
  applies.
- **`paint-order`, `vector-effect`, `clip-path`, `mask`, `filter`** —
  these affect rendering but not authored geometry. They may force the
  editor to refuse certain edits — e.g. baking a transform into geometry
  when `vector-effect="non-scaling-stroke"` is in force would change
  the visible stroke width.
- **`<use>` references and shadow trees** — editing a `<use>` element
  edits the use-instance, not the referenced symbol. The editor's view
  of `<use>`'s geometry is the use-element's own `x/y/width/height`,
  not the resolved shadow tree.
- **`<text>` resolved metrics** — text geometry depends on font metrics
  available only after the document is laid out. The Text Policy Class
  is deferred for exactly this reason.

If a future intent collides with one of the above, the partition itself
is fine; the collision lives in a new policy cell or a new constraint
attached to the affected class.

## Definition

A **Policy Class** is the smallest partition of editable elements such that,
for every editing intent, every element in a class admits the **same set of
legal solutions**.

Two elements share a Policy Class iff there is no intent on which their
solution spaces differ. The moment one intent has a different fan-out of
plausible answers on element X than on element Y, X and Y belong to
**different** Policy Classes — because the class is exactly the slot a
host's policy choice (refuse / native / promote / via-transform) maps onto,
and if Y has no choice to make, attaching a slot to it is dishonest.

The class is **policy-driven, not math-driven.** Two elements that are
mathematically siblings (e.g. `<circle>` and `<ellipse>` are both conics)
may live in different Policy Classes because the editor must offer
different choices on them. Conversely, two elements that look unrelated
may share a class if every gesture has one and only one legal answer on
both.

## Why we need the term

Before this term existed, the editor classified by **SVG tag** (`apply_resize`
is a nine-arm switch on `rect | circle | ellipse | …`). Each tag had ad
hoc behavior baked into imperative code, with no name and no test for the
choice. Non-uniform resize of `<circle>` was forced to uniform scale by
`s = min(sx, sy)` — option (3) "restrict" — but the code reads as if
that's the only choice. Options (1) "compose into `transform=`" and (2)
"promote to `<ellipse>`" exist; the code silently picks one.

Policy Class is the vocabulary for that decision. Once it exists:

- The choice is named (not buried in arithmetic).
- The choice is testable (per-class test contract).
- The choice is configurable (host or document can pick a policy).
- New elements join an existing class, or earn their own because they
  fork something differently.

The unit at which a policy is mappable, decidable, and reviewable is one
Policy Class. Nothing smaller, nothing larger.

## The fork test

To check whether two elements belong in the same Policy Class, enumerate
every editing intent (translate, resize, rotate, skew, vertex-edit,
set-endpoint, …) and ask: **how many legal solutions does each element
admit?**

- If every intent has the same fan-out on both elements, they share a class.
- If any intent forks on one and not the other (or forks differently),
  they belong in distinct classes.

A solution is "legal" if it preserves whatever invariants the editor has
declared it must preserve (round-trip fidelity, authored type, refusal
taxonomy). A solution is _not_ "legal" just because it produces valid
SVG bytes — the policy is about what the editor will offer, not what the
spec admits.

## Worked example: why `<circle>` and `<ellipse>` are different Policy Classes

The naive math says: a circle is an ellipse with `rx = ry`. They're both
conics. Lump them.

Apply the fork test on **resize**:

| Element     | Legal solutions on non-uniform resize                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `<circle>`  | (1) compose into `transform=`; (2) promote to `<ellipse>` by dropping `rx = ry`; (3) restrict to uniform |
| `<ellipse>` | (1) compose into `transform=`; (2) native — write independent `rx`, `ry`                                 |

`<circle>`'s solution space **forks three ways**; `<ellipse>`'s forks two
ways, and one of its options ("promote") doesn't exist because ellipse is
already the general form. The policy table the host must answer is
different. Therefore: different Policy Classes.

This is the canonical Policy Class case. Every other class boundary in
the editor is justified the same way: enumerate solutions, find the fork,
draw the line.

## Worked example: why `<line>`, `<polyline>`, `<polygon>` share a class

Apply the fork test on every intent. For each, the legal solution is
"transport each control point in the geometry under the gesture's affine
map." There is no second option. The result is a `<line>`, `<polyline>`,
or `<polygon>` respectively, with the original element type preserved.

No fork on any intent ⇒ same Policy Class. The class is currently called
**Vertex** in the v1 partition (see below).

## Worked example: where `<rect>` lives, and why it may move

For resize: `<rect>`'s only solution is "transport the two corner points
in local space," serializing back to `x/y/width/height`. Single-solution.
On resize-only, `<rect>` belongs in **Vertex**.

For rotate: `<rect>` admits **three** solutions, because rotating its
corners breaks the axis-aligned constraint that `<rect>` requires:
(1) compose into `transform=`; (2) promote to `<polygon>` by baking the
rotation into vertices; (3) restrict to 0°/90°/180°/270° only.
`<polyline>`'s rotate has one solution (transport vertices).

So **adding rotate to the intent set splits Vertex into `{rect}` and
`{line, polyline, polygon}`**. The classification grows with the intent
set. Policy Class is not static; it is the minimal partition under the
**current** intent set.

## The v1 partition

> **Scope caveat.** As of v1, this partition is justified by the **resize**
> intent and resize alone. Apply the fork test to the other implemented
> intents and the picture is:
>
> - **Resize** drives the partition. Circle's 3-way fork is the only
>   class-level fork that exists in code today.
> - **Translate** has no class-level fork. The `bake` vs `via-T` decision
>   lives on a per-instance attribute condition ("does this element
>   already have `transform=`?"), not on the element's type. Translate
>   could be modeled as a single-class universe.
> - **Rotate** has no fork at all. Every element gets `via-T`; rotate-bake
>   is unimplemented. The 3-way fork for `<rect>` rotate (`via-T` /
>   `promote→polygon` / `restrict`) is **latent**, not active.
> - **Skew, vertex-edit, set-endpoint** — deferred; no policy today.
>
> If resize were removed from the editor, every Policy Class below could
> be merged into one and the term would have nothing meaningful to point
> at. The classification is the minimal partition **under the current
> implemented intent set**, and that set is effectively `{resize}` for
> partition purposes. Adding rotate-bake, skew, or vertex-edit as a real
> intent will move `1` cells in Table 2 to `≥ 2` cells and force the
> partition to grow — most likely splitting Vertex on first contact with
> any of those.

For the current intent set (primarily resize, with translate handled
separately via the `transform=` vs. attribute-surgery seam):

```
v1 Policy Classes:
  Vertex   — line, polyline, polygon, rect
  Circle   — circle
  Ellipse  — ellipse
  Path     — path
  Text     — text (deferred)
  Group    — g (deferred)
```

Notes on choices:

- **Vertex** is single-solution under resize today. Adding rotate may
  split it; defer until rotate's intent is formalized.
- **Circle** and **Ellipse** are distinct (not lumped as "Conic")
  precisely because their resize solution spaces differ.
- **Path** is its own class because its solution space differs from
  Vertex (path supports `via-transform` or `bake into d`; Vertex does
  not have the latter option in the same form).
- **Text** and **Group** are deferred — their intent set and solution
  spaces are insufficiently studied. Naming them now would be premature.

## Mapping tables

Three tables, three questions. Together they are the operational specification
of Policy Class for v1; if any cell drifts from the implementation, this doc
is wrong and should be updated.

### Table 1 — Element → Policy Class

The lookup. Which Policy Class does each SVG element belong to today, and
what invariants (carried as constraints; see the next section) does the
class enforce on its members?

| SVG element                                    | Policy Class | Invariants the class carries              | Notes                                                             |
| ---------------------------------------------- | ------------ | ----------------------------------------- | ----------------------------------------------------------------- |
| `<line>`                                       | Vertex       | `n = 2`                                   | endpoints; `set-endpoint` is a Vertex-on-line specialisation      |
| `<polyline>`                                   | Vertex       | —                                         | open chain; archetypal Vertex case                                |
| `<polygon>`                                    | Vertex       | `closed`                                  | closed chain                                                      |
| `<rect>`                                       | Vertex       | `n = 2`, `axis_aligned`                   | corners; rotate will fork this off once rotate-bake is allowed    |
| `<image>`                                      | Vertex       | `n = 2`, `axis_aligned`, `opaque_content` | bounding box around opaque pixels; vertex-edit will fork this off |
| `<use>`                                        | Vertex       | `n = 2`, `axis_aligned`, `reference`      | bounding box around a `<defs>` reference                          |
| `<circle>`                                     | Circle       | `rx = ry`                                 | constrained conic; canonical fork case                            |
| `<ellipse>`                                    | Ellipse      | `axis_aligned_radii`                      | unconstrained conic in local space                                |
| `<path>`                                       | Path         | —                                         | universal geometry                                                |
| `<text>`                                       | Text         | —                                         | deferred — anchor-based, font-metrics-driven                      |
| `<tspan>`                                      | Text         | child of `<text>`                         | deferred                                                          |
| `<g>`                                          | Group        | bounds-of-children                        | deferred — group has no intrinsic geometry                        |
| `<defs>`                                       | —            | non-rendered container                    | not editable as geometry                                          |
| `<svg>`                                        | —            | viewport                                  | not editable as geometry                                          |
| `<symbol>`, `<marker>`, `<clipPath>`, `<mask>` | —            | template / reference targets              | not editable in scene-graph position; edited via `<defs>` flow    |

A note on Vertex's current membership: `<rect>`, `<image>`, and `<use>`
share Vertex by **resize** behaviour today, but they carry strictly
stronger invariants than `<line>` / `<polyline>` / `<polygon>`. Once a
non-resize intent (rotate-bake; vertex-edit; segment-split) reaches one
of those invariants, Vertex splits. The expected post-split partition is
sketched in the Notes column.

### Table 2 — Solution space per (Policy Class × Intent)

The fork-finder. For each (class, intent) cell, how many legal solutions
exist? "Legal" means: the editor will offer it as a host-configurable
policy. A class with `1` in every column has nothing to declare and is
trivially mappable. A class with `≥ 2` in any column has a policy
decision to make; that's the cell where the term Policy Class earns
its keep.

Intents in scope: those wired into the editor today (resize, translate,
rotate) plus the deferred set (skew, vertex-edit, set-endpoint).
`bake` = write the gesture into geometry attributes; `via-T` = compose
into `transform=`; `promote` = re-type the element by dropping a
constraint; `restrict` = the editor enforces the class's constraint at
the cost of the gesture (the runtime either clamps the gesture onto the
constraint surface and bakes the projection — e.g. Circle × Resize
projects `(sx, sy)` to `(min(sx,sy), min(sx,sy))` — or refuses entirely
when the constraint admits no natural projection — e.g. deleting a
vertex from a polygon with `n = 3`). The projection-vs-refusal choice
is a constraint-layer detail, not a Policy Class choice; see the
"Optional deeper structure" section.

| Policy Class                           | Resize                                                          | Translate                                                          | Rotate                                                                                                    | Skew (deferred)                                           | Vertex-edit (deferred)                                            | Set-endpoint (deferred)    |
| -------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------- |
| **Vertex** (line / polyline / polygon) | 1 — `bake` (transport vertices)                                 | 2 — `bake` / `via-T`                                               | 1 — `bake` (rotate vertices; result still a polyline-class element)                                       | 1 — `bake` (skew vertices; result still polyline-class)   | 1 — `bake` (move vertex N)                                        | 1 on `<line>`; 0 elsewhere |
| **Vertex** (rect / image / use)        | 1 — `bake` (transport corners; rect serialises back to x/y/w/h) | 2 — `bake` / `via-T`                                               | **3** — `via-T` / `promote→polygon` / `restrict`                                                          | **3** — `via-T` / `promote→polygon` / `restrict`          | 0 on rect/image/use (no addressable interior vertices)            | 0                          |
| **Circle**                             | **3** — `via-T` / `promote→ellipse` / `restrict` (uniform)      | 1 — `bake` (transport `cx, cy`)                                    | 1 — `via-T` (rotating a circle is observable only via `transform=`)                                       | **3** — `via-T` / `promote→ellipse+rotation` / `restrict` | 0                                                                 | 0                          |
| **Ellipse**                            | **2** — `bake` (independent `rx, ry`) / `via-T`                 | 1 — `bake` (transport `cx, cy`)                                    | 1 — `via-T` (rotating an axis-aligned ellipse breaks `axis_aligned_radii`; baking would force conversion) | **2** — `via-T` / `restrict`                              | 0                                                                 | 0                          |
| **Path**                               | **2** — `bake into d` / `via-T`                                 | **2** — `bake into d` / `via-T`                                    | **2** — `bake into d` / `via-T`                                                                           | **2** — `bake` / `via-T`                                  | 1 — per-segment vertex / handle / arc-radii edits (path-specific) | 0                          |
| **Text**                               | deferred                                                        | deferred                                                           | deferred                                                                                                  | deferred                                                  | deferred                                                          | deferred                   |
| **Group**                              | deferred                                                        | 1 — `via-T` (groups are translated through their own `transform=`) | 1 — `via-T`                                                                                               | deferred                                                  | n/a                                                               | n/a                        |

Reading the table:

- **Cells marked `1` are not policy decisions.** The host has no choice
  to attach. Tests assert the one legal behaviour.
- **Cells marked `≥ 2` are the cells policy attaches to.** Each is a
  named decision in the (class, intent) policy table. The canonical
  example: Circle × Resize.
- **The two Vertex rows** show why Vertex will eventually split. On
  rotate and skew, polyline-class elements have one solution; rect / image
  / use have three. Same row today (single-solution under resize), different
  rows once rotate-bake or skew is a real intent.

### Table 3 — Editor's chosen policy in v1

The fork test enumerates what's _possible_; this table records what the
editor _picks_ today. A `restrict` here is the runtime expressed as
a hard-coded gate; a `bake` is geometry-attribute surgery; a `via-T` is
transform composition; `n/a` means the cell is `1`-solution (no choice).

| Policy Class                       | Resize                                                                     | Translate                                                                                                                 | Rotate                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Vertex (line / polyline / polygon) | `bake` (n/a)                                                               | `bake` for plain elements; `via-T` if the element already has a `transform=` attribute (see `capture_translate_baseline`) | `via-T` (n/a)                                                                                                        |
| Vertex (rect / image / use)        | `bake` (n/a — open question: image/use may move to `via-T`)                | same as above                                                                                                             | `via-T` — currently the only option because rotate-bake is not implemented; the 3-way fork is **latent**, not active |
| Circle                             | **`restrict`** (`s = min(sx, sy)` in `apply_resize`, `intents.ts`)         | `bake` (n/a)                                                                                                              | `via-T` (n/a)                                                                                                        |
| Ellipse                            | `bake` (independent rx/ry)                                                 | `bake` (n/a)                                                                                                              | `via-T` (n/a)                                                                                                        |
| Path                               | `bake into d` (via `svg-pathdata` MATRIX)                                  | `bake` for plain elements; `via-T` if `transform=` present                                                                | `via-T` (n/a)                                                                                                        |
| Text                               | `restrict` on edge drags; `bake` font-size + position on corner drags      | `bake`                                                                                                                    | `via-T`                                                                                                              |
| Group                              | `restrict` (groups don't resize via gesture; children resize individually) | `via-T` (groups translate through their `transform=`)                                                                     | `via-T`                                                                                                              |

Each non-`n/a` cell in this table is a thing the host could be allowed
to override. Each `restrict` is a v1 limitation that, by writing this
table, becomes an explicit limitation rather than a buried fact. The
Circle × Resize cell is the most-discussed example: v1 picks `restrict`,
the abstraction will support `promote` and `via-T` once the policy slot
exists.

## v1 intent coverage

The four intents in scope for v1 documentation. Resize was the canonical
case worked out above; the other three are documented here for
completeness. Each subsection answers: which classes accept the intent,
what the legal solution space looks like, what v1 picks, and what the
intent does (or would do) to the partition.

### Resize

Already documented (see Worked examples, Table 2 "Resize" column, and
Table 3 "Resize" column). Summary:

- The only intent that drives a non-trivial class-level partition in v1.
- Circle's 3-way fork (`restrict` / `promote→ellipse` / `via-T`) is the
  canonical case; Ellipse and Path have 2-way forks; Vertex is
  single-solution.
- v1 picks `restrict` on Circle, `bake` everywhere else.

### Translate

Translate is the **least class-driven** intent in v1. The fork between
attribute surgery (`bake`) and `transform=` composition (`via-T`) lives
on a **per-instance attribute condition**, not on the element's type.

- **Capability.** Every visible class accepts translate. `<g>` accepts
  it via-T only (groups have no intrinsic geometry to bake into);
  everyone else has both `bake` and `via-T` available.
- **Class-level fork.** Degenerate. Group is its own single-solution
  class; every other class collapses into one 2-solution super-class.
  Translate alone would not justify splitting Vertex / Circle / Ellipse /
  Path into separate classes.
- **Per-instance dispatch.** `capture_translate_baseline` returns
  `viaTransform` if the element already carries a `transform=` attribute
  or is a `<g>`; otherwise it picks attribute surgery
  (`apply_translate` in `intents.ts`). This is _not_ a Policy Class
  decision — it's an attribute-state condition that runs after class
  dispatch.
- **v1 policy.** Implicit. The decision lives in code, not in a declared
  policy table.
- **Open question.** Should "this element already has `transform=`, so
  translate via-T" become an explicit policy slot? Today, an element
  that gains a `transform=` (via rotation, say) keeps translating via-T
  forever after — even if the rotation is later removed and the
  `transform=` becomes the identity. A declared policy would catch this
  drift; the implicit version hides it.

### Rotate

Rotate today is a **universal single-solution intent**. Every class uses
`via-T`. The Policy Class partition is, accordingly, trivial under
rotate.

- **Capability.** Every visible class accepts rotate.
- **Class-level fork.** None. Every cell in the rotate column of Table 2
  is `1`.
- **v1 policy.** `via-T` everywhere. Rotate composes (or extends) the
  element's own `transform=` attribute.
- **Pivot, not a fork.** Every rotation needs a pivot. Pivot defaults
  are class-specific:
  - Circle / Ellipse — `(cx, cy)` (the geometric center is free).
  - Vertex (chain or box) — bbox center in local space.
  - Path — bbox center in local space.
  - Group — bbox center of children, in the group's local space.
    This is a per-class implementation detail, not a Policy Class fork.
    See [`feedback-transform.md`](../feedback-transform.md) for the
    pivot-drift case study.
- **Latent forks** (not v1). If rotate-bake is added as a second policy
  option:
  - VertexChain (line / polyline / polygon) gains `bake` (rotate each
    vertex in local space) — still single-class.
  - VertexBox (rect / image / use) gains a 3-way fork: `via-T` /
    `promote→polygon` (bake by re-typing) / `restrict` to right angles.
  - Ellipse gains a 2-way fork: `via-T` / `promote→path` (no axis-aligned
    ellipse can represent an arbitrary rotation in its own attributes).
  - Path gains `bake into d` as a second option.

  At that point, Vertex must split. See "v1 partition" above for the
  predicted post-split partition.

### Vector editing (sub-modal intent set)

Vector editing is qualitatively different from the three above. It is
not a single gesture; it is a **mode** that exposes its own intent set
on the element's interior structure. Entered by an `enter-vector-edit`
intent (e.g. double-click on a polyline / polygon / path); exited by an
`exit-vector-edit` intent.

- **Capability.** Only VertexChain (line, polyline, polygon) and Path
  accept the vector-editing mode in a meaningful sense.
  - VertexBox (rect / image / use) — formally rejects. A `<rect>`'s
    corners are accessed via the resize gesture; they are not addressable
    as interior vertices. A future "convert rect to editable polygon"
    intent would be a separate `promote` decision, not a vector-edit
    sub-intent.
  - Circle / Ellipse — reject (no addressable vertices in their
    parameterisation).
  - Group — reject (containers do not have an interior to edit).
  - Text — deferred (the analogue is caret positioning, governed by a
    text-editing mode, not a vector-editing mode).
- **This forces the predicted Vertex split.** If vector editing is in
  the v1 intent set, then `Vertex` is no longer a single Policy Class —
  VertexChain accepts the sub-intent set, VertexBox does not. The
  partition becomes:

  ```
  VertexChain  — line, polyline, polygon
  VertexBox    — rect, image, use
  Circle       — circle
  Ellipse      — ellipse
  Path         — path
  Text         — (deferred)
  Group        — (deferred)
  ```

  Whether the split happens in v1 implementation depends on whether
  vector editing ships in v1. The doc commits to the vocabulary
  regardless: VertexChain and VertexBox name the two halves of the fork,
  and the table above already implicitly uses that split.

- **Sub-intent set.** Inside vector-edit mode, the editor exposes
  atomic sub-intents on the addressable interior structure of the
  element. Each sub-intent has its own (Policy Class × sub-intent)
  matrix, computed against the accepting set (VertexChain ∪ Path), not
  the full element set.

  | Sub-intent             | VertexChain                                                                                                          | Path                                                          |
  | ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
  | `translate-vertex`     | 1 — `bake` (move point N in `points`)                                                                                | 1 — `bake` (move the endpoint of segment N in `d`)            |
  | `transform-vertices`   | 1 — `bake` (one affine over the selected vertices; count- & type-preserving — gridaco/grida#881)                     | 1 — `bake` (one affine over the selected vertices)            |
  | `insert-vertex`        | 1 — `bake` (insert at parameter `t` along segment)                                                                   | 1 — `bake`                                                    |
  | `delete-vertex`        | **2** — `bake` / `restrict` (polygon must have ≥ 3 vertices; line must have exactly 2)                               | 1 — `bake` (the path may collapse to empty, separate concern) |
  | `close-shape`          | **2** — `promote→polygon` (the natural target) / `promote→path` (when the chain already has curve-shaped extensions) | 1 — `bake` (close the current sub-path with `Z`)              |
  | `open-shape`           | 1 on polygon — `promote→polyline`                                                                                    | 1 — `bake`                                                    |
  | `insert-tangent`       | **n/a** — polyline-class has no curvature concept                                                                    | 1 — `bake` (promote the segment from `L` to `C` / `Q`)        |
  | `adjust-tangent`       | n/a                                                                                                                  | 1 — `bake`                                                    |
  | `convert-segment-type` | n/a                                                                                                                  | 1 — `bake` (`L ↔ C ↔ Q ↔ A`)                                  |
  | `adjust-arc-radii`     | n/a                                                                                                                  | 1 — `bake`                                                    |
  | `split-sub-path`       | n/a                                                                                                                  | 1 — `bake`                                                    |

  The "n/a" rows are the **VertexChain ⊊ Path** asymmetry. Path's
  sub-intent set is a strict superset of VertexChain's because Path has
  curvature, arcs, and sub-paths that VertexChain does not. This
  asymmetry is itself a Policy Class signal: VertexChain and Path are
  in different classes because their sub-intent set differs.

- **v1 status (unstudied portion).** The sub-intents `convert-segment-
type`, `adjust-arc-radii`, and `split-sub-path` are unstudied and may
  be deferred to post-v1. They are listed here so the partition
  accommodates them when they land — adding them does not require
  redrawing the class boundary, only filling in policy cells.
- **Open questions.**
  - **`close-shape` target.** When a VertexChain closes, does it
    promote to `<polygon>` or to `<path>`? Both are legal. The target
    is a Policy Class decision and should be declared.
  - **VertexBox's vector-edit refusal is not vacuous.** A `<rect>` does
    have four corner points. The current refusal ("rect doesn't enter
    vector edit") is a policy choice — an alternative is "rect's vector
    edit is `promote→polygon`," which would make rect's corners
    independently movable at the cost of dropping the axis-aligned
    constraint. v1 declares `refuse`; document so explicitly.
  - **Entry gesture.** Double-click on the element body? On the
    element's bbox? On a specific control point? The entry gesture is
    not a Policy Class concern, but its semantics interact with the
    set-endpoint and per-vertex hit-test paths.

## Optional deeper structure: class as base + constraints

The fork in `<circle>`'s resize policy is not an accident of SVG. It is
the universal response to **a gesture violating an invariant**:

- `<circle>` has the invariant `rx = ry`. Non-uniform resize would
  violate it. Three universal responses: refuse the gesture, drop the
  invariant (= promote to the unconstrained sibling), or sidestep into
  `transform=`.
- `<rect>` has the invariant `axis_aligned`. Rotation would violate it.
  Same three universal responses.
- `<line>` has the invariant `n_vertices = 2`. A "split segment" gesture
  would violate it. Same three responses (or only two, since
  `via-transform` doesn't apply to segment counts).

Under this view:

```
circle   = Conic   + constraint(rx = ry)
rect     = Vertex  + constraint(n = 2, axis_aligned)
line     = Vertex  + constraint(n = 2)
polyline = Vertex  + ∅
ellipse  = Conic   + constraint(axis_aligned)
path     = Path    + ∅
```

…and **policy is generated**, not hand-tabulated:

```
policy(intent, element):
  for each constraint c on element:
    if intent's solution would violate c:
      consult host's choice: { refuse | drop_c | via_transform }
  else: native
```

Promotion falls out: "drop a constraint" re-types the element to its
unconstrained sibling. `circle → ellipse` drops `rx = ry`. `rect → polygon`
drops `axis_aligned`. `line → polyline` drops `n = 2`.

This is the **base + constraints** model. It is _not_ v1. v1 ships flat
Policy Classes because we only have one fork-causing intent (resize) and
one fork-causing element (circle). Two examples justify the abstraction;
one does not.

When the editor adds rotate (introducing rect's fork) or skew
(introducing ellipse's fork), revisit. At that point lift to base +
constraints in one PR. Until then, flat is honest.

## How to use the term in design discussions

When the term should appear:

- _"Should `<image>` and `<use>` share a class?"_ — apply the fork test.
- _"Adding skew breaks our class boundaries"_ — name which Policy Class
  the new intent splits, and the new partition that results.
- _"We need to refuse non-uniform resize on circle"_ — that is one Policy
  Class's resize-policy choice. Document it in the Circle class's policy
  table, not in the resize implementation.
- _"AI should be able to mutate elements via the same protocol the
  editor uses"_ — AI tools should be parameterized by Policy Class, not
  by SVG tag. `set_vertex(id, i, p)` operates on Vertex elements;
  `set_radii(id, rx, ry)` operates on Ellipse elements.

When the term should _not_ appear:

- "What's the class of `<rect>`'s `fill` attribute?" — Policy Class
  partitions elements, not attributes. Paint, opacity, and other
  presentation concerns are orthogonal.
- "Group children share a class with their parent" — Policy Class is
  not a structural relation; it is per-element. A `<g>` and its `<rect>`
  child are in different classes.

## Layering

Policy Class is one of three layers in the svg-editor core. Each layer
has one job, and the layers do not know about each other except where
the per-class handlers compose them.

```
                ┌─────────────────────────────────────┐
                │  Per-Class Handlers                 │
                │  (intent realisation — the math)    │
                │                                     │
                │  e.g. policy-class/circle/resize:   │
                │    - reads chosen_policy from PC    │
                │    - reads facts from SvgDocument   │
                │    - executes the geometry math     │
                │    - writes via SvgDocument         │
                └──────────┬─────────────┬────────────┘
                           │             │
                  ┌────────▼───┐   ┌─────▼──────────┐
                  │ PolicyClass│   │ SvgDocument    │
                  │            │   │ (a.k.a. the    │
                  │ class +    │   │  SVG Document  │
                  │ intent →   │   │  Layer)        │
                  │ policy     │   │                │
                  │            │   │ AST + parsing  │
                  │ no SVG     │   │ + resolution + │
                  │ knowledge  │   │ structural     │
                  │ no instance│   │ facts + write  │
                  │ knowledge  │   │ chokepoint     │
                  │            │   │                │
                  │            │   │ no intent      │
                  │            │   │ knowledge      │
                  └────────────┘   └────────────────┘
```

### What each layer owns

**Policy Class** (this doc) — `src/core/policy-class/`.
The class partition and the (class, intent) policy tables. Pure data +
lookups. Knows nothing about specific elements or about SVG-XML
mechanics.

**SVG Document Layer** — `src/core/document.ts` + adjacent modules.
The "SVG-spec respecting, surgical update machine." Owns the AST,
parsing, attribute resolution, transform-string handling, structural
facts about authored content (animations, inline CSS transforms,
per-glyph rotates, …), and the single write chokepoint. Knows nothing
about intents or policies.

The full contract of this layer lives in
`packages/grida-svg-editor/src/core/document.README.md` (lands with
the implementation slice).

**Per-Class Handlers** — `src/core/policy-class/<class>/<intent>.ts`
(to be built). The thin layer that composes the other two. Reads
chosen policy from Policy Class, reads structural facts from the SVG
Document Layer, executes the gesture math, and writes back via the
SVG Document Layer's chokepoint.

### The invariants that keep the layers honest

1. **Policy Class never takes `(doc, id)`.** Its public functions take
   `(class, intent)` and nothing else. If a question needs to know
   about a specific element's current state, the question belongs in
   the SVG Document Layer or in the per-class handler — never in
   Policy Class.

2. **SVG Document Layer never mentions intents.** Its public surface
   uses no `Intent` / `Solution` / `PolicyClass` vocabulary. It
   provides facts; it does not compose them into intent-level verdicts.
   The anti-pattern is a method named `is_rotatable(id)` on
   `SvgDocument` — that composition belongs above.

3. **Per-class handlers are the only composers.** Both lower layers
   are inputs to the handler; the handler is the only place where
   "class says X" meets "instance says Y." Nowhere else.

### What dissolved when this layering was named

Before the SVG Document Layer was named, the function
`is_rotatable(doc, id)` in `intents.ts` bundled three concerns:

- (a) class-level rotate capability — _belongs to Policy Class_
- (b) transform-string parsing verdict — _belongs to the SVG Document Layer_
- (c) structural safety gates (per-glyph rotate, inline CSS transform,
  `<animateTransform>` child) — had no clear home, sat in `intents.ts`

After the SVG Document Layer is named:

- (a) — `accepts(cls, "rotate")` from Policy Class
- (b) — `classify(parse_transform_list(...))` from
  `src/core/transform/`, which is part of the SVG Document Layer
- (c) — `doc.has_glyph_rotate(id)`, `doc.has_inline_css_transform(id)`,
  `doc.has_animate_transform_child(id)` — atomic predicates on
  `SvgDocument`, also part of the SVG Document Layer

`is_rotatable` itself becomes a thin composer that calls these and
returns a `RotatableVerdict`. It does not move into Policy Class
(which is class-scoped) or into `SvgDocument` (which has no intent
vocabulary); it stays where it is, but its job is now composition,
not fact-finding.

This is the canonical example of "one concept retires when two
fight." The fight was: should structural safety checks live in
intent-capability functions or in the document layer? The answer:
**neither owns the composition**; the document layer owns the facts,
the per-class handler owns the composition, and intent-capability
functions like `is_rotatable` are themselves thin composers that may
or may not retire entirely under per-class dispatch.

## Relationship to other terms in this codebase

- **Intent** — a user gesture's semantic meaning (translate, resize,
  rotate, set-endpoint, vertex-edit, …). Intent is the **column** of the
  policy matrix; Policy Class is the **row**.
- **Capability** — a per-element boolean (`is_resizable`, `is_rotatable`,
  `accepts_paint`). Capability answers _"does this element accept this
  intent at all?"_; Policy Class answers _"and if so, by which of the
  legal solutions?"_. A capability of `false` is itself a policy
  ("refuse") but expressed as a fast-path gate, not a policy lookup.
- **Refusal** — the typed `RefusalReason` enum returned when an intent
  is rejected. Policy Class is what determines _which_ refusals are
  possible; refusal is the runtime artifact.
- **Promotion** — re-typing an element to a sibling that lacks one of its
  constraints. Promotion is one of the legal solutions a Policy Class
  may declare; it is not a class itself.

## See also

- [`element-ir.md`](../element-ir.md) — the typed in-memory model that
  Policy Classes inhabit. The IR's `Refusable` and per-element capability
  flags are how Policy-Class decisions are surfaced at the type level.
- [`svg-editor-intent-matrix.md`](../svg-editor-intent-matrix.md) —
  current-state inventory of (intent × element) cells. Each cell will
  eventually be a (intent × Policy Class) policy declaration.
- [`reference/svg/element-model.md`](../../../reference/svg/element-model.md) — the spec-grounded
  catalogue of elements and their parameter spaces. Source material for
  enumerating the constraints that drive Policy Class boundaries.
- [`feedback-transform.md`](../feedback-transform.md) — the pivot-drift
  case study. The pivot decision is the rotate-cousin of the canonical
  circle-resize fork, and belongs in a Policy Class's rotate-policy
  declaration.
