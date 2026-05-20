// Stages — pure functions composed by `run_translate_pipeline`.
// See `./README.md` for order / contracts.

import cmath from "@grida/cmath";
import { baseline_union_top_left } from "../intents";
import type { TranslateStage } from "./pipeline";

/** Bridges `ctx.input.movement` (Movement) → `plan.delta` (Vec2),
 *  collapsing the lesser axis when `axis_lock === "by_dominance"`. */
export const stage_axis_lock: TranslateStage = {
  name: "axis_lock",
  run(plan, ctx) {
    const m = ctx.input.movement;
    const locked =
      ctx.modifiers.axis_lock === "by_dominance"
        ? cmath.ext.movement.axisLockedByDominance(m)
        : m;
    const [x, y] = cmath.ext.movement.normalize(locked);
    return { plan: { ...plan, delta: { x, y } } };
  },
};

/** Consults `ctx.snap_session` for geometry-aligned correction; emits a
 *  guide per `ctx.snap_policy`. Identity on `force_disable_snap`, missing
 *  session, or `snap_enabled === false`. */
export const stage_snap: TranslateStage = {
  name: "snap",
  run(plan, ctx) {
    if (ctx.modifiers.force_disable_snap) return { plan };
    if (!ctx.snap_session) return { plan };
    if (!ctx.options.snap_enabled) return { plan };
    const r = ctx.snap_session.snap(
      plan.delta,
      { enabled: true, threshold_px: ctx.options.snap_threshold_px },
      ctx.snap_policy
    );
    return {
      plan: { ...plan, delta: r.delta },
      emit: r.guide ? { guide: r.guide } : undefined,
    };
  },
};

/** Quantizes the agent-union origin + plan.delta to integer multiples
 *  of `options.pixel_grid_quantum`. Anchor comes from the snap session
 *  when open; falls back to `baseline_union_top_left` (RPC path).
 *  Identity when quantum is `null` or `<= 0`. */
export const stage_pixel_grid: TranslateStage = {
  name: "pixel_grid",
  run(plan, ctx) {
    const q = ctx.options.pixel_grid_quantum;
    if (q === null || q <= 0) return { plan };
    const anchor =
      ctx.snap_session?.baseline_union_readonly ??
      baseline_union_top_left(plan.baselines);
    if (!anchor) return { plan };
    const qx = Math.round((anchor.x + plan.delta.x) / q) * q - anchor.x;
    const qy = Math.round((anchor.y + plan.delta.y) / q) * q - anchor.y;
    return { plan: { ...plan, delta: { x: qx, y: qy } } };
  },
};

// See `./README.md`'s "Stage lists per entry point" for the per-caller
// table and rationale. Names below are the canonical IDs referenced
// from that table.

export const STAGES_DEFAULT: ReadonlyArray<TranslateStage> = Object.freeze([
  stage_axis_lock,
  stage_snap,
  stage_pixel_grid,
]);

export const STAGES_NUDGE: ReadonlyArray<TranslateStage> = Object.freeze([
  stage_axis_lock,
  stage_pixel_grid,
]);

export const STAGES_RPC: ReadonlyArray<TranslateStage> = Object.freeze([
  stage_axis_lock,
]);
