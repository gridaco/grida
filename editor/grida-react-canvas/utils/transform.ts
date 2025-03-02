import { cmath } from "@grida/cmath";

export function toCanvasSpace(
  point: cmath.Vector2,
  transform: cmath.Transform
): [number, number] {
  const [x, y] = point;

  // Compute inverse of transform
  const [[a, b, tx], [c, d, ty]] = transform;
  const det = a * d - b * c;
  if (!det) throw new Error("Non-invertible transform");
  const invDet = 1 / det;
  const inv: cmath.Transform = [
    [d * invDet, -b * invDet, (b * ty - d * tx) * invDet],
    [-c * invDet, a * invDet, (c * tx - a * ty) * invDet],
  ];

  // Map pointer => canvas space
  const xCanvas = inv[0][0] * x + inv[0][1] * y + inv[0][2];
  const yCanvas = inv[1][0] * x + inv[1][1] * y + inv[1][2];

  return [xCanvas, yCanvas];
}

/**
 * Converts a rectangle from surface space to canvas space by applying the inverse
 * of the provided transform.
 *
 * This implementation computes the inverse of the 2x3 affine transform and applies
 * it to the top-left and bottom-right corners of the rectangle. It then uses the
 * resulting points to derive the bounding rectangle in canvas space, handling any
 * axis inversions.
 *
 * @param rect - The rectangle in surface space.
 * @param transform - The 2x3 affine transform matrix.
 * @returns The rectangle transformed into canvas space.
 *
 * @example
 * ```typescript
 * const rect: cmath.Rectangle = { x: 10, y: 20, width: 100, height: 50 };
 * const transform: cmath.Transform = [
 *   [1, 0, 5],
 *   [0, 1, 10],
 * ];
 * const canvasRect = surfaceRectToCanvasSpace(rect, transform);
 * // canvasRect will be computed by applying the inverse of the transform to the rect corners.
 * ```
 */
export function surfaceRectToCanvasSpace(
  rect: cmath.Rectangle,
  transform: cmath.Transform
): cmath.Rectangle {
  const [[a, b, tx], [c, d, ty]] = transform;
  const det = a * d - b * c;
  if (det === 0) {
    throw new Error("Non-invertible transform");
  }
  const invDet = 1 / det;
  // Compute inverse transform components
  const inv0_0 = d * invDet;
  const inv0_1 = -b * invDet;
  const inv0_2 = (b * ty - d * tx) * invDet;
  const inv1_0 = -c * invDet;
  const inv1_1 = a * invDet;
  const inv1_2 = (c * tx - a * ty) * invDet;

  // Transform top-left corner
  const x1 = rect.x;
  const y1 = rect.y;
  const tlX = inv0_0 * x1 + inv0_1 * y1 + inv0_2;
  const tlY = inv1_0 * x1 + inv1_1 * y1 + inv1_2;

  // Transform bottom-right corner
  const x2 = rect.x + rect.width;
  const y2 = rect.y + rect.height;
  const brX = inv0_0 * x2 + inv0_1 * y2 + inv0_2;
  const brY = inv1_0 * x2 + inv1_1 * y2 + inv1_2;

  // Compute the new rectangle from transformed corners
  const newX = Math.min(tlX, brX);
  const newY = Math.min(tlY, brY);
  const newWidth = Math.abs(brX - tlX);
  const newHeight = Math.abs(brY - tlY);

  return { x: newX, y: newY, width: newWidth, height: newHeight };
}

export function offsetToSurfaceSpace(
  offset: number,
  axis: cmath.Axis,
  transform: cmath.Transform
) {
  const [x, y] = axis === "x" ? [offset, 0] : [0, offset];
  const [xViewport, yViewport] = vector2ToSurfaceSpace([x, y], transform);
  return axis === "x" ? xViewport : yViewport;
}

export function lineToSurfaceSpace(
  line: cmath.ui.Line,
  transform: cmath.Transform
): cmath.ui.Line {
  return {
    ...line,
    x1: offsetToSurfaceSpace(line.x1, "x", transform),
    y1: offsetToSurfaceSpace(line.y1, "y", transform),
    x2: offsetToSurfaceSpace(line.x2, "x", transform),
    y2: offsetToSurfaceSpace(line.y2, "y", transform),
  };
}

export function pointToSurfaceSpace(
  point: cmath.ui.Point,
  transform: cmath.Transform
): cmath.ui.Point {
  return { ...point, ...vector2ToSurfaceSpace([point.x, point.y], transform) };
}

export function vector2ToSurfaceSpace(
  vec: [number, number],
  transform: cmath.Transform
): [number, number] {
  const [[a, b, tx], [c, d, ty]] = transform;
  const [x, y] = vec;

  // Forward transform: multiply the (x, y) by the matrix
  const xViewport = a * x + b * y + tx;
  const yViewport = c * x + d * y + ty;

  return [xViewport, yViewport];
}

export function rectToSurfaceSpace(
  rect: cmath.Rectangle,
  transform: cmath.Transform
): cmath.Rectangle {
  const min: cmath.Vector2 = [rect.x, rect.y];
  const max: cmath.Vector2 = [rect.x + rect.width, rect.y + rect.height];

  const tmin = vector2ToSurfaceSpace(min, transform);
  const tmax = vector2ToSurfaceSpace(max, transform);

  return cmath.rect.fromPoints([tmin, tmax]);
}
