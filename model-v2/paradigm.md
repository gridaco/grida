# Paradigm proposal — "one box, one way"

Status: **candidate** (phase 2). To be ratified against
[`harnesses.md`](./harnesses.md) before any phase-3 spec work.
Alternative working name: _the box/lens model_.

> **A Grida document declares boxes; the engine resolves them; lenses present
> them. Every node is one oriented box — however sourced — and data flows one
> way.**

This is a paradigm, not a schema: a small set of nouns and laws from which the
schema falls out. It exists to kill the meta-problem in
[`problems.md`](./problems.md): every field of the current model is
polysemous. The paradigm names the roles and assigns each exactly one home.

---

## 1. The nouns

**Tiers** — three, strictly ordered:

| tier | name          | contains                                                | who writes                     | serialized?             |
| ---- | ------------- | ------------------------------------------------------- | ------------------------------ | ----------------------- |
| 1    | **declared**  | intent: bindings, size intent, orientation, payload     | author (gestures, API, import) | **yes — and only this** |
| 2    | **resolved**  | boxes, matrices, bounds — pure function of tier 1       | the engine only                | no (caches at most)     |
| 3    | **presented** | lens output: composited appearance, animation overrides | the engine only                | no                      |

**Box** — the one axis-aligned local rectangle every node resolves to.
The universal geometric noun: all vocabulary is defined against it.

**Source** — where a node's box comes from. Exactly three:

- `declared` — from size intent (shapes, containers, trays)
- `measured` — from content, under intent-as-constraints (text, path, vector,
  markdown; a text's declared width is a _wrap constraint on the measure_,
  not a rectangle)
- `derived` — from children (group, boolean)

**Binding** — how a node's box attaches to its parent's resolved box:
per-axis, as a relation (anchored to start/end/center with offset, or
stretched between edges). _Position is a binding, not a coordinate_ — "x" is
the degenerate binding (anchored-start on both axes).

**Orientation** — a scalar angle on the box. Geometry, not paint (see L6).

**Payload** — what fills the box: a size-free shape descriptor, text content,
a vector network, container behavior. Payloads are _functions evaluated at
the resolved box_; they never own size.

**Lens** — any appearance operation applied after geometry resolution, owning
no box and contributing nothing to layout. Lenses have exactly two homes:

- **lens nodes** — structural, serialized: the transform-quarantine wrapper
  (skew, arbitrary matrix, 3D/perspective). The tree shows what fields would
  hide.
- **lens channels** — runtime, never serialized: animation overrides
  evaluated over tier 2.

The quarantine node and the animation override are the same concept in two
homes — that identity is what unifies P9 and P10.

---

## 2. The laws

**L1 — One-way flow.**
The document stores declared intent only. Resolution is a pure function of
intent (+ fonts/resources/viewport). Presentation composes over resolution.
No tier ever writes upstream. Corollary, and the format's drift-guard:
**if the engine can compute it, the file must not store it.**
_(P4, P10, P11 · H5, H7)_

**L2 — One role, one home.**
Attachment → binding. Extent → size intent. Orientation → θ. Form → payload.
Exception → lens. Each role has exactly one field; each field exactly one
role. Polysemy is a spec bug, not a modeling technique.
_(meta · H5, H6)_

**L3 — The box mediates.**
Layout negotiates _boxes_ (via their oriented AABBs), never payloads.
Measurement produces boxes. Payloads are evaluated at resolved boxes.
Children bind to the parent's resolved box — it is the only reference object
(percentages, anchors, and the ICB all resolve against it).
_(P3, P5, P6, P7 · H4)_

**L4 — Legibility is a hard bound.**
The stored vocabulary must pass the XML test: named scalars and enums a human
can predict pixels from. Whatever cannot (matrices, skew, 3D) exists only
inside an explicit lens node. Matrices appear in tier 2 as derived artifacts —
never in tier 1 outside a lens.
_(P1, P9 · H1, H3, H8)_

**L5 — Uniform header, typed payload.**
One shared core for every node kind — identity, binding, size intent, θ,
layer properties — specified once, with its (small) applicability matrix
written. Typed payload only where behavior genuinely differs. Per-kind
geometry fields are abolished.
_(P8 · H6, H9, H10)_

**L6 — Static is geometry; motion is lens.**
The pre/post-layout question is dissolved, not answered: it was ill-posed
because "rotation" named two roles. _Declared_ orientation is geometry —
layout sees the oriented box's AABB (single-pass safe: the AABB depends on
w, h, θ, never on assigned position). _Animated or exceptional_ transforms
are lens — compositor-only, layout-blind. Same word, two roles, two homes,
per L2.
_(P5, P10 · H4, H7)_

---

## 3. How the catalog lands

