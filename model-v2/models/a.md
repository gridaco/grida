# Model A — `anchor`

**anchor** — the anchored box model. Geometry is _bound_, not placed:
position is a relation the engine must resolve. The name prices the model's
cost — an anchor is nothing until resolved against what holds it.

Status: **proven in lab** (2026-07-07 — decided winner, then implemented
and run through experiments E1–E6; see [`../a/REPORT.md`](../a/REPORT.md)).
This document is still the phase-2 draft: the phase-3 rewrite must fold in
the earned amendments **E-A1…E-A7** (derived-box origin placement, native
flip, the two stretches, grow×rotation, underdetermined bindings, M-4
policy, envelope-peak note) and lock rotation-in-flow as **layout-visible**
(E1). Originally designed from scratch against
[`../problems.md`](../problems.md) and [`../harnesses.md`](../harnesses.md);
implements the ratifiable parts of [`../paradigm.md`](../paradigm.md) as a
concrete schema.

This document is the model: types, fields, defaults, resolution algorithm,
applicability matrix, and harness scorecard. Field names are proposals;
semantics are the commitment.

---

## 0. Ground commitments

- The document stores **declared intent only**. Resolved geometry (boxes,
  matrices, bounds) is engine output and is never serialized.
- **No stored matrices** outside the `lens` kind. No `transform` field exists
  on any node.
- Angles are **degrees**, `f32`, positive = clockwise in screen space
  (y-down; CSS convention). Lengths are logical px, `f32`.
- Document structure is unchanged from the current fbs draft: flat node map,
  parent reference + fractional index for sibling order.

---

## 1. The node

Every node is **header + payload**. The header is identical for all kinds
(one spec, one applicability matrix). The payload is typed per kind.

```
Node {
  // ---- identity (unchanged from SystemNodeTrait) ----
  id
  name?
  active   = true
  locked   = false

  // ---- hierarchy (unchanged) ----
  parent?: { id, order: FractionalIndex }

  // ---- geometry intent ----
  x: AxisBinding        = pin(start, 0)
  y: AxisBinding        = pin(start, 0)
  width:  SizeIntent    = kind default (§4)
  height: SizeIntent    = kind default (§4)
  min_width?, max_width?, min_height?, max_height?: f32
  aspect_ratio?: (f32, f32)          // advisory; resolves an under-specified axis
  rotation: f32         = 0          // degrees; pivot per §5

  // ---- flow intent (child-side layout) ----
  flow: InFlow | Absolute = InFlow   // meaningful only under a layout parent
  grow: f32               = 0        // main-axis growth factor
  self_align: Auto | Start | Center | End | Stretch = Auto   // cross-axis

  // ---- layer (unchanged semantics) ----
  opacity: f32 = 1
  blend_mode   = pass_through
  mask?: MaskType
  effects: LayerEffects

  // ---- typed payload ----
  payload: <per kind, §3>
}
```

Deliberately absent from the header: `transform` (abolished), `position` mode
enums (abolished — replaced by per-axis bindings), per-kind size fields
(abolished — one size intent).

---

## 2. Geometry intent types

### 2.1 AxisBinding — position as a relation, not a coordinate

```
AxisBinding =
  | Pin  { anchor: Start | Center | End, offset: f32 }
  | Span { start: f32, end: f32 }        // both edges bound; extent derived
```

Resolution against the parent's resolved box (extent `E`), for a node of
resolved extent `w` on that axis:

| binding          | resolved start (`x0`) | resolved extent |
| ---------------- | --------------------- | --------------- |
| `Pin{Start, o}`  | `o`                   | from SizeIntent |
| `Pin{End, o}`    | `E − o − w`           | from SizeIntent |
| `Pin{Center, o}` | `(E − w)/2 + o`       | from SizeIntent |
| `Span{a, b}`     | `a`                   | `E − a − b`     |

- `x = 10` is sugar for `Pin{Start, 10}`. "x" _is_ "left".
- "right: 24" is `Pin{End, 24}` — **the intent is stored** (P2, P4).
- `Span` **owns the axis extent**: SizeIntent on a spanned axis is
  `ignored-by-rule` (§8). The classic left+width+right conflict is thereby
  a documented no-op, not a runtime surprise.
- Bindings bind the **unrotated box's** edges; rotation applies afterward
  about the box center (§5). With a center pivot the box and its rotated AABB
  are concentric, so `Pin{Center}` is exactly visual-center regardless of θ.
  _(Open refinement, recorded: AABB-edge binding for Start/End pins —
  θ-dependent but visually tighter. v1 binds the box.)_
