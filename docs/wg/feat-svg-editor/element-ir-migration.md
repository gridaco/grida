---
title: "Element IR — Migration Sketch"
tags:
  - internal
  - design
  - svg-editor
  - ir
  - migration
status: draft
---

# Element IR — Migration Sketch

## Purpose

This is a sketch, not a task list. It maps the current `@grida/svg-editor`
source onto the IR proposed in `element-ir.md`, calling out what survives
verbatim, what survives behind a thin adapter, what gets deleted outright,
and a phasing that minimises risk. The reader is a future implementer
deciding whether the IR migration is worth a real implementation plan;
this doc should answer "where does my current code land" without that
implementer having to re-read the design from scratch. An actual
implementation plan — task breakdown, test matrix, API names — comes
later in a separate doc once this sketch is approved.

## Current code map

Citations are `file:line` against the current `packages/grida-svg-editor/src/`
tree.

| Current module/file                                                                                                                                      | Role today                                                                                                                                                               | Disposition under IR                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `core/transform/parse.ts`                                                                                                                                | Tokeniser for the `transform=` attribute (`parse_transform_list`, leading-translate extraction)                                                                          | **Survives as IR node mutator** — feeds the `LocalTransform` value type's constructor; `explicit_pivot: bool` is set here by tracking whether `rotate(θ)` or `rotate(θ cx cy)` was parsed                                                                                                                     |
| `core/transform/classify.ts`                                                                                                                             | Classifies a parsed transform list into `identity / leading_translate_only / single_rotate_only / leading_translate_then_single_rotate / mixed`                          | **Subsumed by IR** — the classifier's verdicts become the `LocalTransform` enum variants directly; no separate string-verdict layer                                                                                                                                                                           |
| `core/transform/emit.ts`                                                                                                                                 | Serialises a transform op list back to a string                                                                                                                          | **Survives behind a new IR adapter** — the IR's `set_rotation` / pivot-recompose call this; the per-arm string-building in `apply_rotate` (`intents.ts:760-769`) goes away                                                                                                                                    |
| `core/transform/types.ts`                                                                                                                                | `TransformOp` union                                                                                                                                                      | **Survives** — used internally by the parse → IR builder; not exposed beyond `core/transform/` and `core/ir/`                                                                                                                                                                                                 |
| `core/intents.ts:499 apply_resize` per-tag switch (rect / image / use / circle / ellipse / line / polyline / polygon / path / text)                      | The nine-arm switch the README §4 of the matrix calls out as a hot zone                                                                                                  | **Subsumed by IR** — collapses into capability dispatch + per-variant `set_local_box` mutator                                                                                                                                                                                                                 |
| `core/intents.ts:212 apply_translate` per-baseline switch                                                                                                | Parallel eight-arm switch for translate                                                                                                                                  | **Subsumed by IR** — collapses into `Variant.set_translation` on each IR node                                                                                                                                                                                                                                 |
| `core/intents.ts:742 apply_rotate`                                                                                                                       | Builds the `translate(...) rotate(θ cx cy)` string from a `RotateBaseline`                                                                                               | **Survives behind a new IR adapter** — becomes the body of `BoxPrimitive.set_rotation` (and peers); the string-builder helpers (`fmt_angle`, the `rotate_token` construction) are exactly the math the IR mutator needs                                                                                       |
| `core/intents.ts:280 is_resizable` (tag whitelist)                                                                                                       | Per-tag boolean                                                                                                                                                          | **Subsumed by IR** — becomes the `is_resizable: true` capability flag set when the IR builder constructs `BoxPrimitive`, `Circle`, `Ellipse`, `LineSegment`, `PointPolyline`, `PathShape`, `TextRun`                                                                                                          |
| `core/intents.ts:783 is_resizable_node` (transform-shape gate, contains the `"single_rotate"` typo at line 800)                                          | Gates resize on the element's own transform shape                                                                                                                        | **Deprecated** — replaced by `node.capabilities.is_resizable` AND the IR's `set_local_box` returning `Result<(), RefusalReason>`; the typo cannot recur because the gate is a typed bool, not a string compare against classifier output                                                                      |
| `core/intents.ts:627 is_rotatable`                                                                                                                       | Doc-state gate returning `{kind:"yes"}                                                                                                                                   | {kind:"refuse", reason}`                                                                                                                                                                                                                                                                                      | **Survives behind a new IR adapter** — the four refuse reasons (`non-trivial-transform`, `text-with-glyph-rotate`, `css-property-transform`, `animated-transform`) map 1:1 to entries in `RefusalReason`; the inspector becomes a method on the IR variant (`set_rotation` returns the typed refusal) |
| `core/intents.ts:661 RotateBaseline`, `:688 capture_rotate_baseline`                                                                                     | Captures `current_rotation_deg`, leading translate, original transform string for round-trip identity-restore                                                            | **Survives behind a new IR adapter** — the IR's `LocalTransform::LeadingTranslateThenSingleRotate { ..., explicit_pivot: true, pivot }` carries the same fields as typed state; `capture_rotate_baseline` is called by the rotate-pipeline orchestrator and feeds into the IR's `set_rotation` mutator        |
| `core/rotate-pipeline/` (orchestrator, pipeline, stages, apply)                                                                                          | Gesture orchestrator that runs the classify/baseline/apply stages on a stream of pointer events                                                                          | **Survives** — the stages stay; only the leaf `apply.ts` (which today calls `apply_rotate` from `intents.ts`) is rewired to dispatch through `editor.ir.find(id).set_rotation(angle, pivot)`                                                                                                                  |
| `core/resize-pipeline/`, `core/translate-pipeline/`                                                                                                      | Same gesture-orchestrator shape, for resize and translate                                                                                                                | **Survives** — leaf `apply.ts` rewires to the IR mutator; baseline-capture stages remain because the gesture path still needs anchor / origin / `(sx, sy)` math before it knows what to write                                                                                                                 |
| `core/snap/` (AABB-only today; `GROUPS.md`, `neighborhood.ts`, `session.ts`)                                                                             | Snap engine consuming `getBBox`-shaped AABBs                                                                                                                             | **Separate concern** — the IR exposes `polygon_in_doc_space(): Vec2[]` per variant (per `element-ir.md §12`); the snap-engine refactor is a parallel effort, gated to Phase 7. Flagged in `feedback-transform.md §🟡` as already broken on rotated elements                                                   |
| `commands/defaults.ts`, `commands/registry.ts`                                                                                                           | Keymap chord IDs → `editor.commands.*` calls                                                                                                                             | **Survives** — the public command surface is unchanged; only the per-command implementation reroutes through the IR. The selection-scoped `commands.resize_to` loop (`editor.ts:818` member-loop today) switches from `is_resizable` tag-gate to `node.capabilities.is_resizable` capability-gate             |
| `dom.ts:1489 shape_of`                                                                                                                                   | Picks `rect` vs `transformed` for the HUD `SelectionShape`, reads `getScreenCTM()` and subtracts container offset                                                        | **Survives** — but should source `local` from `editor.ir.find(id).local_box` rather than `el.getBBox()` for IR variants that have a declared local frame (every variant except `Group` / `Defs` / `PaintServer`); CTM math stays because the HUD still needs a `local → doc` matrix and only the DOM has that |
| `dom.ts:2174 handle_resize`                                                                                                                              | Branches on `intent.shape?.kind === "transformed"` to choose `local.width/height` vs `rect.width/zoom`                                                                   | **Survives — thinner.** The branch goes away. `intent.shape.local` always lives in the IR's local frame because the IR is the authority on what "local frame" means; the dispatcher forwards into `editor.ir.find(id).set_local_box({x', y', w', h'})`                                                        |
| `dom.ts:2231 handle_rotate`                                                                                                                              | Delegates to `rotate_orchestrator.drive(...)` and emits refusal toasts                                                                                                   | **Survives — thinner.** Refusals now come back as typed `RefusalReason` enum values from the IR mutator, not from a separate `RotatableVerdict` classifier; the toast-mapping table (`emit_rotate_refusal` at `dom.ts:2252`) keys off the `RefusalReason` discriminator instead                               |
| `dom.ts:1003 apply_camera_transform`                                                                                                                     | Pins HUD camera at identity, applies pan/zoom via CSS `transform=` on the SVG root                                                                                       | **Unrelated (no change)** — the IR is headless; camera composition is a surface concern flagged out of scope in `element-ir.md §14`                                                                                                                                                                           |
| `core/document.ts` (`SvgDocument`, `set_attr`, `get_attr`, `tag_of`, attribute-order preservation; ref at `core/document.ts:312`)                        | The parsed AST with trivia preservation — every byte of source attribute trivia (order, quote styles, whitespace, unknown-namespace attrs) is preserved across mutations | **Survives** — becomes the IR's underlying mutable AST. The IR is a typed view _over_ this; `editor.ir.find(rectId).local_box` ultimately calls `doc.set_attr(id, "x"                                                                                                                                         | "y"                                                                                                                                                                                                                                                                                                   | "width" | "height", …)`. `SvgDocument` is the AST-of-record; the IR never owns attribute values |
| `core/parser.ts`, `core/document.ts` parse side                                                                                                          | Parser building `SvgDocument` from a source string                                                                                                                       | **Survives** — extended with one new responsibility: the parse of `transform=` should distinguish `rotate(θ)` from `rotate(θ cx cy)` and carry the `explicit_pivot` flag through to the IR builder                                                                                                            |
| `core/properties.ts` `choose_write_carrier` (cascade resolver)                                                                                           | Decides whether `set_property` writes to presentation attr, inline `style`, or stylesheet rule                                                                           | **Unrelated (no change)** — per `element-ir.md` §Non-goals; the IR exposes `accepts_paint` as a capability but the carrier resolver still decides _where_ the write lands                                                                                                                                     |
| `core/defs.ts` (`defs.gradients.*`, ref-count)                                                                                                           | Typed registry for paint-servers / markers / clipPath / mask / filter                                                                                                    | **Survives behind a new IR adapter** — the `PaintServer` IR variant's mutators delegate to this registry; the public `editor.defs.*` API is unchanged                                                                                                                                                         |
| `core/group.ts plan_group`                                                                                                                               | Group / ungroup policy                                                                                                                                                   | **Survives** — the IR exposes `is_groupable: bool` as a capability; `plan_group` stays the policy authority                                                                                                                                                                                                   |
| `core/insertions.ts`, `core/editor.ts insert / insert_preview`, `core/editor.ts default_paint_attrs_for` (`editor.ts:1471`), `types.ts:25 InsertableTag` | Per-tag default-paint table and insert UX                                                                                                                                | **Survives behind a new IR adapter** — the IR builder gains a `construct_default()` per variant; `default_paint_attrs_for` becomes the variant's default-paint capability                                                                                                                                     |
| `core/hit-shape.ts`, `core/hit-shape-svg.ts`                                                                                                             | Per-tag intrinsic hit-shape computation                                                                                                                                  | **Survives** — the IR can additionally expose `polygon_in_doc_space()` (per `element-ir.md §12`) but the current hit-shape is a separate, surface-side query that doesn't need to migrate                                                                                                                     |
| `core/align.ts`                                                                                                                                          | Computes per-member translate deltas for align                                                                                                                           | **Unrelated (no change)** — operates above the dispatcher; the `align` command issues `translate` intents, which then route through the IR                                                                                                                                                                    |
| `index.ts`, `react.tsx`, `gestures/`, `keymap/`, `presets/`                                                                                              | Public package entrypoints, React wrapper, gesture adapters, keymap defaults                                                                                             | **Unrelated (no change)** — public API surface is preserved; the IR is internal                                                                                                                                                                                                                               |
| `text-surface.ts`                                                                                                                                        | Text edit overlay surface                                                                                                                                                | **Unrelated (no change)** — the IR exposes `accepts_text_edit` as a capability flag the surface reads, but the overlay implementation stays put                                                                                                                                                               |

