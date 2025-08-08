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

/**
 * Evaluates a cubic Bézier curve at parameter t
 */
function evalBezier(
  a: cmath.Vector2,
  b: cmath.Vector2,
  ta: cmath.Vector2,
  tb: cmath.Vector2,
  t: number
): cmath.Vector2 {
  const s = 1 - t;
  const s2 = s * s;
  const t2 = t * t;
  const s3 = s2 * s;
  const t3 = t2 * t;

  const p0 = a;
  const p1: cmath.Vector2 = [a[0] + ta[0], a[1] + ta[1]];
  const p2: cmath.Vector2 = [b[0] + tb[0], b[1] + tb[1]];
  const p3 = b;

  return [
    s3 * p0[0] + 3 * s2 * t * p1[0] + 3 * s * t2 * p2[0] + t3 * p3[0],
    s3 * p0[1] + 3 * s2 * t * p1[1] + 3 * s * t2 * p2[1] + t3 * p3[1],
  ];
}

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
  });

  test("should handle large arc flags correctly", () => {
    const x1 = 0;
    const y1 = 0;
    const rx = 100;
    const ry = 100;
    const angle = 0;
    const largeArcFlag: 0 | 1 = 1; // Large arc
    const sweepFlag: 0 | 1 = 1;
    const x2 = 100;
    const y2 = 0;

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

    // Large arc should result in multiple cubic Bézier segments
    expect(a2cResult.length).toBeGreaterThan(6);
  });

  test("should handle rotated ellipses", () => {
    const x1 = 0;
    const y1 = 0;
    const rx = 50;
    const ry = 25;
    const angle = 45; // 45-degree rotation
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

    expect(a2cResult.length).toBeGreaterThan(0);
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

describe("cmath.bezier.containedByRect", () => {
  const rect = { x: 0, y: 0, width: 10, height: 10 };

  test("returns true for a curve fully inside the rectangle", () => {
    const a: cmath.Vector2 = [1, 1];
    const b: cmath.Vector2 = [9, 9];
    const ta: cmath.Vector2 = [2, 0];
    const tb: cmath.Vector2 = [-2, 0];
    expect(cmath.bezier.containedByRect(a, b, ta, tb, rect)).toBe(true);
  });

  test("returns true when the curve lies on the rectangle boundary", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [10, 0];
    const ta: cmath.Vector2 = [5, 0];
    const tb: cmath.Vector2 = [-5, 0];
    expect(cmath.bezier.containedByRect(a, b, ta, tb, rect)).toBe(true);
  });

  test("returns false when control points push the curve outside", () => {
    const a: cmath.Vector2 = [2, 2];
    const b: cmath.Vector2 = [8, 8];
    const ta: cmath.Vector2 = [0, -20]; // control point far above rect
    const tb: cmath.Vector2 = [0, 20]; // control point far below rect
    expect(cmath.bezier.containedByRect(a, b, ta, tb, rect)).toBe(false);
  });

  test("returns false when the curve is completely outside", () => {
    const a: cmath.Vector2 = [15, 15];
    const b: cmath.Vector2 = [20, 20];
    const ta: cmath.Vector2 = [0, 0];
    const tb: cmath.Vector2 = [0, 0];
    expect(cmath.bezier.containedByRect(a, b, ta, tb, rect)).toBe(false);
  });
});

describe("cmath.bezier.projectParametric", () => {
  /**
   * Evaluates a cubic Bézier segment defined by endpoints `a`, `b` and tangents `ta`, `tb`.
   */
  function evalBezier(
    a: cmath.Vector2,
    b: cmath.Vector2,
    ta: cmath.Vector2,
    tb: cmath.Vector2,
    t: number
  ): cmath.Vector2 {
    const p0 = a;
    const p1: cmath.Vector2 = [a[0] + ta[0], a[1] + ta[1]];
    const p2: cmath.Vector2 = [b[0] + tb[0], b[1] + tb[1]];
    const p3 = b;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const x =
      mt2 * mt * p0[0] +
      3 * mt2 * t * p1[0] +
      3 * mt * t2 * p2[0] +
      t2 * t * p3[0];
    const y =
      mt2 * mt * p0[1] +
      3 * mt2 * t * p1[1] +
      3 * mt * t2 * p2[1] +
      t2 * t * p3[1];
    return [x, y];
  }

  /**
   * Evaluates derivative of cubic Bézier for computing normals in tests.
   */
  function evalDerivative(
    a: cmath.Vector2,
    b: cmath.Vector2,
    ta: cmath.Vector2,
    tb: cmath.Vector2,
    t: number
  ): cmath.Vector2 {
    const p0 = a;
    const p1: cmath.Vector2 = [a[0] + ta[0], a[1] + ta[1]];
    const p2: cmath.Vector2 = [b[0] + tb[0], b[1] + tb[1]];
    const p3 = b;
    const mt = 1 - t;
    const x =
      3 * mt * mt * (p1[0] - p0[0]) +
      6 * mt * t * (p2[0] - p1[0]) +
      3 * t * t * (p3[0] - p2[0]);
    const y =
      3 * mt * mt * (p1[1] - p0[1]) +
      6 * mt * t * (p2[1] - p1[1]) +
      3 * t * t * (p3[1] - p2[1]);
    return [x, y];
  }

  test("projects correctly on a straight line", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [10, 0];
    const ta: cmath.Vector2 = [0, 0];
    const tb: cmath.Vector2 = [0, 0];

    // point above the midpoint of the segment
    expect(cmath.bezier.projectParametric(a, b, ta, tb, [5, 5])).toBeCloseTo(
      0.5,
      6
    );

    // point before the start should clamp to 0
    expect(cmath.bezier.projectParametric(a, b, ta, tb, [-5, 0])).toBeCloseTo(
      0,
      6
    );

    // point after the end should clamp to 1
    expect(cmath.bezier.projectParametric(a, b, ta, tb, [15, 0])).toBeCloseTo(
      1,
      6
    );
  });

  test("returns original t for points on a curved segment", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [10, 0];
    const ta: cmath.Vector2 = [0, 10];
    const tb: cmath.Vector2 = [0, -10];

    const t = 0.3;
    const p = evalBezier(a, b, ta, tb, t);
    expect(cmath.bezier.projectParametric(a, b, ta, tb, p)).toBeCloseTo(t, 6);
  });

  test("handles points offset from the curve", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [10, 0];
    const ta: cmath.Vector2 = [0, 10];
    const tb: cmath.Vector2 = [0, -10];
    const t = 0.4;
    const point = evalBezier(a, b, ta, tb, t);
    const tangent = evalDerivative(a, b, ta, tb, t);
    const normal: cmath.Vector2 = [-tangent[1], tangent[0]];
    const len = Math.hypot(normal[0], normal[1]);
    const offset: cmath.Vector2 = [
      point[0] + (normal[0] / len) * 1,
      point[1] + (normal[1] / len) * 1,
    ];
    const projected = cmath.bezier.projectParametric(a, b, ta, tb, offset);
    expect(projected).toBeCloseTo(t, 2); // allow some tolerance
  });
});

