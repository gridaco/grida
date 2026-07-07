# Design harnesses

The constraints any candidate model must pass. Each has a **concrete probe** —
a test you can actually run against a design on paper — because "friendly" and
"correct" are not evaluable without one. Sources: the stated project
requirements, the current codebase's realities, and the format's encoding
rules.

A candidate model in phase 2 gets a scorecard: one row per harness,
pass / fail / trade (with the trade named).

## Scoring rule T1 — the auxiliary-store test

A claimed virtue counts **only if it is intrinsic to the canonical design** —
i.e., it cannot be obtained by attaching a derived auxiliary store (cache,
projection, materialized snapshot sidecar) to a rival model. Derived-tier
virtues are commodities: any intent-canonical model can serialize a baked
geometry snapshot for dumb consumers; any state-canonical model can be
projected into dense hot-loop records. Neither scores.

The rule is symmetric: a claimed _cost_ that a one-time derived store pays
off (read indirection, hot-loop projection) is likewise not decisive.

What survives T1 — and is therefore the only legitimate scoring material —
are canonical-tier properties: what the store refuses, what intent survives
in it, what merges at what granularity, what a writer must maintain, and
what the format's conformance spec must define. The honest residue of a
derived-store claim is usually a _coherence_ difference: a canonical value
is true by construction, while an auxiliary store is only as fresh as
writer discipline keeps it. Score the residue, not the headline.

---

## H1. Raw-representation readability (the XML test)

**Statement.** The stored form, transliterated to XML, must be readable and
_predictable_ by a human without running code.

**Probe.** Write, in the candidate's storage vocabulary: (a) a rectangle
rotated 15°; (b) a rectangle pinned `right: 24`; (c) a flex column with one
fill-width child; (d) a rotated group of two shapes. A designer-engineer must
be able to sketch the render from the text alone. Any field a human cannot
read without a calculator (e.g. a 6-float matrix) counts against, unless
quarantined (→ H8).

## H2. Authoring ergonomics (gesture → write mapping)

**Statement.** Direct manipulation must map to small, local, meaningful
writes; common reads must always be answerable.

**Probe.** For each gesture — drag, resize (each handle), rotate, reparent,
group/ungroup — list the exact fields written and nodes touched. Flags:
a gesture that writes a field the user didn't conceptually touch; a gesture
that must touch more than one node (except group/ungroup baking); a read
(`x`, `y`, `width`, `height`, `rotation`) that is unanswerable for some node
kind.

## H3. CRDT mergeability

**Statement.** Concurrent edits must merge at property granularity without
producing states no user authored; no edit may require cross-node atomic
writes.

**Probe.** Run the concurrency matrix: move ∥ rotate, resize ∥ rotate,
move ∥ reparent, child-edit ∥ group-rotate, style ∥ geometry. For each pair:
do both intents survive per-property LWW? Structural flags: any stored tuple
whose components are semantically coupled (merging halves produces invalid
values — the matrix-tearing case); any operation whose correctness depends on
two nodes updating together.

**Caveat to carry:** fine-grained merge is _not_ automatically
merge-_correct_ — a drag writes x and y as one intent; per-field LWW can merge
half a drag. The harness demands _validity_ under partial merge (every merged
state is a legal document), not intent-perfection. Name where the candidate
draws that line.

## H4. Layout resolvability

**Statement.** Layout must resolve in a single deterministic pass, and every
interaction between user-set geometry and layout-owned geometry must be
defined.

**Probe.** (a) Show the resolution order: stored intent → measures → boxes →
transforms, with no cycles (a child's layout contribution may not depend on
its assigned position). (b) Answer, from the spec alone: what does a rotated
child occupy in a flex row? What happens when the user sets x on an in-flow
child (error / detach / ignore — which, and is it typed)? What does `fill`
mean under a `hug` parent (the classic circular case)?

## H5. Single source of truth

**Statement.** Every queryable value has exactly one canonical home; all other
appearances are derived, and derivation runs one way.

**Probe.** For each of {position, rotation, size, transform, bounds}: name the
canonical field and the derivation direction. Flags: any lossy extraction in
the steady-state pipeline (`atan2`, matrix decomposition) — permissible only
at import boundaries; any mutator that silently destroys sibling components
(the `set_rotation`-clobbers-scale class); any pair of fields that can
disagree with no defined winner.

## H6. Defined-semantics coverage (the CSS lesson)

**Statement.** Wherever the schema does not _refuse_ an invalid or inert
combination, a written rule must define it. Flat property surfaces don't come
for free — CSS's flat list is backed by an engine spec that defines every
property × display-type × context cell. Whatever flatness a candidate adopts,
it inherits that authorship burden.

**Probe.** Build the applicability matrix: property × node-kind × context
(in-flow / absolute / free-canvas / inside-group / inside-transform-wrapper).
Every cell is one of {effective, ignored-by-rule, error-by-rule,
unrepresentable}. Zero cells may read "undefined". Count the
`ignored-by-rule` cells — each is documentation debt the candidate is
choosing over type-system refusal (H5 tension, see map below).

## H7. Animation readiness (shape, not feature)

**Statement.** The model must not preclude an animation system: channels have
defined interpolation, evaluated values are overrides (never document
writes), and layout-coupled vs compositor-only motion are distinguishable.

**Probe.** For each geometric property: is it interpolable as stored (scalar
lerp) or does it require decompose/recompose (with the known pathologies)?
Is multi-turn rotation (720°) representable or explicitly out of scope? Where
does an evaluated value live such that sync/CRDT never sees animation
traffic? Which lane does an animated rotation take, and does the spec make
both lanes expressible?

