---
title: "Element IR — Typed In-Memory Model for svg-editor"
description: "Proposal for a typed per-node element IR that replaces tag-switch intent dispatch in @grida/svg-editor with capability-gated records, centralising round-trip invariants."
keywords:
  - svg
  - svg-editor
  - element-ir
  - ir
  - capabilities
  - round-trip
tags:
  - internal
  - svg
  - wg
doc_tasks:
  - update
format: md
---

# Element IR

> Reviews and proposes a redesign of an in-flight `@grida/svg-editor` implementation that is **not yet on `main`**. Source paths under `packages/grida-svg-editor/src/` and the migration sketch referenced below describe a forthcoming implementation slice; the proposal stands independently.

## Abstract

The current `@grida/svg-editor` dispatches edit intents by branching on the
SVG element tag. `apply_resize` is a nine-arm `switch` over `rect | image |
use | circle | ellipse | line | polyline | polygon | path | text` that
writes attributes directly; `apply_translate` is a parallel eight-arm
switch; `apply_rotate` writes `transform=` after consulting a separate
classifier whose verdict strings have already drifted out of sync with the
gate (`is_resizable_node` checks `"single_rotate"` while
`core/transform/classify.ts` emits `"single_rotate_only"`,
`intents.ts:800`). Each new (intent × element) cell pushes the `if/else`
count quadratically; round-trip invariants — rotation-pivot tracking on
resize, refusal taxonomy for unsupported transforms, capability gates —
are enforced in prose at each write site and silently violated when
prose drifts. The pivot-drift blocker in `feedback-transform.md` is one
instance of this class.

