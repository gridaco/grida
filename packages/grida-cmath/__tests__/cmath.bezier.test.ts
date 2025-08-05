import cmath from "..";

/**
 * Converts the output of cmath.bezier.a2c to an SVG path string.
 *
 * @param x1 - Starting x-coordinate.
 * @param y1 - Starting y-coordinate.
 * @param a2cResult - Array of cubic Bézier points from cmath.bezier.a2c.
 * @returns A string representing the SVG path.
 */
function a2cToSvgPath(x1: number, y1: number, a2cResult: number[]): string {
  let path = `M ${x1} ${y1}`; // Start the path at the starting point

  for (let i = 0; i < a2cResult.length; i += 6) {
    const [c1x, c1y, c2x, c2y, x, y] = a2cResult.slice(i, i + 6);
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x} ${y}`;
  }

  return path;
}

/**
 * Helper function to reconstruct the full Bezier points by prepending the start point.
 */
const getBezierPoints = (
  x1: number,
  y1: number,
  a2cResult: number[]
): number[] => [x1, y1, ...a2cResult];

describe("cmath.bezier.a2c", () => {
  test("should convert a simple arc to a single cubic Bézier curve (with svg path)", () => {
    // SVG:
    // A rx ry x-axis-rotation large-arc-flag sweep-flag x   y
    // A 1  1  0               0              0          100 0
    const a2cResult = cmath.bezier.a2c(
      0, // x1
      0, // y1
      1, // rx
      1, // ry
      0, // x-axis-rotation
      0, // large-arc-flag
      0, // sweep-flag
      100, // x2
      0 // y2
    );

    const d = a2cToSvgPath(0, 0, a2cResult);

    // console.log("res", a2cResult, d);
    //  res [
    //    4.7136677276662516e-15,
    //    38.49001794597504,
    //    41.66666666666667,
    //    62.54627916220946,
    //    75,
    //    43.30127018922194,
    //    90.47005383792515,
    //    34.36963044151785,
    //    100,
    //    17.863279495408182,
    //    100,
    //    0
    //  ];

    expect(d).toBe(
      "M 0 0 C 4.7136677276662516e-15 38.49001794597504, 41.66666666666667 62.54627916220946, 75 43.30127018922194 C 90.47005383792515 34.36963044151785, 100 17.863279495408182, 100 0"
    );
  });

  test("should convert a simple arc to a single cubic Bézier curve", () => {
    const x1 = 0;
    const y1 = 0;
    const rx = 50;
    const ry = 50;
    const angle = 0;
    const largeArcFlag: 0 | 1 = 0;
    const sweepFlag: 0 | 1 = 1;
    const x2 = 50;
    const y2 = 50;

    const a2cResult = cmath.bezier.a2c(
      x1,
      y1,
      rx,
      ry,
      angle,
      largeArcFlag,
      sweepFlag,
      x2,
      y2
    );

    const bezierPoints = getBezierPoints(x1, y1, a2cResult);

    expect(bezierPoints).toHaveLength(8);
    expect(bezierPoints[0]).toBeCloseTo(x1, 6);
    expect(bezierPoints[1]).toBeCloseTo(y1, 6);
    expect(bezierPoints[6]).toBeCloseTo(x2, 6);
    expect(bezierPoints[7]).toBeCloseTo(y2, 6);
    expect(bezierPoints[2]).toBeCloseTo(27.614237491539665, 3);
    expect(bezierPoints[3]).toBeCloseTo(0, 6);
    expect(bezierPoints[4]).toBeCloseTo(50, 6);
    expect(bezierPoints[5]).toBeCloseTo(22.385762508460335, 3);
  });

  test("should handle large arc flag correctly (large arc, >180 degrees)", () => {
    const x1 = 0;
    const y1 = 0;
    const rx = 50;
    const ry = 50;
    const angle = 0;
    const largeArcFlag: 0 | 1 = 1; // Large arc
    const sweepFlag: 0 | 1 = 1;
    const x2 = 50;
    const y2 = 50;

    const a2cResult = cmath.bezier.a2c(
      x1,
      y1,
      rx,
      ry,
      angle,
      largeArcFlag,
      sweepFlag,
      x2,
      y2
    );

    const bezierPoints = getBezierPoints(x1, y1, a2cResult);

    // Since large arc spans ~270 degrees, expect two cubic Bézier curves
    expect(bezierPoints.length).toBeGreaterThan(8);
    // Optionally, you can check the specific length based on how many segments Snap.svg splits
    // For 270 degrees, it should be split into 3 segments (each ~90 degrees)
    // Each segment adds 6 numbers, so total length = 3 * 6 + 2 (start and end) = 20
    // However, based on Snap.svg's implementation, the exact split may vary
    expect(bezierPoints.length).toBe(20); // Adjust based on actual implementation

    // Verify start and end points
    expect(bezierPoints[0]).toBeCloseTo(x1, 6);
    expect(bezierPoints[1]).toBeCloseTo(y1, 6);
    expect(bezierPoints[bezierPoints.length - 2]).toBeCloseTo(x2, 6);
    expect(bezierPoints[bezierPoints.length - 1]).toBeCloseTo(y2, 6);
  });
});

describe("cmath.bezier.intersectsRect", () => {
  const rect = { x: 0, y: 0, width: 10, height: 10 };

  test("returns true when an endpoint lies inside the rectangle", () => {
    const a: cmath.Vector2 = [5, 5];
    const b: cmath.Vector2 = [15, 15];
    const ta: cmath.Vector2 = [0, 0];
    const tb: cmath.Vector2 = [0, 0];
    expect(cmath.bezier.intersectsRect(a, b, ta, tb, rect)).toBe(true);
  });

  test("returns true when the entire curve is inside the rectangle", () => {
    const a: cmath.Vector2 = [1, 1];
    const b: cmath.Vector2 = [9, 9];
    const ta: cmath.Vector2 = [2, 0]; // control point [3,1]
    const tb: cmath.Vector2 = [-2, 0]; // control point [7,9]
    expect(cmath.bezier.intersectsRect(a, b, ta, tb, rect)).toBe(true);
  });

  test("returns true for a straight line segment crossing the rectangle", () => {
    const a: cmath.Vector2 = [-5, 5];
    const b: cmath.Vector2 = [15, 5];
    const ta: cmath.Vector2 = [0, 0];
    const tb: cmath.Vector2 = [0, 0];
    expect(cmath.bezier.intersectsRect(a, b, ta, tb, rect)).toBe(true);
  });

  test("returns false when the curve's bounding box overlaps but the curve misses the rectangle", () => {
    const a: cmath.Vector2 = [-10, -10];
    const b: cmath.Vector2 = [20, -10];
    const ta: cmath.Vector2 = [10, 30]; // control point [0,20]
    const tb: cmath.Vector2 = [-10, 30]; // control point [10,20]
    expect(cmath.bezier.intersectsRect(a, b, ta, tb, rect)).toBe(false);
  });

  test("returns false when the curve is completely outside the rectangle", () => {
    const a: cmath.Vector2 = [-10, 20];
    const b: cmath.Vector2 = [20, 20];
    const ta: cmath.Vector2 = [0, 0];
    const tb: cmath.Vector2 = [0, 0];
    expect(cmath.bezier.intersectsRect(a, b, ta, tb, rect)).toBe(false);
  });
});
