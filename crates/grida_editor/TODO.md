# TODO

Master ledger of the rust-native editor program: what
[`docs/wg/canvas`](../../docs/wg/canvas/index.md) specifies, what this
crate implements, and what the conformance suite verifies. Listed by
area; order is not priority. The spec docs stay the source of truth —
per-concept deferral details live in each doc's own deferred notes;
this file only tracks status.

A box is checked when the concept is **specced, implemented, and its
conformance suite is green**. Per
[harness.md](./docs/harness.md), a contract without a
citing test is _unverified_: those are tracked under
[Contract coverage](#contract-coverage) rather than by unchecking a
shipped concept.

Suite status: **443 tests green** (core; 453 under `--features shell`)
across 28 contract suites, plus a shell-gated raster suite
(`tests/menu_render.rs`, run under `--features shell`) (2026-07-05; +`tests/align_contracts.rs`, ALIGN 7/7; +`tests/paint_contracts.rs`,
the `fills` binding domain; +`tests/text_contracts.rs`, the typography
binding domain; +`tests/effect_contracts.rs`, the layer-effects binding
domain (Slice 1 — blur + shadows, 14/14); + grouping-wiring tests —
`grp_contracts` multi-ungroup composition + GRP-5 retarget targets,
`menu_contracts` ungroup enablement, `key_contracts` Mod+G/Shift+G/Alt+G
resolve).
Coverage numbers below are `grep`-derived: ids defined
in `docs/wg/canvas/**, the feat-* studies, and this crate's docs/**` vs ids cited in `tests/**`.

## Milestones ([harness.md](./docs/harness.md))

- [ ] **M1 — core.** Suites green (`doc`/`ed`/`hist`, no renderer,
      ARCH-1 cited). Remaining: DOC-1/6, ED-2/4, HISB-6/8
      unverified.
- [ ] **M2 — canvas.** Surface + all overlay systems live; SNAP,
      MEAS, RUL, TG at full citation, PXG-6 open. Remaining:
      SURF-1/3/6 unverified, PERF-2/PERF-4 budgets not in suite.
- [ ] **M3 — panels.** UI 7/7 and HIER 8/8 green. Remaining: widgets
      gaps (WID-4/5/6), properties behaviors (PROP 2/9), shell
      contracts (SHELL 0/4), PERF-1/PERF-3.
- [ ] **M4 — the deliverable.** IO and SYNC suites green (IO 5/7,
      SYNC 7/8). Remaining: IO-2/7, SYNC-6, PERF-5, and the
      two-instance concurrent-authoring demo as a suite-run scenario.

## Concepts

### Core

- [x] **document** — [spec](./docs/document.md) ·
      `src/document.rs` · `tests/doc_contracts.rs`
- [x] **editor** — [spec](./docs/editor.md) ·
      `src/editor.rs` · `tests/ed_contracts.rs`
- [x] **history** — [spec](./docs/history.md) ·
      `src/history.rs` · `tests/hist_contracts.rs`. Revised 2026-07:
      stack-level bucket coalescing removed (committed entries are
      immutable, HISB-3 rewritten); tolerant application added
      (HISB-9); before-context capture fixed (HISB-1 verified).
      Entry `kind` → display-only `label`.
- [x] **sync** — [spec](../../docs/wg/feat-crdt/sync.md) ·
      `src/sync.rs`, `src/sync_net.rs` · `tests/sync_contracts.rs`
- [x] **frame** — [spec](./docs/frame.md) · damage
      ledger in `src/editor.rs` · `tests/frame_contracts.rs`

### Interaction

- [x] **surface** — [spec](../../docs/wg/canvas/surface.md) ·
      `src/interpret.rs` + hud + shell ·
      `tests/interpret_contracts.rs`, `tests/slice_contracts.rs`
- [x] **hud** — [spec](./docs/hud.md) · `src/hud/` ·
      `tests/hud_contracts.rs`, `tests/slice_contracts.rs`
- [ ] **targeting** — [spec](../../docs/wg/canvas/ux-surface/targeting.md)
      (TGT-1..10) done; impl pending. Bridge has point/rect hit entry
      points; graph-distance targeting, descent, deep-select, and
      marquee predicates are not built.
- [ ] **selection partition** —
      [spec](../../docs/wg/canvas/ux-surface/selection-partition.md)
      (PART-1..5) done; impl partial. The partition function
      (`WorkingCopy::partition_selection`, PART-1 cited in
      `tests/grp_contracts.rs`) ships — group by direct parent, scene =
      `None` partition, sibling order preserved. Remaining: the N-boxes
      HUD presentation (PART-2), the taxonomy/refusal contracts
      (PART-3/5) as cited tests. Studied from the web canvas
      (`SurfaceSelectionGroup` + the reducers' `getParentId ?? scene_id`
      groupBy).
- [ ] **edit mode** — [spec](../../docs/wg/canvas/edit-mode.md)
      (MODE-1..10) done; impl substantial: the exclusive slot, the
      MODE-2 dispatch table, and the flatten-primitives entry
      (`flatten_to_vector` — engine shape builder → outline network,
      style preserved, one undoable entry) live (`src/mode.rs` ·
      `tests/mode_contracts.rs`, MODE-1/2/6/7/8/10 cited; deferred
      rows exist as enum members so the resolution order is
      contract-tested). Remaining: paint sessions (gradient/image),
      the width facet (MODE-4), text-slot mirror (session stays
      engine-owned), MODE-3/5/9.
- [x] **tool** — [spec](../../docs/wg/canvas/tool.md) · `src/tool.rs`
      · `tests/tool_contracts.rs` (TOOL 9/9). The pen itself is
      tracked under **vector edit**.
- [ ] **translate** — [spec](../../docs/wg/canvas/translate.md)
      (TRL-1..9) done; the plain move gesture ships under
      surface/snap. Clone-on-translate (Alt) and live re-parenting
      with the drop-target overlay are pending.
- [x] **vector edit** — [spec](../../docs/wg/feat-vector-network/vector-edit.md) ·
      `src/vector/{ops,hit,mode,chrome}.rs` ·
      `tests/vector_contracts.rs` (VEC 14/14, incl. the pen's full
      click/drag state machine, bend, tangent mirroring, live marquee
      sub-select, history-rescinding VEC-2 cleanup) + a sync e2e
      (full tangent networks over loopback). The
      `vector_network` patch domain + wire form replaced the
      polyline-only cap; shell wiring includes pen entry (`P` on a
      selected vector/primitive or pen-from-scratch), the enter idiom
      (Enter / double-click, with primitives flattening on entry),
      double-click-on-empty exit (VEC-13), and the mode's Esc/Delete/
      nudge key capture. Deferred, named in `src/vector/mod.rs`:
      lasso tool, width facet, VSNAP, region derivation.
- [x] **snap** — [spec](../../docs/wg/canvas/snap.md) · `src/snap.rs`
      · `tests/snap_contracts.rs` (SNAP 11/11). Group-descent
      refinement newly specced (SNAP-12..15): snap targets are the
      rendered *atoms* — descend groups to their contents, drop the
      group's derived envelope (a behavior change from the current
      bbox+leaves neighborhood), keep opaque composites (boolean /
      instance) as leaves, rigidity / self-exclusion / degenerate
      rejection. Impl + tests pending.