This document proposes a **typed in-memory element IR**: a per-node
typed view over the parsed SVG AST that exposes element-typed
capabilities (`is_resizable`, `is_rotatable`, `pivot_authoritative_for_rotate`,
`accepts_paint`, …) and typed geometry mutators (`set_local_box`,
`set_rotation`, `set_translation`). Commands dispatch on capability,
not tag. Refusals are a typed `RefusalReason` enum, surfaced rather
than swallowed. Round-trip invariants the bytes-side cannot express
(e.g. "an editor-authored `rotate(θ cx cy)` recomposes its pivot when
the local box changes") become IR invariants enforced by the mutator
methods.

The IR is a **typed view, not alternative storage**. The parsed AST
remains the in-memory store; the file bytes remain the source of truth.
The IR is rebuilt from the AST on every load and discarded on `dispose`.
P1 round-trip is preserved by the parse-side source-position trivia
store (whitespace, attribute order, unknown-namespace content), which
the serializer reads — the IR never touches it.

Scope: **design only**. No code in this doc. The implementation
phasing — what survives verbatim, what gets deleted, what gets an
adapter — lives next to the package as
`packages/grida-svg-editor/docs/element-ir-migration.md` (lands with
the implementation slice).

## Goals

- **Absorb the (intent × element) matrix.** Every cell in
  `svg-editor-intent-matrix.md §4` becomes one of: a typed capability,
  a typed `RefusalReason`, or an `n/a` that the dispatcher recognises
  by capability absence. Commands stop branching on tag.
- **Encode round-trip invariants the AST cannot express.** Specifically:
  when an editor-authored `rotate(θ cx cy)` is co-resident with a
  geometry mutator that changes the local centre, the IR is responsible
  for re-emitting the pivot. The AST holds bytes; only the IR knows
  that this particular `rotate(...)` is "the editor's own pivot, please
  track me".
- **Make refusals explicit and discoverable.** Replace silent gate
  failures (`is_resizable_node` typo returning `false`, `apply_resize`
  text-arm returning early on non-corner drags) with a typed
  `Result<(), RefusalReason>` shape that the UI can surface as a chip.
- **Single seam for new element types and new commands.** Adding
  `<foreignObject>` resize support is "implement the capability on
  the `Opaque` IR variant"; adding a `flip_horizontal` command is
  "add a capability + dispatch row", not a tag-switch in every
  file under `core/`.
- **Preserve the headless / surface separation.** The IR is headless.
  It does not call `getBBox` / `getScreenCTM`. The surface (DOM,
  in-process renderer, test harness) feeds it geometry when the IR
  needs world-space queries; the IR returns typed answers.

## Non-goals

- **Not on-disk format.** Bytes remain the file. The IR is never
  serialised to disk.
- **Not the serialization tree.** There is no IR → serializer pass.
  The serializer reads the parsed AST plus the trivia store; the IR
  is the _write path_ into the AST, not the _read path_ out of it.
- **Not a permanent `NodeId` allocator across loads.** Beyond what
  the public API already guarantees within a single editor lifetime,
  the IR makes no claim that the IR-node identity for `<rect id="foo">`
  before `load()` equals the IR-node identity after. The id stability
  story lives in the AST / `SvgDocument` layer.
- **Not a renderer.** No paint, no compositing, no hit-test. The
  surface owns rendering; the IR owns _what is editable and how_.
- **Not a subsumer of existing packages.** `@grida/cmath` is still
  the math library, `@grida/history` is still the undo store,
  `@grida/mixed-properties` is still the mixed-values layer, and
  `core/rotate-pipeline/` is still the gesture orchestrator. The
  IR is what those packages dispatch _into_; it does not replace
  any of them.
- **Not a CSS engine.** The cascade-carrier resolver in
  `core/properties.ts:choose_write_carrier` stays. The IR exposes
  `accepts_paint` / `accepts_text_edit` as capabilities; the
  resolver decides _where_ the write lands.

## Relationship to SVG bytes and the parsed AST

```
                                        ┌─────────────────────────────┐
                                        │  trivia store               │
                                        │  - whitespace               │
                                        │  - attribute order          │
                                        │  - unknown-namespace attrs  │
                                        │  - comments / PIs           │
                                        │  - CSS source text          │
                                        └────────────┬────────────────┘
                                                     │ read-only
                                                     │
                                                     ▼
   file bytes ──parser──▶ parsed AST ──serializer──▶ file bytes (clean)
                              ▲
                              │ AST = in-memory store
                              │
                       ┌──────┴──────┐
                       │   IR builder │   (per-load, throwaway on dispose)
                       └──────┬──────┘
                              │ visit AST nodes, classify, attach capabilities
                              ▼
                       ┌─────────────┐
                       │ element IR  │   (typed view, capability-keyed)
                       └──────┬──────┘
                              │
                              │ commands dispatch on capability
                              ▼
                       ┌─────────────┐
                       │ IR mutators │   (set_local_box, set_rotation, …)
                       └──────┬──────┘
                              │ write through to AST in-place
                              ▼
                          parsed AST  (mutation observable; bytes follow on serialize)
```

**Where each piece lives in `packages/grida-svg-editor/src/`:**

- `core/document/` — parser, AST, `SvgDocument` (already exists, today
  rooted at `src/document.ts` and `src/core/document.ts`).
- `core/trivia/` — source-position trivia store (today partially
  implicit in `SvgDocument`'s attribute order preservation).
- `core/ir/` — **new**. IR node types, capability enum, mutator
  methods, IR builder.
- `core/intents.ts` — shrinks to a thin dispatcher that maps gesture
  shapes to `editor.ir.find(id).set_local_box(...)` calls. The nine
  arms of `apply_resize` collapse into the IR.
- `core/serializer/` — reads AST + trivia; never reads the IR.

The IR is a **CONTRACT**, not a **STORE**. Concretely:

- The IR does not own attribute values. `editor.ir.find(rectId).local_box`
  is computed from `doc.get_attr(rectId, "x" | "y" | "width" | "height")`
  at call time (with caching where it matters for perf).
- The IR does not own children. `editor.ir.find(groupId).children` walks
  the AST.
- An IR mutator (`set_local_box({x, y, w, h})` on a `BoxPrimitive`)
  ultimately calls `doc.set_attr(id, "x", …)` etc. The AST is the
  point of mutation; the IR is the typed way to reach it.
- The IR is rebuilt on `load_svg`. Within a session, the IR is
  incrementally updated by the same mutator that wrote to the AST
  (the mutator knows what it changed and can patch the IR's cached
  fields without re-walking).

This stance is what makes the README anti-goal "Not a private IR. SVG
is the source of truth" still true. "Private IR" in that anti-goal
means "alternative storage that the file is projected from." The IR
proposed here is not storage — the AST is — and is not the
serialization tree — the AST + trivia is. It is an internal,
typed access layer over the same bytes.

## Node taxonomy

Group by **edit-shape**, not by SVG tag. The matrix in `§4.1` already
shows the natural clusters: `rect | image | use` share the
`(x, y, width, height)` mutator; `polyline | polygon` share `points`;
gradients / patterns / clip-paths / masks / filters have no
canvas-edit semantics and only edit through the `defs.*` registry.
The taxonomy below has **12 variants**; the per-tag → IR-variant
mapping is many-to-one for shapes, one-to-one for containers and
defs-resources.

### `BoxPrimitive` — `<rect>`, `<image>`, `<use>`

The `(x, y, width, height)` family. `<use>` lands here when it is being
_positioned_ (the dominant editor use case); see `Reference` below for
the case where `<use>` semantics dominate.

- **Declared frame**: local origin at `(x, y)` (top-left in current user
  coords). `width × height` extent along positive axes. `transform=` applies
  to this whole frame.
- **Geometry mutators**: `set_local_box({x, y, w, h})`, `set_translation({dx, dy})`.
- **Capabilities**: `is_resizable: true`, `is_rotatable` per `is_rotatable()`
  taxonomy in §6, `pivot_authoritative_for_rotate: true` (the editor _owns_
  the centre-pivot for rotated boxes), `accepts_paint: true` (except
  `<image>`: stroke ok, fill no), `accepts_text_edit: false`,
  `editable_children: false`.
- **Invariants**: `w, h ≥ 0.001` (spec floor); pivot recomposition when
  `is_editor_authored_shape()` is true (§6); `<image>` `href` is held as
  the raw declared string, not a decoded blob.

### `Circle` — `<circle>`

- **Declared frame**: local origin at `(cx, cy)`. Radius `r ≥ 0`.
- **Geometry mutators**: `set_centre({cx, cy})`, `set_radius(r)`,
  `set_translation`. A non-uniform "set local box" is _refused_
  (`UnsupportedConversion::CircleToEllipse`) rather than silently
  switching the tag; the editor's policy is "circle stays a circle until
  the user explicitly converts."
- **Capabilities**: `is_resizable: true` (uniform), `is_rotatable: true`
  (rotation is geometrically a no-op but matters for inherited stroke /
  marker frames), `pivot_authoritative_for_rotate: true`, `accepts_paint: true`.
- **Invariants**: uniform-scale on resize; refuse axis-distinct scaling.

### `Ellipse` — `<ellipse>`

- **Declared frame**: local origin at `(cx, cy)`; semi-axes `rx`, `ry`.
- **Geometry mutators**: `set_centre`, `set_radii({rx, ry})`,
  `set_translation`. Supports independent x/y resize natively.
- **Capabilities**: `is_resizable: true`, `is_rotatable: true`,
  `pivot_authoritative_for_rotate: true`, `accepts_paint: true`.
- **Invariants**: preserves `auto` token if either `rx` or `ry` was
  `auto` in the source — the IR remembers the spelling so the
  serializer can re-emit it.

### `LineSegment` — `<line>`

- **Declared frame**: two endpoints in the local frame, no implicit centre.
- **Geometry mutators**: `set_endpoints({p1, p2})`, `set_translation`.
- **Capabilities**: `is_resizable: true` (via endpoint mutation; corner
  drags rescale around origin per current `apply_resize` behaviour),
  `is_rotatable: true`, `pivot_authoritative_for_rotate: true`,
  `accepts_paint: true` (fill is legal but unrendered — preserve, don't
  strip).
- **Invariants**: preserves author's fill attribute even though it
  doesn't paint.

### `PointPolyline` — `<polyline>`, `<polygon>`

A list of points; no curves.

- **Declared frame**: every point in the local frame.
- **Geometry mutators**: `set_points(points[])`, `set_translation`,
  `set_local_box` (rescales every point around origin). `<polygon>` vs
  `<polyline>` is a tag-level flag on the IR variant
  (`closed: boolean`); converting between them is an explicit
  `convert_to_polyline()` / `convert_to_polygon()` mutator, never silent.
- **Capabilities**: `is_resizable: true`, `is_rotatable: true`,
  `pivot_authoritative_for_rotate: true`, `accepts_paint: true`,
  `editable_children: false`.
- **Invariants**: the `points` source-token sequence (whitespace,
  comma vs space, sign-packed `1-2`) is preserved through the trivia
  store; the IR holds parsed `Vec2[]` for math but the serializer
  writes back via trivia-respecting emission when no point moved.

### `PathShape` — `<path>`

- **Declared frame**: every coordinate in the local frame; command
  alphabet per SVG 2 §9.3.1.
- **Geometry mutators**: `set_translation`, `set_local_box` (matrix-
  transform of `d`). The IR holds the parsed `d` as a typed segment
  array _for math_ (bbox queries, hit tests, intersection) but the
  round-trip representation stays the source `d` string — if the user
  did not touch the path data, the bytes are not re-emitted.
- **Capabilities**: `is_resizable: true`, `is_rotatable: true`,
  `pivot_authoritative_for_rotate: true`, `accepts_paint: true`,
  `editable_children: false`. Higher-level node-sculpting capabilities
  (`accepts_vertex_edit`) are flagged but **out of scope** for v0 per
  the README anti-goal "no path-node sculpting beyond what an SVG-natural
  edit supports."
- **Invariants**: `pathLength` survives edits; relative-vs-absolute
  encoding survives if `d` was not retouched (handled by trivia, not
  the IR); arc commands round-trip verbatim.

### `TextRun` — `<text>`, `<tspan>`, `<textPath>`

The text family. Distinct IR sub-variants exist (`TextRoot`, `TextSpan`,
`TextPath`) but they share a capability profile.

- **Declared frame**: `<text>` carries `(x, y)` as the anchor before
  the first glyph; `<tspan>` inherits the current text position;
  `<textPath>` is 1-D along the referenced path.
- **Geometry mutators**: `set_translation` on `<text>` and `<tspan>`
  with a single-value `x` / `y`; `set_local_box` only on `<text>`
  with a corner drag (uniform `font-size` scale — the current
  `apply_resize` text arm). `<tspan>` `set_local_box` is **refused**
  (`RefusalReason::ResizeRequiresContainingTextRoot`) rather than
  silently no-op'ing. `<textPath>` exposes `set_start_offset`,
  `set_side`, `rebind_href`; geometric drag is refused
  (`RefusalReason::TextPathDragRequiresPathEdit`).
- **Capabilities**: `is_resizable` is `true` only for `<text>` with
  a single-value `x` / `y` (the per-glyph `rotate=` / `dx` / `dy`
  arrays force `false`), `is_rotatable: true` _unless_ `rotate=`
  is set on `<text>` / `<tspan>` (per `is_rotatable` reason
  `text-with-glyph-rotate`), `accepts_paint: true`,
  `accepts_text_edit: true` when every child is a CDATA node
  (matches `is_text_edit_target` in `document.ts:413`).
- **Invariants**: `xml:space` is preserved verbatim; the IR never
  reflows or re-indents text node content.

### `Group` — `<g>`

- **Declared frame**: identity unless `transform=` is set. Does _not_
  establish a new viewport. Group dimensions are the union of children;
  the IR exposes this as a query, never as a settable field.
- **Geometry mutators**: `set_translation` (composes into `transform=`),
  `set_rotation` (composes into `transform=`). `set_local_box` is
  **refused** with `RefusalReason::GroupResizeUndefined` — the editor
  has no "rescale this group" semantic that isn't lying about per-child
  intent. (The README is explicit: "group dimensions are the union of
  children" — no group-resize.)
- **Capabilities**: `is_resizable: false`, `is_rotatable: true` (per
  `is_rotatable` taxonomy), `pivot_authoritative_for_rotate: true`,
  `accepts_paint: true` (inherited by descendants), `editable_children: true`.

### `Viewport` — `<svg>`, `<symbol>`

Both establish a new viewport.

- **Declared frame**: `(x, y, width, height)` in the parent frame;
  `viewBox` / `preserveAspectRatio` map content into that viewport.
- **Geometry mutators**: `set_local_box`, `set_view_box(box)`,
  `set_preserve_aspect_ratio(...)`. The IR exposes the
  resize-vs-rescale policy choice (`§7.5` of
  [`reference/svg/element-model.md`](../../reference/svg/element-model.md)) as
  two distinct mutators: `set_local_box` resizes the viewport;
  `set_view_box` rebinds the inner mapping. Drag-resize at the
  document edge invokes one or the other; never both silently.
- **Capabilities**: `is_resizable: true`, `is_rotatable: true`,
  `pivot_authoritative_for_rotate: false` (the outer transform on
  a `<svg>` is "conceptually on the outside" per SVG 2 §8.5 — the
  pivot policy from §6 does not apply; the IR refuses pivot
  recomposition here), `accepts_paint: true`,
  `editable_children: true`.

### `Defs` — `<defs>`

- **Declared frame**: not rendered; no frame.
- **Geometry mutators**: none. `<defs>` is a container; edits to its
  children go through the relevant `PaintServer` IR variants and the
  `defs.*` registry.
- **Capabilities**: every geometric capability `false`.
  `editable_children: true` (children appear in the hierarchy panel
  and may be edited via their own IR variants).

### `Reference` — `<use>` when reference semantics dominate

`<use>` is conceptually two things: an instance positioned in the
parent frame (`x` / `y` / `width` / `height` mutators), and a
reference to a shadow tree whose contents the editor cannot mutate
directly (per SVG 2 §5.6.1 — `NoModificationAllowedError`).

**Decision**: one IR variant, not two. `<use>` is always a
`BoxPrimitive` for its geometry mutators. The `referenced_href` field
and `shadow_tree_readonly: true` capability are properties on that
same IR node. Rationale: the user always wants to position a `<use>`;
they sometimes also want to navigate to its referent. Splitting the
type means every position-mutator dispatch has to handle two cases
that share their code. Carrying the reference as a field is cheaper.

A separate `Reference` _capability_ (rather than IR variant) carries
the reference behaviour: `is_reference: true`, `referenced_href: string`,
`shadow_tree_observable: true | false` (the IR exposes the resolved
shadow tree as **read-only observable nodes** for hit-testing and
selection navigation; per-shadow-node mutators are absent — every
attempt returns `RefusalReason::ShadowTreeReadOnly`).

### `PaintServer` — `<linearGradient>`, `<radialGradient>`, `<pattern>`, `<marker>`, `<clipPath>`, `<mask>`, `<filter>`

Named, referenced resources. Their canvas-level edit story is empty
(none of them paint as a scene node); their _defs_ edit story is the
typed `defs.*` registry from the README.

- **Declared frame**: per-resource; see
  [`reference/svg/element-model.md`](../../reference/svg/element-model.md)
  sections for each tag. The IR holds the typed definition shape
  (`GradientDefinition`, `PatternDefinition`, …) and exposes it via
  the `defs.*` registry, not as a scene mutator.
- **Geometry mutators**: none at the scene level. Resource-level
  mutators (`set_stops(stops)`, `set_x1/y1/x2/y2`) live on the
  registry API.
- **Capabilities**: `is_resizable: false`, `is_rotatable: false`,
  `accepts_paint: false`, `editable_children: false` _for canvas
  commands_. The hierarchy panel surfaces them; the canvas does not.

### `Opaque` — `<foreignObject>`, `<switch>` content branches, `<style>` blocks, unknown-namespace subtrees

The IR's typed answer for "we can read this, but we will not pretend
to edit it." Per
[`reference/svg/element-model.md §Hazards`](../../reference/svg/element-model.md#hazards-cross-cutting).

- **Declared frame**: for `<foreignObject>` the SVG-side rectangle
  is the frame; for `<switch>` and `<style>` there is no canvas frame.
- **Geometry mutators**: for `<foreignObject>` only,
  `set_local_box` and `set_translation` are implemented (the
  SVG-side rectangle is editable; the foreign content inside is
  not). All other element types in this variant **refuse every
  mutator** with `RefusalReason::ForeignNamespaceContent` (for
  `<foreignObject>` body), `RefusalReason::CascadeAmbiguity`
  (for `<style>`), or `RefusalReason::SwitchBranchAmbiguity`
  (for `<switch>` content).
- **Capabilities**: typically all `false`; `<foreignObject>` is the
  exception with `is_resizable: true`.
- **Invariants**: every observation surface (tree, properties) lists
  these nodes honestly. They are never silently hidden.

## Transform model

Build directly on the equivalence classes from
[`reference/svg/transform-and-frame.md §8`](../../reference/svg/transform-and-frame.md).

### `LocalTransform` value type

```
LocalTransform =
  | Identity
  | LeadingTranslate { tx, ty }
  | SingleRotate { angle_deg, explicit_pivot: bool, pivot?: {cx, cy} }
  | LeadingTranslateThenSingleRotate {
        tx, ty,
        angle_deg, explicit_pivot: bool, pivot?: {cx, cy}
    }
  | Matrix { a, b, c, d, e, f }
  | Mixed { preserved_source: string }
```

The `explicit_pivot` flag is set by the parser. `rotate(30)` parses to
`SingleRotate { angle_deg: 30, explicit_pivot: false }`;
`rotate(30 0 0)` parses to `SingleRotate { angle_deg: 30,
explicit_pivot: true, pivot: { cx: 0, cy: 0 } }`. These are
observationally identical for rendering, but **distinct at the IR
layer** — round-trip requires preserving the spelling (per
[`reference/svg/transform-and-frame.md §3` "Round-trip caveat"](../../reference/svg/transform-and-frame.md)).

`Mixed { preserved_source }` is the IR's "we refuse to lie about the
decomposition" variant. Any transform list that doesn't match the
shapes above (`scale(...) skewX(...) rotate(...)`, repeated rotates,
etc.) lands here. The serializer writes back `preserved_source` verbatim
when no mutator touched the transform; mutators on a `Mixed` LocalTransform
refuse with `RefusalReason::UnsupportedTransformShape { class: "mixed" }`.

`Matrix` is preserved separately from `Mixed`: it is observationally
the most general form, but unlike `Mixed` it has a canonical
serialization (`matrix(a b c d e f)`), so the IR can mutate it (compose
a leading translate, recompose into a `SingleRotate` after a
user-invoked `flatten_transform`) where it cannot mutate `Mixed`.

### `is_editor_authored_shape()`

A capability flag derived from the variant:

```
is_editor_authored_shape() :=
    (variant is SingleRotate AND explicit_pivot is true)
  OR (variant is LeadingTranslateThenSingleRotate AND explicit_pivot is true)
```

These are exactly the forms the `core/rotate-pipeline/` orchestrator
emits — `transform="rotate(θ cx cy)"` or
`transform="translate(tx ty) rotate(θ cx cy)"`. When true, the IR
_owns_ the pivot — the editor wrote it, the editor renormalises it.

When false (`Identity`, `LeadingTranslate` only, `SingleRotate` with
`explicit_pivot: false`, `Matrix`, `Mixed`), the IR does **not own**
the pivot. The author wrote that transform, possibly with an
intentional world-space pivot anchor (e.g. corner of a parent group);
silently recomposing it would corrupt their intent. The IR refuses
pivot-relevant mutations under `RefusalReason::UnauthoredRotatePivot`,
not silently no-ops. The user's recourse is `flatten_transform` →
re-rotate, the documented escape valve.

### Recomposition invariant

When an IR node's local geometry changes (`set_local_box`,
`set_centre`, `set_radii`, `set_endpoints`, `set_points`,
`set_translation`) and `is_editor_authored_shape()` is true on its
`LocalTransform`, the IR rewrites the pivot to the new local centre
before the mutation returns. Concretely, on a `BoxPrimitive`:

```
set_local_box({x', y', w', h'}):
  doc.set_attr(id, "x" | "y" | "width" | "height", …)
  if local_transform.is_editor_authored_shape():
    new_cx = x' + w' / 2
    new_cy = y' + h' / 2
    rewrite local_transform.pivot to (new_cx, new_cy)
    doc.set_attr(id, "transform", emit(local_transform))
```

This is the IR-level absorption of the FEEDBACK_TRANSFORM pivot-drift
blocker. The mutator owns the recompose math; the dispatcher does not
need to know. No per-arm patch in `apply_resize`.

When `is_editor_authored_shape()` is false, `set_local_box` succeeds
but the IR does _not_ touch the transform. The author owns the pivot;
the editor leaves it. This matches the existing `apply_resize` semantic
for non-rotated rects.

### Mutation API

Typed methods per IR variant; no string commands. Skeleton:

```
BoxPrimitive:
  set_local_box(LocalBox) -> Result<(), RefusalReason>
  set_translation(Vec2)   -> Result<(), RefusalReason>
  set_rotation(angle: deg, pivot?: Vec2) -> Result<(), RefusalReason>

Circle:
  set_centre(Vec2)
  set_radius(number)
  set_translation, set_rotation (as above)

… one mutator surface per variant …
```

The dispatcher (`apply_resize` and friends) becomes:

```
apply_resize(id, target_box):
  let node = editor.ir.find(id)
  if not node.capabilities.is_resizable:
    return Err(RefusalReason::ElementNotResizable)
  return node.set_local_box(target_box)  // typed method, owns its math
```

The nine-arm switch in `core/intents.ts:499` disappears.

## Capabilities and dispatch

| Command (public)            | Capability(s) required                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `translate` / `nudge`       | (always available; every variant has `set_translation` or refuses)                                                    |
| `resize_to`                 | `is_resizable`                                                                                                        |
| `rotate` / `rotate_to`      | `is_rotatable`                                                                                                        |
| `flatten_transform`         | (always available; mutates `LocalTransform`)                                                                          |
| `align`                     | `is_translatable` (every variant has it)                                                                              |
| `set_property(name, …)`     | (no capability gate; carrier resolver decides)                                                                        |
| `set_paint(channel, …)`     | `accepts_paint`                                                                                                       |
| `set_text(value)`           | `accepts_text_edit`                                                                                                   |
| `enter_content_edit`        | `accepts_text_edit` (text family) or `editable_children` (groups/viewports)                                           |
| `group`                     | (handled by group policy; see `packages/grida-svg-editor/docs/grouping.md` once it lands — IR exposes `is_groupable`) |
| `reorder` / `remove`        | (tree-shape, not geometry; IR exposes `is_in_scene_tree`)                                                             |
| `insert` / `insert_preview` | (creates a fresh IR node; capabilities derive from the constructed variant)                                           |

The dispatcher's loop:

```
for id in selection:
  let node = editor.ir.find(id)
  let cap = capability_for(command)
  if not node.capabilities[cap]:
    refusals.push({ id, reason: derive_refusal(node, command) })
    continue
  result = node[method_for(command)](args)
  if result.is_err():
    refusals.push({ id, reason: result.err() })

emit_refusals(refusals)  // surface to UI; never silent
```

This is the entire dispatcher. The per-tag knowledge that lives in
`apply_translate`, `apply_resize`, `capture_translate_baseline`,
`capture_resize_baseline`, `baseline_anchor`, `is_resizable` (six
sites in `intents.ts`, see matrix §6) all move into the IR variants.
The dispatcher knows about _capabilities_, not _tags_.

## Refusal taxonomy

Typed enum; one variant per distinct reason a command can be refused.
Returned in `Result<(), RefusalReason>` from every IR mutator and
collected into a `refusals: ReadonlyArray<{id, reason}>` field on the
command result that the UI surfaces as a chip / toast.

```
RefusalReason =
  | ElementNotResizable                    // capability absent
  | ElementNotRotatable                    // capability absent

  // transform-shape refusals (from §6 + is_rotatable today)
  | UnsupportedTransformShape { class: "matrix" | "mixed" | "single_scale" | "single_skew" | "compound" }
  | UnauthoredRotatePivot                  // user-authored pivot, IR refuses to renormalise

  // node-state refusals (from is_rotatable today)
  | AnimatedProperty { property: "transform" | "x" | "fill" | … }
  | CssPropertyTransform                   // style="transform: …" on the element
  | TextWithGlyphRotate                    // text/tspan has rotate= attr

  // structural refusals (from group/use/style)
  | ForeignNamespaceContent                // foreignObject body, MathML, etc.
  | SwitchBranchAmbiguity                  // edit would touch only one branch
  | CascadeAmbiguity                       // <style> rule edit; specificity uncertain
  | ShadowTreeReadOnly                     // <use> shadow-tree mutation attempt
  | GroupResizeUndefined                   // <g>.set_local_box — see Group taxonomy

  // path-specific
  | PathStructureRequired                  // command requires typed segment edit (out of scope v0)

  // text-specific
  | ResizeRequiresContainingTextRoot       // tspan.set_local_box — must route to <text>
  | TextPathDragRequiresPathEdit           // <textPath> drag — edit referenced path

  // ref-count refusals
  | DefsResourceInUse { ref_count: number }  // defs.*.remove with live references

  // multi-selection refusals
  | MultiSelectionMixedShapes              // resize across nodes with distinct LocalTransform variants
```

Each variant carries the data the UI needs to render an actionable
chip. `UnsupportedTransformShape { class: "mixed" }` says "Flatten
Transform and try again." `UnauthoredRotatePivot` says "this rotation
has a pivot the editor didn't author; Flatten Transform to take
ownership." `DefsResourceInUse` says "still referenced by N nodes."

This replaces the silent `is_resizable_node` → `false` failure modes
in today's gates.

## Intent matrix coverage

Walk through every non-trivial cell from `svg-editor-intent-matrix.md`.
Format: cell verdict today → IR landing.

### Transform commands

| Cell                                                | Today's verdict                   | IR landing                                                                                                                                                                               |
| --------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `translate` — `rect`/`image`/`use`                  | native                            | `BoxPrimitive.set_translation`                                                                                                                                                           |
| `translate` — `circle`/`ellipse`                    | native                            | `Circle.set_translation` / `Ellipse.set_translation`                                                                                                                                     |
| `translate` — `line`                                | native                            | `LineSegment.set_translation`                                                                                                                                                            |
| `translate` — `polyline`/`polygon`                  | native (`points` rewrite)         | `PointPolyline.set_translation`                                                                                                                                                          |
| `translate` — `path`                                | geometry-rewrite (`d` re-encoded) | `PathShape.set_translation`; the IR documents the heavy diff cost in the migration doc                                                                                                   |
| `translate` — `text`/`tspan`                        | native (`x`/`y`)                  | `TextRun.set_translation` (with `tspan` rejecting if it inherits position)                                                                                                               |
| `translate` — `g` and any element with `transform=` | transform-only                    | `Group.set_translation` composes a leading translate into `LocalTransform`; same path for any variant whose declared frame doesn't expose `x`/`y`                                        |
| `resize_to` — `rect`/`image`/`use`                  | native (no pivot recompose ⚠)     | `BoxPrimitive.set_local_box` — invariant in §6 absorbs the pivot drift                                                                                                                   |
| `resize_to` — `circle`                              | native (uniform min(sx,sy))       | `Circle.set_radius` — capability flag `is_uniform_scale_only: true` documents the choice                                                                                                 |
| `resize_to` — `ellipse`                             | native                            | `Ellipse.set_radii`                                                                                                                                                                      |
| `resize_to` — `line`                                | native                            | `LineSegment.set_endpoints` rescaled around origin                                                                                                                                       |
| `resize_to` — `polyline`/`polygon`                  | geometry-rewrite                  | `PointPolyline.set_local_box` rescales every point; explicit invariant about token-trivia preservation                                                                                   |
| `resize_to` — `path`                                | geometry-rewrite (`d` matrix-tx)  | `PathShape.set_local_box` — diff cost documented; explicit `set_translation` separate from full resize                                                                                   |
| `resize_to` — `text`                                | mixed (corner uniform, no edge)   | `TextRun.set_local_box`; edge-drag refuses with `ResizeRequiresContainingTextRoot` if the IR routes to `<tspan>`; non-corner refuses with a typed reason rather than silent early-return |
| `resize_to` — `tspan`                               | unimplemented                     | Refused: `RefusalReason::ResizeRequiresContainingTextRoot`                                                                                                                               |
| `resize_to` — `g`                                   | refused (essential)               | Refused: `RefusalReason::GroupResizeUndefined`                                                                                                                                           |
| `resize_to` — `svg`/`symbol`                        | refused (essential)               | `Viewport.set_local_box` — _implemented_ per §6's `Viewport` taxonomy; the previous refusal becomes a capability that exists                                                             |
| `resize_to` — `switch`                              | refused (essential)               | Refused: `RefusalReason::SwitchBranchAmbiguity`                                                                                                                                          |
| `resize_to` — `foreignObject`                       | refused (accidental)              | `Opaque.set_local_box` — the SVG-side rectangle is now editable; foreign body still refused                                                                                              |
| **resize on `single_rotate_only` element**          | refused (accidental, typo @ 800)  | Disappears. Capability check is on the IR's `is_resizable` flag, not a tag-string compare                                                                                                |
| `rotate` — every shape with clean transform         | transform-only                    | `Variant.set_rotation(angle, pivot)`; emits `LocalTransform::SingleRotate { explicit_pivot: true }`                                                                                      |
| `rotate` — text/tspan with `rotate=`                | refused essential                 | Refused: `RefusalReason::TextWithGlyphRotate`                                                                                                                                            |
| `rotate` — element with `style="transform:…"`       | refused essential                 | Refused: `RefusalReason::CssPropertyTransform`                                                                                                                                           |
| `rotate` — element with `<animateTransform>`        | refused essential                 | Refused: `RefusalReason::AnimatedProperty { property: "transform" }`                                                                                                                     |
| `rotate` — element with `Mixed` transform           | refused essential                 | Refused: `RefusalReason::UnsupportedTransformShape { class: "mixed" }`                                                                                                                   |
| `flatten_transform`                                 | transform-only (writes matrix)    | `LocalTransform` → `Matrix` mutator. The post-flatten rotate refusal (§7.3 of matrix) is acknowledged in §15                                                                             |
| `align`                                             | native (via translate)            | Translates per member; same capability path                                                                                                                                              |

### Property / paint / content commands

| Cell                                              | Today's verdict           | IR landing                                                                                              |
| ------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `set_property` — every element                    | native (carrier resolver) | No capability gate (the carrier resolver decides); IR exposes `provenance` for the inspector            |
| `set_paint` — shape / text / group                | native                    | Capability `accepts_paint`; IR variants where it is false (`PaintServer`, most `Opaque`, `Defs`) refuse |
| `set_paint` — `image`                             | n/a                       | `BoxPrimitive` with `accepts_paint: stroke_only` — the IR records the asymmetry                         |
| `set_text` — `text`/`tspan` (CDATA-only children) | native                    | `TextRun.set_text` gated by `accepts_text_edit`                                                         |
| `set_text` — `text`/`tspan` with mixed content    | refused                   | Refused: `RefusalReason::TextMixedContent` (new variant) — surface the reason rather than silent no-op  |
| `enter_content_edit`                              | mode flip                 | Capability gate (`accepts_text_edit` or `editable_children`) — no IR mutation                           |

### Structure commands

| Cell                                                                              | Today's verdict                  | IR landing                                                                                                                                |
| --------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `reorder` — every selectable element                                              | native                           | Tree-level operation on the AST; IR exposes `parent` / `children` queries, not mutators                                                   |
| `remove` — every selectable element                                               | native                           | Tree-level; capability `is_removable` is `false` only on `Defs` (delegates to ref-count check)                                            |
| `remove` — paint-server / marker / clipPath / mask / filter via `commands.remove` | unimplemented (ref-count bypass) | `PaintServer.is_removable: false` for direct `commands.remove`; routes through `defs.*.remove`                                            |
| `group` — every group-eligible element                                            | native                           | Group policy lives in `packages/grida-svg-editor/docs/grouping.md` (lands with the implementation slice); IR exposes `is_groupable: bool` |
| `group` — `tspan`, `svg`, `symbol`, `defs`, `switch`, paint-servers               | refused essential                | Refused: `RefusalReason::NotGroupable`                                                                                                    |
| `insert` — `rect`/`ellipse`/`line`                                                | native (with default paint)      | IR builder constructs a `BoxPrimitive` / `Ellipse` / `LineSegment` with capability-default paint                                          |
| `insert` — other tags                                                             | unimplemented                    | IR builder is the seam; adding an `<image>` insert is "implement `BoxPrimitive.construct_default()` for image"                            |

### Commands with no per-element variance

`undo`, `redo`, `load_svg`, `serialize_svg`, `set_mode`, `enter_scope`,
`exit_scope`, `select*`, `deselect`, `tidy`, `defs.*`,
`preview_property`, `preview_paint` — no IR landing required; they
either operate on the editor lifecycle, the AST tree, or the
provider-backed cleanup pass.

## How FEEDBACK_TRANSFORM blockers land

Six blockers in `feedback-transform.md`. One-by-one:

1. **Pivot drift on resize** — _absorbed by §6 Recomposition Invariant._
   `BoxPrimitive.set_local_box` rewrites the pivot when
   `is_editor_authored_shape()` is true. The bug becomes structurally
   impossible. The fix in the FEEDBACK (recompose call inside the rect
   arm of `apply_resize`) is replaced by the invariant living on the
   mutator itself, applied uniformly across every IR variant that
   supports both geometry-edit and editor-authored rotation. The
   nine-arm switch goes away.

2. **Gate typo (`single_rotate` vs `single_rotate_only`)** — _absorbed
   by §7 Capabilities and Dispatch._ The gate is `node.capabilities.is_resizable`,
   a boolean. String compares against classifier verdicts disappear. The
   typo cannot recur because the classifier no longer drives the gate.

3. **Snap on rotated elements** — _partial — handed off to §12._ The
   IR exposes `polygon_in_doc_space()` per variant. The snap engine
   consumes that, not `getBBox()`. The snap-engine refactor is **out of
   scope for this IR pass** but the IR provides the data. Flagged in
   §15.

4. **Headless `commands.resize_to` vs gesture divergence** — _absorbed
   by §13._ `commands.resize_to` and the gesture path both call
   `editor.ir.find(id).set_local_box(...)`. The divergence cannot exist
   because there is one mutator.

5. **Multi-selection mixed rotations** — _absorbed by §11._ Per-member
   gesture; N independent chromes; no group-resize. The IR refuses to
   construct a single shape for unlike rotations because the
   `MixedView<LocalTransform>` exposes the heterogeneity rather than
   averaging it away.

6. **Camera composition fragility** — _acknowledged by §14, not
   absorbed._ The IR is headless and does not see the camera. The
   `shape_of` / `getScreenCTM` math is a surface concern. The IR
   documents the assumption (HUD camera identity for svg-editor) and
   names the seam where it would change if the HUD camera became
   non-identity. The clean fix described in FEEDBACK*TRANSFORM
   (emit matrix in doc space) is \_outside* the IR; this design does
   not block it but does not perform it.

All six accounted for. The first five land cleanly; the sixth is
honestly out of IR scope and noted in §15.

## Multi-selection

Multi-selection composes per-node IR views into a typed `MixedView`,
per `@grida/mixed-properties` patterns (P5 — separate package). The
shape:

```
editor.ir.selection(): MixedView<IRNode>
```

When the selection is homogeneous (every member has the same
capability set and compatible `LocalTransform` variant), the
dispatcher applies the command uniformly. When it is heterogeneous,
the dispatcher applies per-member, collecting refusals.

**Specifically for resize / rotate with members at different
rotations**: the IR refuses to construct a single `transformed`
shape envelope. Each member's gesture path uses its own
`SelectionShape::transformed`; the HUD renders N independent chromes
(matching the FEEDBACK author's punt). The "group of unlike rotations"
type does not exist in the IR — this is a deliberate refusal, not
an oversight.

If a unified group bbox is requested (`align`, `selection_bounds()`),
it is computed honestly as the union of per-member doc-space
polygons. The result is an AABB in doc space; it is documented as
"the union of the selection's visible footprints" and not as "the
group's local frame," which would be a lie when rotations differ.

## Snap on rotated elements

The IR exposes a `polygon_in_doc_space(): Vec2[]` query per variant.
For a `BoxPrimitive` with rotation, this is the 4-corner polygon of
the rotated rect, transformed through ancestors. For a `PathShape`,
it is an approximate convex hull (path tessellation is the surface's
job; the IR does not own it). For `Opaque`, it is the SVG-side
rectangle when defined or `null`.

The snap engine in `packages/grida-svg-editor/src/core/snap/` consumes
this query. The current `getBBox()`-based logic is replaced by
polygon-aware snapping that respects edge alignment for rotated
shapes.

This snap-engine refactor is **out of scope for this IR design** but
the IR makes the necessary data structurally available. Flagged in
§15.

## Headless `commands.resize_to` divergence

The headless command and the gesture command both call
`editor.ir.find(id).set_local_box(box)`. The divergence in §7.4 of
the matrix (headless uses world AABB, gesture uses local frame)
disappears because both paths use the IR's typed mutator, which
operates in the variant's natural frame. The headless API's
`shape?: SelectionShape` parameter becomes optional metadata for
the caller's convenience; the mutation is the same.

## Camera composition

**Assumption**: the HUD camera is pinned at identity for svg-editor;
the SVG root carries a CSS `transform` for pan/zoom (per
`apply_camera_transform` in `dom.ts`). The IR is headless and does
not see the camera matrix.

The IR does **not** address camera composition. It exists in
document space; doc → screen is the surface's job. The seam where
the IR-level matrix would change if the HUD camera became
non-identity is the `polygon_in_doc_space()` query — it would
continue to return doc-space polygons; the surface (not the IR)
would adjust how it composes those polygons against a non-identity
camera.

The clean fix for camera double-transform proposed in
FEEDBACK_TRANSFORM (move `getScreenCTM()` → `getCTM()` and let HUD
camera compose) is a surface change, parallel to the IR work, not
blocked by it.

## Open questions

The design intentionally does not pin down the following; each
requires a follow-up decision.

a. **`<g>` transform composition into descendant frames.** Two viable
shapes: descendant IR nodes carry a `parent_frame_matrix: Matrix`
field flattened on demand (cheap to query, painful to invalidate on
ancestor edits); OR descendant queries walk to root each call
(always-correct, query cost scales with depth). The matrix's hot
sites (`shape_of`, `polygon_in_doc_space`) suggest caching is
needed; the invalidation story is open.

b. **`<use>` shadow-tree observability.** Per §11 (`Reference` taxonomy)
the IR exposes shadow content as read-only observable nodes. Open
question: do they appear in `editor.tree()` (the public observation
API), making selection navigation possible at the cost of visual
complexity? Or are they hidden from the tree and only surfaced via
a dedicated `editor.ir.find(use_id).shadow_tree()` query? P6 says
defer until ≥2 internal consumers; the IR provides the data either
way.

c. **NodeId stability across loads.** The IR rebuilds on every
`load_svg`. Is the IR responsible for stable IDs across reloads
(e.g. by hashing `id` + structural-path) or does the AST own this?
Today the AST owns it; the IR design does not change that. But the
IR's incremental-update story on mutation depends on knowing the
AST → IR node mapping is stable _within_ a session, which it is by
construction (the IR is a typed view, not a fresh tree).

d. **IR construction cost.** Building the IR walks every AST node
once and classifies its `LocalTransform`. For documents in the
100k-element range (rare in editor use, common in scientific SVG
dumps), this could add visible parse time. Open: incremental
rebuild on `load_svg` (reuse IR nodes whose AST source is
structurally unchanged) vs always-full rebuild.

e. **Path `d`-string parsing.** Do we parse `d` into a typed segment
array eagerly (enables `PathShape` vertex queries, costs memory
per path) or lazily (cheap when paths are large and untouched,
slow when the user starts editing)? Current implementation parses
only on demand via `SVGPathDataTransformer`; the IR could maintain
that or could parse eagerly at build time. Open until path-vertex
editing is in scope (per README anti-goal, currently it is not).

f. **Snap-engine refactor.** Out of scope here; the IR provides
`polygon_in_doc_space()`. The snap engine refactor is a separate
effort with its own design pass.

g. **Camera composition double-transform.** Out of scope here; the
IR is camera-agnostic. The surface-level fix is a separate effort.

h. **Flatten-then-rotate refusal pipeline gap.** Matrix §7.3 documents
that `flatten_transform` produces `matrix(...)` which `is_rotatable`
classifies as `Mixed` and refuses. The IR preserves this
behaviour (`Matrix` variant supports mutation, but rotation
composes against a known canonical shape, which `Matrix` is not
without decomposition). The IR could _additionally_ offer a
`decompose_to_rotation_if_possible()` mutator for the post-flatten
case; open whether to add it.

i. **`TextMixedContent` refusal.** The matrix says `set_text` is
refused (silently) when `<text>` has mixed inline `<tspan>`
children. The IR proposes `RefusalReason::TextMixedContent` as
a new variant; open whether the editor should also offer a typed
"flatten to single CDATA" mutator that the user explicitly opts
into.

## Migration shape

The implementation phasing — which IR variant lands first, what
becomes throwaway, how `apply_resize`'s `rect` arm transforms
into `BoxPrimitive.set_local_box`, how the dispatcher rewires,
and what risks attend each phase — lives in
`packages/grida-svg-editor/docs/element-ir-migration.md` (lands
with the implementation slice). That doc is the companion to this
one; it does not duplicate the design here and will not be drafted
until this design is reviewed.

## Naming review

Each IR node type and capability name should pass the `naming` skill
discipline: a strict, honest name refuses to grow.

- **`BoxPrimitive`** (not `RectLike`, not `RectFamily`). "RectLike" is
  vague — _like_ a rect _how_? Geometrically? Structurally?
  "BoxPrimitive" commits to a specific shape (a box: position +
  extent) and refuses everything else. `<image>` and `<use>` qualify
  because they expose `(x, y, width, height)` natively; `<rect>`
  qualifies because despite being more spec-rich (rx/ry), its
  _edit-shape_ is the same box. A future SVG element with a different
  edit-shape would not fit, and that's correct — it would get its own
  variant rather than dilute this one.

- **`Circle` / `Ellipse` / `LineSegment` / `PointPolyline` / `PathShape`**
  Named for the shape, not the tag. `LineSegment` over `Line` because
  the IR variant exposes "segment with two endpoints" mutators, not
  "line" (which evokes infinite-extent in math contexts).
  `PointPolyline` over `Polyline` because the variant is parameterised
  by a list of points (and disambiguates from path-based polylines a
  future feature could introduce). `PathShape` over `Path` because
  `Path` would clash with `tiny_skia_path::Path` / Skia path / Cairo
  path naming when this IR variant is referenced in Rust contexts.

- **`TextRun`** (not `Text`). `Text` is ambiguous between the SVG tag,
  the spec concept, and our IR. `TextRun` commits to "run of text
  content positioned in a frame" — and accommodates the three SVG
  variants (`<text>`, `<tspan>`, `<textPath>`) without forcing a
  rename when sub-variants emerge.

- **`Group`** (not `Container`, not `GroupNode`). Container is
  overloaded with HTML / layout / DOM senses; `Group` matches the
  `<g>` tag literally. `GroupNode` is redundant — every IR variant
  is a node.

- **`Viewport`** (not `Svg`, not `SvgRoot`). `Viewport` names what
  the spec calls this thing (SVG 2 §7.2 "Establishing a new SVG
  viewport"). `Svg` would conflict with the package name. `SvgRoot`
  is wrong because nested `<svg>` and `<symbol>` are also viewports
  and not roots.

- **`Defs`** (not `Definitions`, not `ResourcesContainer`). The tag
  is `<defs>`; the IR variant is `Defs`. One-to-one with the spec.

- **`Reference`** (capability, not variant) — see §5. The decision
  to make `<use>` a `BoxPrimitive` + reference capability rather
  than a separate `Reference` variant is justified there.

- **`PaintServer`** (not `Resource`, not `DefsChild`). "PaintServer"
  is the spec term ([SVG 2 §13.2](https://www.w3.org/TR/SVG2/painting.html#FillStrokePaintServer)).
  `Resource` is too broad — `<symbol>` is also a resource but is a
  `Viewport`. `DefsChild` is structural rather than semantic.

- **`Opaque`** (not `Unknown`, not `Foreign`). "Unknown" implies "we
  don't know what this is" — but for `<style>` and `<foreignObject>`
  we know exactly what they are; we just refuse to introspect.
  "Foreign" is too narrow — `<style>` is not foreign-namespace.
  "Opaque" names the editor's stance: "we treat this as a typed
  handle with no internal structure exposed."

- **Capability predicates use `is_*`, not `can_*`.** `is_resizable`
  reports a _property of the node_; `can_resize` would imply a
  permission or affordance question, which conflates capability
  with refusal. Refusals are a separate axis (`RefusalReason`).
  `is_resizable: true` and a refused `set_local_box` call can
  coexist (e.g. the node is resizable in principle but the specific
  target violates a constraint); that distinction would collapse if
  capabilities were phrased as `can_*`.

- **`pivot_authoritative_for_rotate`** (not `owns_pivot`, not
  `rotates_around_centre`). "Owns pivot" is too tag-agnostic — every
  node owns its own pivot in some sense. "Rotates around centre" is
  a behaviour, not a permission. "Pivot authoritative for rotate"
  names exactly what the IR claims: _this IR variant has the
  authority to renormalise the pivot when its local box changes._
  Long, but each word earns its place; renaming would lose precision.