- Offsets are px in v1. Percent/scale anchoring is an additive variant later
  (`Pin` offset becomes a length union in the encoding; no layout change).

### 2.2 SizeIntent — two values, not three

```
SizeIntent = Fixed(f32) | Auto
```

- `Fixed` — declared extent.
- `Auto` — the kind's natural extent: measured kinds → measure result under
  constraints; `frame` → hug children; declared-shape kinds → **invalid**
  (`error-by-rule`, §8).
- There is **no `Fill`**. Growth and stretching are expressed where they
  belong, eliminating redundant encodings (H5):
  - main-axis fill under flex → `grow: 1` (+ `Auto`/`Fixed` basis)
  - cross-axis fill under flex → `self_align: Stretch`
  - fill of an absolute/free child → `Span{0, 0}`

Min/max clamp the resolved extent last. `aspect_ratio` resolves an axis only
when exactly one axis is under-specified; it never overrides `Fixed` and
never violates min/max (current semantics, kept).

---

## 3. Kinds and payloads

Ten kinds. Cross-cutting style is one shared component, not per-kind fields:

```
SurfaceStyle { fills: [Paint], strokes: [Paint], stroke_width, stroke_style,
               corner_radius: RectangularCornerRadius, corner_smoothing }
```

| kind     | payload                                                            | box source                 | children                                      |
| -------- | ------------------------------------------------------------------ | -------------------------- | --------------------------------------------- |
| `frame`  | `LayoutBehavior` (§3.1) + `SurfaceStyle` + `clips_content: bool`   | declared (Auto = hug)      | yes                                           |
| `tray`   | `SurfaceStyle`                                                     | declared                   | yes (canvas organization; no clip, no layout) |
| `shape`  | `ShapeDescriptor` (§3.2) + `SurfaceStyle`                          | declared                   | no                                            |
| `image`  | `ResourceRef` + `ImageFit` + `SurfaceStyle`                        | declared                   | no                                            |
| `text`   | content + `TextStyle` + align + overflow (`max_lines`, `ellipsis`) | measured                   | no                                            |
| `embed`  | `format: markdown \| html` + source + `SurfaceStyle`               | measured                   | no                                            |
| `vector` | `VectorNetwork` + `SurfaceStyle` + markers                         | measured (network bounds)  | no                                            |
| `group`  | — (empty)                                                          | derived (children union)   | yes                                           |
| `bool`   | `op: union\|intersect\|subtract\|xor` + `SurfaceStyle`             | derived (op result bounds) | yes (operands)                                |
| `lens`   | `ops: [LensOp]` (§3.3)                                             | derived (children union)   | yes                                           |

Kind consolidations vs today: Rectangle/Ellipse/Polygon/RegularPolygon/Star/
Path collapse into `shape` (adopting the fbs `BasicShapeNode` +
`CanonicalLayerShape` direction); `InitialContainer` is abolished as a kind —
the scene root is a `frame` whose bindings span the viewport (P7
regularized); `TextSpan`/`AttributedText` are one `text` payload (attributed
runs optional within it); Markdown/HTML embeds are one `embed`.

### 3.1 LayoutBehavior (frame only — container side)

Unchanged in spirit from today; restated for completeness:

```
LayoutBehavior {
  mode: None | Flex          = None
  direction: Row | Column    = Row
  wrap: bool                 = false
  main_align:  Start | Center | End | SpaceBetween | SpaceAround | SpaceEvenly = Start
  cross_align: Start | Center | End | Stretch = Start
  padding: EdgeInsets        = 0
  gap: { main: f32, cross: f32 } = 0
}
```

`mode: None` = the frame positions children by their bindings (free canvas
inside a box). `mode: Flex` = the frame owns in-flow children's position.
Grid is an additive future `mode` variant.

### 3.2 ShapeDescriptor — geometry is a function of the box

Size-free, normalized descriptors evaluated at the resolved box (the fbs
`CanonicalLayerShape` position, made runtime-true — P3):

```
ShapeDescriptor =
  | Rect
  | Ellipse { inner_ratio: f32 = 0, start_angle: f32 = 0, sweep: f32 = 360 }
  | RegularPolygon { points: u32 }
  | Star { points: u32, inner_ratio: f32 }
  | Polygon { points: [(f32, f32)] }        // normalized 0..1, scaled to box
  | Path { d: string }                       // normalized 0..1, scaled to box
  | Line                                     // the box's horizontal midline; height intent must be Fixed(0)
```

