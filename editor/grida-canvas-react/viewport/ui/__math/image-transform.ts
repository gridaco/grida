import cmath from "@grida/cmath";
import type cg from "@grida/cg";

export type ImageTransformCorner =
  | "top-left"
  | "top-right"
  | "bottom-right"
  | "bottom-left";

export type ImageTransformSide = "left" | "right" | "top" | "bottom";

export type ImageTransformAction =
  | {
      type: "translate";
      delta: cmath.Vector2;
    }
  | {
      type: "scale-side";
      side: ImageTransformSide;
      delta: cmath.Vector2;
    }
  | {
      type: "rotate";
      corner: ImageTransformCorner;
      delta: cmath.Vector2;
    };

export interface ImageTransformOptions {
  size: cmath.Vector2;
}

const EPSILON = 1e-6;

type PixelMatrix = cmath.Transform;

export type ImageRectCorners = {
  topLeft: cmath.Vector2;
  topRight: cmath.Vector2;
  bottomRight: cmath.Vector2;
  bottomLeft: cmath.Vector2;
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
  let nextMatrix: PixelMatrix = baseMatrix;

  switch (action.type) {
    case "translate": {
      const [dx, dy] = action.delta;
      nextMatrix = [
        [baseMatrix[0][0], baseMatrix[0][1], baseMatrix[0][2] + dx],
        [baseMatrix[1][0], baseMatrix[1][1], baseMatrix[1][2] + dy],
      ];
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
): PixelMatrix {
  const width = size[0] || 1;
  const height = size[1] || 1;
  return [
    [transform[0][0] * width, transform[0][1] * width, transform[0][2] * width],
    [transform[1][0] * height, transform[1][1] * height, transform[1][2] * height],
  ];
}

function fromPixelMatrix(
  matrix: PixelMatrix,
  size: cmath.Vector2
): cg.AffineTransform {
  const width = size[0] || 1;
  const height = size[1] || 1;
  return [
    [matrix[0][0] / width, matrix[0][1] / width, matrix[0][2] / width],
    [matrix[1][0] / height, matrix[1][1] / height, matrix[1][2] / height],
  ];
}

function getCornersFromMatrix(matrix: PixelMatrix): ImageRectCorners {
  const topLeft: cmath.Vector2 = [matrix[0][2], matrix[1][2]];
  const widthVector: cmath.Vector2 = [matrix[0][0], matrix[1][0]];
  const heightVector: cmath.Vector2 = [matrix[0][1], matrix[1][1]];
  const topRight = cmath.vector2.add(topLeft, widthVector);
  const bottomLeft = cmath.vector2.add(topLeft, heightVector);
  const bottomRight = cmath.vector2.add(topLeft, widthVector, heightVector);

  return { topLeft, topRight, bottomRight, bottomLeft };
}

function pickCorner(
  corners: ImageRectCorners,
  corner: ImageTransformCorner
): cmath.Vector2 {
  switch (corner) {
    case "top-left":
      return corners.topLeft;
    case "top-right":
      return corners.topRight;
    case "bottom-right":
      return corners.bottomRight;
    case "bottom-left":
      return corners.bottomLeft;
  }
}

function matrixFromCorners(corners: ImageRectCorners): PixelMatrix {
  const { topLeft, topRight, bottomLeft } = corners;
  const widthVector = cmath.vector2.sub(topRight, topLeft);
  const heightVector = cmath.vector2.sub(bottomLeft, topLeft);
  return [
    [widthVector[0], heightVector[0], topLeft[0]],
    [widthVector[1], heightVector[1], topLeft[1]],
  ];
}

function resizeBySide(
  matrix: PixelMatrix,
  side: ImageTransformSide,
  delta: cmath.Vector2
): PixelMatrix {
  const corners = getCornersFromMatrix(matrix);
  const axis =
    side === "left" || side === "right"
      ? cmath.vector2.sub(corners.topRight, corners.topLeft)
      : cmath.vector2.sub(corners.bottomLeft, corners.topLeft);

  const projected = project(delta, axis);

  switch (side) {
    case "left": {
      corners.topLeft = cmath.vector2.add(corners.topLeft, projected);
      corners.bottomLeft = cmath.vector2.add(corners.bottomLeft, projected);
      break;
    }
    case "right": {
      corners.topRight = cmath.vector2.add(corners.topRight, projected);
      corners.bottomRight = cmath.vector2.add(corners.bottomRight, projected);
      break;
    }
    case "top": {
      corners.topLeft = cmath.vector2.add(corners.topLeft, projected);
      corners.topRight = cmath.vector2.add(corners.topRight, projected);
      break;
    }
    case "bottom": {
      corners.bottomLeft = cmath.vector2.add(corners.bottomLeft, projected);
      corners.bottomRight = cmath.vector2.add(corners.bottomRight, projected);
      break;
    }
  }

  return matrixFromCorners(corners);
}

function rotateByCorner(
  matrix: PixelMatrix,
  corner: ImageTransformCorner,
  delta: cmath.Vector2
): PixelMatrix {
  const corners = getCornersFromMatrix(matrix);
  const center = cmath.vector2.multiply(
    cmath.vector2.add(corners.topLeft, corners.bottomRight),
    [0.5, 0.5]
  );

  const cornerPoint = pickCorner(corners, corner);
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

  const dot =
    baseVector[0] * normalizedTarget[0] +
    baseVector[1] * normalizedTarget[1];
  const cross =
    baseVector[0] * normalizedTarget[1] -
    baseVector[1] * normalizedTarget[0];
  const angle = Math.atan2(cross, dot);

  if (Math.abs(angle) < EPSILON) {
    return matrix;
  }

  const rotation: PixelMatrix = [
    [Math.cos(angle), -Math.sin(angle), 0],
    [Math.sin(angle), Math.cos(angle), 0],
  ];
  const toOrigin: PixelMatrix = [
    [1, 0, -center[0]],
    [0, 1, -center[1]],
  ];
  const back: PixelMatrix = [
    [1, 0, center[0]],
    [0, 1, center[1]],
  ];

  const rotateAroundCenter = cmath.transform.multiply(
    back,
    cmath.transform.multiply(rotation, toOrigin)
  );

  return cmath.transform.multiply(rotateAroundCenter, matrix);
}

function project(delta: cmath.Vector2, axis: cmath.Vector2): cmath.Vector2 {
  const lengthSq = axis[0] * axis[0] + axis[1] * axis[1];
  if (lengthSq < EPSILON) {
    return [0, 0];
  }
  const dot = delta[0] * axis[0] + delta[1] * axis[1];
  const scale = dot / lengthSq;
  return [axis[0] * scale, axis[1] * scale];
}
