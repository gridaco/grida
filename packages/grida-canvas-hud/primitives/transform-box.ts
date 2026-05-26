// Transform-box — class-bound math reducer for the `transform-box`
// named class. Lives in `primitives/` for code organization (one file
// per math domain, pure-function tests without mounting the chrome);
// not Tier 2 in the audience sense — its closure of valid actions IS
// the transform-box chrome's gesture grammar. See the package README
// section "Tier 2 — Primitives (the open building blocks)".
//
// Pure mathematical reducer for a 2×3 affine transform manipulated by
// three op kinds: translate, scale-side, rotate. Operates on a unit box
// [0,0]→[1,1] with size in pixel-space. Translation components of the
// transform are normalized [0..1] against `size`.
//
// Lifted verbatim from the editor's image-paint editor math
// ([editor/grida-canvas-react/viewport/ui/__math/image-transform.ts]).
// The model is NOT image-specific — image-fit is just the first consumer.
//
// CENTER DEFINITION:
//   Center = center of (rect * transform). Rect corners are transformed
//   by the matrix to get the visual center (used as the rotation pivot).
//
// MATHEMATICS:
//   Each corner is a pure projection of a box corner through the
//   transform matrix. No back-solving from points — pure mathematical
//   projection.

import cmath from "@grida/cmath";

/**
 * 2×3 affine transform. Structurally compatible with `AffineTransform`
 * from `@grida/cg` — the HUD package keeps a local alias to avoid
 * acquiring a `@grida/cg` workspace dep just for the type.
 */
export type AffineTransform = [
  [number, number, number],
  [number, number, number],
];

export type TransformBoxAction =
  | {
      type: "translate";
      delta: cmath.Vector2;
    }
  | {
      type: "scale-side";
      side: cmath.RectangleSide;
      delta: cmath.Vector2;
    }
  | {
      type: "rotate";
      corner: cmath.IntercardinalDirection;
      delta: cmath.Vector2;
    };

export interface TransformBoxOptions {
  size: cmath.Vector2;
}

export type TransformBoxCorners = {
  nw: cmath.Vector2;
  ne: cmath.Vector2;
  se: cmath.Vector2;
  sw: cmath.Vector2;
};

const EPSILON = 1e-10;

/**
 * Reduces a transform-box affine in response to a UI action.
 */
export function reduceTransformBox(
  base: AffineTransform,
  action: TransformBoxAction,
  options: TransformBoxOptions
): AffineTransform {
  const { size } = options;

  switch (action.type) {
    case "translate":
      return applyTranslation(base, action.delta, size);
    case "scale-side":
      return applyScaling(base, action.side, action.delta, size);
    case "rotate":
      return applyRotation(base, action.corner, action.delta, size);
  }
}

/**
 * Given a transform-box matrix and the box size, returns the four
 * transformed corners in pixel space.
 *
 *   Each corner = transform * box_corner
 */
export function getTransformBoxCorners(
  transform: AffineTransform,
  size: cmath.Vector2
): TransformBoxCorners {
  const width = size[0] || 1;
  const height = size[1] || 1;

  const boxCorners: cmath.Vector2[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];

  // Transform matrix in pixel space — translation columns denormalized
  // by (width, height).
  const pixelTransform: cmath.Transform = [
    [transform[0][0], transform[0][1], transform[0][2] * width],
    [transform[1][0], transform[1][1], transform[1][2] * height],
  ];

  const corners = boxCorners.map((corner) =>
    cmath.vector2.transform(corner, pixelTransform)
  );

  return {
    nw: corners[0],
    ne: corners[1],
    se: corners[2],
    sw: corners[3],
  };
}

/**
 * Decomposes an affine transform into rotation (deg), scale [sx, sy],
 * and translation [tx, ty] components.
 */
export function decompose(transform: AffineTransform): {
  rotation: number;
  scale: cmath.Vector2;
  translation: cmath.Vector2;
} {
  const matrix: cmath.Transform = [
    [transform[0][0], transform[0][1], transform[0][2]],
    [transform[1][0], transform[1][1], transform[1][2]],
  ];

  return {
    rotation: cmath.transform.angle(matrix),
    scale: cmath.transform.getScale(matrix),
    translation: cmath.transform.getTranslate(matrix),
  };
}

/**
 * Composes rotation (deg), scale, and translation into an affine
 * transform, anchored so the supplied `center` is preserved.
 */
export function compose(
  rotation: number,
  scale: cmath.Vector2,
  translation: cmath.Vector2,
  center: cmath.Vector2
): AffineTransform {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const a = scale[0] * cos;
  const b = -scale[1] * sin;
  const c = scale[0] * sin;
  const d = scale[1] * cos;

  const rotatedScaledCenter = [
    a * center[0] + b * center[1],
    c * center[0] + d * center[1],
  ];

  const tx = center[0] - rotatedScaledCenter[0] + translation[0];
  const ty = center[1] - rotatedScaledCenter[1] + translation[1];

  return [
    [a, b, tx],
    [c, d, ty],
  ];
}

// Degenerate-size guard. Translation is normalised by `size`, so a 0-axis
// would produce Infinity/NaN and corrupt the host's bound transform.
// Scale-side projects onto a corner-derived axis whose length collapses
// to ~0 in the same degenerate case. EPSILON is a pixel-scale floor —
// any size smaller than this is treated as a no-op axis.
const SIZE_EPSILON = 1e-8;

