// Transform-box — intent variant.

import type cmath from "@grida/cmath";
import type { IntentPhase } from "../../event/intent";
import type { AffineTransform } from "../../primitives/transform-box";

/**
 * Drag of a transform-box handle. HUD has already reduced the gesture;
 * the host commits `transform` to whatever field it bound the input to
 * (image-fit paint transform, free-transform node local transform, …).
 *
 * `op` carries the gesture's TYPE and TARGET so the host can
 * route / log / debug, but never the pointer delta — the host doesn't
 * need to re-reduce. HUD's reduction is the public outcome (D1 —
 * subscribe to outcomes, not events).
 *
 * `transform` is box-relative (translation normalized [0..1] against
 * `TransformBoxInput.size`).
 */
export type TransformBoxIntent = {
  kind: "transform_box";
  id: string;
  op:
    | { type: "translate" }
    | { type: "scale_side"; side: cmath.RectangleSide }
    | { type: "scale_corner"; corner: cmath.IntercardinalDirection }
    | { type: "rotate"; corner: cmath.IntercardinalDirection };
  transform: AffineTransform;
  phase: IntentPhase;
};
