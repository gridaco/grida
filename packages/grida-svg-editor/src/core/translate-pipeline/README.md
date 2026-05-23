# `core/translate-pipeline/`

The funnel every position-mutating call flows through. Drag, nudge, and
`editor.commands.translate` all converge on `run_translate_pipeline()` —
each picking the stage list that matches its semantics.

## Files

| File              | Editor-agnostic? | Role                                                                     |
| ----------------- | ---------------- | ------------------------------------------------------------------------ |
| `pipeline.ts`     | ✅               | `run_translate_pipeline()` shell + types (`TranslatePlan`, `Context`, …) |
| `stages.ts`       | ✅               | `stage_axis_lock`, `stage_snap`, `stage_pixel_grid` + `STAGES_*` lists   |
| `orchestrator.ts` | ❌               | `TranslateOrchestrator` — owns snap session / history preview lifecycle  |
| `apply.ts`        | ❌               | `applyTranslatePlan` / `revertTranslatePlan` — wraps `apply_translate`   |

## Extractability boundary

`pipeline.ts` and `stages.ts` MUST stay editor-agnostic. If this module
ever moves to a shared `@grida/translate-pipeline` package, those two
files transfer verbatim; orchestrator + apply stay per-editor.

**Forbidden imports** in `pipeline.ts` and `stages.ts`:

- `../document` (SvgDocument shape)
- `../../dom` (DOM types)
- `../editor` (EditorInternal)
- Any browser global (`document`, `window`, `getBoundingClientRect`, …)

Allowed: `@grida/cmath`, `../snap` (`SnapSession`, `SnapGuidePolicy`), `../intents`
(types only — `TranslateBaseline`).

## Stage order

`STAGES_DEFAULT = [stage_axis_lock, stage_snap, stage_pixel_grid]`

1. `axis_lock` converts `ctx.input.movement` (Movement) → `plan.delta`
   (Vec2). Always runs first — it's the bridge, not an optional feature.
2. `snap` consults the frozen `SnapSession` for the cumulative delta.
   May correct the delta and emit a guide.
3. `pixel_grid` quantizes the union-rect origin + delta to integer
   multiples of `options.pixel_grid_quantum`. Identity when `null`.

## Stage lists per entry point

The funnel's shape is universal; the stage list is per-caller. A new
caller picks the list that matches its semantics — never a flag that
parameterizes a single stage from above.

| List             | Caller                                | What runs                     | Why                                                                                                                                                                                  |
| ---------------- | ------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `STAGES_DEFAULT` | drag (gesture)                        | axis_lock → snap → pixel_grid | UX intent; snap session is open; pixel-grid coarsens after snap.                                                                                                                     |
| `STAGES_NUDGE`   | `editor.commands.nudge({dx, dy})`     | axis_lock → pixel_grid        | UX intent (keyboard arrows today); no snap session; grid still coarsens.                                                                                                             |
| `STAGES_RPC`     | `editor.commands.translate({dx, dy})` | axis_lock                     | Raw numeric API. A typed delta must be honored exactly; quantizing it on a HUD-style flag (`snap_to_pixel_grid`) would silently mangle scripted / tooling / round-trip callers (P1). |

Future UX-intent verbs (`commands.align_left`, `commands.distribute_*`)
add their own named list (or share `STAGES_NUDGE`). They do NOT route
through `commands.translate`.

## Adding a stage

1. Write a pure `TranslateStage` in `stages.ts`.
2. Add it to whichever frozen list (`STAGES_DEFAULT`, `STAGES_NUDGE`,
   `STAGES_RPC`) it semantically belongs to.
3. Add unit tests in `__tests__/translate-pipeline/stages.test.ts`.
4. Update this README's "Stage order" / "Stage lists per entry point"
   sections if order or list membership matters.

No registration step at runtime, no plugin API. Stage lists are
compile-time constants — readers can see every modifier that runs by
reading one file.
