# `@grida/svg-editor` — open questions / deferred work

These are tricky and revisit-later items. Some need design, some need product
calls, some need both. Listed by area; order is not priority.

## Insertion subsystem follow-ups

The `Tool` axis + `commands.insert` / `commands.insert_preview` shipped in
alpha.10. Open items:

- **Text tool (`T`).** _Shipped (click-only)._ Pointer-down places a
  single-line `<text>` (`insertions.default_text_attrs`) and enters
  content-edit immediately; create + first edit are bracketed in one
  history step via `insert_text_preview`, and the empty-equals-delete rule
  removes a node left empty on exit (fresh placement discards with no undo
  entry; an existing node cleared empty is removed as one undoable step).
  Design: [`docs/wg/feat-svg-editor/text-tool.md`](../../docs/wg/feat-svg-editor/text-tool.md).
  Still open:
  - **Tool-axis cleanup (F2).** `insert-text` was added as a sibling
    `Tool` variant gated to `select` mode. The `Tool` union still conflates
    select-mode tools (`cursor` / `insert` / `insert-text`) with
    content-edit-only tools (`lasso` / `bend`) on one axis; splitting them
    into honest mode-gated categories is deferred.
  - **Wrapped / multi-line text.** Out of scope. A drag-to-define-box maps
    to SVG 2 wrapped text (`inline-size` / `shape-inside`) — a separate
    model with its own gesture; this tool only creates single-line text.
- **Tunable defaults via `EditorStyle`.** `default_paint_attrs` (in
  `src/core/insertions.ts`) returns `#D9D9D9` for rect/ellipse and
  `#000000` 1px for line, hard-coded; `default_text_attrs` likewise
  hard-codes 16px sans-serif black. If hosts ask for brand-default fill
  / stroke / stroke-width / font on inserted nodes, promote them to
  `EditorStyle.insertion_*` fields (values, not slots; P2). Similarly
  for `DEFAULT_SIZE = 100` and the `CLICK_THRESHOLD_PX = 2` in `dom.ts`.
- **Scope-respecting insertion.** v1 always inserts at root. Wire `parent`
  to `state.scope` in `start_insert_gesture` once "enter group → draw
  inside group" UX is requested. No API change needed.
- **Polygon / star / path / pencil / brush / arrow tools.** Each future
  add is a PR extending `InsertableTag`. Anti-goal discipline preserved
  for pen / boolean ops / path sculpting.
- **Snap for line tool.** `<line>` insert-drag doesn't currently snap —
  the snap engine is rect-based and lines need an endpoint-style snap
  (per-endpoint to neighbor edges/centers). Deferred until either the
  resize-snap shape grows endpoint support or a dedicated path lands.
- **`presets/insert-*.ts` variants.** Once two hosts arrive at materially
  different opinionated insertion configurations (different default fill,
  different stickiness, different size, different keymap letters), a
  preset graduates — same shape as `keynote` graduated from the camera
  system. Not in v1.

### HUD routing migration (defer until N≥2 insertion tools)

The insertion gesture currently intercepts pointer events in
[`dom.ts:dispatch_pointer`](./src/dom.ts) _before_ `hud.dispatch(event)`
runs, via a `pending_insert` state machine private to the surface. This
adds a second pointer-routing seam to the package (HUD owns the other
one). For N=1 insertion tool (rect/ellipse/line share one gesture shape),
the seam costs ~15 readable lines and isn't worth refactoring.

When the **second insertion-class tool** (polygon, pencil, brush, arrow,
…) lands, convert in one PR:

1. `@grida/hud` `Surface` grows a tool-agnostic setter (e.g.
   `setToolActive(active: boolean)`) that gates its own selection /
   marquee logic when an editor tool is in flight.
2. HUD emits a generic `{kind: "tool_pointer", phase: "down" | "move" | "up", point, mods}` intent for each pointer event during tool-active periods.
3. Move the `start_insert_gesture` / `update_insert_gesture` /
   `commit_insert_gesture` calls from `dispatch_pointer` into
   `commit_intent` alongside the other intent handlers.
4. `pending_insert` and the gesture state machine stay in `dom.ts` —
   only the routing changes.

The convert-on-second-tool rule is the committee verdict from the
insertion design discussion. Premature migration buys HUD-API churn
against a single concrete user; deferred migration keeps the package
boundary clean until the abstraction earns its weight under multiple
consumers (P5: "earn separateness by reuse").

## 0. Foundations (grounding for all sections below)

- **Source of truth.** `src/core/document.ts:SvgDocument` is the in-memory IR
  (round-trip parse of `src/core/parser.ts`). All commands mutate this IR; the
  DOM surface (`src/dom.ts`) re-renders by `editor.serialize()` → `innerHTML`
  on every `editor.subscribe` tick. The browser SVG DOM is **not** the source
  of truth — `render()` rebuilds it from the IR.
- **Node identity.** Stable runtime ids of the form `n0`, `n1`, … assigned by
  `parser.ts:fresh_id`. They are exposed to the DOM via `data-grida-id`
  (`dom.ts:ID_ATTR`); the SVG `id` attribute is independent and authored by
  the user. Hit-testing walks `data-grida-id` up from `elementFromPoint`
  (`dom.ts:hit_test`).
- **History.** `@grida/history` `HistoryImpl` (`editor.ts`). Commands run a
  bare `apply()` first, then `history.atomic(label, tx => tx.push({apply,
revert}))`. Gestures open a `history.preview(label)` session via
  `_internal.history.preview` and `set` / `commit` / `discard` it
  (`dom.ts:active_preview`).
- **Backend split.** Everything in `src/core/**` is DOM-free (intent helpers,
  parser, document, group planner, paint, properties, geometry). DOM-only
  code lives in `src/dom.ts` and `src/text-surface.ts` and is reached through
  the `Surface` interface + `_internal` drivers. Things that would break for
  non-DOM backends: `hit_test` (uses `elementFromPoint`), `container_box` and
  `SvgGeometryDriver` (use `getBBox` + `getCTM` / `getScreenCTM`),
  `dom_computed_*` (uses `getComputedStyle`), text-edit caret geometry
  (`getStartPositionOfChar`).

## 1. Multiple selection groups (HUD wiring)

The HUD already accepts `SelectionGroup[]` and renders one chrome box per
group. svg-editor's `sync_surface_selection` currently uses the flat
`NodeId[]` overload, so multi-select shows N separate boxes instead of one
union box per logical group.

Open questions:

- **Grouping criterion.** Main editor groups by direct parent. For svg-editor
  the parent is the SVG element graph — is that the right axis, or do we
  group by shared transform chain, by sibling-set, by user-defined `<g>`
  boundaries? Different answers give different UX.
- **Disjoint groups vs. outer envelope.** Main editor renders N disjoint
  boxes with no outer "all selections" envelope. Should svg-editor follow,
  or render an outer union box for arbitrary multi-select?
- **Multi-node resize math.** `compute_resize_factors` returns one
  `(sx, sy, origin)` per gesture; applying it to N members requires
  per-member projection (each member's offset inside the union rect → its
  own local scale factor). New helper needed.
- **Multi-node rotate.** Probably out of scope — main editor only rotates
  single-node groups. Confirm before wiring.

Current implementation notes:

- `dom.ts:sync_surface_selection` always calls
  `this.hud.setSelection(state.selection)` with the flat `NodeId[]` from
  `EditorState.selection`. The `SelectionGroup[]` overload exposed by
  `@grida/hud`'s `Surface.setSelection` is unused.
