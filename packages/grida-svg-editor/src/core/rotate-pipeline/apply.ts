// Plan → DOM mutation. Editor-specific: imports SvgDocument + intents.
//
// `applyRotatePlan` loops `plan.members` calling `apply_rotate` for each.
// The shared pivot lives on each member's baseline (captured at gesture
// open, frozen for the gesture). The pipeline's `plan.angle_radians` is
// the gesture delta; `apply_rotate` composes onto each baseline's
// `current_rotation_deg` internally.
//
// Identity-restore: when `angle_radians === 0` and a member had no
// pre-existing rotation, `apply_rotate` restores the original `transform=`
// byte-equal — including the case of `transform=null`. The clean-editor
// invariant "rotate then rotate back" produces a no-op diff.

import type { NodeId, Vec2 } from "../../types";
import type { SvgDocument } from "./../document";
import {
  apply_rotate,
  capture_rotate_baselines,
  is_rotatable,
  type RotatableVerdict,
  type RotateBaseline,
} from "../intents";
import {
  run_rotate_pipeline,
  type RotateContext,
  type RotateOptions,
  type RotatePlan,
  type RotateStage,
} from "./pipeline";
import { STAGES_RPC } from "./stages";

export function applyRotatePlan(doc: SvgDocument, plan: RotatePlan): void {
  for (const m of plan.members) {
    apply_rotate(doc, m.id, m.baseline, plan.angle_radians);
  }
}

/** Reset each member to its baseline rotation (angle_radians = 0). Used
 *  by undo closures. Identity-restore byte-equality kicks in when the
 *  baseline had no pre-existing rotation. */
export function revertRotatePlan(doc: SvgDocument, plan: RotatePlan): void {
  for (const m of plan.members) {
    apply_rotate(doc, m.id, m.baseline, 0);
  }
}

/** Result of a one-shot rotate preparation. `verdicts` lets the caller
 *  surface refusal chips if any member's baseline isn't rotatable; the
 *  caller decides whether to commit or discard. */
export type PreparedRotate = {
  plan: RotatePlan;
  verdicts: ReadonlyMap<NodeId, RotatableVerdict>;
  apply: () => void;
  revert: () => void;
};

/** Headless one-shot rotate. Captures per-member baselines around the
 *  shared pivot, runs the pipeline with `stages` (default `STAGES_RPC`),
 *  returns ready-to-record closures + per-member refusal verdicts. The
 *  caller wraps the closures in history (e.g. `history.atomic`).
 *
 *  Verdicts: if any member returns `kind: "refuse"`, the caller SHOULD
 *  drop the gesture and emit a chip instead of committing. The `apply`
 *  closure here doesn't gate on verdicts — that's a policy decision at
 *  the call site (a programmatic `commands.rotate` may still want to
 *  force-write through; the interactive path does not). */
export function prepare_rotate_rpc(args: {
  doc: SvgDocument;
  ids: ReadonlyArray<NodeId>;
  pivot: Vec2;
  angle_radians: number;
  options: RotateOptions;
  emit: () => void;
  stages?: ReadonlyArray<RotateStage>;
}): PreparedRotate {
  const {
    doc,
    ids,
    pivot,
    angle_radians,
    options,
    emit,
    stages = STAGES_RPC,
  } = args;
  // Drop descendants whose ancestor is also in the gesture set — otherwise
  // both the parent's `transform` AND the child's own attrs rotate around
  // pivots that differ by the parent's accumulated transform, producing
  // double-displacement. Same rationale as translate / resize.
  const filtered_ids = doc.prune_nested_nodes(ids);
  const baselines = capture_rotate_baselines(doc, filtered_ids, pivot);
  const members = filtered_ids.map((id) => ({
    id,
    baseline: baselines.get(id) as RotateBaseline,
  }));
  const verdicts = new Map<NodeId, RotatableVerdict>();
  for (const id of filtered_ids) verdicts.set(id, is_rotatable(doc, id));
  const plan0: RotatePlan = { members, pivot, angle_radians };
  const ctx: RotateContext = {
    input: { ids: filtered_ids, angle_radians },
    modifiers: { angle_snap: "off", force_disable_snap: true },
    options,
  };
  const { plan } = run_rotate_pipeline(plan0, stages, ctx);
  return {
    plan,
    verdicts,
    apply: () => {
      applyRotatePlan(doc, plan);
      emit();
    },
    revert: () => {
      revertRotatePlan(doc, plan);
      emit();
    },
  };
}