describe("cmath.bezier.solveTangentsForPoint", () => {
  test("should solve for tangents that make curve pass through target point", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [100, 0];
    const ta: cmath.Vector2 = [0, 0];
    const tb: cmath.Vector2 = [0, 0];
    const t = 0.5;
    const targetPoint: cmath.Vector2 = [50, 50];

    const [newTa, newTb] = cmath.bezier.solveTangentsForPoint(
      a,
      b,
      ta,
      tb,
      t,
      targetPoint
    );

    // Verify that the curve passes through the target point
    const point = evalBezier(a, b, newTa, newTb, t);
    const distance = Math.hypot(
      targetPoint[0] - point[0],
      targetPoint[1] - point[1]
    );

    expect(distance).toBeLessThan(0.1);
  });

  test("should handle different parametric positions", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [100, 0];
    const ta: cmath.Vector2 = [0, 0];
    const tb: cmath.Vector2 = [0, 0];
    const targetPoint: cmath.Vector2 = [40, 30];

    // Test at different parametric positions
    const testPositions = [0.25, 0.5, 0.75];

    for (const t of testPositions) {
      const [newTa, newTb] = cmath.bezier.solveTangentsForPoint(
        a,
        b,
        ta,
        tb,
        t,
        targetPoint
      );

      const point = evalBezier(a, b, newTa, newTb, t);
      const distance = Math.hypot(
        targetPoint[0] - point[0],
        targetPoint[1] - point[1]
      );

      expect(distance).toBeLessThan(0.1);
    }
  });

  test("should return zero tangents when target is close to linear interpolation", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [100, 0];
    const ta: cmath.Vector2 = [0, 0];
    const tb: cmath.Vector2 = [0, 0];
    const t = 0.5;

    // Target point very close to linear interpolation
    const linearInterp: cmath.Vector2 = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
    ];
    const targetPoint: cmath.Vector2 = [
      linearInterp[0] + 0.05,
      linearInterp[1] + 0.05,
    ];

    const [newTa, newTb] = cmath.bezier.solveTangentsForPoint(
      a,
      b,
      ta,
      tb,
      t,
      targetPoint
    );

    expect(newTa[0]).toBe(0);
    expect(newTa[1]).toBe(0);
    expect(newTb[0]).toBe(0);
    expect(newTb[1]).toBe(0);
  });

  test("should minimize change from original tangents", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [100, 0];
    const ta: cmath.Vector2 = [10, 5];
    const tb: cmath.Vector2 = [-10, 5];
    const t = 0.5;
    const targetPoint: cmath.Vector2 = [50, 50];

    const [newTa, newTb] = cmath.bezier.solveTangentsForPoint(
      a,
      b,
      ta,
      tb,
      t,
      targetPoint
    );

    // Verify that the curve passes through the target point
    const point = evalBezier(a, b, newTa, newTb, t);
    const distance = Math.hypot(
      targetPoint[0] - point[0],
      targetPoint[1] - point[1]
    );
    expect(distance).toBeLessThan(0.1);

    // Verify that the change from original tangents is minimized
    const taChange = Math.hypot(newTa[0] - ta[0], newTa[1] - ta[1]);
    const tbChange = Math.hypot(newTb[0] - tb[0], newTb[1] - tb[1]);

    // The changes should be reasonable (not too large)
    expect(taChange).toBeLessThan(100);
    expect(tbChange).toBeLessThan(100);
  });

  test("should handle edge cases at t=0 and t=1", () => {
    const a: cmath.Vector2 = [0, 0];
    const b: cmath.Vector2 = [100, 0];
    const ta: cmath.Vector2 = [0, 0];
    const tb: cmath.Vector2 = [0, 0];

    // Test at t=0 (curve should pass through start point a)
    const targetAtStart: cmath.Vector2 = [0, 0]; // Should be the start point
    const [newTa1, newTb1] = cmath.bezier.solveTangentsForPoint(
      a,
      b,
      ta,
      tb,
      0,
      targetAtStart
    );

    const pointAtStart = evalBezier(a, b, newTa1, newTb1, 0);
    const distanceAtStart = Math.hypot(
      targetAtStart[0] - pointAtStart[0],
      targetAtStart[1] - pointAtStart[1]
    );
    expect(distanceAtStart).toBeLessThan(0.1);

    // Test at t=1 (curve should pass through end point b)
    const targetAtEnd: cmath.Vector2 = [100, 0]; // Should be the end point
    const [newTa2, newTb2] = cmath.bezier.solveTangentsForPoint(
      a,
      b,
      ta,
      tb,
      1,
      targetAtEnd
    );

    const pointAtEnd = evalBezier(a, b, newTa2, newTb2, 1);
    const distanceAtEnd = Math.hypot(
      targetAtEnd[0] - pointAtEnd[0],
      targetAtEnd[1] - pointAtEnd[1]
    );
    expect(distanceAtEnd).toBeLessThan(0.1);
  });
});