`vector` is deliberately _not_ a descriptor: its network is absolute-local
editable geometry, hence a measured box. `shape/Path` (render-only,
normalized) vs `vector` (editable, measured) is the same split the format
draft already makes.

Stroke endpoint markers live in `SurfaceStyle`-adjacent stroke props and are
honored only on open geometry (`Line`, open `Path`, open network) —
`ignored-by-rule` elsewhere.

### 3.3 LensOp — the capability quarantine

```
LensOp =                       // ordered list; applied in sequence, post-resolution
  | Translate { x, y }
  | Rotate    { deg, origin: Alignment = center }
  | Scale     { x, y, origin: Alignment = center }
  | Skew      { x_deg, y_deg }
  | Matrix    { m00..m12 }                  // 2×3 escape hatch
  | Perspective { d }                        // 3D vocabulary, spec-reserved
  | Rotate3D  { x_deg, y_deg, origin }       //   (implementation staged)
  | Matrix3D  { m: [16] }
```

The `lens` node is the **only** home for skew, arbitrary matrices, and 3D.
It is layout-transparent: its derived (pre-ops) box is what participates in
the parent; ops never affect layout. Imports that hit non-decomposable
transforms **wrap in a lens instead of degrading** (H8). Each op parameter is
a named scalar — an animation channel for free (P10).

Ordinary rotation must never be authored as a lens — validators flag a lens
containing only `Rotate` as "use header rotation" (guards the dual-source
hole, H5).

---

## 4. Kind defaults (size intent)

| kind                              | width default                                       | height default      |
| --------------------------------- | --------------------------------------------------- | ------------------- |
| `frame`, `tray`, `shape`, `image` | `Fixed` (required at creation)                      | `Fixed`             |
| `text`                            | `Auto`                                              | `Auto`              |
| `embed`                           | `Fixed`                                             | `Auto`              |
| `vector`, `group`, `bool`, `lens` | _(no size intent — derived; field ignored-by-rule)_ | —                   |
| `shape/Line`                      | `Fixed`                                             | `Fixed(0)` (locked) |

---

## 5. Rotation semantics

- **Pivot**: boxed and measured kinds — the **box center**, always. No
  stored origin. (Center is the one pivot where the box and its rotated AABB
  are concentric, so layout placement and center-pins need zero correction
  terms.)
- **Derived-box kinds** (`group`, `bool`, `lens`): pivot = the node's **own
  local origin** (the point its bindings place). A center-feel rotation
  gesture writes `rotation` _and_ compensates `x`/`y` offsets — the Figma
  compensation trick, performed over three legible scalars instead of a
  matrix. Child edits never write the group (P6).
- **Layout participation** (P5): a rotated in-flow child contributes its
  oriented AABB — `w' = |w·cosθ| + |h·sinθ|`, `h' = |w·sinθ| + |h·cosθ|` —
  computed from its resolved size only, never its assigned position
  (single-pass safe). Its box center is then placed at the slot center.
- Rotation that would change _wrap constraints_ (rotated text reflowing
  against a rotated width) is explicitly not modeled: children measure
  unrotated, then the AABB wraps the result — the same dodge every studied
  system takes.
- Motion rotation (animation) targets a lens channel, not this field, unless
  layout-coupled motion is explicitly intended (P10 two-lane).

---

## 6. Resolution algorithm

Pure function: `resolve(document, fonts, resources, viewport) → Resolved`.

```
Phase M — measure (bottom-up)
  text/embed:    natural size under intent constraints
                 (Fixed width ⇒ wrap constraint; Auto ⇒ unconstrained)
  vector/bool:   geometry bounds (bool: after path op)
  frame(Auto):   hug = children extents (uses phases M+L of the subtree)

Phase L — layout (top-down, per parent)
  parent frame with mode: Flex, child flow: InFlow
    → flex negotiation (Taffy) over child AABB contributions (§5),
      grow / self_align / min-max applied; measured kinds re-measure at
      layout-imposed extents (standard measure-function flex)
    → child box center := assigned slot center
  otherwise (Absolute child, or parent without layout)
    → bindings resolve per §2.1 against parent's resolved box
    → SizeIntent per §2.2, clamped by min/max, aspect_ratio if applicable

Phase T — transforms
  boxed/measured: local = T(x0, y0) · R_center(θ, w, h)     // = from_box_center
  derived-box:    local = T(x0, y0) · R(θ)                   // origin pivot
  lens:           world = parent_world ∘ local ∘ eval(ops)
  all:            world = parent_world ∘ local

Phase B — bounds
  oriented corners → world AABBs → render-bounds inflation (unchanged)
```