## What's throwaway

- **The nine-arm `apply_resize` switch at `core/intents.ts:499-555`.** Replaced by capability dispatch + per-variant `set_local_box`. Saves ~57 lines and concentrates the resize math in one place per IR variant.
- **The eight-arm `apply_translate` switch at `core/intents.ts:212-256`.** Replaced by per-variant `set_translation`.
- **The eight-arm `capture_translate_baseline` switch at `core/intents.ts:37-86`** and **the ten-arm `capture_resize_baseline` switch at `core/intents.ts:298-380`.** The capture stays — gestures still need pre-mutation state — but it becomes a thin wrapper per IR variant (`BoxPrimitive.capture_for_resize()`) rather than a giant tag-switch.
- **`is_resizable_node` at `core/intents.ts:783-803`.** The string-compare against classifier verdicts is replaced by `node.capabilities.is_resizable`. The `"single_rotate"` typo at line 800 (the classifier emits `"single_rotate_only"`; the gate checks `"single_rotate"`) cannot exist in the typed IR — capabilities are a `bool`, not a string compare against open-vocabulary classifier output. The bug becomes structurally impossible.
- **The `if (intent.shape && intent.shape.kind === "transformed")` branch in `dom.ts:2198-2205` `handle_resize`.** The IR carries this state intrinsically: `editor.ir.find(id).local_box` always returns the local frame regardless of whether the element is rotated. The dispatcher hands the IR a target box and lets the mutator do the math; the "transformed vs AABB" decision disappears from the dispatcher.
- **`RotatableVerdict` type in `core/intents.ts:608-617`.** Its four `reason` strings move into the `RefusalReason` enum and the IR's `set_rotation` returns `Result<(), RefusalReason>` directly. The intermediate verdict struct goes away.
- **The headless / gesture divergence on resize.** Two parallel paths exist today (matrix §7.4, `feedback-transform.md §Structural flaw 1`): `commands.resize_to` reads world AABB via `geometry_provider.bounds_of(id)`, gesture reads `intent.shape.local`. Both collapse onto a single `editor.ir.find(id).set_local_box(target_box)` call; the divergence cannot exist.
- **The per-arm rotate-pivot recomposition that the FEEDBACK doc proposes to add.** The FEEDBACK fix would patch `apply_resize`'s rect arm (and image / use / circle / ellipse / polyline / path arms one by one) to re-emit `transform="rotate(θ new_cx new_cy)"` after writing geometry. Under the IR, the recomposition is the `BoxPrimitive.set_local_box` invariant in `element-ir.md §6`, applied uniformly to every variant whose `LocalTransform.is_editor_authored_shape()` is true. The per-arm patch is throwaway by being unnecessary in the first place.

