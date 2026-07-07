# Problem catalog

Each entry: **statement** → **why it's hard** (the tension) → **option space**
(neutral; costs stated against harnesses, no recommendation) → **evidence**
(current code / format / peers).

Problems are grouped, but they interlock — cross-references are marked
`(→ Pn)`. Harness references are `(H n)` into [`harnesses.md`](./harnesses.md).

Status legend: `open` (no decision), `probed` (a candidate position was argued
in-session but not ratified).

---

## A. State model — what is stored

### P1. Canonical geometric state — matrix, scalars, or hybrid `probed`

**Statement.** What is the single stored truth for a node's placement:
an affine matrix (rotation/skew derived), decomposed scalars
(position + rotation stored, matrix derived), or a hybrid
(layout box + separate post-transform, CSS-style)?

**Why it's hard.**

- _Dual-source is the one indefensible position_, and it is the current one:
  leaves store matrices, containers store scalars, and the runtime constantly
  re-derives one from the other. Every derivation is a hazard: `atan2`
  extraction is lossy under skew/non-uniform scale; rebuilding a matrix from
  extracted (x, y, θ) silently destroys any other components.
- Matrix-canonical gives full affine expressiveness but makes rotation a
  _derived_ property (Figma's model, with its documented API/UI pivot
  mismatch) and is hostile to per-field merge (H3): matrix components are
  semantically coupled — merging `m00` from one write with `m10` from another
  yields a non-rotation.
- Scalar-canonical reads and merges well (H1, H3) but caps expressiveness
  (skew, arbitrary matrices from imports) unless capability is housed
  elsewhere (→ P8).
- Whatever is canonical, _projections in both directions already exist_ in the
  codebase; the question is which direction is definitional and which is
  cache.

**Option space.**

1. Matrix-canonical, scalars virtual (Figma, SVG `matrix()`).
2. Scalars-canonical, matrix virtual (tldraw; CSS individual transform
   properties).
3. Hybrid: layout-resolved box + separate post-layout transform (CSS box +
   `transform`).
4. Mixed per node partition (e.g. scalars for boxed nodes, matrix for a
   dedicated transform node) — interacts with P6 and P8.

**Evidence.**