No cycles: measure never reads position; AABB contribution never reads
assigned position; `Span`/`Pin` read only the parent's resolved box.

**Reads and writes** (P4): `x, y, width, height, rotation` are always
readable — from the resolved tier. Writes re-target intent: setting `x` on a
`Pin{End}` axis rewrites the end offset so the resolved x becomes the given
value; setting `width` on a spanned axis is a **typed error**
(`AxisOwnedBySpan`); setting `x` on an in-flow child under flex is a typed
error (`OwnedByLayout`) — the editor's affordance is "set flow: Absolute".
Resolution never writes back to the document.

---

## 7. Worked examples (H1 — the XML quartet)

```xml
<!-- (a) rectangle rotated 15° -->
<shape kind="rect" x="10" y="20" width="120" height="80" rotation="15"/>

<!-- (b) rectangle pinned right: 24 (intent stored, survives parent resize) -->
<shape kind="rect" x="end 24" y="20" width="120" height="80"/>

<!-- (c) flex column, one growing child; text hugs, re-wraps at stretched width -->
<frame layout="flex" direction="column" gap="8" padding="16"
       width="400" height="auto">
  <shape kind="rect" height="40" self-align="stretch"/>
  <text grow="1">hello</text>
</frame>

<!-- (d) rotated group: one field vs N children; children in group space -->
<group x="100" y="50" rotation="30">
  <shape kind="rect" width="40" height="40"/>
  <shape kind="ellipse" x="56" width="40" height="40"/>
</group>

<!-- (e) the quarantine: skewed import content, visible in the tree -->
<lens ops="skew-x(20)">
  <shape kind="rect" width="240" height="150"/>
</lens>
```

---

## 8. Applicability matrix (H6 — the header, complete)

Contexts: **free** (parent has no layout / child `Absolute`), **flow**
(parent flex + child `InFlow`), **derived** (kind has derived box).
Every cell defined; zero "undefined".

| header field                               | free                                          | flow                                                          | derived-box kinds                                      |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| `x`, `y`                                   | effective                                     | **ignored-by-rule** (layout owns; write = typed error)        | effective (places the space)                           |
| `width`, `height`                          | effective (`Span` overrides: ignored-by-rule) | effective as basis (grow/stretch may override resolved value) | **ignored-by-rule** (box derived)                      |
| `min/max_*`                                | effective                                     | effective                                                     | ignored-by-rule                                        |
| `aspect_ratio`                             | effective when one axis under-specified       | same                                                          | ignored-by-rule                                        |
| `rotation`                                 | effective (center pivot)                      | effective (AABB participates)                                 | effective (origin pivot)                               |
| `flow`                                     | inert (no layout parent) — ignored-by-rule    | effective                                                     | same rules as boxed                                    |
| `grow`, `self_align`                       | ignored-by-rule                               | effective                                                     | same rules as boxed                                    |
| `opacity`, `blend_mode`, `mask`, `effects` | effective                                     | effective                                                     | effective (`group`: effects ignored-by-rule, as today) |
| `Auto` size on `shape`/`image`             | **error-by-rule** (no natural size)           | error-by-rule                                                 | n/a                                                    |

The matrix is nine rows — the price of L5's uniform header, and it is now
paid in full rather than owed.

---

## 9. Encoding sketch (H9 — FlatBuffers)

Respects the fbs header rules: intent states are structural (unions/tables),
never scalar sentinels; evolution is additive.

