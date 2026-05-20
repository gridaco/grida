// Translate pipeline — the funnel every position-mutating call flows through.
//
// Editor-agnostic. This file MUST NOT import any `SvgDocument`, DOM, or
// editor type. It composes pure stages against a frozen context.
//
// Coordinate space: the pipeline operates in **world space** — the root
// SVG's own user-coordinate system. Plan deltas, snap-session inputs,
// pixel-grid quantization, and baseline rects all live in this space.
// `apply_translate` writes raw attributes (own-frame); for flat docs
// (no `<g transform>` ancestor, no nested `<svg>`) world ≡ own and no
// projection step exists. The DOM adapter is responsible for converting
// CSS-pixel cursor deltas to world deltas at the intent boundary
// (`camera.transform.invert`) and for projecting snap guides world →
// screen at HUD paint time. `getScreenCTM` does not feed pipeline math.
//
// See ./README.md for the boundary discipline that keeps the directory
// extractable to a shared package.

import cmath from "@grida/cmath";
import type { guide as _guide } from "@grida/cmath/_snap";
import type { NodeId, Vec2 } from "../../types";
import type { TranslateBaseline } from "../intents";
import type { SnapSession, SnapGuidePolicy } from "../snap";

/** Input to the pipeline. `movement` is cmath's axis-aware carrier in
 *  **world space** (one document unit per integer): `null` on an axis
 *  means "locked — no contribution this frame". Stages downstream of
 *  `stage_axis_lock` see plan.delta (Vec2) instead. */
export type TranslateInput = {
  ids: ReadonlyArray<NodeId>;
  movement: cmath.ext.movement.Movement;
};

export type TranslateModifiers = {
  /** Shift-drag axis lock. `"by_dominance"` snaps to the larger of |dx|, |dy|. */
  axis_lock: "off" | "by_dominance";
  /** Hard override — skip the snap stage regardless of session/options.
   *  Used by RPC and align/distribute commands. */
  force_disable_snap: boolean;
};

export type TranslateOptions = {
  /** `null` (or `<= 0`) = pixel-grid stage is identity. */
  pixel_grid_quantum: number | null;
  snap_enabled: boolean;
  snap_threshold_px: number;
};

export type TranslateContext = {
  input: TranslateInput;
  modifiers: TranslateModifiers;
  options: TranslateOptions;
  snap_session: SnapSession | null;
  snap_policy: SnapGuidePolicy;
};

/** The mutating shape that flows through stages. `delta` starts at
 *  `{x:0,y:0}` (stage_axis_lock populates from ctx.input.movement). */
export type TranslatePlan = {
  ids: ReadonlyArray<NodeId>;
  baselines: ReadonlyMap<NodeId, TranslateBaseline>;
  delta: Vec2;
};

/** Side effects a stage may emit. The shell aggregates these into
 *  PipelineResult.guides. Stages MUST NOT mutate plan/ctx. */
export type StageEmission = {
  guide?: _guide.SnapGuide;
};

export type TranslateStage = {
  readonly name: string;
  run(
    plan: TranslatePlan,
    ctx: TranslateContext
  ): { plan: TranslatePlan; emit?: StageEmission };
};

export type PipelineResult = {
  plan: TranslatePlan;
  guides: ReadonlyArray<_guide.SnapGuide>;
};

/** The funnel. Threads `plan` through `stages` in order; aggregates
 *  guide emissions. Pure: same inputs → same outputs. */
export function run_translate_pipeline(
  init: TranslatePlan,
  stages: ReadonlyArray<TranslateStage>,
  ctx: TranslateContext
): PipelineResult {
  let plan = init;
  const guides: _guide.SnapGuide[] = [];
  for (const stage of stages) {
    const out = stage.run(plan, ctx);
    plan = out.plan;
    if (out.emit?.guide) guides.push(out.emit.guide);
  }
  return { plan, guides };
}