## H8. Capability ceiling & loss policy

**Statement.** Everything the renderer can draw is either representable, or
excluded by an _explicit, named_ policy (quarantine construct or defined
degradation) — never silently capped.

**Probe.** Walk the capability list — translation, rotation, uniform scale,
non-uniform scale, skew, arbitrary 2×3, perspective/3D — and mark each:
representable-everywhere / representable-in-quarantine / degraded-by-rule /
rejected. Then run the import test: an SVG with `transform="skewX(20)"` and a
Figma file with a flipped node — state exactly what the document stores.
Silent loss fails.

## H9. Format-encoding reality (FlatBuffers rules)

**Statement.** The candidate must be encodable under the binding rules in the
`grida.fbs` header: scalars cannot express "unset"; structs are frozen forever
and always-present; unions/tables are the only homes for optionality and
intent; evolution is additive.

**Probe.** For every field with an "unset / auto / inherit" meaning: is that
state structural (nullable table, union, mode enum) rather than sentinel?
For every struct: is all-zeros the true semantic default forever? For the
node-kind story (P8): does adding a kind or property require only additive
changes?

## H10. Hot-loop projectability

**Statement.** Whatever the canonical model, it must project to dense,
`Copy`, cache-friendly per-node records for the render/layout DFS — the
engine's performance posture depends on it.

**Probe.** Sketch the projection: canonical → per-node geometry record
(fixed-size, no heap, no string keys) built once per structural change.
Flags: any per-frame canonical lookup that is a map-of-properties walk; any
projection that cannot be invalidated per-field. (Evidence this is binding:
`NodeGeoData` ~48-byte `Copy`, `NodeLayerCore` ~16-byte `Copy` exist precisely
because the current schema enum was too fat for the DFS.)

## H11. Sentinel-freedom

**Statement.** No in-band magic values, at any layer of the model — not just
the wire format (H9 covers encoding) but the model itself: its editor IR,
runtime structs, and API. "0 means auto", "(0,0) means unset", "empty string
means none" are all failures. Unset/none/auto must be structural: key
absence (sheet), an Option/union (struct), or an explicit mode discriminant.

**Probe.** Enumerate every field. For each: what does "not set" mean, and
how is it encoded? Any overlap between the value domain and an unset marker
fails. Special attention to switch-adjacent fields: when a mode discriminant
exists, the _retained_ inactive values must not need sentinels either.

## H12. Set-means-set (deterministic effectiveness)

**Statement.** The model must be a natural **editor IR**: after
`set(node, field, value)`, whether the value is _effective_ must be
(a) locally decidable — from the node and its explicit discriminants,
possibly plus its parent context, never from sibling-key presence
combinatorics — and (b) guaranteed-or-rejected: a write is either effective
or fails with a typed error. Arbitration ("write anything; rules pick
winners later") is disqualified for the canonical model. CSS affords
arbitration because humans hand-author it without tooling; a
dedicated-editor document does not need or want that leniency.

**Probe.** For every writable field: after a successful write, can a reader
determine effectiveness without global rules over which _other_ keys happen
to exist? Retained dormant values are permitted **only** under an explicit
discriminant (the axes.md flattening (b) pattern — switch-memory with
readable truth); presence-arbitrated dormancy (flattening (c)) fails.

---

## Tension map

Harnesses conflict pairwise; a candidate that claims to max all of them is
hiding a trade. Naming the axis is phase-1 work; _choosing_ a point on it is
phase 2.

| tension                    | axis                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H5 ↔ H6/H3-flatness**    | Refusal-by-construction wants per-type schemas; uniform merge/codecs want flat property space. The more uniform the surface, the more semantics migrate from types into a rulebook someone must write (and validators must enforce).                                                                                            |
| **H1 ↔ H8**                | Named scalars read; full capability (skew, 3D, arbitrary matrices) doesn't. Can't have both _in the same place_ — hence the quarantine option, which is itself a new node kind to justify (P9).                                                                                                                                 |
| **H3 ↔ H2**                | Property-granular merge vs gesture-granular intent: a drag is one intent over two fields. Finer merge granularity = more valid-but-unintended merged states.                                                                                                                                                                    |
| **H4 ↔ P3**                | Layout wants to own the box; shape geometry _is_ the box for parametric shapes. Resolved-size must feed drawing without feeding back into storage (P4's wall).                                                                                                                                                                  |
| **H2 ↔ H7**                | Gestures write the document; animation must not. Two mutation systems address the same conceptual properties through different tiers — the tiers must be explicit or writes will leak.                                                                                                                                          |
| **H10 ↔ P8-flat**          | Property bags are hostile to dense hot-loop records; per-type structs project trivially. Flat-canonical designs pay a projection layer; typed-canonical designs pay the N×M threading.                                                                                                                                          |
| **H9 ↔ everything**        | FlatBuffers pushes toward tables/unions (nullable, evolvable) and away from the compact structs that H1/H10 instincts produce. The encoding is not neutral.                                                                                                                                                                     |
| **H12 ↔ switch-memory UX** | A dedicated editor wants inactive values to survive mode toggles (hug↔fixed restores the old size); strict determinism forbids ambient dormancy. Resolved, not traded: retained values under an explicit discriminant (axes.md flattening (b)) give both — the discriminant keeps truth readable while inactive fields persist. |