- Three coexisting encodings: `crates/grida/src/node/schema.rs` —
  `RectangleNodeRec.transform` (baked matrix) vs
  `ContainerNodeRec { position, rotation }` vs `format/grida.fbs`
  `LayerTrait { layout, post_layout_transform }` (unimplemented; its own
  comment: _"this is currently how grida handles rotation … in the future,
  this might change"_).
- Lossy extraction in the live pipeline: `crates/math2/src/transform.rs:231`
  (`rotation()` = `atan2`), `transform.rs:48` (`set_rotation` overwrites the
  2×2 block); `crates/grida/src/cache/geometry.rs:959` (layout path rebuilds
  leaf transforms as `new(x, y, rotation())`, discarding scale/skew).
- Figma's matrix is effectively rigid+flip in practice — scaling bakes into
  `size`; the general affine capacity is unused by the product (see
  `study.md`).

---

### P2. Position basis — XY vs TRBL vs anchors `probed`

**Statement.** How are "place at (x, y)" and "pin to right: 10" both
representable — as first-class _stored intent_ — without two modes fighting?

**Why it's hard.**

- XY is the graphics-natural flow (SVG, direct manipulation); TRBL is the
  constraint-natural flow (CSS, pinning). Users legitimately want both, often
  per-axis, sometimes per-edge.
- The current model is a node-level either/or
  (`LayoutPositioningBasis::Cartesian | Inset`) — both axes must share one
  mode, `Cartesian` vs `Inset.left/top` encode the same fact two ways, and
  the enum has a third deprecated variant (`Anchored`) that was never
  finished. This is the "two positioning modes, each fighting each other"
  the project never resolved.
- Over-constraint (left + width + right) needs _some_ rule: CSS drops one
  side (direction-dependent); Figma stores state (x) and re-derives, losing
  the offset intent ("right: 10" is not in the document). Both approaches
  leak into P7 (intent vs state).
- Whether position intent lives per-node, per-axis, or per-edge changes the
  merge granularity (H3) and the applicability matrix (H6).

**Option space.**

1. Node-level mode enum (status quo).
2. Per-axis spec: each axis independently anchored (start/end/center) or
   stretched (both edges) — XY becomes sugar for start/start.
3. Full anchor model (WG feat-layout Level 4): anchors to arbitrary targets;
   parent-only as Level 1.
4. CSS-faithful insets + a resolution rule for over-constraint.

**Evidence.**

- `crates/grida/src/node/schema.rs:800` (`LayoutPositioningBasis`, deprecated
  `Anchored` variant, `x()/y()` reading `Inset.left/top` as if Cartesian).
- `format/grida.fbs:1177–1204` (`LayoutPositioningCartesian` /
  `LayoutPositioningInset` union — same either/or, plus per-side px/percent).
- `docs/wg/feat-layout/index.md` — the anchor vision, including the recorded
  complaint about Figma storing state instead of intent.

---

### P3. Size — one word, four roles `open`

**Statement.** W/H simultaneously serves as: (1) **shape parameter** — for
parametric shapes the W/H _is_ the geometry (ellipse axes, star bounding box);
(2) **layout input** — the preferred/basis size that flex negotiates over,
with fixed/auto/fill modes and min/max clamps; (3) **layout output** — the
resolved box after negotiation, which is what the shape must actually be
_drawn at_; (4) **content measurement** — text/path/vector/markdown derive
natural size from content, inverting the flow (size is an output of measure,
optionally constrained: text `width` is a wrap constraint, not a rect).
What is stored, what is derived, and what does "size" even mean per node kind?

**Why it's hard.**

- The same field is read as geometry by the renderer and as a negotiation
  input by the layout engine; when flex stretches a node, the _drawn_ size and
  the _stored_ size diverge unless resolution feeds back into drawing — and
  whether that feedback ever writes back to the document is P7.
- Content-defined nodes break the "size is spec" assumption: a path's tight
  bounds need not start at (0,0) (the runtime carries `content_origin_x/y`
  precisely for this), text height is a measure result, and a line is
  degenerate (height locked to 0).
- Box-less nodes (group, boolean) have _fully derived_ size (→ P5), so any
  uniform "every node has W/H" claim is already false today.
- Aspect ratio is a _relation between the two axes_ — the current schema
  carries it as advisory; where it binds in the resolution order is undefined.
- Percentage/relative sizing exists in the format draft but not the runtime.

**Option space** (per sub-question, combinable):

- Stored size as: raw floats; a mode enum (fixed/auto/fill) per axis;
  or absent for content/derived kinds.
- Shape geometry as: sized (status quo runtime) vs normalized descriptor
  mapped into the resolved box at render (the `grida.fbs`
  `CanonicalLayerShape` position: _"this union intentionally does NOT encode
  size"_).
- Resolution → drawing coupling: renderer reads resolved box always; or
  renderer reads spec except under layout.
- Write-back: never (pure derivation) vs on-commit state capture (Figma-like).

**Evidence.**

- Two size encodings already: leaf `size: Size` vs container
  `layout_dimensions: LayoutDimensionStyle` (`crates/grida/src/node/schema.rs`).
- `format/grida.fbs:1080–1115` — `CanonicalLayerShape` doc comment: shape
  descriptors are size-free, box-mapped at render (the format already takes a
  position the runtime doesn't implement).
- `crates/grida/src/node/scene_graph.rs:182` — `content_origin_x/y` (evidence
  that "shape ≠ (0,0,w,h) box" is real).
- `crates/grida/src/cache/geometry.rs:812` — `MIN_SIZE_DIRTY_HACK` (evidence
  that size-resolution edge semantics are unresolved).
- Text wrap-constraint semantics: `TextSpanNodeRec.width: Option<f32>` +
  the long `height` doc block (`schema.rs:2582–2634`).

---

### P4. Intent vs state — what is stored vs what is exposed `probed`

**Statement.** Does the document store _intent_ (pin right: 10; fill width;
rotate 30°) with state derived, or _state_ (x = 314 at this instant) with
intent re-derived — and what do API reads/writes address?

**Why it's hard.**

- Figma stores state (x/y) plus a constraint enum; the offset intent is never
  in the document — the recorded complaint in the WG doc. Storing intent
  instead means every read of "x" is a _resolution_ (needs parent geometry),
  and every write of "x" must be _re-targeted_ onto the intent field.
- Under a layout parent, position fields are layout-owned: a write to x is
  meaningless unless the model defines whether it errors, detaches the node
  from flow, or is silently ignored (each observable today in different
  tools).
- Layout resolution producing values that _look like_ the stored fields
  invites accidental write-back — the classic corruption path. CSS's
  specified-vs-computed two-tier is the strongest precedent for keeping the
  wall explicit.
- Animation adds a third tier: evaluated override values that must _never_
  write back (→ P9).

**Option space.**

1. State-canonical with intent enums (Figma).
2. Intent-canonical with resolved values as a query-only tier (CSS
   specified/computed analog).
3. Dual-stored with reconciliation rules (rejected by H5 unless rules are
   total).

**Evidence.**

- `docs/wg/feat-layout/index.md` §1 ("What user sets is NOT ALWAYS what they
  get"; "the schema does not contain the 'right is 10' but rather the current
  'state' x").
- Layout-owned overrides in the runtime: `cache/geometry.rs:784–806`
  (layout result replaces schema position for containers) and `:940–973`
  (leaves under layout containers) — resolved values exist only in caches
  today (no write-back), but nothing _names_ this contract.

---

## B. Composition & space — how stored state becomes pixels

### P5. Rotation × layout coupling — pre vs post, and the pivot `probed`

**Statement.** Is rotation a layout-visible geometric property (Figma:
the rotated AABB participates in auto-layout) or a paint-only effect (CSS:
transform never moves siblings)? And around what pivot does stored rotation
apply — baked into translation (matrix), a stored origin, or a fixed
convention (center / top-left)?

**Why it's hard.**

- On a free canvas the two regimes are indistinguishable; they diverge exactly
  under layout, where designer expectation (no overlap surprise) and
  animation/composition stability (no relayout per frame) pull opposite ways.
- Arbitrary-angle _layout-visible_ rotation is only tractable one-pass if the
  child is measured unrotated and its rotated AABB (a function of w, h, θ
  only — never of assigned position) is what layout packs. Rotation that
  changes a child's _wrap constraints_ (rotated text reflowing) is a harder
  class no studied system attempts; Flutter explicitly restricted
  layout-visible rotation to quarter-turns to dodge it.
- Pivot interacts with everything: top-left pivot makes the rotated AABB
  offset quadrant-dependent and couples badly with resize; center pivot makes
  box-center and AABB-center coincide; matrix-baked pivot (Figma) makes the
  gesture pivot a UI fiction implemented by translation compensation.
- The `post_layout_transform` slot in the format conflates two different
  things unless the model separates them: _where static rotation lives_ vs
  _where motion effects live_ (→ P9).

**Option space.**

1. Layout-visible rotation, AABB-fed (Figma) — with a defined pivot
   convention.
2. Paint-only rotation (CSS/SwiftUI/Flutter-Transform).
3. Split: restricted layout-visible (quarter-turns) + unrestricted paint-only
   (Flutter).
4. Both lanes exist, distinguished as static-intent vs motion-effect.

**Evidence.**

- Runtime today: layout is rotation-blind (`ComputedLayout {x,y,w,h}`,
  `crates/grida/src/layout/mod.rs`), rotation slapped on after, pivot =
  local top-left everywhere (`T·R` via `AffineTransform::new`); the correct
  center-pivot primitive exists unused
  (`crates/math2/src/transform.rs:98`, `from_box_center`).
- `format/grida.fbs:1330` — `post_layout_transform` as the declared-but-
  provisional home.
- Peer positions in `study.md` (Figma AABB behavior; Flutter's RotatedBox
  restriction; CSS/SwiftUI paint-only consensus).

---

### P6. Box-less nodes — group and boolean geometry `probed`

**Statement.** Group and BooleanOperation own no box — bounds derive from
children (boolean: from the _path op result_, one step more derived). What
geometry, if any, do they store; around what does a stored rotation pivot;
and do child edits ever require writes to the group?

**Why it's hard.**

- A stored rotation pivoting on a _derived_ center is unstable: moving one
  child moves the pivot and therefore shifts every sibling's world position.
- Fixing that by storing the fitted box (Figma) buys the re-fit dance: every
  child edit triggers a compensating group write — a cross-node transaction
  (hostile to H3) and a well-known complexity sink in Figma's own model.
- Fixing it by baking group transforms into children on commit makes group
  rotation an N-node write and destroys the group-local coordinate space
  (SVG `<g>` semantics) the engine currently relies on.
- Ungrouping must bake regardless; the question is what the _steady state_
  stores.
- Boolean additionally raises whether it is a geometry node at all or a
  _modifier_ over children (its fills/strokes apply to the op result; its
  "size" is the result's bounds).

**Option space.**

1. Store `transform`/scalars on the group; box always derived; pivot = own
   origin; center-feel is gesture-level compensation (status quo shape,
   scalarized or not per P1).
2. Store a fitted box + transform, re-fit on child change (Figma).
3. Groups are ephemeral (selection-only); rotation always bakes into
   children.
4. Boolean: geometry node vs modifier node (orthogonal sub-decision).

**Evidence.**

- `crates/grida/src/node/schema.rs:1457` (`GroupNodeRec` — only
  `transform: Option<AffineTransform>`), `:2012` (`BooleanPathOperationNodeRec`
  same shape).
- Derived bounds machinery: `crates/grida/src/cache/geometry.rs:992`
  (`collect_oriented_corners` — oriented union in group space).
- `format/grida.fbs:1381` — `// TODO: review the group model from scratch.`
  and `:1403` `// TODO: review the shape, should boolop have direct child ?`
  (the format already flags both as unresolved).

---

### P7. Coordinate-space contract `open`

**Statement.** Which nodes establish a coordinate space for their children,
and where is the child origin — the parent's border-box top-left, its
content/padding box, or something else? What are percentages relative to?

**Why it's hard.**

- Today every node implicitly establishes a space
  (`world = parent_world ∘ local`, uniformly), but the _origin_ semantics are
  unstated: does container padding shift child origin (CSS content-box vs
  border-box question)? The answer is currently "whatever Taffy does" for
  flow children and "no" for absolute ones.
- `InitialContainer` is a special case (viewport-filling; _direct children's
  transforms are ignored_ by doc-comment) — a second, undocumented positioning
  regime.
- The format draft has percentage units for insets and dimensions with no
  defined reference box.
- Transform-carrying wrappers (→ P8) and groups (→ P6) create spaces without
  boxes — percentages and anchors inside them need a defined basis or an
  explicit rule that they're invalid there (H6).

**Option space.** Origin at border-box vs content-box; percentage bases per
CSS convention vs simplified single rule; ICB regularized as a normal flex
container vs kept special.

**Evidence.**

- `crates/grida/src/node/schema.rs:1634–1653` (`InitialContainerNodeRec` doc:
  "Direct children are positioned by layout engine (their transforms
  ignored)").
- `format/grida.fbs:1124–1199` (`LayoutDimensionUnit::Percentage`,
  `PositioningSideOffsetKind::Percent` — bases undefined).

---

## C. Schema architecture — how the model is written down

### P8. Property model — per-node-type spec vs flat property space `reframed`

> **Reframed by [`axes.md`](./axes.md):** this problem is
> _representation-level_ (Axis 2), secondary to and separable from the
> semantic-model decision (Axis 1), bounded by the atom rule. The option
> space below stands, but it is tuned after the main model is chosen.

**Statement.** Is the schema a set of node _types_, each declaring its own
fields (status quo Rust structs; fbs union-of-variant-tables) — or a flat
property list where every node is the same bag and properties are simply
inert where they don't apply (CSS-style)? Do we need a per-node spec at all?

**Why it's hard.**

- The domain has a visible partition: a few kinds carry _behavioral_
  semantics (container/layout, group, boolean, text/content), and the rest
  are "just shape" — the fbs already acts on this by bundling shapes into
  `BasicShapeNode` + a size-free shape descriptor. A per-type answer and a
  flat answer may score differently on each side of that partition.
- Per-type buys refusal-by-construction (H5): `VectorNetworkData` implies
  Vector; impossible states are unrepresentable. It costs N×M threading:
  every cross-cutting concern touches every variant — the runtime's 19-arm
  `match` blocks for opacity/blend/mask, `layout_child: Option<...>`
  duplicated onto ~12 structs, and every new trait repeats the tour.
- Flat buys uniform codecs, uniform tooling, natural property-level CRDT
  merge (H3), and additive property evolution — but the comparison to CSS is
  **not apples to apples**: CSS's flat list works only because thousands of
  pages of engine spec define, per property × display-type × context, whether
  it applies, what it computes to, and how it interacts. A flat schema
  _exports_ the semantics from the type system into a rulebook that must
  actually be written (H6) and enforced by validators rather than by
  construction.
- The runtime needs dense, `Copy`, cache-friendly projections in hot loops
  regardless of the choice (H10) — it already builds them
  (`NodeLayerCore`, `NodeGeoData`), and it already needs a _flat_ projection
  too (`UnknownNodeProperties` exists as "a standard spec for each exposed
  property names and types"). Both projections exist; the question is which
  direction is canonical and which is derived.

**Option space.**

1. Per-type (status quo), with cross-cutting concerns as composed traits
   (fbs `SystemNodeTrait`/`LayerTrait` direction).
2. Flat property bag + written applicability matrix (CSS direction; Figma's
   plugin surface approximates this).
3. Partitioned: flat/uniform property core (identity, geometry, paint,
   layer) + typed payload only where behavior genuinely differs
   (shape descriptor, text content, vector network, layout container).
4. Flat storage, typed _views_ (schema-level bag; SDK exposes typed node
   classes).

**Evidence.**

- `crates/grida/src/node/schema.rs` — 19-arm matches (`opacity()`,
  `blend_mode()`, `mask()`, `fills()`…); `UnknownNodeProperties` (`:256`);
  `layout_child` duplication across leaf structs.
- `format/grida.fbs:1510–1589` — the union-per-variant rationale comment
  (the argued case _for_ per-type), alongside `BasicShapeNode` (`:1415`),
  which is the argued case for _merging_ variants where payloads coincide.
- CSS precedent and its hidden cost: see `study.md` (applicability rules as
  the price of flatness).

---

### P9. Capability ceiling — full affine, 3D, and where power lives `probed`

**Statement.** The renderer can draw more than the model can say: full affine
(skew), and plausibly 3D/perspective (Skia `M44`). By spec, should the
primitive support everything drawable — and if full power on _every_ node
fights practicality (merge, authoring, layout), does capability live in an
exceptional construct (a `TransformGroup`-like node) instead?

**Why it's hard.**

- Capping the spec below the renderer means imports (SVG skew, matrix-authored
  content) silently degrade — a loss policy nobody chose. Uncapping every
  node re-imports all of P1's matrix problems everywhere.
- Quarantining power in a wrapper node keeps the common case clean and makes
  exotic content structurally visible, but adds a node kind whose layout
  semantics need defining (transparent? sizing?) and whose existence must not
  become a second home for ordinary rotation (re-opening dual-source, H5).
- 3D raises follow-on costs wherever it's allowed: bounds, culling,
  hit-testing through perspective.

**Option space.**

1. Full transform capability on every node.
2. Restricted per-node model + dedicated transform/wrapper node carrying an
   op-list or matrix (WPF `TransformGroup`, SVG nested `<g transform>`,
   Flutter `Transform` widget precedents).
3. Restricted model + explicit import degradation policy (no quarantine).
4. 3D excluded from the document model entirely (renderer-only effects).

**Evidence.**

- Import limitations already documented (io-svg: transform handling caveats).
- `format/grida.fbs` has no skew/3D representation; runtime leaf matrices
  _can_ hold skew but the layout path destroys it
  (`cache/geometry.rs:959`) — an accidental, undocumented cap.

---

### P10. Animation readiness — channels, overrides, and lanes `probed`

**Statement.** The model must decide _now_ (shape-wise, not feature-wise):
what is an animatable channel, where do evaluated animation values live
relative to stored values, and does animated geometry re-enter layout?

**Why it's hard.**

- Interpolation is only well-defined over decomposed values; animating a
  matrix requires decompose/interpolate/recompose with known pathologies
  (CSS's matrix-interpolation flips — the reason CSS later shipped individual
  `rotate`/`translate`/`scale` properties). The channel question therefore
  back-pressures P1.
- Winding (720° = two turns) is representable in a scalar, not in a matrix.
- The SMIL/WAAPI/DCC consensus is override-not-write-back: animation produces
  an evaluated tier above the stored tier (third tier on P4's two). A model
  that lets animation write stored fields corrupts the document and floods
  sync.
- Whether an animated rotation reflows siblings is P5's question wearing a
  different hat: base-field animation (layout-coupled) vs post-layout channel
  (compositor-only) are _both_ legitimate — a per-lane answer needs the lanes
  to exist in the model.
- Spin-around-a-point needs an origin _somewhere_; if stored rotation has a
  fixed pivot convention, animated rotation needs its own origin slot
  (the format's `post_layout_transform_origin` is the existing candidate
  slot).

**Option space.** Channels over stored scalars only; channels over a separate
post-layout transform; both lanes; animation out of document-model scope
entirely (pure runtime concern) with the format merely not _precluding_ it.

**Evidence.**

- `format/grida.fbs:1330–1332` (`post_layout_transform`,
  `post_layout_transform_origin` — unimplemented slots).
- No animation system exists in the engine; this problem is purely
  shape-of-the-spec today, which is exactly why it's cheap now and expensive
  later.

---

### P11. Normative artifact — which document is the spec `open`

**Statement.** `grida.fbs` says "aligned to Rust runtime model"; the runtime
says otherwise. When model-v2 lands, which artifact is normative — the format
schema, the Rust types, or a prose spec both must satisfy — and what
mechanically prevents re-drift?

**Why it's hard.**

- "Aligned to" comments are aspiration, not enforcement; the current
  three-way divergence (P1) grew _under_ such comments.
- The format has binding encoding constraints of its own (FlatBuffers
  scalar-default semantics, tables-over-structs, additive unions — the rules
  in the fbs header), which a runtime-first spec can accidentally violate.
- Cross-boundary codec tests exist for some flows (Rust encode → TS decode in
  the SVG import corpus) but nothing tests _model_ equivalence.

**Option space.** Format-first (fbs is the spec; runtime is a decoder);
runtime-first (fbs is a codec artifact); prose-spec-first (both are
implementations; conformance corpus enforces). Each needs a drift-detection
mechanism to be credible.

**Evidence.**

- `format/grida.fbs:1–113` (header rules + "Aligned to" claims);
  the `LayerTrait` vs `crates/grida/src/node/schema.rs` divergence this
  catalog documents.

---

## Meta

The recurring pattern across P1–P11: **every field the current model stores is
secretly polysemous** — `transform` is placement _and_ orientation _and_
(accidentally) skew; `size` is shape _and_ preference _and_ result; `position`
is coordinate _and_ constraint; group `transform` is space _and_ gesture
residue. The unclear parts "keep arising" because each polysemy resolves only
by naming the roles and assigning each role exactly one home. That naming —
not any particular encoding — is what phase 2 candidates must be judged on.