- `EditorState.selection` (`types.ts`) is a flat `ReadonlyArray<NodeId>` with
  no notion of parent / group / transform-chain membership; `editor.commands.select`
  (`editor.ts`) just dedupes + replaces / adds / toggles.
- Resize is single-node: `dom.ts:handle_resize` takes `intent.ids[0]` only
  and rejects multi-node groups. Translate is the only multi-node intent
  wired (`dom.ts:handle_translate` loops `ids`).
- Rotate is unimplemented in both the host and core: `dom.ts:commit_intent`
  has an empty `case "rotate"`, and `editor.ts` (around the `translate`
  block) notes "resize / rotate: deferred for v1."
- Entry points to inspect/change: `dom.ts:sync_surface_selection`,
  `dom.ts:handle_resize`, `core/intents.ts:compute_resize_factors`
  (currently single-baseline; multi-node aggregate scaling would need a new
  helper that projects each member's `bbox` into a union-rect frame).

## 2. Per-element-type interaction semantics (specs)

For each SVG element type, we need an explicit "what _should_ happen when
the user does X" table. The HUD emits generic gestures (translate / resize /
rotate / set_endpoint); the host decides how to realize them. That mapping
is currently implicit and inconsistent.

Concrete cases worth a section each:

- **`<circle>`** — three plausible interpretations of "resize":
  1. **Apply transform** — wrap or extend the element's `transform` attribute.
     Exact, reversible, but pollutes the attribute.
  2. **Surgery into `<ellipse>`** — non-uniform resize converts the element
     to `<ellipse>` (with `rx`, `ry`); now follows ellipse semantics.
  3. **Restrict** — reject non-uniform gestures, allow only uniform scale
     (corner-drag with shift, or only constrained handles).
- **`<path>`** — analogous slot. Today we surgery the `d` attribute on
  resize. Alternative: apply `transform`. Per-gesture choice or
  per-document policy?
- **`<image>` / `<use>`** — likely transform-only; surgery is meaningless.
- **`<text>`** — resize semantics are extra-fuzzy (font-size? container box?
  scale transform?). Separate item from text-editing.

We need a single table per element kind: which gestures are accepted,
which are rejected, what they map to. Once that's written down, the host's
intent handlers become a switch on `tag_of(id)` instead of ad hoc.

Current implementation notes (from `core/intents.ts` and `dom.ts`):

- Resize is gated by `is_resizable(tag)` in `core/intents.ts` — accepts
  `rect`, `image`, `use`, `circle`, `ellipse`, `line`, `polyline`, `polygon`,
  `path`, `text`. `g`, `svg`, `tspan`, `defs`, etc. fall through and the
  resize intent is dropped at `dom.ts:handle_resize`.
- **Surgery, not transform.** `apply_resize` (`core/intents.ts`) writes
  geometry attributes directly — never composes a `transform`. Translate
  _does_ write `transform` when the node already has one or when `tag === "g"`
  (`capture_translate_baseline` returns `viaTransform`); otherwise it
  mutates `x/y`, `cx/cy`, `points`, `d`, `x1/y1/x2/y2` etc.
  (`apply_translate`). No per-document policy switch exists.
- Per tag, `apply_resize` behavior:
  - `rect` / `image` / `use` — scale `x/y/width/height`. Treated identically
    despite TODO §2 calling out image/use as "likely transform-only."
  - `circle` — forced to uniform scale (`s = min(sx, sy)`), so non-uniform
    drag still produces a valid `<circle>`. **Not** converted to `<ellipse>`.
  - `ellipse` — independent `rx`, `ry` scaling.
  - `line` — both endpoints scaled around the resize origin.
  - `polyline` / `polygon` — `scale_points_string` scales each pair.
  - `path` — `scale_path_d` applies a `MATRIX(sx,0,0,sy,e,f)` via
    `svg-pathdata` and re-encodes `d`.
  - `text` — corner gestures only (rejects edge drags via `isCorner`
    check); scales `x`, `y`, and `font-size` by `min(sx, sy)`. No container
    box, no `transform`.
- Translate via `transform` exists only for elements that already have a
  `transform` attribute or are `<g>` — see `viaTransform` arm in
  `capture_translate_baseline`. Otherwise geometry attributes are rewritten.
- `<line>` has a dedicated `set_endpoint` intent (`dom.ts:handle_set_endpoint`)
  on top of resize, driven by HUD endpoint knobs (`shape_of` returns
  `{ kind: "line", p1, p2 }` for line tags).
- Entry points to inspect/change: `core/intents.ts:is_resizable`,
  `core/intents.ts:capture_resize_baseline`, `core/intents.ts:apply_resize`,
  `dom.ts:handle_resize`, `dom.ts:shape_of` (controls which HUD handles
  appear per tag).

## 3. Undecided — items below are listed but no direction chosen

The items below are mentioned for tracking. Each needs its own design pass
before implementation.

### 3a. Hit-testing follow-ups

> **See [`docs/wg/feat-svg-editor/hit-test.md`](../../docs/wg/feat-svg-editor/hit-test.md)** for the full design notes, bug
> postmortem, and v2 implementation guide. That document is the source
> of truth for hit-test architecture; the bullets below are summary.

Done (`core/hit-shape/`):

- **Pure-cmath picker** — `_pick_node_at_world` runs entirely off the
  document model + cached world-space bounds. No `elementFromPoint`,
  no walk-up of `[data-grida-id]`, no live DOM read on the pick path.
  This was a deliberate retirement: an earlier version kept
  `elementFromPoint` as a "fast-path for filled shapes," but it
  short-circuited past thin elements on top of a filled background
  (slides fixture — line over `<rect width="1920" height="1080">`).
  The DOM API only contributes via `SvgGeometryDriver.bounds_of`
  (`getBBox` + `getCTM`), which is memoized.
- **Bounds-rect fallback** for shape-less tags: `<text>`, `<tspan>`,
  `<use>`, transformed nodes, unknown tags. The hit-shape is the
  world-space AABB — the editor norm (Figma / Illustrator treat the
  text bbox as the click target, not the glyph outline).
- **Transparent tags** — `is_transparent_tag` lists structural /
  non-rendering elements (`<g>`, `<svg>`, `<defs>`, `<symbol>`, masks,
  filters, gradient defs, metadata) that never participate in picking.
  Root pickability is a separate `allow_root` flag (measurement HUD
  passes true, selection HUD false).
- **Fat hit-area** — `EditorStyle.hit_tolerance_px` (default 4 CSS px,
  `0` disables). Tolerance is screen-space and converts to world units
  via `camera.zoom` at pick entry, so the band stays the same width on
  screen at any zoom.

Open:

- **Tiebreak policy when multiple candidates within tolerance.** Today:
  topmost-first wins on first match. Alternative: distance-nearest wins
  for non-exact hits, z-order only for exact (distance=0) hits. Trade-
  off: distance-nearest matches user mouse intent but means a filled
  shape (distance 0 inside) always beats a near-miss thin element on
  top of it — defeats the point of fat-hit. Current rule is correct
  for the slides line-over-rect case; minor quirk is text-bbox-padding
  can include a click that's geometrically closer to a thin line below
  it. Revisit if it bites.
- **Full Bezier distance for `<path>` Q/C/A segments.** v1 uses
  control-polyline approximation (M/L endpoints + Q/C control points);
  tight on straight runs, loose on tightly-curved Beziers. Upgrade by
  lowering curves to flattened polylines (de Casteljau, fixed-N
  samples) or computing distance-to-curve via Newton iteration on the
  derivative.
