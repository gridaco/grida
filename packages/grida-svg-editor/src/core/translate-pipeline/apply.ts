// Plan → DOM mutation. Editor-specific: imports SvgDocument + apply_translate.
//
// `applyTranslatePlan` writes `plan.delta` (world-space, see pipeline.ts)
// straight into `apply_translate` — no projection step. For flat documents
// (the editor's design target — no nested `<svg>`, no `<g transform>`),
// world-space ≡ each element's own-frame. Documents with transformed
// ancestors fall outside v1 scope; they would need a per-element
// `getCTM().inverse()` here.
//
// `prepare_translate_rpc` is the headless one-shot entry: capture
// baselines, run the pipeline with `stages` (default `STAGES_RPC`),
// return `{plan, apply, revert}` ready for `history.atomic`. The
// caller's `delta` is taken in world-space units (== document units in
// flat docs); axes are honored exactly under `STAGES_RPC`.

import type { NodeId, Vec2 } from "../../types";
import type { SvgDocument } from "../document";
import { apply_translate, capture_translate_baselines } from "../intents";
import {
  run_translate_pipeline,
  type TranslateContext,
  type TranslateOptions,
  type TranslatePlan,
  type TranslateStage,
} from "./pipeline";
import { STAGES_RPC } from "./stages";

/** Apply the plan: for each id, run `apply_translate` with the
 *  baseline + world-space delta. Does NOT emit; caller wraps with
 *  history machinery and calls `emit()` after. */
export function applyTranslatePlan(
  doc: SvgDocument,
  plan: TranslatePlan
): void {
  for (const id of plan.ids) {
    const baseline = plan.baselines.get(id);
    if (!baseline) continue;
    apply_translate(doc, id, baseline, plan.delta.x, plan.delta.y);
  }
}

/** Reset each id to its baseline (delta = 0). Used by undo closures. */
export function revertTranslatePlan(
  doc: SvgDocument,
  plan: TranslatePlan
): void {
  for (const id of plan.ids) {
    const baseline = plan.baselines.get(id);
    if (!baseline) continue;
    apply_translate(doc, id, baseline, 0, 0);
  }
}

/** Prepare a one-shot, headless translate. Captures baselines, runs
 *  the pipeline with `stages` (default `STAGES_RPC`), returns ready-to-
 *  record closures. Caller wraps in history (e.g. `history.atomic`).
 *  See `./README.md` for the per-caller stage lists. */
export function prepare_translate_rpc(args: {
  doc: SvgDocument;
  ids: ReadonlyArray<NodeId>;
  delta: Vec2;
  options: TranslateOptions;
  emit: () => void;
  stages?: ReadonlyArray<TranslateStage>;
}): { plan: TranslatePlan; apply: () => void; revert: () => void } {
  const { doc, ids, delta, options, emit, stages = STAGES_RPC } = args;
  // Drop descendants whose ancestor is also in the gesture set —
  // otherwise both the parent's `transform` AND the child's own attrs
  // shift, double-displacing the child. See
  // `SvgDocument.prune_nested_nodes` for the rationale.
  const filtered_ids = doc.prune_nested_nodes(ids);
  const plan0: TranslatePlan = {
    ids: filtered_ids,
    baselines: capture_translate_baselines(doc, filtered_ids),
    delta: { x: 0, y: 0 },
  };
  const ctx: TranslateContext = {
    input: { ids: plan0.ids, movement: [delta.x, delta.y] },
    modifiers: { axis_lock: "off", force_disable_snap: true },
    options,
    snap_session: null,
    snap_policy: "engine",
  };
  const { plan } = run_translate_pipeline(plan0, stages, ctx);
  return {
    plan,
    apply: () => {
      applyTranslatePlan(doc, plan);
      emit();
    },
    revert: () => {
      revertTranslatePlan(doc, plan);
      emit();
    },
  };
}
