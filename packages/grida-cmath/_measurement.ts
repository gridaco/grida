import cmath from "./index";

export interface Measurement {
  a: cmath.Rectangle;
  b: cmath.Rectangle;
  box: cmath.Rectangle;
  /**
   * top, right, bottom, left
   */
  distance: [number, number, number, number];
}

/**
 * Converts a Vector2 point to a zero-size Rectangle for measurement purposes.
 * This allows Vector2 points to be treated consistently with rectangles in the measurement system.
 *
 * @param point - The Vector2 point to convert
 * @returns A zero-size Rectangle at the point's coordinates
 */
function vector2ToRectangle(point: cmath.Vector2): cmath.Rectangle {
  return {
    x: point[0],
    y: point[1],
    width: 0,
    height: 0,
  };
}

/**
 * Normalizes input to Rectangle format for measurement calculations.
 * Vector2 points are converted to zero-size rectangles.
 * Rectangles are passed through unchanged.
 *
 * @param input - Either a Vector2 point or Rectangle
 * @returns A Rectangle representation suitable for measurement
 */
function normalizeToRectangle(
  input: cmath.Rectangle | cmath.Vector2
): cmath.Rectangle {
  return Array.isArray(input) ? vector2ToRectangle(input) : input;
}

/**
 * Calculates the base rectangle and the spacing of the nearest top, right, bottom, and left with given rectangles `a` and `b`.
 *
 * - If the two rectangles do not intersect, the base rectangle will be `a`.
 * - If one rectangle is contained in another, the base rectangle will be the contained (smaller) rectangle.
 * - If the two rectangles intersect, the base rectangle will be their intersection.
 *
 * The top, right, bottom, and left spacing is relative to the base rectangle.
 *
 * @param a - The first rectangle or Vector2 point.
 * @param b - The second rectangle or Vector2 point.
 * @returns The spacing guide with base rectangle and spacing values.
 */
export function measure(
  a: cmath.Rectangle | cmath.Vector2,
  b: cmath.Rectangle | cmath.Vector2
): Measurement | null {
  const rectA = normalizeToRectangle(a);
  const rectB = normalizeToRectangle(b);

  if (cmath.rect.isIdentical(rectA, rectB)) return null;
  const intersection = cmath.rect.intersection(rectA, rectB)!;

  // If no intersection
  if (!intersection) {
    const spacing = calculateNonIntersectingSpacing(rectA, rectB);
    return {
      a: rectA,
      b: rectB,
      box: rectA,
      distance: spacing,
    };
  }

  // If `a` contains `b`
  if (cmath.rect.contains(rectA, rectB)) {
    return {
      a: rectA,
      b: rectB,
      box: rectB,
      distance: calculateContainerSpacing(rectA, rectB),
    };
  }

  // If `b` contains `a`
  if (cmath.rect.contains(rectB, rectA)) {
    return {
      a: rectA,
      b: rectB,
      box: rectA,
      distance: calculateContainerSpacing(rectB, rectA),
    };
  }

  // Intersection case (no containment)
  const spacing = calculateIntersectingSpacing(rectA, rectB, intersection);

  return {
    a: rectA,
    b: rectB,
    box: intersection,
    distance: spacing,
  };
}

/**
 * Calculates spacing for intersecting rectangles (no containment).
 *
 * @param a - The first rectangle.
 * @param b - The second rectangle.
 * @param intersection - The intersection rectangle.
 * @returns The distances [top, right, bottom, left] between the rectangles.
 */
function calculateIntersectingSpacing(
  a: cmath.Rectangle,
  b: cmath.Rectangle,
  intersection: cmath.Rectangle
): [number, number, number, number] {
  return [
    Math.abs(intersection.y - Math.min(a.y, b.y)),
    Math.abs(
      Math.max(a.x + a.width, b.x + b.width) -
        (intersection.x + intersection.width)
    ),
    Math.abs(
      Math.max(a.y + a.height, b.y + b.height) -
        (intersection.y + intersection.height)
    ),
    Math.abs(intersection.x - Math.min(a.x, b.x)),
  ];
}

/**
 * https://eli.thegreenplace.net/2008/08/15/intersection-of-1d-segments
 */
const segments_intersect = (x1: number, x2: number, y1: number, y2: number) =>
  x2 >= y1 && y2 >= x1;

/**
 * Calculates spacing for non-intersecting rectangles.
 */
