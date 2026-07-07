# The two axes — semantic model × representation

The candidate set (`anchor`, `sheet`, `bake`) bundled decisions that are
actually separable. This document factors them, so the **main-model decision
comes first** and the representation decision is tuned afterward.

---

## Axis 1 — the semantic model (primary; decide first)

What is the _truth_ of a node's geometry — the vocabulary and its direction
of derivation. This axis answers P1–P5, P7:

- **`anchor` semantics** — intent-canonical: bindings + size intent + θ;
  the engine resolves.
- **`bake` semantics** — state-canonical: matrix + size; the editor
  materializes.

`sheet`'s _geometry semantics_ — presence-arbitrated CSS insets — is a third
point on this axis, and it is eliminated **as an editor IR** by H12 (below):
setting a value does not guarantee the value is effective; effectiveness
depends on which sibling keys happen to be present. CSS can afford this
because CSS is hand-authored by humans without mediating tooling — leniency
is a feature for that audience. A Grida document is written by a dedicated
editor; its IR can and should be strict.

## Axis 2 — representation & mutation protocol (secondary; tunable)

How the chosen semantics are stored and mutated: typed structs vs a flat
keyed sheet; key granularity; the edit protocol. This axis answers P8 and
sets CRDT granularity, tooling uniformity, and much of the encoding. It is
tunable **after** Axis 1 — with one hard constraint:

> **The atom rule.** The semantic model defines its _atoms of intent_ — the
> smallest units that must merge as a whole to keep every merged document
> valid. Representation may group keys at or above the atom, never split
> below it.

Examples:

- `bake`'s `rt: [f32; 6]` is **one atom** — six separate keys could pair one
  edit's `cos θ₁` with another's `sin θ₂`: a torn, non-rigid matrix. Sheet
  representation of `bake` is fine _iff_ `rt` is a single key.
- `anchor`'s `Pin{anchor, offset}` safely splits into two keys
  (`x-mode`, `x-offset`): any cross-merge of the two is a valid binding.
- List-valued properties (fill stacks, lens ops) choose atomicity per-element
  or per-list — both above the atom, both legal, different merge behavior.

## Yes — every semantic model is sheet-representable

Any fixed schema flattens: field → key, absence = unset. The interesting
choice is how _unions/switches_ flatten, and there are exactly three ways:

| flattening                                  | shape                                                         | switch behavior                                          | truth decidability                                                                       |
| ------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **(a) atomic union key**                    | `x = Pin{end, 24}` (one key)                                  | switching replaces the value; no memory                  | trivial — the key is the truth                                                           |
| **(b) discriminant + retained role fields** | `x-mode = pin-end`, `x-offset = 24`, `x-start`, `x-end`       | inactive fields **survive**; toggling back restores them | truth = read the discriminant; effectiveness of any field is locally decidable           |
| **(c) presence-arbitrated** (CSS)           | `left`, `right`, `width` — presence + precedence rules decide | dormancy with **resurrection**; no discriminant exists   | effectiveness depends on sibling-key combinatorics — not locally decidable at write time |

Only **(c)** changes _semantics_ — it is what made `sheet` a distinct model.
(a) and (b) are pure representation choices available to `anchor` and `bake`
alike.

**(b) is the notable discovery of this factoring**: it delivers the
switch-memory UX a dedicated editor wants — toggle `width-mode`
fixed → auto → fixed and the retained `width-value` restores (the
hug/fixed toggle-memory pattern) — _while keeping truth deterministic_,
because an explicit discriminant always names which fields are live. Dormant
values under (b) are a feature; dormant values under (c) are a hazard. The
difference is the discriminant.

## What survives from `sheet` regardless of Axis 1

These are Axis-2 / protocol features, available to either semantic model:

- the **single-op mutation protocol** (`set/clear(node, key, value)`) —
  uniform history, undo, diffing, multiplayer;
- the **closed property registry** as the normative spec artifact
  (type · initial · applies-to per key);
- per-key **animation channels**;
- inspector/tooling uniformity.

What does _not_ survive: presence-arbitration, resurrection, and the
"every write is legal" policy — killed by H12 for the editor IR.

## Auxiliary stores are Axis 2 too

A model's _derived_ tiers may be serialized as auxiliary stores without
changing the model: a baked-geometry snapshot section for dumb consumers
(thumbnails, CDN renderers, embedded viewers), dense projections for hot
loops, prebuilt spatial indexes. The current fbs draft's commented-out
`relative_transform_snapshot` is this idea by name. Rules: an auxiliary
store is always **marked as cache**, is never the merge target, and its
staleness policy is the writer's obligation. Consequence for triage
(harnesses scoring rule **T1**): no model may claim a derived-tier property
as a design virtue — only canonical-tier properties differentiate.

## Orthogonality — confirmed, with its two exceptions named

"CRDT/code-level layout can vary regardless of the layout model" is correct
**above the atom**. The two places representation is _not_ neutral:

1. **Splitting below an atom** corrupts merges (the torn matrix).
2. **Choosing flattening (c)** silently changes write semantics from
   strict to arbitrated.

Avoid both, and Axis 2 is freely tunable per surface — the wire format, the
runtime structs, and the CRDT layer may even choose _different_ groupings of
the same semantic model, provided all respect the atoms.

## Axis 3 — time (how truth persists)

One more separable axis, named to keep it out of the model race: truth can
persist as **snapshots of state/intent** (a document) or as an **operation
log** (event-sourced; the fold is the document). This is a sync-layer choice
(state-based vs op-based CRDT, history compaction) parameterized by
whichever Axis-1 vocabulary the operations speak. It changes merge and
history mechanics, not what geometry _is_ — so it is tuned independently,
like Axis 2.

## The taxonomy is now closed

At this altitude, a geometry truth can only be: **given** per node
(intent — `anchor`; `sheet` was this with permissive writes, retired),
**computed** (state — `bake`), **relational** (wired to other nodes —
`wire`, [models/d.md](./models/d.md), disciplined to single-assignment
dataflow, not a solver), or **historical** (the log — Axis 3, not a model).
There is no fifth archetype to wait for; the Axis-1 decision can be made
final.

## Consequence for phase 2

- The **main-model decision is `anchor` vs `bake`** (Axis 1).
- `sheet` is re-scoped: its geometry semantics are retired; its
  representation and protocol become Axis-2 options evaluated _after_ the
  main model is chosen (likely candidates: flattening (b) + single-op
  protocol on top of the winner).
- New harnesses H11 (sentinel-freedom) and H12 (set-means-set) are added to
  [`harnesses.md`](./harnesses.md); H12 is the formal reason `sheet`
  semantics fail as editor IR.