function applyTranslation(
  base: AffineTransform,
  pixelDelta: cmath.Vector2,
  size: cmath.Vector2
): AffineTransform {
  const sx = Math.abs(size[0]) > SIZE_EPSILON ? size[0] : 0;
  const sy = Math.abs(size[1]) > SIZE_EPSILON ? size[1] : 0;
  if (sx === 0 && sy === 0) return base;
  const dx = sx === 0 ? 0 : pixelDelta[0] / sx;
  const dy = sy === 0 ? 0 : pixelDelta[1] / sy;
  return [
    [base[0][0], base[0][1], base[0][2] + dx],
    [base[1][0], base[1][1], base[1][2] + dy],
  ];
}

/**
 * Side scaling.
 *
 * TODO: true original-direction scaling (scaling pure X/Y axes
 * regardless of current rotation) is unimplemented. The current
 * implementation falls back to a geometry-based approach — scaling
 * follows the current rotated axes. This was inherited from the
 * editor's image-paint editor and ships as-is.
 */
function applyScaling(
  base: AffineTransform,
  side: cmath.RectangleSide,
  pixelDelta: cmath.Vector2,
  size: cmath.Vector2
): AffineTransform {
  const corners = getTransformBoxCorners(base, size);

  const axis =
    side === "left" || side === "right"
      ? cmath.vector2.sub(corners.ne, corners.nw)
      : cmath.vector2.sub(corners.sw, corners.nw);

  // Degenerate axis → projection denominator is 0; bail rather than emit
  // a transform full of NaN.
  if (Math.hypot(axis[0], axis[1]) < SIZE_EPSILON) return base;

  const projected = cmath.vector2.project(pixelDelta, axis);

  switch (side) {
    case "left": {
      corners.nw = cmath.vector2.add(corners.nw, projected);
      corners.sw = cmath.vector2.add(corners.sw, projected);
      break;
    }
    case "right": {
      corners.ne = cmath.vector2.add(corners.ne, projected);
      corners.se = cmath.vector2.add(corners.se, projected);
      break;
    }
    case "top": {
      corners.nw = cmath.vector2.add(corners.nw, projected);
      corners.ne = cmath.vector2.add(corners.ne, projected);
      break;
    }
    case "bottom": {
      corners.sw = cmath.vector2.add(corners.sw, projected);
      corners.se = cmath.vector2.add(corners.se, projected);
      break;
    }
  }

  return cornersToBoxTransform(corners, size);
}

/**
 * Convert pixel-space corners back to a box-relative transform.
 */
export function cornersToBoxTransform(
  corners: TransformBoxCorners,
  size: cmath.Vector2
): AffineTransform {
  const width = size[0] || 1;
  const height = size[1] || 1;

  const { nw, ne, sw } = corners;

  const widthVector = cmath.vector2.sub(ne, nw);
  const heightVector = cmath.vector2.sub(sw, nw);

  return [
    [widthVector[0] / width, heightVector[0] / height, nw[0] / width],
    [widthVector[1] / width, heightVector[1] / height, nw[1] / height],
  ];
}

/**
 * Rigid-body rotation of the transformed geometry (rect × transform)
 * around its center. Preserves corner distances and keeps pre/post
 * centers aligned.
 */
function applyRotation(
  base: AffineTransform,
  corner: cmath.IntercardinalDirection,
  pixelDelta: cmath.Vector2,
  size: cmath.Vector2
): AffineTransform {
  const corners = getTransformBoxCorners(base, size);
  const center = cmath.vector2.multiply(
    cmath.vector2.add(corners.nw, corners.se),
    [0.5, 0.5]
  );

  const cornerPoint = corners[corner];
  const target = cmath.vector2.add(cornerPoint, pixelDelta);
  const baseVector = cmath.vector2.sub(cornerPoint, center);
  const targetVector = cmath.vector2.sub(target, center);

  const baseLength = Math.hypot(baseVector[0], baseVector[1]);
  if (baseLength < EPSILON) return base;

  const targetLength = Math.hypot(targetVector[0], targetVector[1]);
  if (targetLength < EPSILON) return base;

  const normalizedTarget = [
    (targetVector[0] / targetLength) * baseLength,
    (targetVector[1] / targetLength) * baseLength,
  ] as cmath.Vector2;

  const dot = cmath.vector2.dot(baseVector, normalizedTarget);
  const cross = cmath.vector2.cross(baseVector, normalizedTarget);
  const angle = Math.atan2(cross, dot);

  if (Math.abs(angle) < EPSILON) return base;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const rotatePoint = (point: cmath.Vector2): cmath.Vector2 => {
    const relative = cmath.vector2.sub(point, center);
    return cmath.vector2.add(center, [
      relative[0] * cos - relative[1] * sin,
      relative[0] * sin + relative[1] * cos,
    ]);
  };

  const rotatedCorners = {
    nw: rotatePoint(corners.nw),
    ne: rotatePoint(corners.ne),
    se: rotatePoint(corners.se),
    sw: rotatePoint(corners.sw),
  };

  return cornersToBoxTransform(rotatedCorners, size);
}