- **Per-tool tolerance override.** v1 honors only the global
  `hit_tolerance_px`; gestures that want a tighter or looser band
  (e.g. endpoint-grab during a draw tool) need a per-intent slot.
- **Path interior fill hit.** v1 returns edge distance for closed
  paths; filled regions defined by `d="M ... Z"` with a non-zero
  winding rule don't get "inside the fill is a direct hit" semantics.
  Add when the Bezier work above lands.
- **Z-order memo invalidation cost.** `_z_order_cache` rebuilds via a
  full depth-first walk on every `structure_version` bump. Cheap
  today for hundreds of nodes; revisit at 10k+.

### 4. Copy / paste

**Shipped.** Spec: [`docs/wg/feat-svg-editor/clipboard.md`](../../docs/wg/feat-svg-editor/clipboard.md)
(FRD — payload = standalone SVG document; extraction policies for the
five context kinds; command/refusal semantics; transport ownership;
trust model).

What shipped:

- **Core codec** — `core/clipboard.ts:extract_payload` (selection →
  standalone document: normalization, closed-carrier-list reference
  closure with cycle guard + forest exclusion, xmlns shell with
  well-known repair, deterministic, headless).
- **Commands** — `commands.copy()` / `cut()` / `paste(text?)` on the
  public surface; internal buffer as the transport floor; provider
  write-through; cut as one history step labeled `"cut"`; paste's
  gesture-grade refusal table (junk environment input → `[]`, never a
  throw).
