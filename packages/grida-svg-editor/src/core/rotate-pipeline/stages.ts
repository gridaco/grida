// Stages — pure functions composed by `run_rotate_pipeline`.
//
// v1 ships one stage: `stage_angle_snap`. Shift-drag snaps the angle to
// integer multiples of `options.angle_snap_step_radians` (default π/12 =
// 15°). The snap is applied to the *total* angle from gesture start —
// the user expects "shift" to mean "land on a clean increment from the
// baseline rotation", not "round the delta-this-frame."
//
// Identity-restore: when `current_rotation_deg + delta = 0`, no rotation
// is written; `apply_rotate` honors the byte-equal restore. This stage
// doesn't need a special-case — `angle_radians = 0` round-trips through
// the snap math unchanged when the step divides 0 (it always does).

import type { RotateStage } from "./pipeline";

/** Snap the rotation angle to multiples of `options.angle_snap_step_radians`
 *  when shift is held. No-op on the off / disabled / unset path. */
export const stage_angle_snap: RotateStage = {
  name: "angle_snap",
  run(plan, ctx) {
    if (ctx.modifiers.force_disable_snap) return { plan };
    if (ctx.modifiers.angle_snap !== "step") return { plan };
    const step = ctx.options.angle_snap_step_radians;
    if (step === null || step <= 0) return { plan };
    const snapped = Math.round(plan.angle_radians / step) * step;
    return { plan: { ...plan, angle_radians: snapped } };
  },
};

/** Default stage list for HUD-driven rotate gestures (drag). */
export const STAGES_DEFAULT: ReadonlyArray<RotateStage> = Object.freeze([
  stage_angle_snap,
]);

/** Stage list for headless RPC paths (`commands.rotate`, `rotate_to`).
 *  No snap — the caller passed an exact angle on purpose. */
export const STAGES_RPC: ReadonlyArray<RotateStage> = Object.freeze([]);