- [ ] **snap — vector** —
      [spec](../../docs/wg/feat-vector-network/snap-vector.md) is a placeholder
      (VSNAP reserved); blocked on the `math2` point-anchor snapping
      gap; needed by vector edit.
- [x] **measurement** — [spec](../../docs/wg/canvas/measurement.md) ·
      `src/measurement.rs` · `tests/meas_contracts.rs` (MEAS 6/6)
- [x] **ruler** — [spec](../../docs/wg/canvas/ruler.md) ·
      `src/ruler.rs` · `tests/ruler_contracts.rs` (RUL 10/10)
- [x] **pixel grid** — [spec](../../docs/wg/canvas/pixel-grid.md) ·
      `src/pixel_grid.rs` · `tests/pxg_contracts.rs` (PXG-6 open →
      coverage)
- [x] **transparency grid** —
      [spec](../../docs/wg/canvas/transparency-grid.md) ·
      `src/transparency_grid.rs` · `tests/tg_contracts.rs` (TG 3/3)

### Input

- [x] **keybindings** — [spec](./docs/keybindings.md) ·
      `src/keys.rs` · `tests/key_contracts.rs` (KEY 6/6). The
      normative sheet as data: meaningful-modifier masks with
      enumeration-time overlap detection, the virtual primary
      modifier, command chains over the registry enum, focus-legal
      and `(hold)` row marks, the opacity multi-tap machine; the
      shell's key routing dispatches through the table (no inline
      behavior). The Arrange z-order rows resolve via `src/arrange.rs`
      (unit-tested). Sheet rows whose commands await their features
      are **not shipped** (named in `src/keys.rs` module docs):
      auto-layout, boolean, text style, outline mode,
      color picker, toggle locked (no `locked` prop yet), remove
      fill/stroke. Align & distribute now ship (see **align**); group /
      ungroup / group-with-container ship (see **grouping**).
