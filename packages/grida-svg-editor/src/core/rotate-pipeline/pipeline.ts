// Rotate pipeline — sibling to translate-pipeline and resize-pipeline. The
// funnel every rotate-mutating gesture flows through.
//
// Editor-agnostic. This file MUST NOT import any `SvgDocument`, DOM, or
// editor type. It composes pure stages against a frozen context.
//
// Coordinate space: the pipeline operates in **world space** — `pivot` is
// in root-SVG own user units; `angle` is radians (delta from gesture
// start). `apply_rotate` converts to degrees at the boundary (SVG wire
// format). The DOM adapter converts cursor → angle delta at the intent
// boundary; the pipeline never sees screen pixels.
//
// Shape mirrors resize-pipeline deliberately: same stage protocol, same
// plan-threading, same multi-member shape. Per-member baselines + shared
// pivot live on the plan; `applyRotatePlan` loops members and calls
// `apply_rotate` once each.

import type { NodeId, Vec2 } from "../../types";
import type { RotateBaseline } from "../intents";

/** Input to the pipeline. `angle_radians` is the gesture's accumulated
 *  delta from gesture start; positive = CCW per SVG convention (Y-axis
 *  points down, so positive angle rotates clockwise visually). */
export type RotateInput = {
  ids: ReadonlyArray<NodeId>;
  angle_radians: number;
};

export type RotateModifiers = {
  /** Shift-drag angle snap. When `"step"`, the angle quantizes to integer
   *  multiples of `options.angle_snap_step_radians`. */
  angle_snap: "off" | "step";
  /** Hard override — skip the snap stage regardless of session/options. */
  force_disable_snap: boolean;
};

export type RotateOptions = {
  /** Step size for shift-drag angle snap. `null` (or `<= 0`) disables. */
  angle_snap_step_radians: number | null;
};

export type RotateContext = {
  input: RotateInput;
  modifiers: RotateModifiers;
  options: RotateOptions;
};

/** The mutating shape that flows through stages.
 *
 *  - `members` carries per-member baselines captured at gesture open.
 *    Each member's `RotateBaseline.pivot` is the **shared** pivot, by
 *    construction at capture time.
 *  - `angle_radians` is the gesture's accumulated rotation; stages may
 *    quantize it (snap-to-step). `applyRotatePlan` passes it verbatim
 *    to `apply_rotate` for each member. */
export type RotatePlan = {
  members: ReadonlyArray<{ id: NodeId; baseline: RotateBaseline }>;
  pivot: Vec2;
  angle_radians: number;
};

export type RotateStageEmission = {
  // Rotation has no snap-guide concept in v1 — angle snap is silent.
  // Field reserved for future edge-parallel snap engine.
};

export type RotateStage = {
  readonly name: string;
  run(
    plan: RotatePlan,
    ctx: RotateContext
  ): { plan: RotatePlan; emit?: RotateStageEmission };
};

export type RotatePipelineResult = {
  plan: RotatePlan;
};

/** The funnel. Threads `plan` through `stages` in order. Pure: same
 *  inputs → same outputs. */
export function run_rotate_pipeline(
  init: RotatePlan,
  stages: ReadonlyArray<RotateStage>,
  _ctx: RotateContext
): RotatePipelineResult {
  let plan = init;
  for (const stage of stages) {
    const out = stage.run(plan, _ctx);
    plan = out.plan;
  }
  return { plan };
}
