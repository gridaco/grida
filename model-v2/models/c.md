# Model C — `bake`

**bake** — the materialized matrix model. Layout is _baked_ into stored
state at edit time; the file is the resolved picture. The name prices the
model's cost — a bake must be re-baked when any input changes, and you
cannot un-bake it to recover the intent.

Status: **proposed** (phase 2 candidate, rival to [`anchor`](./a.md)).
Matrix-canonical and state-canonical, Figma-faithful — but designed
best-faith for 2026: the known Figma scars that are fixable _within_ the
paradigm are fixed; the ones that are the paradigm are kept and priced.

Its deep bet is different from A's and B's: **the document is the resolved
picture, not a program that produces one.**

---

## 0. Ground commitments

- **Geometry is a matrix plus a size.** Every node stores
  `rt: [f32; 6]` (2×3 affine, parent-relative) and `size: (w, h)` —
  uniformly, all kinds (fixing current-Grida's container/leaf split _within_
  the matrix paradigm).
- **The document stores state, not intent.** Layout runs at **edit time**
  and materializes its results into the stored matrices and sizes. What is
  on disk is what is on screen.
- Rotation, x, y are **derived lenses** over the matrix — never stored.
- Node kinds and typed payloads are kept as in Model A (flatness is B's
  axis; C isolates the geometry/state axis).

**A note on the "dumb renderer" claim — demoted by scoring rule T1**
([`../harnesses.md`](../harnesses.md)). An earlier draft scored "renders
with no layout engine" as `bake`'s unique win. It is not: _any_ model can
emit a materialized geometry snapshot as an auxiliary store for dumb
consumers — the current fbs draft's commented-out
`relative_transform_snapshot` field even names that idea (a _snapshot_,
riding alongside intent). What is intrinsic to `bake` is narrower and
double-edged: the snapshot **is** the canonical store. That buys
coherence-by-construction (the baked values cannot be stale, because there
is no upstream intent to drift from) and a trivial conformance spec (the
meaning of a file is "compose and paint" — no layout semantics to
standardize). It is also precisely where the model's costs originate:
intent loss, write amplification, coarse merges. Score the residue, not the
headline.

---

## 1. The node

```
Node {
  id, name?, active, locked
  parent?: { id, order: FractionalIndex }

  rt:   [f32; 6]                 // parent-relative affine. THE geometry.
  size: (w: f32, h: f32)         // unrotated box extent

  // ---- re-derivation intent (edit-time only; renderers ignore) ----
  constraint_x: Min | Max | Center | Stretch | Scale   = Min
  constraint_y: Min | Max | Center | Stretch | Scale   = Min
  flow: InFlow | Absolute = InFlow
  grow: f32 = 0
  self_align: Auto | Start | Center | End | Stretch = Auto
  size_mode_w, size_mode_h: Fixed | Hug | Fill = Fixed   // frames/text

  // ---- layer (as Model A) ----
  opacity, blend_mode, mask?, effects

  payload: <typed, as Model A §3 — minus the lens kind (§4)>
}
```

The split to understand: `rt`/`size` are **the truth**; the
constraint/flow/size-mode block is **advice to editors** about how to
_rewrite_ the truth when context changes. A renderer never reads the advice.

## 2. Derived lenses (API surface)

- `x, y` — the translation column of `rt`.
- `rotation` — `atan2(m10, m00)`, degrees. **Setter fixed relative to
  Figma:** setting `rotation` rebuilds `rt` pivoting at the **box center**
  (Figma's API pivots at the origin while its UI pivots at center — the
  scar is a pure API choice and C repairs it for free).
- `width/height` — `size`; the scale tool bakes into `size` (matrices stay
  rigid + flip in UI practice), but the matrix _may_ carry scale/skew —
  imports land losslessly with no wrapper (§4).
- All setters are matrix rewrites; all getters are closed-form. Lossy-
  extraction hazards (atan2 under skew) exist **only at the lens**, read-only
  — the stored value never round-trips through them (single-source is
  genuinely clean here; cleaner than current-Grida's dual model).

## 3. Edit-time materialization (the paradigm's engine)

Layout and constraints run **when edits happen**, inside the editing session,
and write their results into `rt`/`size` of affected nodes:

- **Auto-layout frame changes** (child added/removed/resized, gap/padding
  edits, text reflow): the editor re-runs flex for the frame and writes each
  in-flow child's new translation (and stretched sizes), plus the frame's own
  hug size. Rotation participates as the child's rotated AABB (Figma
  semantics — canvas never lies).
- **Parent resize**: constraints re-derive children (`Max` keeps
  right-distance, `Scale` interpolates, `Stretch` adjusts size), writing
  matrices/sizes.
- **Group edits**: groups store a fitted `size` + `rt`; any child geometry
  edit triggers the **re-fit procedure** — recompute the fitted bounds,
  rewrite the group's `rt`/`size`, and counter-adjust all children so world
  positions hold. This is the known Figma dance, inherent to storing fitted
  state; C owns it as a specified edit-time obligation rather than an
  accident.

Consequences, both directions:

- Reads are free and exact everywhere — `node.x` is a number, not a query
  (P4 answered by _abolishing_ the resolved tier, not by walling it).