- [ ] **routing** — [spec](./docs/routing.md); chain
      dispatch, `claims`, and the capture-layer order are live
      (`src/keys.rs` + the shell's key routing; ROUTE-1/3 cited).
      Remaining: ROUTE-2 state-hash checks, ROUTE-4/5 as cited tests,
      and the ROUTE-6 intent matrix.
- [x] **traversal** — [spec](../../docs/wg/canvas/traversal.md) ·
      `src/traverse.rs` · `tests/trav_contracts.rs` (TRAV 5/5;
      TRAV-5's camera-reveal half is shell wiring — the suite covers
      its records-nothing half).
- [ ] **nudge** — [spec](../../docs/wg/canvas/nudge.md) ·
      translate/resize nudge in `src/interpret.rs`, camera pan + key
      wiring in the shell · `tests/nudge_contracts.rs` (NUDGE-1/3/5
      cited). Remaining: NUDGE-2 burst framing (a dwell-closed
      gesture at the interaction layer — never stack merging),
      NUDGE-4 in-flow reorder (needs auto-layout flow), and NUDGE-6
      advisory guide (the keyboard-only post-nudge alignment flash —
      reveals, never corrects; ported from the svg-editor's
      `NudgeDwellWatcher`).

### Structure

Per-partition commands over [selection partition](../../docs/wg/canvas/ux-surface/selection-partition.md)
(each inserts one adopting parent per group). Spec-only; impl pending.

- [ ] **grouping** — [spec](../../docs/wg/canvas/grouping.md)
      (GRP-1..6) done; impl substantial. The pure resolver
      (`src/grouping.rs` — `group`/`ungroup`, the align.rs pattern: over
      the working copy + world-bounds oracle + injected id minter → one
      history entry) ships with `tests/grp_contracts.rs` (GRP-1/2/3/4
      cited, incl. cross-parent per-partition wrap, world-position hold
      under a nested parent, frontmost-slot depth, ungroup round-trip,
      container-wrap). **Command wired** (2026-07): `Command::Group`/
      `Ungroup`/`GroupWithContainer` dispatch from the sheet's Arrange
      rows (`Mod+G` / `Mod+Shift+G` / `Mod+Alt+G`, `src/keys.rs`) and the
      canvas context menu (`src/menu.rs`, Ungroup gated on a dissolvable
      member). Shell handlers (`src/shell/app.rs`): `group_selection`
      pre-mints one wrapper id per partition (the flatten pool pattern)
      and resolves against the engine world bounds; `ungroup_selection`
      dissolves every selected group as one entry, ordering them by
      **descending** document index so the single-id resolver's batches
      compose (`grp_contracts` multi-ungroup arbiter), skipping a
      dissolvable nested under another (deferred). GRP-5 selection
      retarget lands shell-side (wrap → the new wrappers, ungroup → the
      promoted children); its resolver-derived *targets* are cited
      (`grp_5_retarget_targets_are_resolver_derived`), the `set_selection`
      call itself is shell (like TRAV-5's split). Remaining: GRP-6 scene
      single-child refusal (needs the scene-constraints query), the
      nested-selection ungroup edge, and auto-layout (`Shift+A`, its own
      command family). v1 assumes pure-translation parent/wrapper
      (`frame_origin` doctrine).
- [ ] **auto-layout** — [spec](../../docs/wg/canvas/auto-layout.md)
      (ALY-1..5) done; impl pending. Wrap-and-infer flex container per
      partition (`Shift+A`) + apply-in-place on an existing container;
      layout model deferred to [feat-layout](../../docs/wg/feat-layout/).
- [ ] **flatten** — [spec](../../docs/wg/feat-vector-network/flatten.md)
      (FLAT-1..4) done; impl partial. The destructive per-partition
      combine ships (`mode::flatten_selection` + the pure network ops
      `vector::ops::{apply_affine, append}`) with `tests/flatten_contracts.rs`
      (FLAT-1/2/3 cited): combines each partition's flattenable members
      into one baked vector in the shared **parent** frame (so world
      position holds under any parent transform), non-flattenable members
      left in place, first member donates the style, one recorded entry
      (undo restores). Flattenable set matches the web's: the primitives
      (rect/ellipse/polygon/star/line) **and vector nodes**
      (`member_as_vector` — a vector contributes its own network). Text
      and boolean are in the set but backend-gated (glyph-outline /
      path-boolean eval) and left unflattened when absent — same
      degradation the web's non-wasm fallback makes. **Command wired**
      (2026-07): the context menu + `Mod+E` (`Command::Flatten`,
      `src/shell/app.rs`) run `flatten_selection` over the whole
      selection with a pre-minted id pool; menu enablement widened to
      `mode::can_flatten` (multi-select + vectors), replacing the old
      single-only gate; `menu_contracts` MENU-2 updated to the widened
      capability. **Text now flattens** via delegation: `flatten_selection`
      takes an injected `outline` closure and, for a text member, bakes it
      through the same primitive **create outlines** ↓ uses
      (`member_flatten_form`), so mixed type + shapes combine into one
      vector; the shell builds the outlines through the renderer's fonts
      up front. `tests/flatten_contracts.rs` `flat_delegates_text_into_the_union`
      cited; headless callers pass `|_| None` and text is skipped
      (`FLAT-2`). Remaining: the **boolean**-bake (FLAT-4, path-boolean
      eval). Reuses the single-node mode-entry `flatten_to_vector`
      (**edit mode**) for the shape→network conversion + style carry.
- [ ] **create outlines** —
      [spec](../../docs/wg/feat-vector-network/create-outlines.md)
      (OUTL-1..5) done; impl **wired**. The dedicated text→vector
      command (menu "Create Outlines", `Command::CreateOutlines`): each
      selected text node is replaced **in place** by a vector of its
      glyph outlines, per node (never unioned), one entry. Font backend
      is the engine primitive `Renderer::outline_text_node`
      (`crates/grida/src/runtime/scene.rs` — reuses the render path's
      paragraph shaping → `text::paragraph_to_vector_network`), injected
      into `mode::create_outlines` as an outliner closure so the mutation
      logic stays headless-testable. Tests: engine
      `grida/tests/text_outline.rs` (shaping → non-empty glyph network
      with embedded fonts; empty → empty) + `outline_contracts.rs`
      (OUTL-1/3/4/5 + `can_create_outlines`). No keybinding (`Mod+Shift+O`
      is outline _mode_). **Flatten delegates its text members to this
      same primitive** (↑). Remaining: OUTL-2 render-fidelity as a raster
      reftest; carry text effects / rich per-run fills (deferred tail).

### Features

- [ ] **boolean** — [spec](../../docs/wg/feat-vector-network/boolean.md)
      (BOOL-1..8) done; impl pending. Creation is per selection
      partition (its "per shared parent" = [PART](../../docs/wg/canvas/ux-surface/selection-partition.md)).
- [x] **align** — [spec](../../docs/wg/canvas/align.md) ·
      `src/align.rs` · `tests/align_contracts.rs` (ALIGN 7/7). The
      reference-frame rule as a pure resolver over the working copy
      plus a world-bounds oracle (`Patch` position batch, one history
      entry): cardinality frame flip, world-AABB alignment under
      rotation, delta projection into each member's own parent frame
      (mixed / transformed parents), edge-gap distribute, and the
      auto-layout exclusion (`WorkingCopy::is_layout_owned`, the
      computed-vs-authored doctrine). Shell wiring: the Alt+A/D/W/S,
      Alt+H/V, Alt+Ctrl+H/V rows (`src/keys.rs`) dispatch through the
      registry (`Command::Align`/`Distribute`). ALIGN-1 tightened
      during impl: only the aligned edge/center is invariant, not the
      whole union AABB.
- [x] **io** — [spec](../../docs/wg/canvas/io.md) · `src/io.rs` ·
      `tests/io_contracts.rs`
- [ ] **io — external** — [spec](../../docs/wg/canvas/io-external.md)
      (IOX-1..7); partial. Shipped: the paste sniffing order's rows
      1/4 (native envelope; image bytes → image node via
      `io::insert_image`, IOX-7's paste half cited in
      `tests/io_contracts.rs`) and copy-as-PNG (Mod+Shift+C — shell
      raster export to the system clipboard; the whole selection
      composited in paint order over its union bounds, selected roots
      only). Remaining: the drop matrix,
      sniffing rows 2/3/5, IOX-1..6 as cited tests, and the
      document-side resource store (pasted image bytes live in the
      host image store only: image nodes are outside the wire subset —
      sync/copy of one fails loudly — and `.grida` save falls back to
      an unknown-node slot).
- [ ] **context menu** — [spec](./docs/menu.md)
      · canvas menu live: the menu-as-data surface (`src/menu.rs`
      over the `src/command.rs` registry — the closed action /
      submenu / separator taxonomy, enablement dry-run through the
      commands' own pure resolvers), the anchored modal presenter
      (`src/ui/menu.rs`: flip-then-clamp placement, the
      `UiLayer::set_capture` popup grab, submenu, keyboard
      navigation, sheet-derived shortcut hints), shell wiring
      (secondary press → MENU-5 retarget → open at point), and the
      Copy name / Copy ID reference additions ·
      `tests/menu_contracts.rs` (MENU-1/2/4 cited) + a headless raster
      probe (`tests/menu_render.rs`) proving the scene actually paints
      — rows flow inside a Flex panel and each panel is its own
      top-level scene root (the engine runs no layout for a `Normal`
      container's children and lays out only the _first_ absolute
      child of a Flex parent — so per-row absolute placement painted
      only row 0, and a second panel sibling vanished). Remaining:
      MENU-4
      point-targeted paste, the layer/scene/ruler-row menus (MENU-6
      rides the scene-row menu), the in-mode (vector-edit) menu.
- [ ] **application menu** — [spec](./docs/menu.md) "The application
      menu" · inventory-as-data live: `menu::application_menu` builds
      the File/Edit/Object/Arrange/View/(Text)/Settings bar over the
      command registry, live rows wired + enablement dry-run, unbuilt
      rows shown **deferred** (`MENU-7`: inert `Item::Deferred`
      placeholders naming their blocking system — the bar is the
      enumerated backlog). `tests/menu_contracts.rs` (MENU-1 actionable
      / MENU-7 inert / MENU-2 undo-redo cited) + the native-routing
      contract `Menu::command_bindings` (MENU-1). Native host wired:
      `src/shell/menubar.rs` builds a **muda** menu bar from the value,
      installed on macOS (`init_for_nsapp`), activations drained in
      `about_to_wait` → registry command; the bar rebuilds on selection
      / command change (`menu_dirty`). Remaining: accelerator display
      (MENU-3 — held off to avoid double-dispatch with the winit
      keybinding routing), the non-macOS install (per-window HWND/gtk),
      and wiring the deferred systems (file dialogs, boolean ops, mask,
      transforms, text attributes, layout, settings) as commands land.

### Panels & UI

- [x] **ui** — [spec](./docs/ui.md) · `src/ui/` ·
      `tests/ui_contracts.rs` (UI 7/7)
- [ ] **widgets** — [spec](./docs/widgets.md) ·
      [inventory](./docs/widgets-inventory.md); partial.
      The inventory is the spec plane (tiers, composition doctrine,
      INV-1/2); the reality matrix:
  - foundation: `Field<T>` value model (`src/ui/field.rs`, WID-6
    spine); **popover** primitive promoted (`src/ui/popover.rs` —
    placement + panel shell + grab; menu rewired onto it, WID-8);
    `UiResponse.rebuild` (the self-contained-overlay tick, honored in
    `UiLayer::dispatch`); `BindingValue` grown Bool / Index / Quad /
    Numbers / Color / **ListOp** (SHEET-3, `src/ui/bind.rs`).
  - atoms shipped: **toggle** (check/switch), **segmented** (single
    row + grid = alignment), **select** (first self-contained floating
    popover), **text** (buffer entry). Pre-field: button, number,
    slider, swatch, label.
  - composites shipped: **quad** (uniform⇄split, one `Quad` commit,
    WID-9), **color picker** (WID-4 hot path — SV plane + hue/alpha
    drag + hex, N previews → one commit).
  - list section shipped: **`list_section`** (SHEET-3 — add / remove /
    toggle-active / reorder-by-drag, all `ListOp` commits).
  - tests: `tests/atom_contracts.rs` (25) + `tests/widget_render.rs`
    raster (6). Suite: core 338 / shell 347 green.
  - not new widgets — panel compositions of the above: **pair** (X/Y,
    W/H = 2 numbers), **dimension** (number + mode select), **gap**
    (number), **paint** (kind select + swatch/picker + active toggle +
    remove — **wired** for fills, 2026-07; per-fill opacity slider +
    blend select still deferred), **effect** (kind select + numbers
    - toggle), **export row** (format select + scale number). Each
      sub-value commits independently, so they assemble in the panel —
      no compound commit, no new primitive. `Button` grew an optional
      `commit` binding so an add/remove button emits a `Fills`/`ListOp`
      (the atoms table's "button → list add/remove" path); `Binding`
      grew `entry` so a generic atom addresses `fills[i]`. Effect /
      export wired when their sheet sections are built.
  - still missing: **constraints** (bespoke 2D inset visual),
    **number-list** (dash pattern), **gradient editor** (stop track);
    section collapse / header-actions / capability gate; text IME
    preedit (WID-5 composition — committed-string path done); select
    flip/clamp (downward-only inline; needs viewport); mixed-field
    rendering retrofitted into number/slider/swatch.
  - build order (✓ = done): select ✓ → segmented ✓ → toggle ✓ →
    text ✓ → popover promotion ✓ → color picker ✓ → quad ✓ → list
    section ✓ → paint (fills) ✓ → (gradient / effect / export assemble
    as panel sections) → constraints / gradient / number-list.
  - architecture note: emissions do NOT bubble child→parent (the
    layer routes each hit to the owning widget), so value-combining
    composites are **monolithic** widgets with internal sub-region
    hit-testing (like segmented/select/quad/picker), emitting one
    compound `BindingValue`; groupings whose sub-values commit
    independently stay containers.
- [ ] **properties** — [spec](./docs/properties.md);
      partial. Panel is live (`src/ui/properties.rs`, `src/ui/bind.rs`)
      but PROP is 2/9 — mixed values and preview/commit behaviors are
      largely unverified. **Fills** now bind the general paint-list
      domain (see below), not the old single-solid special case.
- [ ] **properties — sheet** —
      [spec](./docs/properties-sheet.md) (SHEET-1..3)
      done; inventory partial. **Fills** shipped (2026-07): the general
      `fills` paint-list — a list section of paint rows (swatch→picker,
      kind select solid/linear/radial/sweep/diamond, active toggle,
      remove; header add), all `SHEET-3` single-entry commits. Document
      domain: `PropPatch.fills: Paints` (invertible, serializable,
      validated — mutually exclusive with the legacy `fill_solid`) +
      `Editor::node_fills`; the bind layer owns the list-op / per-entry
      resolvers (`ARCH-3`), addressed by `Binding::entry`. Tests:
      `tests/paint_contracts.rs` (8), `doc_contracts` fills round-trip,
      `ui_contracts` fills section + picker. The paint program's
      remaining slices (each reuses the fills machinery — `PropPatch`
      list domain → `Binding::entry` / bind-owned resolvers → atoms
      assembled in the panel → contract tests):
  - [~] **strokes** — paint list + geometry **shipped** (2026-07):
        `PropPatch.strokes: Paints` (invert/serialize/validate,
        `paint_contracts`) + `Editor::node_strokes`;
        `BindingProperty::{Strokes, Stroke*}` sharing the fill resolvers;
        a Strokes section built by the same `PaintTarget` code path as
        Fills (swatch→picker, kind, active, add/remove). **Geometry**
        now shipped: `PropPatch.{stroke_width,stroke_align,stroke_cap,
        stroke_join,stroke_miter,stroke_dash}` (uniform weight normalized
        across the 3 engine width reps; align/cap/join/miter/dash via
        `stroke_style`) + `Editor::node_stroke_*` queries +
        `STROKE_ALIGNS/CAPS/JOINS` bindings + panel rows (weight number,
        align/cap/join segmented, miter number when join=miter, dash
        number = 0-solid). Tests: `doc_contracts` geometry round-trip +
        empty-dash-clears + unsupported-kind reject; `paint_contracts`
        width/cap/dash bindings; `ui_contracts` geometry rows render.
        Remaining (refine): per-side (rectangular) width; Line/Vector's
        flattened geometry + **markers** (start/end shapes); dash
        multi-segment sequence + solid/dashed class control.
  - [~] **text typography** — Slice A (core) **shipped** (2026-07):
        `PropPatch.{text_align_vertical,font_size,font_weight,font_italic,
        line_height,letter_spacing}` authored on the node-level style
        (`node_text_style(_mut)` — the `stroke_style` pattern; text has no
        `Node::text_style()` accessor) + `Editor::node_font_*` queries +
        `FontSize/FontWeight/FontItalic/LineHeight/LetterSpacing/
        TextAlignVertical` bindings + a **Text** section (size number,
        weight select, italic toggle, line/letter numbers, horizontal +
        vertical align segmented — the old inline align row folded in).
        Enum-payload fields author one variant (line-height `Factor`,
        letter-spacing `Fixed`); the inverse carries the whole prior enum
        (exact undo). `node_signature` folds a `TextStyleSignature`
        projection (`TextStyleRec` has no `PartialEq`). Tests:
        `doc_contracts` typography round-trip + line-height variant-inverse
        + non-text reject; `text_contracts` (10, the bind layer);
        `ui_contracts` Text-section render. Remaining (later slices, named):
        **B** — font family (host-gated catalog) + family-aware weight/
        italic dropdown; **C** — text-details (transform, decoration line +
        sub-details, truncation `max_lines`/`ellipsis`/`max_length`,
        word-spacing, vertical trim); **D** — per-run `AttributedText`
        rich text, variable-font axes + `font_features` + optical sizing,
        line/letter/word Fixed⇄Factor mode toggle. Text color/stroke ride
        the Fills/Strokes sections (text carries `fills`/`strokes`).
  - [ ] **gradient stop-track editor** — the missing Tier-2 composite
        (stop ramp: add / move / remove stops, per-stop offset + color);
        opens a paint **session** (MODE-5). Today gradients are
        kind-switch + representative color only.
  - [ ] **per-fill opacity + blend** — a per-paint opacity slider and
        blend-mode select on each fill/stroke row (`FillOpacity` /
        `FillBlend` bindings; the bind resolver for opacity already
        exists). Today alpha rides the color picker.
  - [ ] **fill/stroke reorder-by-drag** — `ListOp::Move` from a drag on
        the paint row (the bind resolver exists; needs the row drag
        gesture — or route through `list_section`).
  - [ ] **image paint authoring** — source picker (host-gated,
        [io-external](../../docs/wg/canvas/io-external.md)) + fit
        segmented + transform; today image fills render + reorder/toggle
        but their source is not authorable.
  - [~] **effects section** — Slice 1 **authorable** (2026-07): the
        engine's `LayerEffects` is a structured bag (not a flat list), so
        the panel gives **one section per slot, cardinality from the
        spec** (not web's flat cascade). Shipped: **Layer blur** (single
        `Option` slot — enable toggle / Gaussian radius / active) +
        **Shadows** (multi `Vec` — add/list/remove, per-entry drop-vs-inner
        kind, color picker, active, dx/dy/blur/spread). `PropPatch.
        {layer_blur: Option<Option<FeLayerBlur>>, shadows:
        Option<Vec<FilterShadowEffect>>}` + `node_effects_mut` per-kind
        match (engine has `effects()` but no `effects_mut()`) +
        `Editor::node_effects` + `BindingProperty::{LayerBlur*, Shadows,
        Shadow*}` + wire mirrors (`WireBlur`/`WireLayerBlur`/`WireShadow`/
        `WireShadowEffect` — effect types aren't `Serialize`). Enum-payload
        author-one-variant, inverse-carries-whole-slot (blur v1 = Gaussian).
        `node_signature` promoted from 12-tuple to named `NodeSignature`
        struct (+`effects`). Tests: `effect_contracts` (14) + doc
        round-trip/inverse/reject + ui render. **Deferred (Slices 2–4):**
        backdrop blur (single, = layer-blur clone), noise (multi, coloring
        + blend), glass (single, 6 params, rect-only), progressive blur.
  - [~] **export section** — **introduced** scaffold (2026-07): a
        present-but-deferred header + honest note (no authoring domain
        yet). Remaining (refine): per-node export presets (format select
        + scale number), the list machinery + `IO-7`.
  - [~] **selection colors** — **introduced** read-only (2026-07): the
        head node's distinct solid fill/stroke colors listed as hex.
        Remaining (refine): aggregate across the whole selection,
        live-update on recolor, recolor-all + select-by-color command.
  - [ ] **mixed-value** (`PROP-2` / `WID-6`) — the paint list is
        editable only when all selected nodes have equal stacks
        (`PROP-6` guard); heterogeneous → a single mixed indicator.
- [x] **hierarchy** — [spec](../../docs/wg/canvas/hierarchy.md) ·
      `src/ui/hierarchy.rs` · `tests/hier_contracts.rs` (HIER 8/8)
- [ ] **devtools** — [spec](./docs/devtools.md) is an
      RFD (no contracts yet); impl pending.

### Application

- [ ] **shell** — [spec](./docs/shell.md); impl live
      (`src/shell/`: window, session, panel layout, key routing
      through the binding table — KEY-1 refines SHELL-1) but
      SHELL-1..4 have no citing tests yet.
- [ ] **harness / budgets** — PERF-1..5 budgets are specified but not
      yet enforced by the suite.
- [ ] **architecture** — ARCH-1 cited; ARCH-2..4 (structural/dep
      rules) unverified.

## Contract coverage

Unverified ids on otherwise-shipped concepts (spec defines them, no
test cites them):

- [ ] ARCH-2, ARCH-3, ARCH-4
- [ ] DOC-1, DOC-6
- [ ] ED-2, ED-4
- [ ] HISB-6, HISB-8
- [ ] SYNC-6
- [ ] FRAME-5
- [ ] SURF-1, SURF-3, SURF-6
- [ ] HUD-1
- [ ] PXG-6
- [ ] MENU-4, MENU-6 (with the pending menu hosts, above)
- [ ] IO-2, IO-7
- [ ] SHELL-1..4, PERF-1..5 (with their concepts, above)

## Open questions / deferred

Pointers only — the owning doc holds the detail:

- Missing ui primitives: the full taxonomy + status matrix now live
  in [widgets-inventory](./docs/widgets-inventory.md)
  and the **widgets** item above; the module TODO in `src/ui/mod.rs`
  mirrors the popover / picker / input trio.
- Vector-anchor snapping needs point-anchor snapping that `math2`
  does not yet provide:
  [snap-vector.md](../../docs/wg/feat-vector-network/snap-vector.md). (The pen's
  own vertex/segment thresholds shipped with vector edit and are not
  VSNAP.)
- Vector edit's named deferrals (lasso, width facet, region
  derivation, wire region paints): `src/vector/mod.rs` module docs.
- Per-doc deferred tails: each spec in
  [`docs/wg/canvas`](../../docs/wg/canvas/index.md) names its own
  deferrals inline (doctrine: deferred is named, not silently
  omitted).