- **Registry ids** — `clipboard.copy` / `cut` / `paste` registered
  (`commands/defaults.ts`), `select`-mode gated; deliberately NO keymap
  rows (native ClipboardEvents are the binding — a keymap claim would
  `preventDefault` the keystroke and suppress the event's generation).
- **DOM surface transport** — `copy`/`cut`/`paste` listeners on the
  owner document behind a focus-only clipboard gate
  (`claims_clipboard`, stricter than keyboard attention); container
  focus management (`tabIndex = -1`, focus on pointerdown); the
  `DomSurfaceOptions.clipboard: false` native-transport opt-out.
- Tests: `__tests__/clipboard-extract.test.ts`,
  `clipboard-commands.test.ts`, `clipboard.browser.test.ts`; manual TC
  `test/svg-editor-clipboard.md`.

Still open (deferred by the FRD, tracked here):

- ~~**Subtree clone**~~ — **shipped** ([#817](https://github.com/gridaco/grida/issues/817)):
  `core/subtree.ts:clone_plan` (no closure, no shell, ids verbatim,
  next-sibling placement), consumed by `commands.duplicate` (⌘D) and
  the §5 alt-drag clone. Spec:
  [`docs/wg/feat-svg-editor/subtree-clone.md`](../../docs/wg/feat-svg-editor/subtree-clone.md).
  Selection normalization is now shared with payload extraction via
  `subtree.normalize_roots`.
- **Paste placement enhancements** — paste-at-pointer, collision
  offset, scoped paste (each must confront wrapper-vs-rewrite noise).
- **Materializing extraction variants** — ancestor-transform bake and
  inherited-presentation capture (provenance-driven).
- **Non-walked carriers** — `<style>` element rules (blocked on the
  cascade engine's stylesheet matching), SMIL timing/value refs,
  `cursor`, SVG 2 text-layout properties.
- **Peer-format ingestion** (e.g. Figma's binary clipboard) and
  non-SVG paste (plain text → `<text>`, raster images).
- **Rendering-surface hardening** — the FRD trust-model's tracking
  obligation; the `innerHTML` mount executes `on*` attrs for loaded
  AND pasted content alike. Separate, security-reviewed work item.

### 5. Alt-drag (translate with clone) — SHIPPED

Shipped ([#817](https://github.com/gridaco/grida/issues/817)). Spec:
[`docs/wg/feat-svg-editor/subtree-clone.md`](../../docs/wg/feat-svg-editor/subtree-clone.md).

Hold Alt during a translate gesture to clone the selected nodes and move
the clone (the origin stays at rest). Consumes the **subtree-clone**
operation (no defs closure) per the clipboard FRD's verdict — not the
clipboard's payload extraction.

Implementation notes:

- `TranslateModifiers.clone` (optional, default off — nudge/RPC paths
  untouched) is mapped from `hud.modifiers().alt` by
  `dom.ts:current_translate_modifiers` (pull-at-consume, live per
  frame); `sync_modifiers` re-drives the translate orchestrator on an
  Alt flip between pointer moves. No `Intent` change in `@grida/hud`
  was needed — the original "extend Intent to carry modifiers" entry
  point predated the pull-at-consume modifier plumbing.
- The clone state machine lives in
  `core/translate-pipeline/orchestrator.ts:reconcile_clone` (lazy clone
  on first modifier-held frame; mid-drag toggle; snap + selection
  retarget; commit-time composite delta = one undo step; Escape =
  byte-exact restore). See `core/translate-pipeline/README.md` §Clone
  toggle for the lifecycle contract and the absolute-revert invariant
  it depends on.
- `selection.duplicate` (⌘D) is registered in `commands/defaults.ts` +
  `keymap/defaults.ts`; `commands.duplicate()` is the public API.
- Alt's measurement-overlay role coexists (hover-time vs gesture-time).
- Tests: `__tests__/subtree-clone.test.ts`,
  `__tests__/commands-duplicate.test.ts`,
  `__tests__/translate-pipeline/clone-drag.test.ts`,
  `__tests__/clone-drag.browser.test.ts` (pins the dom.ts wiring —
  alt→clone mapping, redrive-on-flip, selection retarget); manual TC
  `test/svg-editor-duplicate.md`.
- Repeating-offset duplicate shipped (gridaco/grida#825, spec
  §Repeating offset): `commands.duplicate` measures the previous
  duplication's translate delta via `subtree.repeat_delta` and applies
  it to the fresh clones in the same atomic step; a cloned drag commit
  seeds the record (`OrchestratorDeps.on_clone_commit` →
  `_internal.seed_duplication`).
- Still open (spec §Out of scope): clone-to-different-parent.

### 6. Snap to geometry

**Translate snap is implemented in alpha.8.** Shape, code paths, and
remaining gaps:

- Toggle: `EditorStyle.snap_enabled` (default `true`); runtime via
  `editor.set_style({ snap_enabled: false })`.
- Module: [`src/core/snap/`](./src/core/snap/README.md) — editor-agnostic
  `SnapSession` + `SnapOptions`; editor-specific `compute_neighborhood`.
  Designed for future extraction to a shared `@grida/snap` package.
- Engine: `@grida/cmath/_snap.snapToCanvasGeometry` + `guide.plot`.
- HUD: `snapGuideToHUDDraw` from `@grida/hud`; merged into `redraw()`
  via the variadic `merge_hud_draws`.
- Neighborhood policy: direct parent + parent's element children,
  excluding the dragged set, filtered by `STRUCTURAL_GRAPHICS_SET`.
  Matches the old editor's `getSnapTargets` shape.
- **Group snap policy:** Figma-shaped descent in alpha.10 — `<g>`
  contributes its bbox AND each rendered descendant leaf to the snap
  candidate set, on both sides; group-to-group bbox alignment is
  preserved. See [`src/core/snap/GROUPS.md`](./src/core/snap/GROUPS.md)
  for the ADR, mechanism, and caveats (stroke/filter/opacity
  excluded, rotated descendants snap by AABB, clip-path not
  respected, `<use>` opaque). Also includes the alpha.10
  empty-group "jerk to origin" fix in `SnapSession`.
- Coordinate space: HUD-container CSS pixels (zoom-invariant by
  construction; threshold is a constant pixel count at any zoom).
- Hot-loop strategy: agent + neighbor rects frozen at gesture start
  via `container_box`; per-frame call only into cmath, no DOM reads.
  Sidesteps the cache-thrash failure mode the old editor flagged.

**Still open:**

- **Resize snap.** `handle_resize` is single-node and does not consult
  the snap engine. Wait until multi-node resize ships (TODO §1) — at
  that point we'd freeze a resize baseline and feed corner / edge
  points to a `snapObjectsResize`-shaped helper.
- **User-defined guides (`Guide2D`).** No authoring UI in svg-editor.
  Out of scope unless / until guides land.
- **Pickability / lock filter.** §9 — currently only tags outside
  `STRUCTURAL_GRAPHICS_SET` are filtered. A node-level lock attribute
  is not yet honored.
- **Axis lock.** `cmath._snap` accepts `false` per axis to disable
  snapping on that axis, but the gesture surface does not currently
  expose axis-lock state to the snap call. Wire when shift-drag
  axis-lock UX lands.
- **Spacing cap.** cmath caps spacing snap at 64 anchors; documents
  with > 64 sibling rects under one parent get edge / center snap but
  silently lose spacing. Acceptable for v1.

### 7. Snap to pixel grid

**Snap-to-pixel-grid is implemented in alpha.9** as a stage of the translate
pipeline. Universal across drag / nudge / RPC. (The flag is named after the
_action_ — snap to the integer-pixel lattice — and is unrelated to the
visual pixel-grid overlay in `@grida/canvas-pixelgrid`.)

- Toggle: `EditorStyle.snap_to_pixel_grid` (default `false` for SVG-fidelity
  audiences); quantum: `EditorStyle.pixel_grid_size` (default `1`). Runtime
  flip: `editor.set_style({ snap_to_pixel_grid: true, pixel_grid_size: 1 })`.
- Module: [`src/core/translate-pipeline/`](./src/core/translate-pipeline/README.md)
  — `stage_pixel_grid` quantizes the agent-union origin to integer multiples
  of `pixel_grid_size` as the final stage of `STAGES_DEFAULT` (drag / nudge)
  and `STAGES_RPC` (`editor.commands.translate`).
- Composition with snap-to-geometry: snap-to-geometry runs first and emits
  the geometry guide; snap-to-pixel-grid then coarsens the corrected delta.
  Sub-pixel divergence
  from a fractional anchor (≤0.5px at q=1) is acceptable — imperceptible at
  any reasonable zoom.
- Anchor semantics: the FINAL position is quantized, not the delta. A rect
  at fractional `x=0.4` nudged by `(1, 0)` lands at `x=1` (settle-to-grid),
  then `2, 3, …` on subsequent nudges.

Resize / rotate quantization deferred until those paths grow snap-aware
pipelines of their own (see items #1, #6 follow-ups).

### 8. Keyboard shortcuts

Arrow-key nudge (1px / 10px with shift), bracket reorder, alignment hotkeys,
duplicate (Cmd+D), select-all, lock/unlock. Mapping table, modifier
conventions, document focus rules (when do shortcuts fire vs. fall through
to text-edit).

Current implementation notes:

- Full status table is in `docs/keybindings.md`. Routing infra is shipped; gaps
  are individual commands.
- Already registered (`keymap/defaults.ts` + `commands/defaults.ts`):
  `history.undo` / `history.redo` (Cmd+Z, Cmd+Shift+Z, Cmd+Y),
  `selection.deselect` (Escape), `selection.remove` (Backspace / Delete),
  `selection.group` (Cmd+G), `selection.all` (Cmd+A),
  `selection.sibling` (Tab / Shift+Tab via `args: "next" | "prev"`),
  `selection.align` (Alt+A/D/W/S/H/V via `args: AlignDirection`),
  `hierarchy.enter` (Enter), `hierarchy.exit` (Shift+Enter),
  `transform.nudge` (Arrow / Shift+Arrow, 1px / 10px via `args: { dx, dy }`),
  `reorder` (`]` / `[` / `Cmd+]` / `Cmd+[`, direction via `args`),
  `selection.duplicate` (Cmd+D — see §5).
- Command ships, binding deliberately deferred:
  `selection.set_opacity` (digit → opacity). The command is registered
  and `editor.commands.set_opacity` exists; the digit keybindings are NOT
  in the default keymap by decision (silent failure mode; issue #850). See
  `docs/keybindings.md` → Object Properties for the intended semantics.
- Missing (per `docs/keybindings.md` `[~]` and `[-]`):
  `clipboard.cut` / `copy` / `paste`, distribute
  (`Alt+Ctrl+H`/`V`), `paint.remove_fill` /
  `remove_stroke` / `swap`, visibility / lock toggles,
  viewport keys (zoom is in `gestures/defaults.ts` instead — see below),
  no tool-letter shortcuts (`V`/`R`/`O`/…) because the editor has no
  tool model.
- Cross-platform: `kb(KeyCode.KeyZ, M.CtrlCmd)` resolves to Cmd on Mac /
  Ctrl elsewhere via `@grida/keybinding`'s platform getter
  (`keymap.ts:platformGetter`). No hand-rolled `e.metaKey` checks in
  `keymap/defaults.ts`.
- Text-edit focus guard: `keymap.dispatch` calls `is_text_input_focused()`
  (`util/dom.ts`) and skips bindings without a "safe" modifier (Meta/Ctrl/Alt)
  when an `INPUT` / `TEXTAREA` / `contentEditable` element is focused.
  Note: the live SVG text-edit caret (`SvgTextSurface`) is NOT a
  contentEditable element; instead `dom.ts:on_keydown` returns early when
  `this.text_edit` is non-null, so all editor shortcuts are inert while
  inline text edit is active.
- `keymap.claims(e)` lets the host preventDefault on advertised keys even
  when the chain rejects (`dom.ts:on_keydown`).
- Viewport zoom shortcuts (`Cmd+=` / `Cmd+-` / `Shift+0` / `Shift+1` /
  `Shift+2`) live in `gestures/defaults.ts:KEYBOARD_ZOOM`, not the keymap —
  they're surface-scoped, not editor commands.
- Entry points to add: rows in `keymap/defaults.ts`, handlers in
  `commands/defaults.ts`. Tree-walk helpers on `SvgDocument`
  (`element_children_of`, `parent_of`) are sufficient for the sibling /
  select-all bindings already shipped — no new IR helper required.

### 9. Locked elements

Background research / terms to separate before choosing a policy:

- **Visibility.** A locked element may still render normally. Locking is not the
  same as `display="none"`, `visibility="hidden"`, or opacity changes. (Layer
  show/hide itself uses `visibility`, not `display` — see `docs/geometry.md`
  "Show/hide uses `visibility`, not `display`".)
- **Pickability / hit-testing.** SVG already has `pointer-events`, including
  `pointer-events="none"`, which affects browser hit-testing and DOM APIs such
  as `elementFromPoint` / `elementsFromPoint`. This is a pointer-targeting
  semantic, not a complete editor lock semantic.
- **Selectability.** Some editors allow locked elements to be selected or
  inspected; others make them unselectable from the canvas but still reachable
  from a layer/tree panel. "Selectable" and "transformable" should be treated
  as separate questions.
- **Transformability.** A locked element may reject translate / resize / rotate
  gestures even if it remains visible and discoverable.
- **Editability.** Locking may or may not block non-transform edits such as
  changing fill, stroke, text content, z-order, attributes, grouping, or delete.
- **Persistence.** SVG has native hit-test semantics but no general built-in
  editor-lock attribute. Durable lock state would require an editor convention
  such as custom metadata; ephemeral lock state would live only in runtime
  editor state.
- **Backend split.** DOM-backed picking can rely on browser hit-testing for the
  normal pointer path, but inspector-style queries that include non-pickable or
  locked elements may need an editor-owned query over the document model.

Open questions:

- Does "locked" mean visible but not transformable, or also not editable?
- Are locked elements selectable on canvas, only selectable in the layer tree,
  or not selectable at all?
- Does lock affect pointer hit-testing, editor commands, or both?
- Is lock document state that should survive save/load, or session-only editor
  state?
- If persisted, should it be represented as Grida-specific SVG metadata?

Current implementation notes:

- No lock state is implemented. There is no `data-grida-locked` (only
  `data-grida-id` — `dom.ts:ID_ATTR`), no `EditorState.locked` field, and
  no `commands.lock` / `unlock`.
- Hit-testing goes through `dom.ts:hit_test` → `owner_doc.elementFromPoint`
  → walk-up to `data-grida-id`. Native `pointer-events="none"` would already
  cause the element to be skipped by the browser (the walk-up resolves to
  the next painted ancestor); `pointer-events="all"` and the default
  `visible-painted` work as the browser defines them. The editor never
  injects `pointer-events` itself except temporarily during text edit
  (`text-surface.ts:55` sets `bounding-box` on the active `<text>`).
- `elementsFromPoint` is not used; only `elementFromPoint`. Any "click
  through to occluded element" UX would need a new path.
- Tree/layer panel selection goes through `commands.select(id)` →
  `set_selection` (`editor.ts`) which does not consult any hit-test or
  pickability gate, so layer-tree selection of a hypothetically locked
  node would "just work" once a lock attribute is introduced — only the
  pointer path needs filtering.
- Pickability / selectability / transformability / editability are not
  distinguished by any current type. `is_resizable(tag)` in
  `core/intents.ts` is a tag-level capability check, not a per-node lock.
- Entry points to add: a `data-grida-locked` attribute convention written
  during `render()` (`dom.ts`), a filter in `hit_test` and `handle_marquee`,
  a guard at the top of `handle_translate` / `handle_resize` /
  `handle_set_endpoint`, and (for "persisted" lock) a `<g data-grida-locked>`
  / custom-namespaced attr scheme respected by `parser.ts` and
  `document.ts:emit_attr`.

### 10. Grouping / ungrouping

Grouping and ungrouping should be treated as fundamentally different operations.
Grouping is mostly an authoring / organization action. Ungrouping is a
flattening action and can change rendering semantics if the group carries SVG
state.

#### Grouping — implemented

The grouping spec below is implemented as of `selection.group` + `Cmd+G`.
The accept/reject decision tree (cross-parent, non-contiguous, constrained
parents, valid `<g>`-child predicate) and the round-trip / whitespace
caveats are documented in [`docs/grouping.md`](docs/grouping.md). Ungrouping has
shipped — see the §Ungrouping section below.

Use the real SVG `<g>` element as the grouping primitive.

User-facing behavior:

- `Cmd+G` groups the current selection.
- The created group becomes the new selection.
- The group can be moved / transformed as a single unit.
- The original children remain editable after entering / expanding the group
  through future UI affordances such as a layer tree, double-click, or explicit
  isolation mode.
- Grouping should require **2 or more selected nodes**. Grouping a single node
  usually adds a wrapper without adding user value.

Authoring rule:

- Grouping wraps selected nodes in a new `<g>`.
- Do not add attributes to the new `<g>` unless needed. In particular, do not
  generate an `id` just because a group was created.
- Prefer grouping only nodes that share the same direct parent.
- Prefer grouping only contiguous siblings, because grouping non-contiguous
  siblings can change paint order unless intervening nodes are also moved.

Example:

```svg
<rect id="a" />
<circle id="b" />
```

After grouping:

```svg
<g>
  <rect id="a" />
  <circle id="b" />
</g>
```

Why grouping itself is usually safe:

- A plain `<g>` with no attributes is a structural container.
- Wrapping contiguous siblings in a plain `<g>` preserves child order.
- The child elements keep their original attributes and geometry.
- The group introduces a useful editor handle without needing a custom SVG
  object model.

Optional nice-to-have:

- Avoid unnecessary nested grouping. If the selection is already exactly one
  group, `Cmd+G` should probably be a no-op.
- If the selection contains a group plus other siblings, grouping is still valid
  because the new group represents a new larger selection unit.
- If the selection contains all children of an existing group, avoid wrapping
  them in another group unless the user explicitly asks for a new nested group.

#### Ungrouping — background research / limitations

Ungrouping is not the inverse of grouping in all cases. Removing a `<g>` means
splicing its children into the parent. This is only visually trivial when the
`<g>` is a plain structural wrapper.

Cases to study before choosing policy:

- **Plain group.** `<g><rect/><circle/></g>` can usually be removed by moving
  children into the parent at the same position.
- **Group with `transform`.** The group transform affects all children. Naive
  removal changes output. Preserving appearance requires composing / baking the
  group transform into each child or descendant.
- **Child already has `transform`.** Transform order matters. The former group
  transform and the child transform must compose in the same visual order.
- **Inherited presentation attributes.** Attributes such as `fill`, `stroke`,
  `font-*`, `opacity`-like inherited properties, and other presentation values
  may be inherited from the group. Removing the group can change children that
  depended on inheritance.
- **Group `opacity`.** Group opacity is applied after children are composited.
  Pushing opacity to each child is not generally equivalent, especially when
  children overlap.
- **Group `filter`.** A filter on the group applies to the rendered group as a
  whole. Applying the same filter to each child can produce different output.
- **Group `clip-path` / `mask`.** Group-level clipping or masking may not be
  equivalent to per-child clipping or masking.
- **CSS classes / selectors.** A group may carry `class`, `style`, or participate
  in selectors that depend on ancestry, child position, or grouping structure.
  Ungrouping can change cascade results even if attributes are copied.
- **Referenced groups.** A `<g id="...">` may be referenced by `<use>`. Removing
  or rewriting it can break references or change all instances.
- **Groups inside `<defs>`.** These may be definitions/assets rather than canvas
  groups. Treating them as ordinary editable groups may be incorrect.
- **Animated group attributes.** Animations may target the group itself, e.g.
  animated `transform`, `opacity`, or style. Ungrouping can break animation
  targets or timing semantics.
- **Markers, filters, masks, and coordinate systems.** Some referenced resources
  depend on object bounding boxes, current user space, or inherited context.
  Ungrouping can change the coordinate context.

Open questions (answers below reflect the shipped clean-structural subset):

- Does `Cmd+Shift+G` only allow plain structural groups? **Yes** — own
  attributes must be a subset of `{ transform, id, data-grida-id }`.
- Do we reject ungrouping when the group has non-trivial visual state?
  **Yes** — refused (no-op, no history), not silently mishandled.
- Do we distinguish "ungroup" from a more destructive "flatten group"
  command? **Not yet** — only `ungroup` ships; a destructive
  "flatten group" (per-child opacity / filter / cascade preservation) is
  still deferred.
- How much visual preservation do we attempt for transforms and inherited
  presentation attributes? **Transforms only** — the group `transform` is
  baked into each child (op-list prepend). Inherited presentation
  attributes are not preserved; a group carrying them is refused instead.
- How much CSS cascade preservation do we attempt? **None** — a group with
  `class` / `style` is refused rather than flattened.

Current implementation notes (grouping):

- `commands.group()` ships (`editor.ts`), backed by the read-only policy
  gate in `core/group.ts:plan_group` (same-parent + valid-tag +
  non-constrained-parent + contiguous-sibling rules; full decision tree in
  `docs/grouping.md`).
- `<g>` is treated as a first-class node: `tag_of(id) === "g"` triggers the
  `viaTransform` translate baseline (`core/intents.ts:capture_translate_baseline`)
  so moving a group writes a `transform` on the `<g>`. `<g>` is not
  resizable (not in `is_resizable`'s allowlist).
- The group node has no `id` attribute by design — `doc.create_element("g")`
  in `editor.ts` adds only a `data-grida-id`. The SVG `id` is left empty per
  the §10 spec.
- `commands.group()` reverse-iterates `plan.children` on revert so each
  child's captured `next_element_sibling_of` anchor is still present in
  the parent on re-insert — paint order is exactly restored.
- Grouping does not exist for single-node selections (`commands.group()`
  returns `false`); `plan_group` itself accepts `length === 1` but the
  default command handler in `commands/defaults.ts:selection.group`
  gates on `length === 0` only. See `docs/keybindings.md`'s "should be 2+"
  note for the user-facing UX rule.

Current implementation notes (ungrouping):

- **Ships for the safe clean-structural subset.** `commands.ungroup({ id? })`
  (`editor.ts`) is gated by the read-only policy `core/group.ts:plan_ungroup`
  and bound to **Cmd/Ctrl+Shift+G** (`selection.ungroup` in
  `keymap/defaults.ts` + `commands/defaults.ts`). One atomic history step;
  undo restores the group, its children, and their transforms byte-equal.
- **Accepted:** a `<g>` that is a plain structural wrapper — own attributes
  are a subset of `{ transform, id, data-grida-id }` — with **at least one**
  element child, NOT inside `<defs>`, NOT referenced by any `<use>`
  (`href` / `xlink:href === "#<id>"`, enumerated via `find_by_tag`), and
  with no direct SMIL animation child (`animate` / `animateTransform` /
  `animateMotion` / `set`). When the group carries a `transform`, every
  child's own `transform` must be parseable.
- **Refused (no mutation, no history) — the rendering-semantics-changing
  cases from the research above:** any group `opacity` / `filter` /
  `clip-path` / `mask` / `class` / `style` / inherited presentation attr
  (`fill`, `stroke`, `font-*`, …); a `<g>` referenced by `<use>`; a `<g>`
  inside `<defs>`; an animation-bearing `<g>`; an empty `<g>`; a `<g>` whose
  (or whose child's) transform doesn't parse; and any non-single-`<g>`
  selection. These are honest refusals — the package does NOT attempt the
  per-child opacity / filter / cascade preservation those cases would need.
- **Transform bake:** when the group has a `transform`, it is baked into each
  child by PREPENDING the group's parsed ops to the child's parsed ops and
  re-emitting clean tokens (`transform.parse` / `transform.emit` in
  `core/transform.ts`) — e.g. group `translate(10 20)` + child `rotate(5)`
  → child `translate(10 20) rotate(5 0 0)`. This is an op-list compose, NOT
  a `matrix(...)` collapse: SVG applies transform lists left-to-right, so the
  group's ops must lead the child's to preserve visual order, and keeping
  clean tokens stays human-readable and round-trips through the parser
  without trig drift.
- **Still not attempted (deferred):** inherited-presentation push-down,
  group-`opacity` flattening, group-`filter` / `clip-path` / `mask`
  per-child equivalence, CSS-cascade preservation, and a distinct
  destructive "flatten group" command. A real "preserve appearance" ungroup
  of a stateful group would need computed-value reads (the DOM-attached
  `getComputedStyle` path) — out of scope for the clean-structural subset.

### 11. Camera fit breaks when root SVG uses percentage / responsive sizing

Background:

- The DOM surface composes its world↔screen mapping by applying a CSS
  `translate + scale` transform on the mounted `<svg>` element. The math
  assumes the SVG renders at **intrinsic pixel dimensions matching the
  world bounds** the camera uses for `fit("<root>")` (the viewBox, in
  practice). That's true when the root declares `width="800" height="600"`
  or similar pixel values.
- When the root declares `width="100%" height="100%"` (or omits them, or
  uses any non-pixel unit that resolves against the parent), the `<svg>`
  element sizes itself to its container and runs its own internal
  `preserveAspectRatio` fit. The camera's transform then stacks on top of
  an already-scaled element — world bounds and rendered geometry no longer
  agree.

Observable symptoms:

- `camera.fit("<root>")` overshoots: the SVG visibly overflows the
  viewport instead of fitting with the requested margin.
- `camera.reset()` (identity transform) coincidentally _looks_ fitted,
  because the SVG had already auto-fit itself to the container before any
  camera transform applied. Users hit this as "100% fits, Fit overflows" —
  reversed from expectation. Reproduces with `/svg`'s Observatory
  fixture (`width="100%" height="100%"`); `/svg/examples/slides` is unaffected
  because its fixture uses fixed pixel dimensions.

Why this is an engine concern (not a fixture concern):

- Most authored / exported SVGs (Figma, Illustrator, Sketch, browser
  screenshot tools) declare explicit pixel dimensions, so the issue is
  rare in the import-from-design-tool path. But hand-authored,
  web-embedded, and responsive SVGs routinely use `width="100%"`, and
  one of the editor's goals is to grow to fit real SVGs in the wild.
- It's silent and confusing — `fit()` runs without error, the user
  just sees the wrong thing.

Possible directions (none chosen):

1. **Normalize on parse.** When the root has non-pixel `width` / `height`,
   replace them with pixel values derived from the viewBox (or strip them
   entirely so the camera's CSS sizing is authoritative). Cheapest;
   round-trips back to the original on `serialize()` need care — we'd
   have to remember the original declarations to avoid mutating user
   intent.
2. **Force intrinsic sizing in CSS.** Apply `svg { width: <vb_w>px;
height: <vb_h>px }` on the attached root during mount so DOM-rendered
   geometry matches what the camera models, regardless of authored attrs.
   Less invasive than normalize-on-parse, but the CSS rule has to track
   viewBox edits.
3. **Teach the camera.** Detect the case and adjust the world↔screen
   mapping to account for the SVG's internal auto-fit. Most invasive;
   would compose the SVG's own `preserveAspectRatio` transform into the
   camera's math.

Entry points to inspect when picking a direction: `core/parser.ts` (root
attr handling), `dom.ts` (mount path that injects the parsed SVG into the
container), `core/camera.ts:fit` and `core/camera.ts:resolve_bounds`
(world-bounds source — currently viewBox-based).

### 12. ~~`SvgEditorProvider` conflates "initial document" with "live document"~~ — **RESOLVED**

> **Resolution:** Option 1 (split prop, imperative live-update) applied in
> `v1.0.0-alpha.8`. `SvgEditorProviderProps.svg` was renamed to `initialSvg`
> and the reactive `useEffect`-driven `editor.load(svg)` was removed.
> Subsequent changes to `initialSvg` are silently ignored — matching the
> Lexical / Slate / TipTap convention. Hosts that need live document
> replacement (file open, page switch, reset) call `useSvgEditor().load(...)`
> imperatively, or remount the provider with a different `key`.
>
> Receipts:
>
> - **Lexical** (`packages/lexical-react/src/LexicalComposer.tsx:60-123`): `initialConfig.editorState` is wrapped in `useMemo([])`. Docs (`docs/getting-started/react.md:193`): _"Lexical is generally meant to be uncontrolled, so avoid trying to pass the EditorState back into Editor.setEditorState or something along those lines."_
> - **Slate** (`packages/slate-react/src/components/slate.tsx:38-55`): `initialValue` is consumed inside a `React.useState(initializer)`. Renamed from `value` in 0.94.3 (PR #5421) _"to emphasize uncontrolled nature of it"_ — the exact migration we just performed.
> - **TipTap** (`packages/react/src/useEditor.ts:160-199`): `content` is excluded from `compareOptions`'s re-apply whitelist; live updates flow through `editor.commands.setContent(...)`.
>
> Original problem statement kept below for historical context.

### 12 (historical). `SvgEditorProvider` conflates "initial document" with "live document"

Background:

- The React provider's current contract (`src/react.tsx:SvgEditorProvider`):
  mount once, then any subsequent change to the `svg` prop calls
  `editor.load(svg)`. That re-parses the document, rebuilds the IR, and
  fires every `editor.load` listener — including preset hooks like
  `keynote.attach`'s refit-on-load that resets the camera.
- The prop is a single value, but it covers two unrelated lifecycles:
  - **Initial document** — host-controlled, mount-scoped, infrequent.
  - **Live document during a session** — gesture-rate, editor-owned;
    the only legitimate "external reload" trigger is the host explicitly
    swapping the file (page switch, file open, undo to a snapshot).

Observable symptoms:

- Any host that round-trips edits back into the prop hits a feedback
  loop: commit → `editor.serialize()` → host state update → provider
  sees new `svg` prop → `editor.load()` → preset refit → camera /
  selection / per-session UI state resets.
- Reproduces in the multi-page slides demo at
  [`editor/app/(canvas)/svg/examples/slides/page.tsx`](<../../editor/app/(canvas)/svg/examples/slides/page.tsx>):
  the demo serializes the active page on every commit (to power
  thumbnails). Without intervention, every gesture commit resets the
  zoom/pan because the provider re-loads with the freshly serialized
  string. The demo currently works around it by `useMemo`'ing the prop
  with only `activeId` as a dep — correct for the current API, but the
  trap remains for any other host that doesn't think to do this.
- Doesn't reproduce in `/svg` (free-form) because that demo
  doesn't echo `editor.serialize()` back into the `svg` prop. The trap is
  latent, not absent.

Why this is an engine concern:

- The misuse looks idiomatic in React. "Drive the editor from state, get
  notified on edits, update state" is the default mental model. The host
  has to know that one half of that loop is forbidden — and the type
  signature doesn't say so.
- Even the "right" host pattern (memoize the prop, freeze it after
  mount) is non-obvious; it took chasing through preset internals and
  the provider's `useEffect` to identify the root cause.
- React's own ecosystem has solved this exact problem already with the
  `defaultValue`/`value` split on text inputs. The editor providers most
  React developers reach for (Slate, Lexical, ProseMirror, Monaco) all
  split the props for the same reason.

Suggested fix (NOT applied — flagging for review before any engine change):

The cleanest fix is API-level on the provider, in
`src/react.tsx:SvgEditorProvider`. Three plausible shapes, in
descending order of preference:

1. **Split the prop.** Rename the current `svg` prop to `initialSvg`
   (mount-only — read once in the `useState(() => …)` initializer that
   constructs the editor, never read again). Document `editor.load(...)`
   as the supported live-update path. Misuse becomes a type error: the
   prop is consumed exactly once. This matches Slate / Lexical /
   ProseMirror / Monaco conventions and is the cleanest mental model
   for hosts.
2. **Skip no-op loads.** Inside the existing `useEffect(svg)`, compare
   the incoming string to `editor.serialize()` and bail when equal.
   Cheap (string compare on the IR's own output, which the host
   serialized from in the first place) and silently absorbs the
   round-trip. Backwards-compatible — no host code changes required.
   Downside: hides the misuse rather than eliminating it; a host that
   _intends_ to reload with the same content (e.g. discard local changes
   back to the saved version) gets a surprising no-op.
3. **Gate on an explicit `loadKey`.** Add a `loadKey?: number | string`
   prop; the provider reloads only when `loadKey` changes, not when
   `svg` changes. Hosts get an imperative "reload now" without changing
   the `editor.load(...)` API surface. Less invasive than (1), more
   explicit than (2). Downside: API grows by a prop, and the host now
   has two ways to express "reload" (bump `loadKey` vs call
   `editor.load`).

Recommendation: **(1)**. The type-system enforcement closes the trap
permanently; the other two only paper over it. Migration cost is a
one-line rename per host plus an `editor.load(...)` call wherever hosts
actually want live updates (currently zero such hosts).

Entry points to inspect when picking a direction:
`src/react.tsx:SvgEditorProvider` (the `useEffect(svg)` that drives the
reload), `src/core/editor.ts:SvgEditor.load` (the imperative path that
would become the supported live-update API).

### 13. Text editing

Text editing dedicated spec documentation.
needs `<tspan>` support as well ?

Current implementation notes:

- Inline editing is implemented for the **single-flat-run** case. The host
  driver is `dom.ts:enter_content_edit`, which mounts an `SvgTextSurface`
  (`text-surface.ts`) and a `@grida/text-editor` `createTextEditor`. Entry
  is via the HUD's `enter_content_edit` intent (`dom.ts:commit_intent`) —
  e.g. double-click on a `<text>` — or programmatically via
  `editor.enter_content_edit(id)` (`editor.ts`).
- `document.ts:is_text_edit_target` gates eligibility: target must be
  `<text>` or `<tspan>` AND have only text children (no nested `<tspan>` /
  `<textPath>` / etc.). So a `<text>` containing any `<tspan>` is currently
  **not editable** through the inline UI; that's a known v1 limitation per
  the docstring on `is_text_edit_target`.
- `<tspan>` is _parsed_ and _preserved_ (`parser.ts` treats them like any
  element; `serialize()` round-trips them). They participate in selection
  / translate (`capture_translate_baseline` has a `tspan` arm shifting
  `x`/`y`). They do not get an authoring command for create / split /
  merge.
- `commands.set_text(value)` (`editor.ts`) replaces all direct text
  children with a single text node via `document.ts:set_text` — destructive
  to any pre-existing `<tspan>` structure if invoked on a parent `<text>`.
  The gate (`is_text_edit_target`) prevents that for current text editing,
  but a programmatic `set_text` against a `<text>` with `<tspan>`s would
  silently flatten.
- Text edit caret + selection are rendered as **sibling SVG `<rect>`s** of
  the outer `<text>` (`text-surface.ts:SvgTextSurface`), not as HUD-canvas
  overlays. The text element gets temporary `xml:space="preserve"` and
  `pointer-events="bounding-box"` during edit; both are restored on
  commit/cancel.
- Geometry is single-line: `positionForNavigation` (`text-surface.ts`) maps
  Up / Down / line_start / line_end to doc-start / doc-end. Multi-line
  `<text>` / wrapping / `dx`/`dy` per-glyph offsets are not modeled.
- Inherited font styles (`font-family`, `font-size`, …) come from
  `getComputedStyle(textEl)` (`text-surface.ts:metrics`) — works for the
  DOM-attached preview but breaks for any non-DOM surface.
- Entry points to extend: relax `is_text_edit_target` and teach
  `text-surface.ts` about multiple runs / line breaks; introduce a
  dedicated `commands.set_tspan_text(id, value)` so flat-string writes
  don't have to traverse parent `<text>`; design what "edit a `<text>`
  with `<tspan>` children" routes to (parent vs. nearest tspan).

### 14. Promote degenerate-line label trick to a `HUDLabel` primitive

`compute_size_meter_extra` (`dom.ts`) emits a **zero-length `HUDLine`**
with a `label` to render the `W × H` pill below each selection. It works,
but it leaks an implementation detail of the HUD canvas:

- The label position relies on `primitives/canvas.ts:~L205` using a
  strict-`<` tie-break on `Math.abs(x2-x1) < Math.abs(y2-y1)`. Both
  zero → false → label placed at `(midX, midY + LABEL_OFFSET)`. Flipping
  that to `<=` or `>` would silently flip the meter's orientation.
- `compute_measurement_extra` and the future snap engine are the only
  other label-bearing extras today, and both attach labels to _real_
  lines. The size meter is the first "pill anchored at a point with no
  segment" use case.

Fix: add a `HUDLabel { x, y, text, color?, anchor? }` primitive to
`@grida/hud` (`primitives/types.ts`, renderer in `primitives/canvas.ts`),
extend `HUDDraw.labels?: HUDLabel[]`, then rewrite
`compute_size_meter_extra` to emit one `HUDLabel` per selected node.
Backstop the existing tie-break with a unit test in `@grida/hud` so a
future refactor breaks the test, not the meter.

### 15. Per-element geometry primitives leak across the package boundary

To render editable X/Y/W/H fields, a host has to hard-code the SVG-attribute
table per tag: rect/image/use → `(x, y, width, height)`, circle →
`(cx, cy, r)`, ellipse → `(cx, cy, rx, ry)`, line → `(x1, y1, x2, y2)`. This
is _per-element edit semantics_ leaking into the host, which README §P3
explicitly designates as **internal architecture, not extension points**
("The SVG spec is the registry; we implement against it"). The package's
own `ResizeAttrs` discriminated union (`src/core/intents.ts:240`) already
names this table — it just isn't exported.

Two related shortcomings, in increasing order of design weight:

**15.1. Export `ResizeAttrs` (or a typed `node_kind(id)` accessor).** The
type already exists and is the closed registry the host wants. A
`editor.node_kind(id): ResizeAttrs["kind"]` accessor (or
`editor.node_geometry_primitives(id): { kind, attrs }`) collapses the
host-side per-tag table to a `switch`. The `kind: "unsupported"` arm
naturally handles g/text/path/poly. Zero design work, modest API addition.

**15.2. Add `editor.commands.resize_to(id, target: Rect)`.** The current
public API can write X/Y/W/H only for tags whose attributes literally
happen to be named `x/y/width/height`. For path / text / g / poly /
circle (where "width" means `r * 2`?), the host has no unified way to
write a target rect — even though `apply_resize` (`src/core/intents.ts`)
already knows how. The shape is _not_ a flat
`set_bounds({x?, y?, w?, h?})` — §2 above entertains three semantic
interpretations of resize (transform / surgery / restrict) and a flat
setter would force one answer at the host call site. The right shape is
`resize_to(id, target: Rect)` routed through the existing `apply_resize`

- `capture_resize_baseline` machinery, so per-tag policy stays in one
  place.

When 15.1 and 15.2 both land, a host inspector collapses to: one read of
`node_kind(id)`, a switch over the closed enum, and either typed
attribute rows or a single bbox-edit row routed through `resize_to`. No
host-side per-tag table.

## 16. Policy Class wiring — outstanding moves

The Policy Class layer (`src/core/policy-class/`) replaced the legacy
per-tag switches for the resize intent. Five deferred moves remain
before rotate / other intents can land on the same shape.

### 16.1. Text class is unwired.

`is_resizable("text") === true` (legacy), but Policy Class declares
Text as deferred — no resize cells in `SOLUTION_SPACE` or
`CHOSEN_POLICY` (`src/core/policy-class/tables.ts`). The resize
dispatcher routes `<text>` to `resize_text` which preserves legacy
behavior verbatim (uniform corner scaling, edge refusal); the chosen
policy is **not** read from `chosen_policy("text", "resize")`. Every
other class is policy-driven. Resolve by designing the Text Policy
Class properly — font-size scaling vs. container-box scaling,
anchor-attribute handling, the size-meter UX problem (§13). Then fill
in `tables.ts` cells, flip the cross-check test, and replace
`resize_text`'s body with a policy switch.

### 16.2. `ResizeBaseline.attrs.kind` discriminates by tag, not by class.

`ResizeAttrs` in `src/core/intents.ts` is `"rect" | "image" | "use" |
"circle" | …` — one variant per SVG tag. Three of five class handlers
in `src/core/policy-class/handlers/resize.ts` have to narrow a union
wider than their class membership (VertexChain checks three of eleven
variants; VertexBox checks three; Circle / Ellipse / Path each check
one). The guards are dead code if the dispatcher is correct — they
exist to satisfy TypeScript narrowing. Restructure by either lifting
to per-class baseline types (`VertexChainBaseline` with nested
`{ kind: "line" | "polyline" | "polygon"; ... }`) or making
`dispatch_resize` pre-narrow before handler dispatch.

### 16.3. Legacy `is_resizable` / `is_resizable_node` still in `intents.ts`.

Two legacy capability functions with hardcoded tag-string lists. The
new equivalent is `accepts(policy_class_of(tag), "resize")`. Two
sources of truth; nothing prevents drift if one is updated without
the other (the cross-check test catches it after the fact). Migrate
the remaining callers (`resize-pipeline/orchestrator.ts` boundary
check, `dom.ts:handle_resize`) to the Policy Class lookup; delete
both functions in one PR. ~20 LOC plus test updates.

### 16.4. `is_rotatable` is stranded in `intents.ts`.

After `SvgDocument` absorbed the structural-fact predicates,
`is_rotatable` is a four-line composer over delegated checks — it
does no fact-finding itself. It's the rotate-class analogue of
`dispatch_resize` and should live in `policy-class/handlers/rotate.ts`
when rotate gets wired through Policy Class. Two resolutions when
that lands: (a) each rotate handler asks `SvgDocument` for its own
safety facts and composes its own verdict — `is_rotatable` retires
entirely; (b) move `is_rotatable` into a `policy-class/handlers/
rotate.ts` composer the dispatcher calls before per-class dispatch.
(a) is cleaner if rotate handlers genuinely differ; (b) is simpler if
they don't.

### 16.5. `dom.ts` per-tag branches not yet retired.

Six tag-string checks in `src/dom.ts` covering `shape_of`,
`container_box`, insert-draw snap gating, `handle_set_endpoint`, and
snap bbox-source selection. Class-level metadata
(`bbox_snap_source(cls)`, `accepts_rect_snap_during_insert(cls)`,
`accepts_endpoint_edit(cls)`) currently uses hardcoded tag strings.
These are class-keyed and don't depend on resolved SVG state, so they
fit Policy Class. Add the metadata queries to `policy-class/`,
refactor `dom.ts` to consult them. Effort: tiny.
