import { SVGPathData } from "./svg-path-data.js";
import { type CommandA, type CommandC } from "./types.js";

export type Point = [x: number, y: number];

export function rotate([x, y]: Point, rad: number) {
  return [
    x * Math.cos(rad) - y * Math.sin(rad),
    x * Math.sin(rad) + y * Math.cos(rad),
  ];
}

const DEBUG_CHECK_NUMBERS = true;
export function assertNumbers(...numbers: number[]) {
  if (DEBUG_CHECK_NUMBERS) {
    for (let i = 0; i < numbers.length; i++) {
      if ("number" !== typeof numbers[i]) {
        throw new Error(
          `assertNumbers arguments[${i}] is not a number. ${typeof numbers[i]} == typeof ${numbers[i]}`
        );
      }
    }
  }
  return true;
}

const PI = Math.PI;

/**
 * https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes
 * Fixes rX and rY.
 * Ensures lArcFlag and sweepFlag are 0 or 1
 * Adds center coordinates: command.cX, command.cY (relative or absolute, depending on command.relative)
 * Adds start and end arc parameters (in degrees): command.phi1, command.phi2; phi1 < phi2 iff. c.sweepFlag == true
 */
export function annotateArcCommand(c: CommandA, x1: number, y1: number) {
  c.lArcFlag = 0 === c.lArcFlag ? 0 : 1;
  c.sweepFlag = 0 === c.sweepFlag ? 0 : 1;
  let { rX, rY } = c;
  const { x, y } = c;

  if (Math.abs(rX) < 1e-10 || Math.abs(rY) < 1e-10) {
    c.rX = 0;
    c.rY = 0;
    c.cX = (x1 + x) / 2;
    c.cY = (y1 + y) / 2;
    c.phi1 = 0;
    c.phi2 = 0;
    return;
  }

  rX = Math.abs(c.rX);
  rY = Math.abs(c.rY);
  const xRotRad = (c.xRot / 180) * PI;
  const [x1_, y1_] = rotate([(x1 - x) / 2, (y1 - y) / 2], -xRotRad);
  const testValue =
    Math.pow(x1_, 2) / Math.pow(rX, 2) + Math.pow(y1_, 2) / Math.pow(rY, 2);

  if (1 < testValue) {
    rX *= Math.sqrt(testValue);
    rY *= Math.sqrt(testValue);
  }
  c.rX = rX;
  c.rY = rY;
  const c_ScaleTemp =
    Math.pow(rX, 2) * Math.pow(y1_, 2) + Math.pow(rY, 2) * Math.pow(x1_, 2);
  const c_Scale =
    (c.lArcFlag !== c.sweepFlag ? 1 : -1) *
    Math.sqrt(
      Math.max(
        0,
        (Math.pow(rX, 2) * Math.pow(rY, 2) - c_ScaleTemp) / c_ScaleTemp
      )
    );
  const cx_ = ((rX * y1_) / rY) * c_Scale;
  const cy_ = ((-rY * x1_) / rX) * c_Scale;
  const cRot = rotate([cx_, cy_], xRotRad);

  c.cX = cRot[0] + (x1 + x) / 2;
  c.cY = cRot[1] + (y1 + y) / 2;
  c.phi1 = Math.atan2((y1_ - cy_) / rY, (x1_ - cx_) / rX);
  c.phi2 = Math.atan2((-y1_ - cy_) / rY, (-x1_ - cx_) / rX);
  if (0 === c.sweepFlag && c.phi2 > c.phi1) {
    c.phi2 -= 2 * PI;
  }
  if (1 === c.sweepFlag && c.phi2 < c.phi1) {
    c.phi2 += 2 * PI;
  }
  c.phi1 *= 180 / PI;
  c.phi2 *= 180 / PI;
}

