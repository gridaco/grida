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
