// Stages — pure functions composed by `run_resize_pipeline`.
//
// Order: aspect_lock → snap → pixel_grid. Each stage is purely a
// transformation on `plan.{dx, dy}` (world-space deltas); none of them
// touch attribute writes. The orchestrator turns the final plan into
// (sx, sy, origin) via `compute_resize_factors` + `apply_resize`.
//
// The snap stage queries the element's *effective rect* via
// `effective_resize` so that, when a constraint (circle uniform,
// text-on-corner uniform, text-on-edge no-op) kicks in, snap sees what
// the attribute write will actually produce. See `../../README.md`'s
// "Resize snap" section for the rationale.

import { compute_resize_factors, type ResizeBaseline } from "../intents";
import { effective_resize, is_corner_direction } from "../resize-capability";
import type { ResizePlan, ResizeStage } from "./pipeline";

function pipeline_baseline(plan: ResizePlan): ResizeBaseline {
  return plan.baseline;
}

/** Collapse `(dx, dy)` to a uniform scale when Shift-drag is active.
 *  Element-driven uniform (circle / text-on-corner) is enforced inside
 *  `resize_constraint`, not here — this stage is *only* the user-visible
 *  modifier. No-op on edge handles (uniform across one axis isn't a
 *  meaningful constraint). */
export const stage_aspect_lock: ResizeStage = {
  name: "aspect_lock",
  run(plan, ctx) {
    if (ctx.modifiers.aspect_lock !== "uniform") return { plan };
    if (!is_corner_direction(plan.direction)) return { plan };
    // Use `compute_resize_factors(shift=true)` to derive the locked
    // (sx, sy), then invert back to (dx, dy). Single source of truth for
    // the lock math — same path apply uses on commit.
    const pbase = pipeline_baseline(plan);
    const locked = compute_resize_factors(
      pbase,
      plan.direction,
      plan.dx,
      plan.dy,
      true
    );
    const bbox = pbase.bbox;
    // Moving corner of the bbox in local space.
    const Hx_base = (() => {
      switch (plan.direction) {
        case "nw":
        case "w":
        case "sw":
          return bbox.x;
        case "ne":
        case "e":
        case "se":
          return bbox.x + bbox.width;
        case "n":
        case "s":
          return bbox.x + bbox.width / 2;
      }
    })();
    const Hy_base = (() => {
      switch (plan.direction) {
        case "nw":
        case "n":
        case "ne":
          return bbox.y;
        case "sw":
        case "s":
        case "se":
          return bbox.y + bbox.height;
        case "e":
        case "w":
          return bbox.y + bbox.height / 2;
      }
    })();
    const new_Hx = locked.origin.x + (Hx_base - locked.origin.x) * locked.sx;
    const new_Hy = locked.origin.y + (Hy_base - locked.origin.y) * locked.sy;
    return {
      plan: {
        ...plan,
        dx: new_Hx - Hx_base,
        dy: new_Hy - Hy_base,
      },
    };
  },
};

/** Consults `ctx.snap_session` for moving-edge alignment correction.
 *  Identity on `force_disable_snap`, missing session, or
 *  `snap_enabled === false`. */
