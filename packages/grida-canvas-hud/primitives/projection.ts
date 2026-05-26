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
 * Project all four doc-space rect corners through the camera and return
 * the screen-space AABB that covers them. Projecting all four (not just
 * two diagonals) is required for rotated / sheared transforms — the
 * diagonal pair would shrink the AABB and miss valid hover/hit pixels.
 */
export function docRectToScreenAABB(
  rect: Rect,
  transform: cmath.Transform
): Rect {
  const x1 = rect.x + rect.width;
  const y1 = rect.y + rect.height;
  const [s0x, s0y] = docToScreen(transform, rect.x, rect.y);
  const [s1x, s1y] = docToScreen(transform, x1, rect.y);
  const [s2x, s2y] = docToScreen(transform, x1, y1);
  const [s3x, s3y] = docToScreen(transform, rect.x, y1);
  const minX = Math.min(s0x, s1x, s2x, s3x);
  const minY = Math.min(s0y, s1y, s2y, s3y);
  const maxX = Math.max(s0x, s1x, s2x, s3x);
  const maxY = Math.max(s0y, s1y, s2y, s3y);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