```fbs
table Pin  { anchor: AnchorEdge = Start; offset: float = 0; }
table Span { start: float = 0; end: float = 0; }
union AxisBinding { Pin, Span }            // absent ⇒ Pin{Start, 0}

table SizeFixed { value: float; }
table SizeAuto  {}
union SizeIntent { SizeFixed, SizeAuto }   // absent ⇒ kind default (§4)

table NodeHeader {
  id: NodeIdentifier (required);
  parent: ParentReference;                 // + fractional index (unchanged)
  x: AxisBinding;  y: AxisBinding;
  width: SizeIntent;  height: SizeIntent;
  min_width: SizeFixed;  max_width: SizeFixed;      // nullable tables, not sentinels
  min_height: SizeFixed; max_height: SizeFixed;
  aspect_ratio: CGSize;                    // (0,0) ⇒ unset (existing convention)
  rotation: float = 0;
  flow: Flow = InFlow;  grow: float = 0;  self_align: SelfAlign = Auto;
  opacity: float = 1;  blend_mode: LayerBlendMode = PassThrough;
  mask_type: LayerMaskType;  effects: LayerEffects;
  active: bool = true;  locked: bool = false;  name: string;
}

union NodePayload { FramePayload, TrayPayload, ShapePayload, ImagePayload,
                    TextPayload, EmbedPayload, VectorPayload, GroupPayload,
                    BoolPayload, LensPayload }

table NodeSlot { header: NodeHeader (required); payload: NodePayload; }
```

Consequences for the current draft: `LayerTrait.layout`,
`LayoutPositioningBasis`, `post_layout_transform`-as-rotation-home are
superseded; `post_layout_transform(_origin)` slots are retired in favor of
the `lens` kind (one home, not two). `CanonicalLayerShape` survives nearly
verbatim as `ShapePayload`'s descriptor.

---

## 10. Harness scorecard

| harness          | verdict                  | note                                                                                                                                                                                           |
| ---------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 readability   | **pass**                 | §7; no matrix outside `lens`                                                                                                                                                                   |
| H2 gestures      | **pass**                 | drag → 2 offsets; resize → 1–2 fields; rotate boxed → 1 field; rotate group → 3 fields (compensation, single node); reads always answerable                                                    |
| H3 CRDT          | **pass w/ named caveat** | all intent = scalars/enums; no coupled tuples except gesture-level pairs (drag x+y, Span a+b) — merged states valid, compound intent not reconstructed                                         |
| H4 layout        | **pass**                 | §6 single-pass; rotated-in-flex defined (§5); x-write under flow = typed error; fill-under-hug resolved by standard flex (grow distributes _available_ space; hug uses basis sizes — no cycle) |
| H5 single source | **pass**                 | matrices tier-2 only; no atan2/decompose anywhere in steady state; lens-only-rotate flagged                                                                                                    |
| H6 coverage      | **pass**                 | §8 matrix complete, 0 undefined cells                                                                                                                                                          |
| H7 animation     | **pass**                 | channels = header scalars (layout-coupled lane) or lens op params (compositor lane); winding representable (scalar degrees); overrides tier-3, never serialized                                |
| H8 capability    | **pass**                 | full 2×3 + 3D representable via `lens`; import policy = wrap, never silent loss                                                                                                                |
| H9 encoding      | **pass**                 | §9; unset structural, evolution additive                                                                                                                                                       |
| H10 hot loops    | **pass**                 | resolved tier materializes to the existing dense-record shape (`NodeGeoData` becomes the tier-2 record, minus its schema/rotation dualities)                                                   |

**Declared trades** (from the tension map): header uniformity costs the
`ignored-by-rule` cells in §8; legibility costs a wrapper node for skew;
layout-visible rotation costs reflow on rotation _edits_ under flex (motion
goes to lens channels); intent storage costs read-indirection (already paid —
the resolved tier is today's geometry cache).

---

## 11. What this abolishes (runtime + format deltas, coarse)

- Per-node `transform: AffineTransform` fields — gone (P1). `math2`'s
  `rotation()` / `set_rotation()` leave the steady-state pipeline; the
  orphaned `from_box_center` becomes _the_ transform constructor.
- `LayoutPositioningBasis` (Cartesian/Inset/deprecated-Anchored) — gone (P2).
- Container `position + rotation` vs leaf `transform` split — gone; one
  header (P1, P8).
- `resolve_layout`'s per-kind branch forest — replaced by §6's four phases.
- `NodeGeoData.schema_transform`/`rotation` duality — the tier-2 record holds
  resolved values only.
- Six shape node kinds → one `shape` kind + descriptor.
- `InitialContainer` as a node kind — a viewport-bound `frame`.

## 12. Open items this model defers

Percent/scale offsets in `Pin` (additive); AABB-edge vs box-edge binding for
rotated absolute pins (§2.1 note); grid mode; anchor-to-node (WG Level 4 —
`Pin` grows a target ref, additive); attributed-text run encoding inside
`TextPayload`; `bool` operand semantics (does a `bool` child render
standalone — kept as today); tray's exact root-treatment semantics.