## What survives

- **`@grida/cmath`** — vector / matrix / rect math. The IR's `polygon_in_doc_space()` queries, the `LocalTransform` value type's compose operations, and the pivot-recompose math all live on top of cmath. Untouched.
- **`@grida/history`** — undo store. The IR mutators write through `SvgDocument.set_attr`, which is already the history-tracked surface. No history work in the IR layer.
- **`SvgDocument` and the trivia store** (`core/document.ts`) — the AST-of-record with byte-perfect attribute trivia preservation (the comment at `core/document.ts:3` says it explicitly: "keeps every byte of source trivia (attribute order, quote styles, ...)"). The IR is the typed write path _into_ this AST; the AST stays the source of truth. P1 round-trip is preserved because the IR never touches the serializer.
- **`core/transform/parse.ts` + `classify.ts` + `emit.ts`** — the existing transform-list helpers. The IR builds on them: parse → `LocalTransform` value, classify → variant tag, emit → string for `set_attr`. None of this lower-level code is rewritten; it gets a typed envelope.
- **`core/rotate-pipeline/` orchestrator and stages** — the gesture-time classify / baseline / apply pipeline. Only the leaf apply rewires through the IR; the gesture orchestration is solid and stays.
- **`core/resize-pipeline/`, `core/translate-pipeline/`** — same shape, same disposition.
- **`core/defs.ts`** — typed defs registry with ref-counts. The IR's `PaintServer` variant delegates here; the public `editor.defs.*` API is unchanged.
- **`core/group.ts plan_group`** — group/ungroup policy; the IR consumes its verdicts via the `is_groupable` capability flag.
- **`core/properties.ts choose_write_carrier`** — cascade-aware property write resolver. Untouched (see `element-ir.md §Non-goals`).
- **`svg-pathdata` (`core/intents.ts:4`)** — third-party `d`-string parser / transformer. The IR's `PathShape` variant keeps using it (lazily; see Risks §Path parsing).
- **`core/svg-parse.ts`** (`parse_points`, `parse_path_first_move`, etc.) — string-level token parsers. Used by the IR builder for `polyline` / `polygon` / `path` initial population.
- **`commands/` and the public command surface** — `editor.commands.{translate, resize_to, rotate, …}` keeps the same names and signatures. The IR is internal; the public API is unchanged.

