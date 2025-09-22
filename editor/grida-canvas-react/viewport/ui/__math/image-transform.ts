import cmath from "@grida/cmath";
import type cg from "@grida/cg";

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

const EPSILON = 1e-6;

export type ImageRectCorners = {
  nw: cmath.Vector2; // northwest = top-left
  ne: cmath.Vector2; // northeast = top-right
  se: cmath.Vector2; // southeast = bottom-right
  sw: cmath.Vector2; // southwest = bottom-left
};

/**
 * Reduces an image paint transform in response to a UI action in pixel space.
 */
export function reduceImageTransform(
  base: cg.AffineTransform,
  action: ImageTransformAction,
  options: ImageTransformOptions
): cg.AffineTransform {
  const { size } = options;
  const baseMatrix = toPixelMatrix(base, size);
  let nextMatrix: cmath.Transform = baseMatrix;

  switch (action.type) {
    case "translate": {
      nextMatrix = cmath.transform.translate(baseMatrix, action.delta);
      break;
    }
    case "scale-side": {
      nextMatrix = resizeBySide(baseMatrix, action.side, action.delta);
      break;
    }
    case "rotate": {
      nextMatrix = rotateByCorner(baseMatrix, action.corner, action.delta);
      break;
    }
  }

  return fromPixelMatrix(nextMatrix, size);
}

/**
 * Returns the rectangle corners in pixel coordinates for the provided transform.
 */
export function getImageRectCorners(
  transform: cg.AffineTransform,
  size: cmath.Vector2
): ImageRectCorners {
  const matrix = toPixelMatrix(transform, size);
  return getCornersFromMatrix(matrix);
}

function toPixelMatrix(
  transform: cg.AffineTransform,
  size: cmath.Vector2
): cmath.Transform {
  const width = size[0] || 1;
  const height = size[1] || 1;
  return [
    [transform[0][0] * width, transform[0][1] * width, transform[0][2] * width],
    [
      transform[1][0] * height,
      transform[1][1] * height,
      transform[1][2] * height,
    ],
  ];
}

function fromPixelMatrix(
  matrix: cmath.Transform,
  size: cmath.Vector2
): cg.AffineTransform {
  const width = size[0] || 1;
  const height = size[1] || 1;
  return [
    [matrix[0][0] / width, matrix[0][1] / width, matrix[0][2] / width],
    [matrix[1][0] / height, matrix[1][1] / height, matrix[1][2] / height],
  ];
}

function getCornersFromMatrix(matrix: cmath.Transform): ImageRectCorners {
  const nw: cmath.Vector2 = [matrix[0][2], matrix[1][2]]; // northwest = top-left
  const widthVector: cmath.Vector2 = [matrix[0][0], matrix[1][0]];
  const heightVector: cmath.Vector2 = [matrix[0][1], matrix[1][1]];
  const ne = cmath.vector2.add(nw, widthVector); // northeast = top-right
  const sw = cmath.vector2.add(nw, heightVector); // southwest = bottom-left
  const se = cmath.vector2.add(nw, widthVector, heightVector); // southeast = bottom-right

  return { nw, ne, se, sw };
}

function matrixFromCorners(corners: ImageRectCorners): cmath.Transform {
  const { nw, ne, sw } = corners; // northwest, northeast, southwest
  const widthVector = cmath.vector2.sub(ne, nw); // northeast - northwest
  const heightVector = cmath.vector2.sub(sw, nw); // southwest - northwest
  return [
    [widthVector[0], heightVector[0], nw[0]],
    [widthVector[1], heightVector[1], nw[1]],
  ];
}

function resizeBySide(
  matrix: cmath.Transform,
  side: cmath.RectangleSide,
  delta: cmath.Vector2
): cmath.Transform {
  const corners = getCornersFromMatrix(matrix);
  const axis =
    side === "left" || side === "right"
      ? cmath.vector2.sub(corners.ne, corners.nw) // northeast - northwest
      : cmath.vector2.sub(corners.sw, corners.nw); // southwest - northwest

  const projected = cmath.vector2.project(delta, axis);

  switch (side) {
    case "left": {
      corners.nw = cmath.vector2.add(corners.nw, projected); // northwest
      corners.sw = cmath.vector2.add(corners.sw, projected); // southwest
      break;
    }
    case "right": {
      corners.ne = cmath.vector2.add(corners.ne, projected); // northeast
      corners.se = cmath.vector2.add(corners.se, projected); // southeast
      break;
    }
    case "top": {
      corners.nw = cmath.vector2.add(corners.nw, projected); // northwest
      corners.ne = cmath.vector2.add(corners.ne, projected); // northeast
      break;
    }
    case "bottom": {
      corners.sw = cmath.vector2.add(corners.sw, projected); // southwest
      corners.se = cmath.vector2.add(corners.se, projected); // southeast
      break;
    }
  }

  return matrixFromCorners(corners);
}

function rotateByCorner(
  matrix: cmath.Transform,
  corner: cmath.IntercardinalDirection,
  delta: cmath.Vector2
): cmath.Transform {
  const corners = getCornersFromMatrix(matrix);
  const center = cmath.vector2.multiply(
    cmath.vector2.add(corners.nw, corners.se), // northwest + southeast
    [0.5, 0.5]
  );

  const cornerPoint = corners[corner];
  const target = cmath.vector2.add(cornerPoint, delta);
  const baseVector = cmath.vector2.sub(cornerPoint, center);
  const targetVector = cmath.vector2.sub(target, center);
  const baseLength = Math.hypot(baseVector[0], baseVector[1]);

  if (baseLength < EPSILON) {
    return matrix;
  }

  const targetLength = Math.hypot(targetVector[0], targetVector[1]);
  if (targetLength < EPSILON) {
    return matrix;
  }

  const normalizedTarget = [
    (targetVector[0] / targetLength) * baseLength,
    (targetVector[1] / targetLength) * baseLength,
  ] as cmath.Vector2;

  const dot = cmath.vector2.dot(baseVector, normalizedTarget);
  const cross = cmath.vector2.cross(baseVector, normalizedTarget);
  const angle = Math.atan2(cross, dot);

  if (Math.abs(angle) < EPSILON) {
    return matrix;
  }

  // Convert angle from radians to degrees for cmath.transform.rotate
  const angleDegrees = (angle * 180) / Math.PI;

  return cmath.transform.rotate(matrix, angleDegrees, center);
}