- Intent is partially lost — "right: 24" exists only as
  `constraint_x: Max` + current state; the offset is re-derived, never
  stored. This is the exact WG-doc complaint, kept knowingly: in C, _state
  is the point_.
- Write amplification — one text edit inside a deep auto-layout stack writes
  matrices across the subtree; every such write is CRDT traffic and history
  noise. Concurrent relayout ∥ manual-move conflicts are C's characteristic
  merge hazard (arbitrated by property-atomic LWW on `rt`: someone's intent
  loses whole).

## 4. Capability

The 2×3 matrix natively carries the full affine group — translation,
rotation, scale, flip, skew — **on every node, with no quarantine wrapper**.
SVG/Figma imports land verbatim (H8's 2D row: best of the three models).

**3D does not exist** in C. A 2×3 cannot hold perspective; admitting an
`M44` would forfeit the compact-struct virtues the paradigm buys. 3D is
declared out of the document model (renderer-side effects only) —
an honest cap, priced in the scorecard.

There is no `lens` kind; motion/animation overrides are runtime-tier
concerns outside the document (as in A), but their channels are weak (§6 H7).

## 5. Worked examples (H1 quartet)

```xml
<!-- (a) rectangle rotated 15° — the matrix IS the storage -->
<shape kind="rect" rt="0.966 -0.259 25.9  0.259 0.966 9.1" size="120 80"/>

<!-- (b) pinned right: 24 — state + advice; the 24 is not in the file -->
<shape kind="rect" rt="1 0 256  0 1 20" size="120 80" constraint-x="max"/>

<!-- (c) flex column — children carry materialized positions; a dumb
     renderer draws this with zero layout code -->
<frame layout="flex" direction="column" gap="8" rt="1 0 0 0 1 0" size="400 120">
  <shape kind="rect" rt="1 0 16  0 1 16" size="368 40" self-align="stretch"/>
  <text  rt="1 0 16  0 1 64" size="368 40" grow="1">hello</text>
</frame>

<!-- (d) rotated group — fitted size stored; child edits re-fit -->
<group rt="0.866 -0.5 100  0.5 0.866 50" size="96 40">…</group>

<!-- (e) skew — no wrapper, no ceremony, also no tree visibility -->
<shape kind="rect" rt="1 0.364 0  0 1 0" size="240 150"/>
```

Example (a) _is_ the H1 verdict: a human cannot read `0.966 -0.259` as
"15°" without a calculator. A canonical serializer MAY emit sugar
(`rotation="15"`) when `rt` is rigid — but sugar is a codec courtesy; the
canonical form is six floats.

## 6. Harness scorecard

| harness          | verdict              | note                                                                                                                                                                |
| ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 readability   | **fail (mitigable)** | matrices at rest; serializer sugar only for the rigid subset                                                                                                        |
| H2 gestures      | **pass**             | drag/rotate/resize = 1–2 node writes (matrix+size); group edits = subtree re-fit writes (flag)                                                                      |
| H3 CRDT          | **trade**            | `rt` merges atomically — no tearing, but move ∥ rotate = one intent lost whole; materialization = write amplification and relayout∥edit conflicts                   |
| H4 layout        | **pass, relocated**  | no runtime resolution at all; all definedness questions move to edit-time procedures, which must be specified with equal rigor                                      |
| H5 single source | **pass**             | one home (`rt`+`size`); lenses read-only; _cleaner than the current dual system_                                                                                    |
| H6 coverage      | **medium**           | applicability matrix small (advice fields inert per context), but the edit-time procedure book (re-fit, re-derive, materialize) replaces it — comparable total mass |
| H7 animation     | **fail-ish**         | matrix channel = decompose/interpolate pathologies; no winding; would need bolted-on decomposed channels (CSS's retrofit, replayed)                                 |
| H8 capability    | **split**            | 2D affine: best of three (ambient, lossless import). 3D: excluded by construction                                                                                   |
| H9 encoding      | **pass (leanest)**   | `CGTransform2D` struct exists; the current fbs draft's commented-out `relative_transform_snapshot` is literally this field waiting                                  |
| H10 hot loops    | **pass (native)**    | matrix+size IS the hot-loop record; rivals pay a projection layer — a T1-mitigable cost, so not decisive                                                            |
| — dumb renderer  | **T1-demoted**       | replicable on any model via an auxiliary snapshot store; intrinsic residue = snapshot coherence-by-construction + trivial conformance spec (§0 note)                |

**Where C beats A — intrinsic only (post-T1):** single-source cleanliness
(one home, lenses read-only); trivial conformance spec (file meaning =
compose + paint, no normative layout spec); ambient 2D-affine import
fidelity (no wrapper ceremony); encoding leanness; no dual-representation
invalidation machinery (though edit-time relayout machinery takes its
place — partially a wash).
**Where C loses to A:** authoring legibility, intent preservation (the
original WG complaint is _kept_), merge granularity, write amplification,
animation, 3D ceiling.

## 7. Deferred

Exact re-fit/compensation procedures (normative pseudo-code needed if C
advances); whether `size_mode`/`constraint` advice suffices to reconstruct
intent for responsive re-targeting (the known ceiling of state-canonical
systems); flip representation conventions; text: stored size vs re-measure
obligations on font-availability drift (a real risk: a file materialized
with font X renders differently when X falls back — the dumb-renderer
guarantee is only as strong as resource pinning).