## Phasing — incremental landing

The IR can land per element type. Each phase ships independently behind the existing public API. Tests for each phase live alongside the migrated variant in `core/ir/`.

- **Phase 0 — Scaffolding.** Add `core/ir/` with the `IRNode` enum stub (variants defined but methods may be `unimplemented!()`), the `Capability` flags struct, the `RefusalReason` enum (full taxonomy from `element-ir.md §8`), and the `LocalTransform` value type with `explicit_pivot: bool` populated by the parser. Extend `core/transform/parse.ts` to track whether `rotate(θ)` or `rotate(θ cx cy)` was written. No commands wired yet. Tests: parse → IR-rebuild idempotence on the existing fixture corpus; round-trip of `explicit_pivot` flag through parse + emit.
- **Phase 1 — `BoxPrimitive`** (rect / image / use). **Proof-of-concept.** Migrate the `case "rect"` arm (and the parallel image / use arms) of `apply_resize` (`core/intents.ts:509-516`) to `BoxPrimitive.set_local_box`. Migrate the equivalent `apply_translate` arms (`core/intents.ts:227-234`). Rewire the gate in `is_resizable_node` (`core/intents.ts:783`) to read the IR capability flag for these three tags only — the other six tags keep the old switch. Wire `commands.resize_to` and the gesture path to both call into the same mutator (kills `feedback-transform.md §Structural flaw 1` for rect/image/use). Demonstrates: (a) pivot recomposition lands as an invariant on the mutator, killing the headline FEEDBACK_TRANSFORM blocker for the most common element type; (b) the `"single_rotate_only"` typo cannot recur because the gate is a typed bool; (c) the per-tag switch shrinks. **Phases 2+ are gated on Phase 1 review.**
- **Phase 2 — `Circle` and `Ellipse`.** Smaller surface (uniform-scale circle, independent rx/ry ellipse). Validates the per-type pattern from Phase 1 on a simpler shape. The "circle stays a circle until the user explicitly converts" policy from `element-ir.md §5` lands here as `RefusalReason::CircleToEllipse`.
- **Phase 3 — `LineSegment`, `PointPolyline`.** Validates non-`(x, y, w, h)` geometry. `PointPolyline` exercises the trivia-preservation contract for the `points` string (the IR holds parsed `Vec2[]` for math; the serializer round-trips the source token sequence when no point moved).
- **Phase 4 — `PathShape`.** The hard one. The `d`-string parsing strategy is decided here: eager parse at IR-build time vs lazy on first mutator call. Default: lazy, matching today's `SVGPathDataTransformer` behaviour, with an explicit hook for path-vertex editing when it lands (currently out of scope per the package README).
- **Phase 5 — `TextRun`, `Group`, `Viewport`.** The structural variants. `TextRun` introduces `RefusalReason::ResizeRequiresContainingTextRoot` (the `<tspan>` arm gap from matrix §4.1). `Group` introduces `RefusalReason::GroupResizeUndefined` (replaces today's silent `is_resizable: false`). `Viewport` is the variant where `set_local_box` becomes _implemented_ for `<svg>` / `<symbol>` — today they refuse essential (matrix §4.1).
- **Phase 6 — `Opaque`, `Defs`, `PaintServer`, `Reference` capability.** Refusals + registry integration. `<foreignObject>`'s SVG-side rectangle becomes editable through `Opaque.set_local_box` (the FEEDBACK matrix §4.1 marks this `refused (accidental)` today). `PaintServer.is_removable: false` for direct `commands.remove` (closes the ref-count bypass in matrix §7.5 / `editor.ts:remove` gap).
- **Phase 7 — Snap engine + multi-selection mixed view + headless command convergence.** Snap engine consumes `polygon_in_doc_space()` (replaces the AABB-only path flagged in `feedback-transform.md §🟡`). Multi-selection `MixedView<IRNode>` lands (`element-ir.md §11`). Headless `commands.resize_to` and gesture path are fully unified across every variant (Phase 1 unified rect/image/use; this phase finishes the job).

Each phase ends with: existing tests pass, new IR tests pass, README updated if the public surface changed (it shouldn't, but the FEEDBACK doc gets a check-off for resolved blockers).

## Proof-of-concept walkthrough — `apply_resize` rect arm (before / after)

This is the load-bearing example. The current code lives at `core/intents.ts:507-516`:

**Before** (`core/intents.ts:499-555`, rect arm):

```ts
export function apply_resize(
  doc: SvgDocument,
  id: NodeId,
  baseline: ResizeBaseline,
  sx: number,
  sy: number,
  origin: { x: number; y: number }
): void {
  const a = baseline.attrs;
  switch (a.kind) {
    case "rect":
    case "image":
    case "use":
      doc.set_attr(id, "x", String(origin.x + (a.x - origin.x) * sx));
      doc.set_attr(id, "y", String(origin.y + (a.y - origin.y) * sy));
      doc.set_attr(id, "width", String(Math.max(0.001, a.w * sx)));
      doc.set_attr(id, "height", String(Math.max(0.001, a.h * sy)));
      return;
    // … seven more arms: circle / ellipse / line / polyline / polygon / path / text …
  }
}
```

`is_resizable_node` (`core/intents.ts:783`) gates the call; the rotate-pivot is _not_ recomposed (this is the headline `feedback-transform.md §BLOCKER 1`). The FEEDBACK fix proposes patching this arm to re-parse and re-emit `transform="rotate(θ new_cx new_cy)"` after writing geometry; the same patch then has to be repeated in the image / use / circle / ellipse / polyline / path arms.

**After** (dispatcher in `core/intents.ts` shrinks to capability dispatch; the math moves into the IR mutator):

```ts
// core/intents.ts — dispatcher
export function apply_resize(
  ir: IR,
  id: NodeId,
  target: LocalBox
): Result<void, RefusalReason> {
  const node = ir.find(id);
  if (!node.capabilities.is_resizable) {
    return Err(RefusalReason.ElementNotResizable);
  }
  return node.set_local_box(target);
}
```

```ts
// core/ir/box_primitive.ts — the BoxPrimitive variant's mutator
class BoxPrimitive {
  set_local_box(target: LocalBox): Result<void, RefusalReason> {
    const { x, y, w, h } = target;
    this.doc.set_attr(this.id, "x", String(x));
    this.doc.set_attr(this.id, "y", String(y));
    this.doc.set_attr(this.id, "width", String(Math.max(0.001, w)));
    this.doc.set_attr(this.id, "height", String(Math.max(0.001, h)));

    // Invariant from element-ir.md §6: when the element's LocalTransform
    // is editor-authored (the editor wrote the rotate(θ cx cy) pivot,
    // not the user), recompose the pivot to the new local centre so
    // subsequent rotate gestures pivot around the artwork's centre,
    // not the stale pre-resize centre.
    if (this.local_transform.is_editor_authored_shape()) {
      const new_cx = x + w / 2;
      const new_cy = y + h / 2;
      this.local_transform = this.local_transform.with_pivot({
        cx: new_cx,
        cy: new_cy,
      });
      this.doc.set_attr(
        this.id,
        "transform",
        emit_transform_list(this.local_transform.to_ops())
      );
    }
    return Ok();
  }
}
```

Two things to notice:

1. **The pivot recompose is one method, not nine.** Every IR variant whose `is_editor_authored_shape()` is true gets the invariant for free by composing `set_local_box` on top of a shared `LocalTransform.with_pivot()` helper. The per-arm patch the FEEDBACK doc would otherwise need (rect arm, image arm, use arm, circle arm, ellipse arm, polyline arm, path arm) becomes one piece of code.
2. **The typo at `core/intents.ts:800` (`"single_rotate"` vs the classifier's `"single_rotate_only"`) cannot exist.** The capability gate is `node.capabilities.is_resizable`, a `bool` set when the IR builder constructs the variant. There is no string compare against open-vocabulary classifier output, so there is nothing to misspell. The same gate works correctly for any `LocalTransform` shape the IR recognises; new shapes added to the enum auto-extend the gate without touching the dispatcher.

The dispatcher loop in `dom.ts:2174 handle_resize` correspondingly shrinks: the `intent.shape?.kind === "transformed"` branch goes away because `target` is always in the IR's local frame, regardless of whether the element is rotated. The HUD still streams `intent.shape.local`; the dispatcher just forwards it.

Net: the per-arm switch is gone, the pivot-drift bug is structurally absorbed, the gate typo can't recur, and the headless `commands.resize_to` / gesture-path divergence collapses to a single call site. All four FEEDBACK_TRANSFORM blockers in this neighbourhood land at once.

## Risks and unknowns

- **Parse cost.** Building the IR walks every AST node once and classifies its `LocalTransform`. For typical editor documents (≤ few hundred elements) this is unmeasurable; for adversarial scientific SVG dumps (100k+ elements) it could add visible load time. Mitigate: profile after Phase 1; if it shows up, switch to lazy per-node IR construction (build on first `editor.ir.find(id)`).
- **Memory.** N IR nodes for N AST elements. Each variant is a small struct of `{ id, capabilities, local_transform, doc_ref }`; cheap. Benchmark anyway.
- **Trivia store contract.** `SvgDocument.set_attr` (`core/document.ts:312`) is documented at `core/document.ts:3` as preserving "every byte of source trivia (attribute order, quote styles, ...)". The IR mutators must only write through `set_attr`; they must never reach into the AST representation directly. The contract is: _if the IR didn't change a value, the bytes don't change._ This is already how the existing intent helpers work; the IR codifies the rule. Need to verify what `set_attr` does when the _new_ value equals the existing value (it should be a no-op; confirm in Phase 0 tests).
- **NodeId stability across rebuilds.** The IR rebuilds on `load_svg` (per `element-ir.md §Non-goals` (c)); within a session the IR is incrementally updated by the same mutator that wrote to the AST. The IR exposes the same `NodeId` values the AST does — there is no IR-side indirection. Phase 0 picks "AST owns NodeId, IR borrows it" as the default; nothing in the design pushes back on this.
- **Public API impact.** `editor.state.selection: ReadonlyArray<NodeId>` and every other public observation must keep working. The IR is internal. Stated explicitly in `element-ir.md §Non-goals` ("Not a permanent NodeId allocator"); restated here because it's the single most important non-regression test for the migration.
- **Incremental rebuild on attribute change.** If `editor.set_property(id, "fill", "red")` runs, does the IR rebuild the whole tree, just the affected node, or nothing (because `fill` doesn't change capabilities)? Open question; Phase 0 picks "the IR mutator that wrote the attribute knows which IR-node fields to invalidate" as the default, and Phase 7 may add a coarser-grained invalidation API if the per-mutator approach turns out to leak. Per `element-ir.md` open question (d).
- **`<g>` transform composition into descendants** (per `element-ir.md` open question (a)). The IR for a `<rect>` inside a rotated `<g>` needs to know about the group's transform to answer `polygon_in_doc_space()` honestly. Two options — flatten on demand vs walk-to-root — both have known costs. Phase 5 picks one; Phase 7 may revisit if snap-engine perf demands it.
- **Snap-engine refactor is parallel work.** Flagged in `element-ir.md §15` and in `feedback-transform.md §🟡`. The IR provides `polygon_in_doc_space()`; consumption is a separate effort. Don't conflate.
- **Camera double-transform.** Out of scope per `element-ir.md §14`. `feedback-transform.md §Structural flaw / What's not decided #5` describes the clean fix; the IR work does not block it but does not perform it either.

**Most important risk: incremental rebuild on attribute change.** The IR's claim of being "a typed view, not alternative storage" depends on the AST-to-IR mapping staying live across mutations without a full re-walk. If the mutator-driven invalidation story leaks (a mutator writes through but forgets to patch a cached IR field), the IR returns stale data — a class of bug worse than the per-tag switch it replaces. Phase 0 must land a test that covers "write through `set_attr` directly (bypassing IR mutators) — IR observation reflects the change after a defined re-read API" so the contract is testable from day one.

## Out of scope for this sketch

- The actual implementation task list (file-by-file edits, PR sequence, reviewer assignments).
- The test-coverage matrix (which fixtures, which assertions per variant, fuzz strategy).
- API names beyond what's named in `element-ir.md` (the variant names, capability names, refusal names are locked there; concrete TypeScript signatures are an implementation-plan concern).
- HUD-side changes. None expected; the HUD contract is locked and `feedback-transform.md` is explicit that all host work flows through the existing `shape_of` / `intent.shape` boundaries.
- Benchmarks. Phase 1 ends with profile data; the benchmark suite is a follow-up.
- Snap-engine refactor design (parallel effort).
- Camera composition fix (parallel effort).
- Path-vertex sculpting (out of scope per the package README).

## Next step

After this sketch and `element-ir.md` are approved, an implementation plan opens for Phase 0 + Phase 1 only — the proof-of-concept. Phases 2+ are gated on Phase 1 review.
