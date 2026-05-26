// Doc-space → screen-space AABB projection helper.
//
// Used by class chrome builders to register screen-space hit AABBs for
// doc-space rectangles (padding side regions, transform-box body,
// vector-path region bbox). Centralised so the projection convention
// stays consistent across classes.

import type cmath from "@grida/cmath";
import type { Rect } from "../event/gesture";
import { docToScreen } from "../event/transform";

/**
 * Project a doc-space rect's two diagonal corners through the camera
 * and return an axis-aligned screen-space rect. The output is normalised
 * (non-negative `width` / `height`) regardless of transform orientation.
 */
export function docRectToScreenAABB(
  rect: Rect,
  transform: cmath.Transform
): Rect {
  const [sx0, sy0] = docToScreen(transform, rect.x, rect.y);
  const [sx1, sy1] = docToScreen(
    transform,
    rect.x + rect.width,
    rect.y + rect.height
  );
  return {
    x: Math.min(sx0, sx1),
    y: Math.min(sy0, sy1),
    width: Math.abs(sx1 - sx0),
    height: Math.abs(sy1 - sy0),
  };
}
