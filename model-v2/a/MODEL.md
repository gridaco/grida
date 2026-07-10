# The anchor geometry model — consolidated statement

Status: **proposal, post-experiments, pedantic-reviewed** (2026-07-07).
The model as it stands after E1–E7. Carries the _load-bearing_
amendments inline (E-A1/2/3/9/10 and, by reference, E-A5); the full
amendment set and the review's lock conditions live in
[`REPORT.md`](./REPORT.md) and [`pedantic-review.md`](./pedantic-review.md).
Seed of the phase-3 normative rewrite; a.md remains the detailed draft
it supersedes clause by clause.

## One sentence

A node is an **anchored box with typed content**: the box comes from
intent, content is _realized into_ the box at render, and nothing
derivable is ever stored.

## The two-axis core

The E7 study crystallized what the kind table was reaching for. Every
kind answers two **independent** questions:

1. **Where does the box come from?** — `declared` (intent) ·
   `measured` (content, one-way) · `derived` (children union)
2. **How does content fill the box?** — realization, at render, never
   written back

| kind     | box                                                             | content realization                                                |
| -------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `frame`  | declared (Auto = hug)                                           | children — bindings or flex                                        |
| `shape`  | declared                                                        | **parametric**: descriptor = f(box), then children in local space  |
| `vector` | declared (Auto = reference bounds)                              | **mapped**: points in a reference rect, scaled `box/ref` at render |
| `text`   | measured under intent constraints                               | **flowed**: re-wraps at the imposed box                            |
| `image`  | declared                                                        | **fitted**: paint re-covers per fit mode                           |
| `embed`  | declared w × measured h                                         | flowed                                                             |
| `group`  | derived (union of oriented children)                            | children in origin space                                           |
| `bool`   | derived (**op-result** bounds — D-5; subtract-to-empty ⇒ empty) | operands in origin space                                           |
| `lens`   | derived                                                         | children ∘ ops — **paint only**                                    |

`shape` here names the internal parametric payload family, not an authored
element. Draft 0 Grida XML lowers `<rect>`, `<ellipse>`, and `<line>` into
this family; the frozen E3 TextIr dialect alone spells it
`<shape kind="…">`.

Why this shape is right, per the evidence:

- _Parametric_ is Figma's own answer for primitives (star = count +
  ratio; corner radius px-stable under non-uniform resize) and our
  engine's current answer (`to_shape()` from size; fbs
  `CanonicalLayerShape` size-free). XYWH-vs-shape dissolves: the box is
  the shape's _input_, so layout and shape definition cannot fight.
- _Mapped_ is the Sketch/Figma/SVG convergence (normalized 0–1 points /
  `normalizedSize` blob / viewBox): **resize never rewrites points** —
  the blob stays the blob. Reference is a **rect** (observed non-zero
  blob origins), not a bare size. Our io-figma already implements the
  read side.
- _Flowed_ and _fitted_ are the standard measure-function and BoxFit
  seams, already shipping.

Child ownership is orthogonal to box source. A shape may own ordered,
free-positioned children in its declared local box: the primitive paints first,
then its descendants. Those descendants never measure or resize the shape and
never change its contribution to parent layout. Text therefore composes under a
shape as an ordinary child; there is no combined shape-with-text kind.

## The laws

1. **Intent only in the file.** Derivable ⇒ not encodable. The resolved
   tier (boxes, matrices, bounds, materialized points, baked outlines)
   is engine output. (Figma's file, notably, agrees on the intent side —
   its normalized blob — while also shipping the bake; we ship only
   intent.)
2. **No stored matrices outside `lens`.** Rotation is one scalar
   (degrees), flips are two booleans (E-A2, corpus-forced), pivot is the
   box center for boxed/measured kinds and the own-origin for derived
   kinds.
3. **The box is the only negotiation surface with layout.** Realization
   never feeds back into layout; measurement feeds forward only.
   Acyclicity is _guarded_, not free: E-A5 makes End/Center/Span
   bindings error-by-rule under parents with no resolvable extent
   (derived boxes, Auto-hug axes) — remove that rule and Span ← hug ←
   children is a real cycle. Locality: a leaf edit re-resolves up the
   measure chain to the nearest fixed-extent ancestor, then its subtree
   (18 µs per card subtree measured _under clean parent boxes_;
   incremental invalidation itself is phase-4 work).
4. **Rotation is a post-layout paint transform** (DEC-0 second lock,
   owner framing — supersedes the E1 default): sizing (flex
   contributions, hug, derived unions) never reads rotation or flips;
   the read tier (world AABBs, selection, hit) stays oriented. The
   normative rule set incl. the V-4 group-box fork:
   [`dec0-visual-only.md`](./dec0-visual-only.md). The E1 arm
   (oriented-AABB participation) remains implemented and tested as the
   documented alternative.