function calculateNonIntersectingSpacing(
  a: cmath.Rectangle,
  b: cmath.Rectangle
): [number, number, number, number] {
  // return [
  //   cmath.nearest(a.y, b.y, b.y + b.height),
  //   cmath.nearest(a.x + a.width, b.x, b.x + b.width),
  //   cmath.nearest(a.y + a.height, b.y, b.y + b.height),
  //   cmath.nearest(a.x, b.x, b.x + b.width),
  // ];

  //   const x_intersects = segments_intersect(
  //     a.x,
  //     a.x + a.width,
  //     b.x,
  //     b.x + b.width
  //   );

  //   const y_intersects = segments_intersect(
  //     a.y,
  //     a.y + a.height,
  //     b.y,
  //     b.y + b.height
  //   );

  // legacy
  let rop = 0,
    right = 0,
    bottom = 0,
    left = 0;

  if (a.x + a.width <= b.x) {
    right = b.x - (a.x + a.width);
  } else if (b.x + b.width <= a.x) {
    left = a.x - (b.x + b.width);
  }

  if (a.y + a.height <= b.y) {
    bottom = b.y - (a.y + a.height);
  } else if (b.y + b.height <= a.y) {
    rop = a.y - (b.y + b.height);
  }

  return [rop, right, bottom, left];
}

/**
 * Calculates spacing for contained rectangles.
 */
function calculateContainerSpacing(
  outer: cmath.Rectangle,
  inner: cmath.Rectangle
): [number, number, number, number] {
  return [
    Math.abs(outer.y - inner.y),
    Math.abs(outer.x + outer.width - (inner.x + inner.width)),
    Math.abs(outer.y + outer.height - (inner.y + inner.height)),
    Math.abs(outer.x - inner.x),
  ];
}

//
//
// =============
//
//
type LineXYXYLR = [number, number, number, number, number, number];

/**
 * Generates guide line coordinates with length and rotation based on a rectangle and side.
 *
 * @param rect - The rectangle in { x, y, width, height } format.
 * @param side - The side of the rectangle: "t" (top), "r" (right), "b" (bottom), "l" (left).
 * @param length - The length of the guide line.
 * @param zoom - Optional zoom factor (default is 1).
 * @returns An array representing the line's coordinates [x1, y1, x2, y2, length, rotation].
 */
export function guide_line_xylr(
  rect: cmath.Rectangle,
  side: cmath.RectangleSide,
  length: number,
  zoom: number = 1
): LineXYXYLR {
  const { x, y, width, height } = rect;
  const midX = x + width / 2;
  const midY = y + height / 2;
  const scaledLength = length * zoom;

  let x1 = 0,
    y1 = 0,
    x2 = 0,
    y2 = 0,
    rotation = 0;

  switch (side) {
    case "top": // Top
      x1 = midX * zoom;
      y1 = y * zoom;
      x2 = x1;
      y2 = y1 - scaledLength;
      rotation = 180;
      break;
    case "right": // Right
      x1 = (x + width) * zoom;
      y1 = midY * zoom;
      x2 = x1 + scaledLength;
      y2 = y1;
      rotation = 270;
      break;
    case "bottom": // Bottom
      x1 = midX * zoom;
      y1 = (y + height) * zoom;
      x2 = x1;
      y2 = y1 + scaledLength;
      rotation = 0;
      break;
    case "left": // Left
      x1 = x * zoom;
      y1 = midY * zoom;
      x2 = x1 - scaledLength;
      y2 = y1;
      rotation = 90;
      break;
  }

  return [x1, y1, x2, y2, scaledLength, rotation];
}

/**
 * Generates auxiliary guide line coordinates extending from a point towards the closest rectangle side.
 *
 * @param point - The reference point in { x, y } format.
 * @param rect - The target rectangle in { x, y, width, height } format.
 * @param side - The side of the rectangle: "t", "r", "b", or "l".
 * @param zoom - Optional zoom factor (default is 1).
 * @returns An array representing the auxiliary line's coordinates [x1, y1, x2, y2, length, rotation].
 */
export function auxiliary_line_xylr(
  point: cmath.Vector2,
  rect: cmath.Rectangle,
  side: cmath.RectangleSide,
  zoom: number = 1
): LineXYXYLR {
  const [px, py] = point;
  const { x, y, width, height } = rect;

  const rectRight = x + width;
  const rectBottom = y + height;

  let x1 = px * zoom,
    y1 = py * zoom,
    x2 = 0,
    y2 = 0,
    length = 0,
    rotation = 0;

  if (cmath.rect.containsPoint(rect, point)) {
    return [x1, y1, NaN, NaN, 0, 0];
  }

  switch (side) {
    case "top": // Top
    case "bottom": // Bottom
      if (px < x) {
        length = (x - px) * zoom;
        rotation = -90;
        x2 = x1 + length;
        y2 = y1;
      } else {
        length = (px - rectRight) * zoom;
        rotation = 90;
        x2 = x1 - length;
        y2 = y1;
      }
      break;

    case "left": // Left
    case "right": // Right
      if (py > rectBottom) {
        length = (py - rectBottom) * zoom;
        rotation = 180;
        x2 = x1;
        y2 = y1 - length;
      } else {
        length = (y - py) * zoom;
        rotation = 0;
        x2 = x1;
        y2 = y1 + length;
      }
      break;
  }

  return [x1, y1, x2, y2, length, rotation];
}
