import type cmath from "@grida/cmath";

/**
 * Surface camera transform: axis-aligned (scale + translate only).
 *
 * Stored as a `cmath.Transform`:
 *   `[[sx, 0, tx], [0, sy, ty]]`
 *
 * Off-diagonal components are ignored; the surface does not support rotation
 * or shear at the camera level.
 */
export type Transform = cmath.Transform;

export const IDENTITY: Transform = [
  [1, 0, 0],
  [0, 1, 0],
];

/** Project a screen-space point into document-space. */
export function screenToDoc(t: Transform, x: number, y: number): cmath.Vector2 {
  const [[sx, , tx], [, sy, ty]] = t;
  // Safe for axis-aligned transforms; sx/sy are non-zero in practice.
  const dx = (x - tx) / (sx || 1);
  const dy = (y - ty) / (sy || 1);
  return [dx, dy];
}

/** Project a document-space point into screen-space. */
export function docToScreen(t: Transform, x: number, y: number): cmath.Vector2 {
  const [[sx, , tx], [, sy, ty]] = t;
  return [sx * x + tx, sy * y + ty];
}

/** Current zoom (uniform scale). */
export function zoomOf(t: Transform): number {
  return t[0][0];
}
