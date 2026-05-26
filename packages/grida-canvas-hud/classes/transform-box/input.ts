// Transform-box — public input + hover + active-op types.
//
// The math primitive lives at `primitives/transform-box.ts` (reusable
// by external Tier-2 consumers). This class is the chrome + gesture
// wiring on top.

import type cmath from "@grida/cmath";
import type { AffineTransform } from "../../primitives/transform-box";
import type { HUDSemanticGroup } from "../../primitives/types";

/**
 * Input pushed by the host to enable transform-box chrome.
 * Schema-level feature flag — pass `null` (or never call
 * `setTransformBox`) to disable.
 *
 * @unstable Public shape may change as the transform-box model
 * stabilises. The contract is shaped by a single integration today;
 * a second independent consumer will ratify it.
 */
export interface TransformBoxInput {
  /**
   * Host-defined identity, echoed back on every intent so the host
   * can correlate (e.g. `"node-1:fill[2]"` for an image-paint
   * transform, `"node-1:local"` for a free-transform). NOT a NodeId
   * — the granularity is "one transform" per setter call.
   */
  id: string;

  /**
   * Box-relative affine — same shape as AffineTransform (2×3).
   * Translation components ([0][2], [1][2]) are normalized [0..1]
   * against `size`.
   */
  transform: AffineTransform;

  /** Box size in doc-space units. */
  size: cmath.Vector2;

  /**
   * Doc-space anchor for the box's [0,0]. Combined with `rotation`
   * to project box-local → doc-space. The box's local frame is
   * rotated by `+rotation` around `origin` to land in doc-space.
   */
  origin: cmath.Vector2;

  /**
   * Container rotation in degrees (CCW). When non-zero, the
   * gesture's doc-space cursor delta is de-rotated by `-rotation`
   * before being fed to the math reducer.
   */
  rotation?: number;

  /**
   * Optional semantic group for visibility policy. All emitted
   * overlays carry the same group so a single `SurfaceVisibilityPolicy`
   * toggle suppresses the whole model atomically.
   */
  group?: HUDSemanticGroup;
}

/**
 * Hover state for the transform-box model — HUD-owned. The chrome
 * reads this each frame; in the current model nothing differs
 * visually per hover (handles are transparent by default), but the
 * cursor mapping reads it (`grab` for corner, `ns/ew-resize` for
 * sides, `move` for body). Cleared on pointer-out / blur.
 */
export type TransformBoxHover =
  | { kind: "transform_box_body"; id: string }
  | { kind: "transform_box_side"; id: string; side: cmath.RectangleSide }
  | {
      kind: "transform_box_corner";
      id: string;
      corner: cmath.IntercardinalDirection;
    };

/**
 * Active gesture descriptor that the host's chrome rebuilder uses to
 * suppress handles during a drag (mirrors padding-overlay). The
 * Surface derives this from `state.gesture` when the gesture matches
 * this input's `id`.
 */
export type TransformBoxActiveOp =
  | { type: "translate" }
  | { type: "scale_side"; side: cmath.RectangleSide }
  | { type: "rotate"; corner: cmath.IntercardinalDirection };
