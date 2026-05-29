// Camera transform helpers — thin wrapper over `@grida/cmath`.
//
// HUD's camera is intentionally axis-aligned (scale + translate only).
// No rotation, no shear at the camera level. Rotation lives on per-
// object render/hit shapes (`screen_obb`) so the camera stays cheap
// to invert and per-frame projections stay branch-free.
//
// Bedrock invariant: this module re-uses cmath types directly; it
// does not re-define `Vec2`, `Matrix`, or `Rect`. The `Transform`
// alias is just an exported convenience for downstream signatures.

import type cmath from "@grida/cmath";

/**
 * Axis-aligned 2×3 affine.
 *
 * Stored as a `cmath.Transform`:
 *   `[[sx, 0, tx], [0, sy, ty]]`
 *
 * Off-diagonal components are ignored by these helpers; HUD's camera
 * is scale + translate only.
 */
export type Transform = cmath.Transform;

export const IDENTITY: Transform = [
  [1, 0, 0],
  [0, 1, 0],
];

/** Project a screen-space point into document-space. */
export function screenToDoc(t: Transform, x: number, y: number): cmath.Vector2 {
  const [[sx, , tx], [, sy, ty]] = t;
  const dx = (x - tx) / (sx || 1);
  const dy = (y - ty) / (sy || 1);
  return [dx, dy];
}

/** Project a document-space point into screen-space. */
export function docToScreen(t: Transform, x: number, y: number): cmath.Vector2 {
  const [[sx, , tx], [, sy, ty]] = t;
  return [sx * x + tx, sy * y + ty];
}

/** Current uniform zoom. Reads `sx`. */
export function zoomOf(t: Transform): number {
  return t[0][0];
}