5. **Styles are px-stable under resize** — strokes, radii, font sizes,
   effects never scale with the box (non-scaling-stroke by
   construction; every studied tool refuses SVG's default here).
   The **two scales** are distinct operations, never a stored mode:
   - **K / parameter scale** — an op-layer _bake_: multiplies style
     scalars + sizes through the subtree (Grida already ships
     `parametric_scale`; = Figma `rescale()`, Sketch K).
   - **picture scale** — a stored `lens scale()` op: everything scales
     at render, strokes and image fills included; the quarantined
     SVG/Framer-Graphic semantics. No `<Graphics>` container is ever
     _required_ — the default world is the layout world; the
     proportional world is the opt-in lens.
6. **Points law** (E-A9): vector vertices live in the reference rect and
   are written **only by vertex-editing gestures**. Resize, layout
   stretch, grow — all are box writes; the mapping happens at render.
   (Retires the current editor's per-resize vertex bake.) _Read side
   research-grounded; the write side is **open until locked**: the ref
   rect is free intent (exempt from law 1, like Figma's normalizedSize);
   no renormalization as a gesture side effect; vertex-edit = an atomic
   declared write-set with a stationarity guarantee; zero-extent ref
   axis maps translation-only. See pedantic-review.md §B2._
7. **Reads materialize, writes re-target.** `x/y/w/h/rotation` and
   vertex coordinates always read from the resolved tier in real
   coordinates (as Figma's Plugin API does over its normalized storage);
   writes re-target the stored intent in delta form. The **text IR
   materializes** — an agent always sees and writes real numbers, and
   predicted geometry cold at 22/22 (E3 — n=3 models over 6 documents;
   the probe protocol, not the score, is what phase 3 inherits: re-run
   per grammar change). _Read half proven; the IR write half is open
   pending stable ids (an agent editing-in-place has only positional
   identity today)._
8. **Strict states; writes in two declared regimes.** Invalid documents
   are unrepresentable (unions, nullable boxes, no sentinels —
   E2-proven encodable and byte-fixpoint). Writes are either
   **re-targeted** (the coerce set: e.g. an x-write on an End pin
   rewrites the offset; always reported, never silent) or **rejected
   with a typed error** (the M-2 locked list: AxisOwnedBySpan,
   OwnedByLayout, BoxDerived, InvalidNumber — a rejected op leaves the
   document byte-identical, M-6). Which writes belong to which set is
   enumerated spec, not implementer choice.
9. **Derived boxes: bindings place the origin, never the union**
   (E-A1) — child edits change a group's _reported_ box but never move
   siblings in world space. Reported box = origin + union.

## Resolution — one pure function

`resolve(document, fonts, resources, viewport) → Resolved`, four phases:
**measure** (bottom-up naturals) → **layout** (flex over contributions /
bindings; contributions abstract over rotation AABBs, union boxes,
mapped bounds — the accidental plugin seam of E6) → **transform**
(`from_box_center`; origin pivot for derived; lens ops appended) →
**bounds** (oriented corners → world AABBs). Measured floor: 10k nodes
in 5.4 ms unoptimized, linear; subtree resolve cost bounded at 18 µs
(clean-parent precondition — see law 3); the incremental invalidator
itself is phase-4 work.

## The lifecycle, concretely

A flex card list; a card holds an icon (`vector`) and a title (`text`):

- **stretch the card** (cross-axis fill): one intent state
  (`self_align: stretch`); at render the icon's points re-map to the
  new box, the title re-wraps, the image fill re-covers. Document
  writes: **zero** (layout did it).
- **resize the icon by hand**: two field writes (w, h). Points
  untouched.
- **rotate the card**: one field write; paint-only — the list does NOT reflow (DEC-0), measured
  smooth; a spinning-motion variant targets a lens channel instead.
- **K-scale the card**: sanctioned bake — sizes, radii, stroke widths,
  font size multiply; still no matrix anywhere.
- **edit an icon vertex**: vertex write in reference space; the icon's
  Auto box re-derives; bindings re-resolve. Sibling cards never move.

## What this retires / what stays open

Retired: per-node transforms, position enums, per-resize vertex bakes,
`MIN_SIZE`-style sentinels, the ICB special regime, the mandatory
graphics container. Open (unchanged from a.md §12 + run findings):
`bool` operand semantics, grid mode, attributed text runs, percent pins,
anchor-to-node (`wire`), M-4 RMW policy, stable ids in the text IR.

## Suggested next step

Phase-3 proper: rewrite `models/a.md` against this statement as the
normative spec (every conformance `POL` locked, E-A1…E-A10 folded,
applicability matrix regenerated with `flip_x/flip_y` and the vector
reference rect), regenerate the fbs draft (header + `VectorPayload
{ ref: Rect, network }`), then WG graduation.