/**
 * Solves a quadratic system of equations of the form
 *      a * x + b * y = c
 *      x² + y² = 1
 * This can be understood as the intersection of the unit circle with a line.
 *      => y = (c - a x) / b
 *      => x² + (c - a x)² / b² = 1
 *      => x² b² + c² - 2 c a x + a² x² = b²
 *      => (a² + b²) x² - 2 a c x + (c² - b²) = 0
 */
export function intersectionUnitCircleLine(
  a: number,
  b: number,
  c: number
): [number, number][] {
  assertNumbers(a, b, c);
  // cf. pqFormula
  const termSqr = a * a + b * b - c * c;

  if (0 > termSqr) {
    return [];
  } else if (0 === termSqr) {
    return [[(a * c) / (a * a + b * b), (b * c) / (a * a + b * b)]];
  }
  const term = Math.sqrt(termSqr);

  return [
    [
      (a * c + b * term) / (a * a + b * b),
      (b * c - a * term) / (a * a + b * b),
    ],
    [
      (a * c - b * term) / (a * a + b * b),
      (b * c + a * term) / (a * a + b * b),
    ],
  ];
}

export const DEG = Math.PI / 180;

export function lerp(a: number, b: number, t: number) {
  return (1 - t) * a + t * b;
}

export function arcAt(c: number, x1: number, x2: number, phiDeg: number) {
  return (
    c + Math.cos((phiDeg / 180) * PI) * x1 + Math.sin((phiDeg / 180) * PI) * x2
  );
}

export function bezierRoot(x0: number, x1: number, x2: number, x3: number) {
  const EPS = 1e-6;
  // Coefficients for the derivative of a cubic Bezier curve
  // B'(t) = 3(1-t)²(P₁-P₀) + 6(1-t)t(P₂-P₁) + 3t²(P₃-P₂)
  // When rearranged to at² + bt + c:
  const x01 = x1 - x0;
  const x12 = x2 - x1;
  const x23 = x3 - x2;
  const a = 3 * x01 + 3 * x23 - 6 * x12;
  const b = (x12 - x01) * 6;
  const c = 3 * x01;
  // solve a * t² + b * t + c = 0

  if (Math.abs(a) < EPS) {
    // For near-zero a, it becomes a linear equation: b * t + c = 0
    return Math.abs(b) < EPS ? [] : [-c / b];
  }
  return pqFormula(b / a, c / a, EPS);
}

export function bezierAt(
  x0: number,
  x1: number,
  x2: number,
  x3: number,
  t: number
) {
  // Calculates a point on a cubic Bezier curve at parameter t.
  // B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
  // Which is equivalent to:
  // B(t) = (s³)P₀ + (3s²t)P₁ + (3st²)P₂ + (t³)P₃  where s = 1-t
  const s = 1 - t;
  const c0 = s * s * s;
  const c1 = 3 * s * s * t;
  const c2 = 3 * s * t * t;
  const c3 = t * t * t;

  return x0 * c0 + x1 * c1 + x2 * c2 + x3 * c3;
}

function pqFormula(p: number, q: number, PRECISION = 1e-6) {
  // 4 times the discriminant:in
  const discriminantX4 = (p * p) / 4 - q;

  if (discriminantX4 < -PRECISION) {
    return [];
  } else if (discriminantX4 <= PRECISION) {
    return [-p / 2];
  }
  const root = Math.sqrt(discriminantX4);

  return [-(p / 2) - root, -(p / 2) + root];
}