| problem                   | resolution under the paradigm                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** canonical form     | Falls out of L1+L4: tier 1 stores named scalars; the matrix is a tier-2 artifact. Lossy extraction becomes structurally impossible — there is nothing to extract _from_.                                                                          |
| **P2** position basis     | L2: position is a per-axis binding relation. XY and "right: 10" are the same construct at different anchors; both are stored intent. Over-constraint is unrepresentable (a stretched axis owns its extent).                                       |
| **P3** size roles         | L2+L3, four roles → four homes: declared size = intent (constraints, for measured sources); resolved box = tier 2; shape = payload(resolved box) — the `CanonicalLayerShape` size-free position becomes runtime-true; measurement = a box source. |
| **P4** intent vs state    | L1: reads resolve (tier 2), writes re-target intent (tier 1). Writing a layout-owned field is a typed error — a named cell in the applicability matrix, not a silent ignore.                                                                      |
| **P5** rotation × layout  | L6: declared θ feeds the oriented-box AABB. Pivot for boxed nodes = box center (the only pivot where box-center and AABB-center coincide, so layout placement needs no correction terms). Motion rotation = lens channel.                         |
| **P6** box-less nodes     | L3 derived source: groups/booleans declare attachment (+θ) but never size; the box is derived; **child edits never write the group** — no re-fit transactions. Exact pivot mechanics → phase 3.                                                   |
| **P7** coordinate space   | L3: the parent's resolved box is the sole reference object. ICB regularizes to "a node whose box is bound to the viewport." Border-vs-content-box origin = one phase-3 matrix cell.                                                               |
| **P8** property model     | L5: the partition. Uniform header (one spec) + typed payload (shape descriptor, text, network, container behavior, lens ops).                                                                                                                     |
| **P9** capability ceiling | L4: the lens node is the sole home for beyond-vocabulary transforms; imports **wrap instead of degrade**; 3D enters as additive lens vocabulary, never as node fields.                                                                            |
| **P10** animation         | L1+L6: channels over tier-1 scalars (deliberate, layout-coupled lane) or lens channels (default, compositor lane); overrides live in tier 3 and never serialize.                                                                                  |
| **P11** normativity       | L1's corollary is the mechanical drift-guard: the file encodes exactly the declared tier; anything derivable is not encodable. Conformance = equality of `resolve(decode(file))` across implementations.                                          |

---

## 4. Trades, declared

Per the tension map — what this paradigm _pays_:

- **L5 costs refusal-by-construction at the header.** Header fields are inert
  on some kinds (size intent on a derived-source node). Every inert cell must
  be written down as `ignored-by-rule` — accepted documentation debt, kept
  small by keeping the header small.
- **L4 costs common-vocabulary capability.** Skew and matrices require a
  wrapper node even when "one field would do." Accepted: the tree-visibility
  of exotic content is the point.
- **L6 costs relayout on declared-rotation edits** under layout parents.
  Accepted: continuous motion belongs in the lens lane; editing intent
  _should_ reflow.
- **L1 costs read indirection** — every `node.x` read is a tier-2 query.
  Accepted and already paid: the resolved tier _is_ the dense geometry cache
  the engine maintains today (H10 aligns rather than fights).
- **H3's granularity caveat stands.** Bindings and gestures couple fields
  (a drag writes two offsets; a stretch writes two edges). The paradigm
  guarantees merged states are _valid_, not that they reconstruct compound
  intent.

## 5. What this paradigm does **not** decide (phase 3)

Deliberately open, in catalog order: exact binding vocabulary (center?
scale-anchor? — P2 options 2/3), size-intent modes and min/max interaction,
measured-source constraint semantics per kind, group pivot mechanics and
gesture compensation, border-vs-content-box child origin, the header
applicability matrix itself, lens-op vocabulary and its fbs encoding,
degrees-vs-radians, and every field name.

## 6. Falsification

The paradigm is wrong — not merely incomplete — if any of these hold:

1. **A role genuinely needs two homes.** E.g. if rotated-text-reflow
   (orientation participating in wrap-constraint negotiation) becomes a
   requirement, L3's "layout never sees payloads" breaks. (No studied system
   attempts this; we bet with the field.)
2. **The legible vocabulary is too small in practice** — if a material share
   of real imports (SVG/Figma corpora) lands in lens wrappers, the common
   vocabulary is mis-sized and L4's bound is doing harm.
3. **Measured-source constraints can't express real text sizing modes**
   (auto-width / auto-height / fixed with truncation) without re-introducing
   polysemous size.
4. **Tier-2 query cost is unacceptable for editor-side hot reads** even with
   materialized caches — would force resolved values back into the document,
   breaking L1.

Phase-2 exit: run this document against every harness probe in
[`harnesses.md`](./harnesses.md) with a worked example set (the H1 XML
quartet, the H3 concurrency matrix, the H6 applicability matrix for the
header), alongside at least one rival candidate for contrast — the natural
rival is **flat-property CSS-style** (P8 option 2), which maximizes exactly
what this paradigm trades away.
