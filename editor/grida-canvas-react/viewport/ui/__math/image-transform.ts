import cmath from "@grida/cmath";
import type cg from "@grida/cg";

/**
 * IMAGE TRANSFORM EDITOR - PURE MATHEMATICAL IMPLEMENTATION
 *
 * PARAMETERS:
 * - rect: The box (container rectangle)
 * - transform: The current transform matrix applied to the box
 *
 * MATHEMATICS:
 * Each corner is simply a projection of box corner through the transform matrix.
 * No resolving matrix from points - pure mathematical projection.
 *
 * CENTER DEFINITION (as clarified by user):
 * Center = center of (rect * transform)
 * Where rect corners are transformed by the matrix to get the visual center.
 */

export type ImageTransformAction =
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

export interface ImageTransformOptions {
  size: cmath.Vector2;
}

export type ImageRectCorners = {
  nw: cmath.Vector2;
  ne: cmath.Vector2;
  se: cmath.Vector2;
  sw: cmath.Vector2;
};

const EPSILON = 1e-10;

/**
 * Reduces an image paint transform in response to a UI action.
 */
export function reduceImageTransform(
  base: cg.AffineTransform,
  action: ImageTransformAction,
  options: ImageTransformOptions
): cg.AffineTransform {
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
 * PURE MATHEMATICAL CORNER PROJECTION
 *
 * Given:
 * - rect: box rectangle corners
 * - transform: transformation matrix
 *
 * Result: Each corner = transform * rect_corner
 */
export function getImageRectCorners(
  transform: cg.AffineTransform,
  size: cmath.Vector2
): ImageRectCorners {
  const width = size[0] || 1;
  const height = size[1] || 1;

  // Box rectangle corners in pixel space
  const boxCorners: cmath.Vector2[] = [
    [0, 0], // northwest
    [width, 0], // northeast
    [width, height], // southeast
    [0, height], // southwest
  ];

  // Transform matrix in pixel space
  const pixelTransform: cmath.Transform = [
    [transform[0][0], transform[0][1], transform[0][2] * width],
    [transform[1][0], transform[1][1], transform[1][2] * height],
  ];

  // Pure mathematical projection: transform * corner
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
 * Apply translation by modifying translation components directly.
 */
function applyTranslation(
  base: cg.AffineTransform,
  pixelDelta: cmath.Vector2,
  size: cmath.Vector2
): cg.AffineTransform {
  const boxDelta: cmath.Vector2 = [
    pixelDelta[0] / size[0],
    pixelDelta[1] / size[1],
  ];

  return [
    [base[0][0], base[0][1], base[0][2] + boxDelta[0]],
    [base[1][0], base[1][1], base[1][2] + boxDelta[1]],
  ];
}

/**
 * MATHEMATICAL FOUNDATION: Transform Decomposition
 *
 * Decomposes an affine transform into rotation, scale, and translation components.
 * This is essential for side scaling in original directions.
 */
export function decompose(transform: cg.AffineTransform): {
  rotation: number; // degrees
  scale: cmath.Vector2; // [scaleX, scaleY]
  translation: cmath.Vector2; // [tx, ty]
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
 * MATHEMATICAL FOUNDATION: Transform Composition
 *
 * Composes rotation, scale, and translation into an affine transform.
 */
export function compose(
  rotation: number, // degrees
  scale: cmath.Vector2, // [scaleX, scaleY]
  translation: cmath.Vector2, // [tx, ty]
  center: cmath.Vector2 // rotation/scale center
): cg.AffineTransform {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Create rotation * scale matrix
  const a = scale[0] * cos;
  const b = -scale[1] * sin;
  const c = scale[0] * sin;
  const d = scale[1] * cos;

  // Calculate translation that maintains the center
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

/**
 * MATHEMATICAL FOUNDATION: Side Scaling in Original Directions
 *
 * When scaling a side, we scale in the ORIGINAL direction (X or Y axis)
 * regardless of current rotation. This requires working directly with
 * the transform matrix components.
 */
/**
 * CORRECT APPROACH: Direct Matrix Modification for Original Direction Scaling
 *
 * The key insight: Instead of using transform decomposition (which is inaccurate),
 * we directly modify the matrix components to achieve scaling in original X/Y directions.
 */
function applyScaling(
  base: cg.AffineTransform,
  side: cmath.RectangleSide,
  pixelDelta: cmath.Vector2,
  size: cmath.Vector2
): cg.AffineTransform {
  // For original direction scaling, we need to modify the transform matrix
  // to scale in pure X or Y direction, regardless of current rotation.

  // This is a complex mathematical problem that requires careful handling
  // of the matrix components to preserve rotation while scaling in original directions.

  // For now, fall back to the working geometry-based approach
  // TODO: Implement true original-direction scaling

  const corners = getImageRectCorners(base, size);

  const axis =
    side === "left" || side === "right"
      ? cmath.vector2.sub(corners.ne, corners.nw)
      : cmath.vector2.sub(corners.sw, corners.nw);

  const projected = cmath.vector2.project(pixelDelta, axis);

  // Apply scaling to appropriate corners
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
 * Convert corners back to box-relative transform.
 */
function cornersToBoxTransform(
  corners: ImageRectCorners,
  size: cmath.Vector2
): cg.AffineTransform {
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
 * PURE MATHEMATICAL ROTATION
 *
 * Rotate the transformed geometry (rect * transform) around its center.
 * This preserves distances and keeps pre-post centers aligned.
 */
function applyRotation(
  base: cg.AffineTransform,
  corner: cmath.IntercardinalDirection,
  pixelDelta: cmath.Vector2,
  size: cmath.Vector2
): cg.AffineTransform {
  // Get current transformed corners (rect * transform)
  const corners = getImageRectCorners(base, size);
  const center = cmath.vector2.multiply(
    cmath.vector2.add(corners.nw, corners.se),
    [0.5, 0.5]
  );

  // Calculate rotation angle from UI interaction
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

  const angleDegrees = (angle * 180) / Math.PI;

  // Rotate all corners around center (rigid body rotation)
  const rotatePoint = (point: cmath.Vector2): cmath.Vector2 => {
    const rad = (angleDegrees * Math.PI) / 180;
    const relative = cmath.vector2.sub(point, center);
    const cos = Math.cos(rad),
      sin = Math.sin(rad);
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

  // Convert rotated corners back to transform matrix
  // This preserves the center alignment by construction
  return cornersToBoxTransform(rotatedCorners, size);
}
