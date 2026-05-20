// Resize pipeline — sibling to translate-pipeline. The funnel every
// resize-mutating gesture flows through.
//
// Editor-agnostic. This file MUST NOT import any `SvgDocument`, DOM, or
// editor type. It composes pure stages against a frozen context. See
// `../translate-pipeline/README.md` for the boundary discipline.
//
// Coordinate space: the pipeline operates in **world space** — the root
// SVG's own user-coordinate system. `plan.baseline.bbox` and the
// per-axis `dx`/`dy` are world-space; `apply_resize` writes raw
// attributes (own-frame); for flat docs world ≡ own and no projection
// step exists. The DOM adapter is responsible for converting
// CSS-pixel cursor deltas to world deltas at the intent boundary
// (`camera.transform.invert`) and for projecting snap guides world →
// screen at HUD paint time. `getScreenCTM` does not feed pipeline math.
//
// Shape mirrors translate-pipeline deliberately: same stage protocol,
// same plan-threading, same emission shape. The two pipelines share
// primitives (snap session, cmath snap, pixel-grid math) but their
// inputs differ — translate carries a Vec2 delta, resize carries a
// direction + per-axis world-frame deltas.

import type { guide as _guide } from "@grida/cmath/_snap";
import type { NodeId } from "../../types";
import type { ResizeBaseline, ResizeDirection } from "../intents";
import type { SnapSession } from "../snap";

/** Input to the pipeline. `dx` / `dy` are in **world space** (root-SVG
 *  own user units), sign-adjusted so a positive value grows the moving
 *  edge outward. The DOM adapter converts CSS-pixel cursor deltas to
 *  world deltas at the intent boundary; the pipeline never sees screen
 *  pixels. */
export type ResizeInput = {
  id: NodeId;
  direction: ResizeDirection;
  dx: number;
  dy: number;
};

export type ResizeModifiers = {
  /** Shift-drag aspect lock. When `"uniform"`, the larger-magnitude axis
   *  wins and both axes scale by the same factor (preserving baseline
   *  aspect ratio). Independent of element-driven uniformity (circle,
   *  text-on-corner) which is enforced by `resize_constraint`. */
  aspect_lock: "off" | "uniform";
  /** Hard override — skip the snap stage regardless of session/options. */
  force_disable_snap: boolean;
};

export type ResizeOptions = {
  /** `null` (or `<= 0`) = pixel-grid stage is identity. */
  pixel_grid_quantum: number | null;
  snap_enabled: boolean;
  snap_threshold_px: number;
};

export type ResizeContext = {
  input: ResizeInput;
  modifiers: ResizeModifiers;
  options: ResizeOptions;
  snap_session: SnapSession | null;
};

/** The mutating shape that flows through stages.
 *
 * Single coordinate system — **world space** (root-SVG own user units):
 *   - `baseline.bbox` is the world-space rect the pipeline scales —
 *     for single-member groups this is the member's bbox; for multi-
 *     member groups this is the union of all member bboxes (with a
 *     synthesized free `rect` carrier; per-member constraints kick in
 *     at apply time).
 *   - `baseline.attrs` carries the parsed-attribute snapshot used by
 *     `apply_resize` to write back. For flat docs world ≡ own; for
 *     transformed ancestors (out of v1 scope) `apply_resize` would need
 *     a per-element CTM invert.
 *   - `members` (when present) lists per-member captured baselines.
 *     `applyResizePlan` loops members and applies one shared
 *     `(sx, sy, origin)` to each. Omit `members` for legacy single-
 *     member plans — they use `id` + `baseline` directly.
 *   - `dx` / `dy` are sign-adjusted world-space deltas — positive means
 *     the moving edge grows outward.
 */
export type ResizePlan = {
  id: NodeId;
  baseline: ResizeBaseline;
  members?: ReadonlyArray<{ id: NodeId; baseline: ResizeBaseline }>;
  direction: ResizeDirection;
  /** World-space, sign-adjusted gesture deltas. */
  dx: number;
  dy: number;
};

export type ResizeStageEmission = {
  guide?: _guide.SnapGuide;
};

export type ResizeStage = {
  readonly name: string;
  run(
    plan: ResizePlan,
    ctx: ResizeContext
  ): { plan: ResizePlan; emit?: ResizeStageEmission };
};

export type ResizePipelineResult = {
  plan: ResizePlan;
  guides: ReadonlyArray<_guide.SnapGuide>;
};

/** The funnel. Threads `plan` through `stages` in order; aggregates guide
 *  emissions. Pure: same inputs → same outputs. */
export function run_resize_pipeline(
  init: ResizePlan,
  stages: ReadonlyArray<ResizeStage>,
  ctx: ResizeContext
): ResizePipelineResult {
  let plan = init;
  const guides: _guide.SnapGuide[] = [];
  for (const stage of stages) {
    const out = stage.run(plan, ctx);
    plan = out.plan;
    if (out.emit?.guide) guides.push(out.emit.guide);
  }
  return { plan, guides };
}