export const stage_snap: ResizeStage = {
  name: "snap",
  run(plan, ctx) {
    if (ctx.modifiers.force_disable_snap) return { plan };
    if (!ctx.snap_session) return { plan };
    if (!ctx.options.snap_enabled) return { plan };

    // Convert current (dx, dy) → constrained (sx, sy, origin) → effective
    // rect. Both `compute_resize_factors` and `effective_resize` consume
    // the *container-space* baseline so the produced rect lands in HUD
    // space (where snap operates and guides render).
    const pbase = pipeline_baseline(plan);
    const f = compute_resize_factors(
      pbase,
      plan.direction,
      plan.dx,
      plan.dy,
      false
    );
    const eff = effective_resize(pbase, plan.direction, f.sx, f.sy);
    if (eff.no_op) return { plan };

    const r = ctx.snap_session.snap_resize(
      eff.rect,
      { x: eff.mask.x_edge, y: eff.mask.y_edge },
      {
        enabled: true,
        threshold_px: ctx.options.snap_threshold_px,
      }
    );
    if (r.dx === 0 && r.dy === 0) {
      return { plan, emit: r.guide ? { guide: r.guide } : undefined };
    }

    // The snap correction is in effective-rect space — it shifts the
    // moving corner by (r.dx, r.dy). To feed `compute_resize_factors`,
    // we translate that into the own-frame gesture delta:
    //   new effective moving-corner = eff.moving_corner + (r.dx, r.dy)
    //   new effective (sx, sy)      = derived from that around eff.origin
    //   new gesture (dx, dy)        = where the bbox's baseline moving
    //                                 corner would land under the new
    //                                 effective scale.
    // For free elements `eff.sx === gesture.sx`, so this collapses to
    // additive: dx_new = dx + r.dx, dy_new = dy + r.dy.
    // For uniform-constrained elements (circle / text-on-corner) the
    // gesture is already collapsed to (s, s) by the constraint, and the
    // snap correction may break that — so we choose the axis the snap
    // engine hit (or the more-restrictive one when both axes hit) and
    // back-derive a single `s` that places that corner on the snapped
    // line. The other axis then follows from the uniform constraint.
    if (eff.uniform) {
      const bbox = pbase.bbox;
      // Snapped moving corner in container space (where snap operates).
      const new_Hx = eff.moving_corner.x + r.dx;
      const new_Hy = eff.moving_corner.y + r.dy;
      // Pick the snapped axis as the source of truth. When both axes
      // hit, pick the smaller |s| (more restrictive — the rect can't
      // grow past the closer constraint).
      const sx_from_x =
        eff.mask.x_edge !== null && r.dx !== 0 && bbox.width !== 0
          ? ((new_Hx - eff.origin.x) / (eff.moving_corner.x - eff.origin.x)) *
            eff.sx
          : null;
      const sy_from_y =
        eff.mask.y_edge !== null && r.dy !== 0 && bbox.height !== 0
          ? ((new_Hy - eff.origin.y) / (eff.moving_corner.y - eff.origin.y)) *
            eff.sy
          : null;
      let s = eff.sx;
      if (sx_from_x !== null && sy_from_y !== null) {
        // Both axes hit — pick the smaller (more restrictive) scale.
        s = Math.min(sx_from_x, sy_from_y);
      } else if (sx_from_x !== null) {
        s = sx_from_x;
      } else if (sy_from_y !== null) {
        s = sy_from_y;
      }
      // Back-derive (dx, dy) from `s`. The baseline moving corner in
      // bbox-local coordinates:
      const Hx_base = corner_x_of(bbox, plan.direction);
      const Hy_base = corner_y_of(bbox, plan.direction);
      const target_Hx = eff.origin.x + (Hx_base - eff.origin.x) * s;
      const target_Hy = eff.origin.y + (Hy_base - eff.origin.y) * s;
      return {
        plan: {
          ...plan,
          dx: eff.mask.affects_x ? target_Hx - Hx_base : 0,
          dy: eff.mask.affects_y ? target_Hy - Hy_base : 0,
        },
        emit: r.guide ? { guide: r.guide } : undefined,
      };
    }
    // Free element: additive on each affected axis.
    return {
      plan: {
        ...plan,
        dx: eff.mask.affects_x ? plan.dx + r.dx : plan.dx,
        dy: eff.mask.affects_y ? plan.dy + r.dy : plan.dy,
      },
      emit: r.guide ? { guide: r.guide } : undefined,
    };
  },
};

/** Quantize the moving corner's *post-resize* position to integer
 *  multiples of `pixel_grid_quantum` in own-frame space. Identity when
 *  quantum is `null` / `<= 0` or the gesture is a no-op. */
export const stage_pixel_grid: ResizeStage = {
  name: "pixel_grid",
  run(plan, ctx) {
    const q = ctx.options.pixel_grid_quantum;
    if (q === null || q <= 0) return { plan };
    const pbase = pipeline_baseline(plan);
    const f = compute_resize_factors(
      pbase,
      plan.direction,
      plan.dx,
      plan.dy,
      false
    );
    const eff = effective_resize(pbase, plan.direction, f.sx, f.sy);
    if (eff.no_op) return { plan };
    // Quantize the moving corner; back-derive (dx, dy) the same way as
    // the snap stage's uniform branch (also reused for free elements).
    const target_Hx = eff.mask.affects_x
      ? Math.round(eff.moving_corner.x / q) * q
      : eff.moving_corner.x;
    const target_Hy = eff.mask.affects_y
      ? Math.round(eff.moving_corner.y / q) * q
      : eff.moving_corner.y;
    const bbox = pbase.bbox;
    const Hx_base = corner_x_of(bbox, plan.direction);
    const Hy_base = corner_y_of(bbox, plan.direction);
    return {
      plan: {
        ...plan,
        dx: eff.mask.affects_x ? target_Hx - Hx_base : 0,
        dy: eff.mask.affects_y ? target_Hy - Hy_base : 0,
      },
    };
  },
};

// Tiny helpers — bbox-local moving-corner coordinates. Kept local rather
// than importing from resize-capability so the stage file stays a
// single, self-contained reading.

function corner_x_of(
  r: { x: number; width: number },
  dir: import("../intents").ResizeDirection
): number {
  switch (dir) {
    case "nw":
    case "w":
    case "sw":
      return r.x;
    case "ne":
    case "e":
    case "se":
      return r.x + r.width;
    case "n":
    case "s":
      return r.x + r.width / 2;
  }
}
function corner_y_of(
  r: { y: number; height: number },
  dir: import("../intents").ResizeDirection
): number {
  switch (dir) {
    case "nw":
    case "n":
    case "ne":
      return r.y;
    case "sw":
    case "s":
    case "se":
      return r.y + r.height;
    case "e":
    case "w":
      return r.y + r.height / 2;
  }
}

/** Default stage list for HUD-driven resize gestures (drag).
 *  No NUDGE / RPC analogs at v1 (no `commands.resize` per README). */
export const STAGES_DEFAULT: ReadonlyArray<ResizeStage> = Object.freeze([
  stage_aspect_lock,
  stage_snap,
  stage_pixel_grid,
]);
