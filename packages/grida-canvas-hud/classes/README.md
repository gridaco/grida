# `classes/` — promoted named classes

Tier-1 of the package's [two-tier doctrine](../README.md#what-this-package-is--two-tiers). Each subfolder under `classes/` is one promoted named class — a composed, opinionated interaction model with a closed gesture grammar, a dedicated intent contract, and a bounded feature surface.

Three migrations have landed; the rest are pending. See the [promotion-bar dry-run](#promotion-bar-dry-run) below for each candidate's audit outcome and current state. The package-level [Named classes table](../README.md#named-classes) is the authoritative list of promoted classes.

Landed:

- [`padding/`](./padding/) — promoted from `surface/padding-overlay.ts`. Folder convention applied; tests at `__tests__/classes/padding/surface.test.ts`.
- [`transform-box/`](./transform-box/) — promoted from `surface/transform-box.ts`. Math reducer stays in `primitives/transform-box.ts` (Tier 2). Tests at `__tests__/classes/transform-box/surface.test.ts`.
- [`vector-path/`](./vector-path/) — promoted from `surface/vector-chrome.ts`. 10 vector intent variants extracted into `intent.ts`; the densest class in the package, still one model (a path) under one noun. 5 test files relocated to `__tests__/classes/vector-path/`. Co-target matrix rows still pending (see [the gap note](../README.md#named-classes)).

Pending:

- `corner-radius/` and `parametric-handle/` — chrome currently lives **inline** inside `surface/surface.ts` (corner-radius at lines 778–927, parametric-handle similarly). These migrations require extracting the chrome-build code out of the orchestrator, not just relocating a file. They also share `CORNER_RADIUS_PRIORITY` and renderer-side hooks (`hudCanvas.setCornerRadiusHandles` / `setParametricHandles`) — design pass needed on whether to keep per-class renderer setters, fold parametric-handle to absorb corner-radius (the dry-run's open audit), or both. Deferred for review.
- `chrome.ts` split (resize-box / selection-outline / marquee / lasso / hover-overlay) — deferred per the doctrine; lands last.

## Folder convention

Each promoted class lives in its own subfolder. The shape is fixed — every reader knows where to look.

```text
classes/<name>/
├── surface.ts      # the chrome — build function that returns OverlayElement[]
│                   # carries the anti-goals header (what this class is NOT)
├── input.ts        # public input type, declared @unstable until rule #3 (two consumers) is satisfied
├── intent.ts       # this class's intent variant(s); unioned by event/intent.ts
├── priority.ts     # this class's priority constants (corner / side / body / …)
├── index.ts        # re-exports the public surface (input type, priority constants, build fn if exported)
├── hover.ts        # optional — only when hover derivation is non-trivial
└── gesture.ts      # optional — only when gesture state outgrows event/gesture.ts's union
```

The shared dispatcher (`event/state.ts`, `event/decision.ts`, `event/cursor.ts`) stays unified across all classes. Hover/hit/cursor resolution is _cross-class_ — it must be — so the class subfolder contributes its intent variant and priority constants but does not own the dispatch loop.

Per-class tests live under [`__tests__/classes/<name>/`](../__tests__/) and follow the [promotion contract](../README.md#promotion-contract). Co-target assertions (pair with every other class that may share an `id`) land in [`__tests__/composition/`](../__tests__/composition/).

## Promotion-bar dry-run

The verification step for the doctrine revision asks: do the five [promotion-bar rules](../README.md#what-justifies-a-new-named-class) actually classify the existing modules cleanly? This section records the dry-run. It is a sanity check, not a commitment — each module gets its own audit PR when migration starts.

Rule numbering, for reference:

1. **Model audit** — fold if model matches an existing class.
2. **Closed gesture grammar** — must be a finite (target × gesture × modifier) → intent table.
3. **Two consumers** (or one + adversarial demo) shape the contract.
4. **Feature flags are capability flags**, not visual variants.
5. **Stable identity** — one noun.

| Candidate                                                                | Outcome                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `surface/padding-overlay.ts`                                             | **Migrated**                 | Model: 4 side numerics committed by side-handle drag. Gesture grammar: 4 side handles × drag × optional alt-mirror. Now lives at [`classes/padding/`](./padding/) with the full convention (input.ts, intent.ts, priority.ts, surface.ts, index.ts). 42 tests green at the new test path. Anti-goals header carried into `surface.ts`.                                                                                                                                                                                                                                                |
| `surface/transform-box.ts` + `primitives/transform-box.ts`               | **Migrated** with split      | Chrome migrated to [`classes/transform-box/`](./transform-box/); math reducer stays in `primitives/transform-box.ts` (Tier 2 — genuinely reusable by external consumers). Model: 2×3 affine on a unit box. Gesture grammar: 4 corners (rotate) × 4 sides (scale) × body (translate). Tests green at the new test path. Anti-goals header carried into `surface.ts`.                                                                                                                                                                                                                   |
| `primitives/corner-radius.ts` (chrome path) + `setCornerRadius`          | **Passes** with split        | Chrome promotes to `classes/corner-radius/`; geometry/math stays in `primitives/corner-radius.ts`. Model: 4 corner radii committed by knob drag (default branch + explicit anchor-locked branch with alt). Gesture grammar closed. Demo exists. Single noun.                                                                                                                                                                                                                                                                                                                          |
| `primitives/parametric-handle.ts` (chrome path) + `setParametricHandles` | **Passes** with split        | Chrome promotes to `classes/parametric-handle/`; geometry stays in `primitives/parametric-handle.ts`. Model: scalar-on-curve committed by knob drag, value snapped to `domain.step`. Gesture grammar closed. Single noun. **Open audit:** corner-radius is arguably a specialization of this model (a 4-knob multi-instance over a fixed parametric curve). If a fold becomes the right call, this would absorb corner-radius — deferred until a real second consumer of `parametric-handle` lands and forces the question.                                                           |
| `surface/vector-chrome.ts`                                               | **Migrated**                 | Densest class — 10 intent variants (`select_vertex`, `translate_vertices`, `translate_vector_selection`, `clear_vector_selection`, `select_segment`, `select_region`, `select_tangent`, `set_tangent`, `split_segment`, `bend_segment`) but **one model**: a path. Vertices, segments, tangents, regions are _features_ of the same model, not separate models. Now lives at [`classes/vector-path/`](./vector-path/). `enter_content_edit`/`exit_content_edit` stay in `event/intent.ts` — they're orchestration (mode entry/exit), not vector-class-bound. 5 test files relocated.  |
| Selection chrome inside `surface/chrome.ts` — resize handles             | **Waits**                    | Same gesture grammar as `transform-box` (4 corners + 4 sides + body) but a different model: mutates the host's `(x, y, w, h, rotation)` directly, not an inner affine. The chrome differs (rendered handle pips vs invisible hit strips); per the doctrine, **chrome variance is not a model split** — but the model genuinely differs (outer rect vs inner affine binding-target). Rule #1 says: audit again when the migration actually starts. Two paths: (a) one class with a binding-target axis (outer vs inner); (b) two classes that share a math reducer. Decision deferred. |
| Selection chrome inside `chrome.ts` — selection outline                  | **Waits + likely fold**      | Outline rendering recurs across padding, vector regions, transform-box, and selection — it's a _primitive concern_ (a styled stroke around a geometric region), not a class. The selection-specific outline is host-state-driven (which nodes are selected) but the rendering is generic. Likely outcome: outline rendering stays primitive (Tier 2), selection chrome promotes a thinner `classes/selection-outline/` that just declares "this id has a selection outline." Deferred.                                                                                                |
| Selection chrome inside `chrome.ts` — rotate handles                     | **Folds into resize-box**    | Same model as resize handles' gesture variant (which corner is being dragged), same target geometry, different intent kind (`rotate` vs `resize`). Per rule #1: same model with a feature axis (rotate-mode toggled by modifier or by which corner sub-region is hit), not two classes. Folds with resize-box.                                                                                                                                                                                                                                                                        |
| Selection chrome inside `chrome.ts` — hover overlay                      | **Waits + likely host code** | Hover outline for the currently-hovered node is host-state-driven but visually trivial (one outline). Rule #2 (closed gesture grammar) is N/A — there's no gesture, it's pure display. This may not deserve a class at all; could be a primitive-level emission tied directly to the surface's `hover()` getter. Deferred.                                                                                                                                                                                                                                                            |
| Selection chrome inside `chrome.ts` — marquee                            | **Waits + likely class**     | Distinct model: rectangular selection over empty space. Closed gesture grammar (drag from empty → marquee → commit with `marquee_select` intent). Likely promotes to `classes/marquee/`.                                                                                                                                                                                                                                                                                                                                                                                              |
| Selection chrome inside `chrome.ts` — lasso                              | **Waits + likely class**     | Same shape as marquee but polygon instead of rect. Distinct model (point-in-polygon vs AABB intersection), distinct gesture grammar (single mode-toggle from marquee). Either folds with marquee under a `selection-region` class with a shape-axis feature flag, or stays distinct. Deferred — the marquee/lasso fold-or-split decision is the same kind of question as resize-vs-transform-box.                                                                                                                                                                                     |

Reading: every existing surface module either promotes (5 cases) or splits-from-`chrome.ts` and waits for its own audit (5 cases). No candidate fails rule #2 (none have open-ended customization). No candidate fails rule #5 (every name resolves to one noun). The bar is usable.

## Migration cadence

One class per PR. Each migration PR:

1. Audits the candidate per the 5 rules; records the outcome in this file.
2. Moves the module's files into `classes/<name>/` with the folder convention above.
3. Updates imports in `index.ts`, `surface/surface.ts`, `event/intent.ts`, demo files.
4. Relocates per-class tests from `__tests__/<name>.test.ts` to `__tests__/classes/<name>/`.
5. Adds rows to [`__tests__/composition/co-target.test.ts`](../__tests__/composition/) for every (this-class, existing-class) pair that may share an `id`.
6. Adds a row to the **Named classes** table in the package README.
7. No behavior changes. Pure relocation + import updates.

The selection-chrome split out of `chrome.ts` is deferred until the simpler migrations land — that file is the largest single consolidation and benefits from the contract being settled by the smaller cases first.