export function a2c(arc: CommandA, x0: number, y0: number): CommandC[] {
  if (!arc.cX) {
    annotateArcCommand(arc, x0, y0);
  }
  // Convert xRot to radians
  const xRotRad = (arc.xRot / 180) * PI;

  // Handle zero radius case - convert to a straight line represented as a curve
  if (Math.abs(arc.rX) < 1e-10 || Math.abs(arc.rY) < 1e-10) {
    return [
      {
        relative: arc.relative,
        type: SVGPathData.CURVE_TO,
        x1: x0 + (arc.x - x0) / 3,
        y1: y0 + (arc.y - y0) / 3,
        x2: x0 + (2 * (arc.x - x0)) / 3,
        y2: y0 + (2 * (arc.y - y0)) / 3,
        x: arc.x,
        y: arc.y,
      },
    ];
  }

  const phiMin = Math.min(arc.phi1 as number, arc.phi2 as number),
    phiMax = Math.max(arc.phi1 as number, arc.phi2 as number),
    deltaPhi = phiMax - phiMin;
  const partCount = Math.ceil(deltaPhi / 90);

  const result: CommandC[] = new Array(partCount);
  let prevX = x0;
  let prevY = y0;

  const transform = (x: number, y: number): Point => {
    const [xTemp, yTemp] = rotate([x * arc.rX, y * arc.rY], xRotRad);
    return [(arc.cX as number) + xTemp, (arc.cY as number) + yTemp];
  };

  for (let i = 0; i < partCount; i++) {
    const phiStart = lerp(
      arc.phi1 as number,
      arc.phi2 as number,
      i / partCount
    );
    const phiEnd = lerp(
      arc.phi1 as number,
      arc.phi2 as number,
      (i + 1) / partCount
    );
    const deltaPhi = phiEnd - phiStart;
    const f = (4 / 3) * Math.tan((deltaPhi * DEG) / 4);
    // x1/y1, x2/y2 and x/y coordinates on the unit circle for phiStart/phiEnd
    const x1 = Math.cos(phiStart * DEG) - f * Math.sin(phiStart * DEG);
    const y1 = Math.sin(phiStart * DEG) + f * Math.cos(phiStart * DEG);
    const x = Math.cos(phiEnd * DEG);
    const y = Math.sin(phiEnd * DEG);
    const x2 = x + f * y;
    const y2 = y - f * x;

    const cp1 = transform(x1, y1);
    const cp2 = transform(x2, y2);
    const end = transform(x, y);

    const command: CommandC = {
      relative: arc.relative,
      type: SVGPathData.CURVE_TO,
      x: end[0],
      y: end[1],
      x1: cp1[0],
      y1: cp1[1],
      x2: cp2[0],
      y2: cp2[1],
    };

    if (arc.relative) {
      command.x1 -= prevX;
      command.y1 -= prevY;
      command.x2 -= prevX;
      command.y2 -= prevY;
      command.x -= prevX;
      command.y -= prevY;
    }
    prevX = end[0];
    prevY = end[1];

    result[i] = command;
  }
  return result;
}

/**
 * Determines if three points are collinear (lie on the same straight line)
 * and the middle point is on the line segment between the first and third points
 *
 * @param p1 First point [x, y]
 * @param p2 Middle point that might be removed
 * @param p3 Last point [x, y]
 * @returns true if the points are collinear and p2 is on the segment p1-p3
 */
export function arePointsCollinear(p1: Point, p2: Point, p3: Point): boolean {
  // Create vectors
  const v1x = p2[0] - p1[0];
  const v1y = p2[1] - p1[1];
  const v2x = p3[0] - p1[0];
  const v2y = p3[1] - p1[1];

  // Cross product: v1 × v2 = v1x * v2y - v1y * v2x
  // If cross product is close to zero, points are collinear
  const cross = v1x * v2y - v1y * v2x;
  const isCollinear = Math.abs(cross) < 1e-10;

  if (!isCollinear) return false;

  // Now check if p2 is on the segment p1-p3
  // For this we check if the projection of v1 onto v2 is between 0 and |v2|

  // Calculate dot product
  const dot = v1x * v2x + v1y * v2y;

  // Calculate squared lengths
  const lenSqV1 = v1x * v1x + v1y * v1y;
  const lenSqV2 = v2x * v2x + v2y * v2y;

  // p2 is on segment p1-p3 if:
  // 1. 0 ≤ dot(v1,v2) ≤ dot(v2,v2) - this checks if projection is within segment
  // 2. |v1| ≤ |v2| - this checks if p2 is not beyond p3
  return 0 <= dot && dot <= lenSqV2 && lenSqV1 <= lenSqV2;
}
