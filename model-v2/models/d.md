# Model D — `wire`

**wire** — the wired geometry model. Geometry values are _wired_ to
referents anywhere in the document, not only to the parent; the document is
a dataflow graph, not a tree-scoped program. The name prices the model's
costs — a cut wire dangles (deleted referent), and wires can tangle
(merge-created cycles).

Status: **proposed** (phase 2 candidate). The relational archetype of the
canonical-truth taxonomy — the last unexplored point on Axis 1. Not a blend
of the other models: its single new primitive (referent-general binding)
changes what the canonical store _is_. It is, deliberately, the model the
WG feat-layout doc's Level 4 ("anchor to arbitrary nodes, named anchors,
inter-element constraints") implies as a destination.

---

## 0. Ground commitments

- **Single-assignment dataflow, not a solver.** Each axis of each node is
  bound to exactly **one** expression over referent boxes. The document is a
  DAG evaluated in one topological pass — the _spreadsheet_ discipline
  (every cell has one formula), explicitly **not** the Cassowary/Auto-Layout
  discipline (simultaneous equations, priorities, multiple solutions).
  Determinism and set-means-set (H12) survive because assignment is single
  and directed.
- **The tree keeps its non-geometric jobs.** Parent-child still owns paint
  order, clipping, opacity/blend inheritance, and coordinate spaces. Wires
  carry _geometry dependency only_. The two graphs may disagree — that is
  the point.
- Everything not named here is inherited unchanged from
  [`anchor`](./a.md): size intent, rotation semantics (center pivot, AABB
  under flow), payloads, kinds, lens quarantine, tiers.

## 1. The one new primitive

`anchor`'s binding gains a referent:

```
Pin  { to: Referent = parent, to_edge: Start|Center|End,
       from_edge: Start|Center|End = same-as-to_edge, offset: f32 }
Span { start: (Referent, Edge, offset), end: (Referent, Edge, offset) }

Referent = Parent | Node(id) | Guide(id)
```

- `x = pin(start, 10)` still means "my left, 10 from parent's left" —
  `anchor` is literally the `to = Parent` restriction of `wire`.
- `x = pin(to: #sidebar, to_edge: end, offset: 8)` — my left, 8 right of
  the sidebar's right edge. Sibling chaining, badges, callouts.
- `Span` between two _different_ referents — the WG doc's auxiliary use
  cases (comment bubbles, link lines, attached annotations) become ordinary
  geometry instead of a separate overlay system.
- Referent geometry is read as the referent's **resolved world AABB**,
  transformed into the bound node's parent space (a rotated referent binds
  by its AABB — defined, if blunt).

## 2. Resolution

Build the axis-level dependency graph (node-axis → referent), topologically
sort, evaluate in one pass; in-flow children under a flex parent are owned
by layout exactly as in `anchor` (wires on owned axes: `ignored-by-rule`).
Still single-pass, still deterministic — the cost moves to _graph
maintenance_, not solving.

## 3. The new hazard class (the honest core)

`wire` introduces failure modes none of a/b/c have, and each needs a
normative rule:

1. **Dangling wires** — the referent is deleted. Rule: fall back to
   `Parent` with the last-resolved offset captured at fallback time, plus a
   document diagnostic. (CSS Anchor Positioning ships fallbacks for the same
   reason; the WG doc itself flags orphaned targets as ConstraintLayout's
   danger.)
2. **Tangled wires** — cycles. Locally, a write that would create a cycle
   is a **typed error** (H12-conform). But two concurrent writes, each
   acyclic alone, can merge into a cycle — a CRDT hazard class beyond
   anything in a/b/c. Rule: resolve-time deterministic cycle-break (drop the
   edge with the greatest (node-id, axis) order, treat as parent-bound,
   diagnostic). Merges stay valid; someone's wire goes slack.
3. **Locality loss** — a node's geometry no longer depends only on its
   ancestors. Invalidation becomes a dirty-graph walk (spreadsheet
   machinery), not a subtree walk; render caching and culling get a harder
   dependency story (H10 hit).
4. **Comprehension** — "why is this here?" now has non-local answers.
   Editor tooling must render wires visibly, or documents become haunted.

## 4. Worked examples

```xml
<shape kind="rect" x="10" y="20" width="120" height="80" rotation="15"/>   <!-- unchanged -->
<shape kind="rect" x="pin end 24" y="20" width="120" height="80"/>          <!-- unchanged -->

<!-- the new expressiveness: -->
<text  x="pin start to:#avatar.end +12" y="pin center to:#avatar.center">Name</text>
<shape kind="rect" x="span (to:#a.center) (to:#b.center)" y="pin start 40"
       height="2"/>                                   <!-- a link line, as geometry -->
```

## 5. Scorecard (delta from `anchor` — all else equal)

| harness          | verdict               | note                                                                                                            |
| ---------------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| H1 readability   | pass                  | wire syntax reads; non-local reasoning cost is real but visible in the text                                     |
| H2 gestures      | pass                  | binding gestures write one axis; _creating_ a wire is a deliberate act                                          |
| H3 CRDT          | **trade (new class)** | per-field merge intact; merge-created cycles need the §3.2 break rule — valid-but-slack outcomes                |
| H4 layout        | pass                  | still single-pass (topo); definedness rules grow by the §3 rulebook                                             |
| H5 single source | pass                  | single-assignment; fallback state is explicit                                                                   |
| H6 coverage      | pass at cost          | §3 rules + referent × context cells added to the matrix                                                         |
| H7 animation     | pass                  | channels unchanged; wires make _rigged_ motion expressible (a referent moves, dependents follow)                |
| H8 capability    | pass                  | unchanged (lens quarantine inherited)                                                                           |
| H9 encoding      | pass                  | `Pin.to` is an additive table field; a `Parent`-only document is byte-compatible with `anchor`'s shape          |
| H10 hot loops    | **trade**             | dirty-graph invalidation machinery replaces subtree invalidation wherever wires exist                           |
| H11/H12          | pass                  | single-assignment keeps set-means-set; cycle-writes are typed errors locally, broken deterministically on merge |

**Intrinsic (T1-clean) virtues:** cross-node intent is _stored_ (the WG
Level-4 promise, natively); auxiliary attachments (comments, link lines,
badges) become ordinary geometry; reparenting a wire-bound node does not
move it (geometry decoupled from tree — no other model has this).
**Intrinsic costs:** the §3 hazard class exists _at all_ — every rule in §3
is spec surface and editor UX that a/b/c simply do not need.

## 6. Verdict (proposer's own)

`wire` is real, coherent, and not needed now. Its distinctive power is an
**additive extension of `anchor`'s vocabulary** — FlatBuffers table
evolution makes `Pin.to` a zero-cost future field, so nothing must be
reserved today and no migration is baked in by choosing `anchor` first.
Its hazard class, by contrast, is paid in full the day the first wire
exists: fallback rules, cycle-break rules, dirty-graph invalidation, wire
visualization. Adopt `anchor`; record `wire` as the priced Level-4
destination that `anchor` grows into if and when the product demands
cross-node attachment — with this document as the bill of costs to re-read
on that day.
