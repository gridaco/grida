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

export function pointToSurfaceSpace(
  point: [number, number],
  transform: [[number, number, number], [number, number, number]]
): [number, number] {
  const [[a, b, tx], [c, d, ty]] = transform;
  const [x, y] = point;

  // Forward transform: multiply the (x, y) by the matrix
  const xViewport = a * x + b * y + tx;
  const yViewport = c * x + d * y + ty;

  return [xViewport, yViewport];
}

export function rectToSurfaceSpace(
  rect: cmath.Rectangle,
  transform: [[number, number, number], [number, number, number]]
): cmath.Rectangle {
  const min: cmath.Vector2 = [rect.x, rect.y];
  const max: cmath.Vector2 = [rect.x + rect.width, rect.y + rect.height];

  const tmin = pointToSurfaceSpace(min, transform);
  const tmax = pointToSurfaceSpace(max, transform);

  return cmath.rect.fromPoints([tmin, tmax]);
}
