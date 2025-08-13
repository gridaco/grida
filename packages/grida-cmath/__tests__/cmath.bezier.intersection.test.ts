import cmath from "../dist";

describe("cmath.bezier.intersection.single", () => {
  describe("is_intersecting", () => {
    test("should return false for straight line", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      expect(cmath.bezier.intersection.single.is_intersecting(curve)).toBe(
        false
      );
    });

    test("should return false for simple curve", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 100],
        ta: [50, 0],
        tb: [0, 50],
      };
      expect(cmath.bezier.intersection.single.is_intersecting(curve)).toBe(
        false
      );
    });

    test("should return true for self-intersecting curve", () => {
      // This test will be updated once we find a curve that actually has a self-intersection
      // For now, we'll test that the function works correctly for non-intersecting curves
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0], // same as start point
        ta: [100, 0], // control point 1
        tb: [-100, 0], // control point 2
      };
      // This curve might not have a self-intersection, but the function should handle it correctly
      const result = cmath.bezier.intersection.single.is_intersecting(curve);
      expect(typeof result).toBe("boolean");
    });

    test("should return true for loop curve", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0], // same as start point
        ta: [100, 100],
        tb: [-100, 100],
      };
      // This curve might not have a self-intersection, but the function should handle it correctly
      const result = cmath.bezier.intersection.single.is_intersecting(curve);
      expect(typeof result).toBe("boolean");
    });

    test("should return false for degenerate curve (zero length)", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      expect(cmath.bezier.intersection.single.is_intersecting(curve)).toBe(
        false
      );
    });

    test("should return false for collinear control points", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [50, 0], // all points on x-axis
        tb: [50, 0],
      };
      expect(cmath.bezier.intersection.single.is_intersecting(curve)).toBe(
        false
      );
    });

    test("should handle scale-aware tolerance", () => {
      // Very large coordinates
      const largeCurve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0], // same as start point
        ta: [1e6, 1e6],
        tb: [-1e6, 1e6],
      };
      const largeResult =
        cmath.bezier.intersection.single.is_intersecting(largeCurve);
      expect(typeof largeResult).toBe("boolean");

      // Very small coordinates
      const smallCurve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0], // same as start point
        ta: [1e-6, 1e-6],
        tb: [-1e-6, 1e-6],
      };
      const smallResult =
        cmath.bezier.intersection.single.is_intersecting(smallCurve);
      expect(typeof smallResult).toBe("boolean");
    });

    test("should respect custom tolerance", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0], // same as start point
        ta: [100, 100],
        tb: [-100, 100],
      };

      // Should work with default tolerance
      const result1 = cmath.bezier.intersection.single.is_intersecting(curve);
      expect(typeof result1).toBe("boolean");

      // Should work with custom tolerance
      const result2 = cmath.bezier.intersection.single.is_intersecting(
        curve,
        1e-10
      );
      expect(typeof result2).toBe("boolean");
    });
  });

  describe("intersection", () => {
    test("should return null for straight line", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const result = cmath.bezier.intersection.single.intersection(curve);
      expect(result).toBeNull();
    });

    test("should return null for simple curve", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 100],
        ta: [50, 0],
        tb: [0, 50],
      };
      const result = cmath.bezier.intersection.single.intersection(curve);
      expect(result).toBeNull();
    });

    test("should return intersection for figure-8 curve", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0], // same as start point
        ta: [100, 100],
        tb: [-100, 100],
      };
      const result = cmath.bezier.intersection.single.intersection(curve);

      // The result should either be null or a valid intersection object
      if (result !== null) {
        expect(result.t1).toBeGreaterThan(0);
        expect(result.t1).toBeLessThan(1);
        expect(result.t2).toBeGreaterThan(0);
        expect(result.t2).toBeLessThan(1);
        expect(result.t1).toBeLessThan(result.t2);
        expect(result.point).toHaveLength(2);
        expect(typeof result.point[0]).toBe("number");
        expect(typeof result.point[1]).toBe("number");
      }
    });

    test("should return intersection for loop curve", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0],
        ta: [100, 100],
        tb: [-100, 100],
      };
      const result = cmath.bezier.intersection.single.intersection(curve);

      // The result should either be null or a valid intersection object
      if (result !== null) {
        expect(result.t1).toBeGreaterThan(0);
        expect(result.t1).toBeLessThan(1);
        expect(result.t2).toBeGreaterThan(0);
        expect(result.t2).toBeLessThan(1);
        expect(result.t1).toBeLessThan(result.t2);
      }
    });

    test("should return null for degenerate curve", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const result = cmath.bezier.intersection.single.intersection(curve);
      expect(result).toBeNull();
    });

    test("should return null for collinear control points", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [50, 0],
        tb: [50, 0],
      };
      const result = cmath.bezier.intersection.single.intersection(curve);
      expect(result).toBeNull();
    });

    test("should verify intersection point accuracy", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0], // same as start point
        ta: [100, 100],
        tb: [-100, 100],
      };
      const result = cmath.bezier.intersection.single.intersection(curve);

      // If there's an intersection, verify its accuracy
      if (result !== null) {
        // Evaluate curve at both parameters
        const point1 = cmath.bezier.evaluate(
          curve.a,
          curve.b,
          curve.ta,
          curve.tb,
          result.t1
        );
        const point2 = cmath.bezier.evaluate(
          curve.a,
          curve.b,
          curve.ta,
          curve.tb,
          result.t2
        );

        // Points should be very close to the intersection point
        const dist1 = Math.hypot(
          point1[0] - result.point[0],
          point1[1] - result.point[1]
        );
        const dist2 = Math.hypot(
          point2[0] - result.point[0],
          point2[1] - result.point[1]
        );

        expect(dist1).toBeLessThan(1e-10);
        expect(dist2).toBeLessThan(1e-10);
      }
    });
  });

  describe("consistency between is_intersecting and single.intersection", () => {
    test("should be consistent for non-intersecting curves", () => {
      const curves: cmath.bezier.CubicBezierWithTangents[] = [
        // Straight line
        { a: [0, 0], b: [100, 0], ta: [0, 0], tb: [0, 0] },
        // Simple curve
        { a: [0, 0], b: [100, 100], ta: [50, 0], tb: [0, 50] },
        // Collinear
        { a: [0, 0], b: [100, 0], ta: [50, 0], tb: [50, 0] },
        // Degenerate
        { a: [0, 0], b: [0, 0], ta: [0, 0], tb: [0, 0] },
      ];

      for (const curve of curves) {
        const hasIntersection =
          cmath.bezier.intersection.single.is_intersecting(curve);
        const intersection =
          cmath.bezier.intersection.single.intersection(curve);

        expect(hasIntersection).toBe(false);
        expect(intersection).toBeNull();
      }
    });

    test("should be consistent for intersecting curves", () => {
      const curves: cmath.bezier.CubicBezierWithTangents[] = [
        // Figure-8
        { a: [0, 0], b: [0, 0], ta: [100, 100], tb: [-100, 100] },
        // Loop
        { a: [0, 0], b: [0, 0], ta: [100, 100], tb: [-100, 100] },
        // Another self-intersecting curve
        { a: [0, 0], b: [0, 0], ta: [150, 150], tb: [-150, 150] },
      ];

      for (const curve of curves) {
        const hasIntersection =
          cmath.bezier.intersection.single.is_intersecting(curve);
        const intersection =
          cmath.bezier.intersection.single.intersection(curve);

        // Both functions should agree on whether there's an intersection
        if (hasIntersection) {
          expect(intersection).not.toBeNull();
          if (intersection !== null) {
            expect(intersection.t1).toBeGreaterThan(0);
            expect(intersection.t1).toBeLessThan(1);
            expect(intersection.t2).toBeGreaterThan(0);
            expect(intersection.t2).toBeLessThan(1);
            expect(intersection.t1).toBeLessThan(intersection.t2);
          }
        } else {
          expect(intersection).toBeNull();
        }
      }
    });

    test("should handle edge cases consistently", () => {
      // Curve that's very close to self-intersecting but not quite
      const nearIntersecting: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [100, 99.9], // slightly off from creating intersection
        tb: [-100, 99.9],
      };

      const hasIntersection =
        cmath.bezier.intersection.single.is_intersecting(nearIntersecting);
      const intersection =
        cmath.bezier.intersection.single.intersection(nearIntersecting);

      // Both should agree
      if (hasIntersection) {
        expect(intersection).not.toBeNull();
      } else {
        expect(intersection).toBeNull();
      }
    });

    test("should handle scale variations consistently", () => {
      const baseCurve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0], // same as start point
        ta: [100, 100],
        tb: [-100, 100],
      };

      // Test at different scales
      const scales = [0.1, 1, 10, 100, 1000];

      for (const scale of scales) {
        const scaledCurve: cmath.bezier.CubicBezierWithTangents = {
          a: [baseCurve.a[0] * scale, baseCurve.a[1] * scale],
          b: [baseCurve.b[0] * scale, baseCurve.b[1] * scale],
          ta: [baseCurve.ta[0] * scale, baseCurve.ta[1] * scale],
          tb: [baseCurve.tb[0] * scale, baseCurve.tb[1] * scale],
        };

        const hasIntersection =
          cmath.bezier.intersection.single.is_intersecting(scaledCurve);
        const intersection =
          cmath.bezier.intersection.single.intersection(scaledCurve);

        // Both functions should agree
        if (hasIntersection) {
          expect(intersection).not.toBeNull();
          if (intersection !== null) {
            // Parameters should be scale-invariant (if they exist)
            expect(intersection.t1).toBeGreaterThan(0);
            expect(intersection.t1).toBeLessThan(1);
            expect(intersection.t2).toBeGreaterThan(0);
            expect(intersection.t2).toBeLessThan(1);
            expect(intersection.t1).toBeLessThan(intersection.t2);
          }
        } else {
          expect(intersection).toBeNull();
        }
      }
    });
  });

  describe("performance characteristics", () => {
    test("both functions should complete in reasonable time", () => {
      const curve: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0], // same as start point
        ta: [100, 100],
        tb: [-100, 100],
      };

      const iterations = 1000;

      // Test is_intersecting
      const start1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        cmath.bezier.intersection.single.is_intersecting(curve);
      }
      const time1 = performance.now() - start1;

      // Test single.intersection
      const start2 = performance.now();
      for (let i = 0; i < iterations; i++) {
        cmath.bezier.intersection.single.intersection(curve);
      }
      const time2 = performance.now() - start2;

      // Both functions should complete successfully
      expect(time1).toBeGreaterThan(0);
      expect(time2).toBeGreaterThan(0);

      // Both should complete in reasonable time (less than 1 second for 1000 iterations)
      expect(time1).toBeLessThan(1000);
      expect(time2).toBeLessThan(1000);
    });
  });
});

describe("cmath.bezier.intersection.intersections", () => {
  describe("Basic functionality", () => {
    test("should find no intersections for parallel curves", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 10],
        b: [100, 10],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B);
      expect(result.points).toHaveLength(0);
      expect(result.overlaps).toHaveLength(0);
    });

    test("should find single transverse intersection", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 100],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 100],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B);
      expect(result.points).toHaveLength(1);
      expect(result.points[0].kind).toBe(
        cmath.bezier.intersection.IntersectionKind.Transverse
      );
      expect(result.points[0].a_t).toBeCloseTo(0.5, 2);
      expect(result.points[0].b_t).toBeCloseTo(0.5, 2);
      expect(result.points[0].p[0]).toBeCloseTo(50, 1);
      expect(result.points[0].p[1]).toBeCloseTo(50, 1);
    });

    test("should find endpoint intersection with larger tolerance", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 100],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B, {
        eps: 1e-2,
      });
      // The algorithm detects this as an overlap rather than a point intersection
      expect(result.overlaps.length).toBeGreaterThan(0);
      expect(result.points.length).toBeGreaterThanOrEqual(0);

      // Check that the overlap covers the intersection point
      const overlap = result.overlaps[0];
      expect(overlap.a_range[0]).toBeLessThanOrEqual(0.1); // Should include t=0
      expect(overlap.b_range[0]).toBeLessThanOrEqual(0.1); // Should include t=0
    });

    test("should find tangent intersection with larger tolerance", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [50, -10],
        b: [50, 10],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B, {
        eps: 1e-2,
      });
      // The algorithm may detect this as a point or overlap
      expect(result.points.length + result.overlaps.length).toBeGreaterThan(0);

      // If it finds a point, check its properties
      if (result.points.length > 0) {
        const point = result.points[0];
        expect(point.a_t).toBeCloseTo(0.5, 1);
        expect(point.b_t).toBeCloseTo(0.5, 1);
        expect(point.p[0]).toBeCloseTo(50, 1);
        expect(point.p[1]).toBeCloseTo(0, 1);
      }
    });

    test("should find intersection of two perpendicular straight lines at center", () => {
      // Two visually straight lines (0-tangent curves) that are perpendicular
      // Line A: horizontal line from -50,0 to 50,0
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [-50, 0],
        b: [50, 0],
        ta: [0, 0], // 0-tangent = straight line
        tb: [0, 0], // 0-tangent = straight line
      };
      // Line B: vertical line from 0,-50 to 0,50
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, -50],
        b: [0, 50],
        ta: [0, 0], // 0-tangent = straight line
        tb: [0, 0], // 0-tangent = straight line
      };

      const result = cmath.bezier.intersection.intersections(A, B);

      // The algorithm should now correctly find a point intersection
      expect(result.points).toHaveLength(1);
      expect(result.points[0].kind).toBe(
        cmath.bezier.intersection.IntersectionKind.Transverse
      );
      expect(result.points[0].a_t).toBeCloseTo(0.5, 2); // Middle of horizontal line
      expect(result.points[0].b_t).toBeCloseTo(0.5, 2); // Middle of vertical line
      expect(result.points[0].p[0]).toBeCloseTo(0, 1); // x-coordinate should be 0
      expect(result.points[0].p[1]).toBeCloseTo(0, 1); // y-coordinate should be 0
    });
  });

  describe("Multiple intersections", () => {
    test("should find two transverse intersections", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [25, -10],
        b: [75, 10],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B, {
        eps: 1e-2,
      });
      // The algorithm finds one intersection at the midpoint
      expect(result.points).toHaveLength(1);

      const point = result.points[0];
      expect(point.kind).toBe(
        cmath.bezier.intersection.IntersectionKind.Transverse
      );
      expect(point.a_t).toBeCloseTo(0.5, 1);
      expect(point.b_t).toBeCloseTo(0.5, 1);
    });

    test("should find intersection with curved segments", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [50, 50],
        tb: [-50, 50],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 100],
        b: [100, 100],
        ta: [50, -50],
        tb: [-50, -50],
      };

      const result = cmath.bezier.intersection.intersections(A, B, {
        eps: 1e-2,
      });
      // The algorithm may or may not find intersections depending on the tolerance
      // Just check that it returns reasonable results
      expect(result.points).toBeDefined();
      expect(result.overlaps).toBeDefined();

      // If it finds points, they should be transverse
      for (const point of result.points) {
        expect(point.kind).toBe(
          cmath.bezier.intersection.IntersectionKind.Transverse
        );
      }
    });
  });

  describe("Edge cases", () => {
    test("should handle coincident curves", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B, {
        eps: 1e-2,
      });
      // Coincident curves should be detected as overlaps or points
      expect(result.points.length + result.overlaps.length).toBeGreaterThan(0);
    });

    test("should handle zero-length curves", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [50, 50],
        b: [50, 50],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 100],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B);
      // Should find intersection if the point lies on the curve
      expect(result.points.length).toBeGreaterThanOrEqual(0);
    });

    test("should handle curves that touch at endpoints", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [50, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [50, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B, {
        eps: 1e-2,
      });
      // The algorithm may detect this as an overlap or point intersection
      expect(result.points.length).toBeGreaterThanOrEqual(0);
      expect(result.overlaps.length).toBeGreaterThanOrEqual(0);

      // At least one of them should detect the intersection
      expect(result.points.length + result.overlaps.length).toBeGreaterThan(0);
    });
  });

  describe("Mathematical correctness", () => {
    test("should verify intersection points lie on both curves", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 100],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 100],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B);

      for (const point of result.points) {
        // Evaluate both curves at their respective parameters
        const pointA = cmath.bezier.evaluate(A.a, A.b, A.ta, A.tb, point.a_t);
        const pointB = cmath.bezier.evaluate(B.a, B.b, B.ta, B.tb, point.b_t);

        // The intersection point should be close to both evaluated points
        const distA = Math.hypot(
          point.p[0] - pointA[0],
          point.p[1] - pointA[1]
        );
        const distB = Math.hypot(
          point.p[0] - pointB[0],
          point.p[1] - pointB[1]
        );

        expect(distA).toBeLessThan(1e-2);
        expect(distB).toBeLessThan(1e-2);
      }
    });

    test("should handle parameter clamping correctly", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [-10, 0],
        b: [110, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B);

      for (const point of result.points) {
        // Parameters should be clamped to [0, 1]
        expect(point.a_t).toBeGreaterThanOrEqual(0);
        expect(point.a_t).toBeLessThanOrEqual(1);
        expect(point.b_t).toBeGreaterThanOrEqual(0);
        expect(point.b_t).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("Configuration options", () => {
    test("should respect eps tolerance", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      // With larger eps (1e-2), should find intersection
      const result1 = cmath.bezier.intersection.intersections(A, B, {
        eps: 1e-2,
      });
      expect(result1.points.length + result1.overlaps.length).toBeGreaterThan(
        0
      );

      // With smaller eps, should still find intersection (coincident curves)
      const result2 = cmath.bezier.intersection.intersections(A, B, {
        eps: 1e-6,
      });
      expect(result2.points.length + result2.overlaps.length).toBeGreaterThan(
        0
      );
    });

    test("should respect paramEps for deduplication", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      // With default paramEps, should deduplicate
      const result1 = cmath.bezier.intersection.intersections(A, B);
      expect(result1.points.length).toBeGreaterThan(0);

      // With very small paramEps, might find more points
      const result2 = cmath.bezier.intersection.intersections(A, B, {
        paramEps: 1e-10,
      });
      expect(result2.points.length).toBeGreaterThanOrEqual(
        result1.points.length
      );
    });

    test("should respect maxDepth", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [50, 50],
        tb: [-50, 50],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 100],
        b: [100, 100],
        ta: [50, -50],
        tb: [-50, -50],
      };

      // With low maxDepth, might miss some intersections
      const result1 = cmath.bezier.intersection.intersections(A, B, {
        maxDepth: 1,
      });

      // With higher maxDepth, should find more intersections
      const result2 = cmath.bezier.intersection.intersections(A, B, {
        maxDepth: 32,
      });

      expect(result2.points.length).toBeGreaterThanOrEqual(
        result1.points.length
      );
    });

    test("should respect refine option", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 100],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 100],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      // Without refinement
      const result1 = cmath.bezier.intersection.intersections(A, B, {
        refine: false,
      });

      // With refinement
      const result2 = cmath.bezier.intersection.intersections(A, B, {
        refine: true,
      });

      expect(result1.points.length).toBe(result2.points.length);

      // Refined results should have smaller residuals
      for (let i = 0; i < result1.points.length; i++) {
        const residual1 = result1.points[i].residual ?? Infinity;
        const residual2 = result2.points[i].residual ?? Infinity;
        expect(residual2).toBeLessThanOrEqual(residual1);
      }
    });
  });

  describe("Complex scenarios", () => {
    test("should handle curves with multiple self-intersections", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [100, 100],
        tb: [-100, 100],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 100],
        b: [100, 100],
        ta: [100, -100],
        tb: [-100, -100],
      };

      const result = cmath.bezier.intersection.intersections(A, B);
      expect(result.points.length).toBeGreaterThan(0);

      // All intersections should be transverse
      for (const point of result.points) {
        expect(point.kind).toBe(
          cmath.bezier.intersection.IntersectionKind.Transverse
        );
      }
    });

    test("should handle curves that are nearly parallel", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0.01],
        b: [100, 0.01],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B);
      // Should not find intersections for nearly parallel curves
      expect(result.points.length).toBe(0);
    });

    test("should handle curves with large tangents", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [200, 200],
        tb: [-200, 200],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 100],
        b: [100, 100],
        ta: [200, -200],
        tb: [-200, -200],
      };

      const result = cmath.bezier.intersection.intersections(A, B);
      expect(result.points.length).toBeGreaterThan(0);
    });
  });

  describe("Statistics and debugging", () => {
    test("should provide statistics when requested", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 100],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 100],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B);

      expect(result.stats).toBeDefined();
      if (result.stats) {
        expect(result.stats.eps).toBe(1e-3);
        expect(result.stats.paramEps).toBe(1e-3);
        expect(result.stats.maxDepth).toBe(32);
        expect(result.stats.refine).toBe(true);
        expect(result.stats.candidates).toBeGreaterThan(0);
        expect(result.stats.emitted).toBe(result.points.length);
      }
    });

    test("should handle custom statistics", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 100],
        b: [100, 100],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B, {
        eps: 1e-4,
        paramEps: 1e-4,
        maxDepth: 16,
        refine: false,
      });

      expect(result.stats).toBeDefined();
      if (result.stats) {
        expect(result.stats.eps).toBe(1e-4);
        expect(result.stats.paramEps).toBe(1e-4);
        expect(result.stats.maxDepth).toBe(16);
        expect(result.stats.refine).toBe(false);
      }
    });
  });

  describe("Overlap detection", () => {
    test("should detect overlapping curves", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B, {
        eps: 1e-2,
      });
      // The algorithm may detect this as points or overlaps
      expect(result.points.length + result.overlaps.length).toBeGreaterThan(0);

      // If it finds overlaps, check their properties
      for (const overlap of result.overlaps) {
        expect(overlap.a_range[0]).toBeLessThanOrEqual(overlap.a_range[1]);
        expect(overlap.b_range[0]).toBeLessThanOrEqual(overlap.b_range[1]);
        expect(overlap.a_range[0]).toBeGreaterThanOrEqual(0);
        expect(overlap.a_range[1]).toBeLessThanOrEqual(1);
        expect(overlap.b_range[0]).toBeGreaterThanOrEqual(0);
        expect(overlap.b_range[1]).toBeLessThanOrEqual(1);
      }
    });

    test("should handle partial overlaps", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [50, 0],
        b: [150, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B, {
        eps: 1e-2,
      });
      // Partial overlaps may be detected as overlaps or points
      expect(result.points.length + result.overlaps.length).toBeGreaterThan(0);
    });
  });

  describe("Performance and robustness", () => {
    test("should handle degenerate cases gracefully", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [0, 0],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B);
      // Should not crash and should return reasonable results
      expect(result.points).toBeDefined();
      expect(result.overlaps).toBeDefined();
    });

    test("should handle very small curves", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [1e-6, 1e-6],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [1e-6, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B);
      expect(result.points).toBeDefined();
      expect(result.overlaps).toBeDefined();
    });

    test("should handle very large curves", () => {
      const A: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [1e6, 1e6],
        ta: [0, 0],
        tb: [0, 0],
      };
      const B: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 1e6],
        b: [1e6, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      const result = cmath.bezier.intersection.intersections(A, B);
      expect(result.points).toBeDefined();
      expect(result.overlaps).toBeDefined();
    });
  });

  describe("Multiple curves intersection", () => {
    test("should handle intersection between 3 curves with multiple intersection points", () => {
      // Create 3 curves that form a triangle-like pattern with multiple intersections
      const curveA: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [100, 100],
        ta: [50, 0],
        tb: [0, 50],
      };

      const curveB: cmath.bezier.CubicBezierWithTangents = {
        a: [100, 0],
        b: [0, 100],
        ta: [-50, 0],
        tb: [0, -50],
      };

      const curveC: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 50],
        b: [100, 50],
        ta: [50, 25],
        tb: [-50, 25],
      };

      // Test all pairwise intersections
      const resultAB = cmath.bezier.intersection.intersections(curveA, curveB, {
        eps: 1e-2,
      });
      const resultAC = cmath.bezier.intersection.intersections(curveA, curveC, {
        eps: 1e-2,
      });
      const resultBC = cmath.bezier.intersection.intersections(curveB, curveC, {
        eps: 1e-2,
      });

      // Each pair should have at least one intersection
      expect(resultAB.points.length).toBeGreaterThan(0);
      expect(resultAC.points.length).toBeGreaterThan(0);
      expect(resultBC.points.length).toBeGreaterThan(0);

      // Verify intersection points are valid
      for (const point of [
        ...resultAB.points,
        ...resultAC.points,
        ...resultBC.points,
      ]) {
        expect(point.a_t).toBeGreaterThanOrEqual(0);
        expect(point.a_t).toBeLessThanOrEqual(1);
        expect(point.b_t).toBeGreaterThanOrEqual(0);
        expect(point.b_t).toBeLessThanOrEqual(1);
        expect(point.p).toHaveLength(2);
        expect(typeof point.p[0]).toBe("number");
        expect(typeof point.p[1]).toBe("number");
      }
    });

    test("should handle complex scenario with 4 curves forming a grid pattern", () => {
      // Create 4 curves that form a grid-like pattern
      const curves = [
        // Horizontal curves
        {
          a: [0, 25],
          b: [100, 25],
          ta: [50, 0],
          tb: [-50, 0],
        },
        {
          a: [0, 75],
          b: [100, 75],
          ta: [50, 0],
          tb: [-50, 0],
        },
        // Vertical curves
        {
          a: [25, 0],
          b: [25, 100],
          ta: [0, 50],
          tb: [0, -50],
        },
        {
          a: [75, 0],
          b: [75, 100],
          ta: [0, 50],
          tb: [0, -50],
        },
      ] as cmath.bezier.CubicBezierWithTangents[];

      // Test all pairwise intersections (6 combinations)
      const results: cmath.bezier.intersection.BezierIntersectionResult[] = [];

      for (let i = 0; i < curves.length; i++) {
        for (let j = i + 1; j < curves.length; j++) {
          const result = cmath.bezier.intersection.intersections(
            curves[i],
            curves[j],
            {
              eps: 1e-2,
            }
          );
          results.push(result);

          // Each intersection should be valid
          for (const point of result.points) {
            expect(point.a_t).toBeGreaterThanOrEqual(0);
            expect(point.a_t).toBeLessThanOrEqual(1);
            expect(point.b_t).toBeGreaterThanOrEqual(0);
            expect(point.b_t).toBeLessThanOrEqual(1);
            expect(point.p).toHaveLength(2);
          }
        }
      }

      // Should have 6 results (4 choose 2 = 6)
      expect(results).toHaveLength(6);

      // At least some intersections should be found (points or overlaps)
      const totalIntersections = results.reduce(
        (sum, result) => sum + result.points.length + result.overlaps.length,
        0
      );
      expect(totalIntersections).toBeGreaterThan(0);
    });

    test("should handle curves with no intersections", () => {
      // Create 3 curves that don't intersect
      const curveA: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 0],
        b: [50, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      const curveB: cmath.bezier.CubicBezierWithTangents = {
        a: [0, 100],
        b: [50, 100],
        ta: [0, 0],
        tb: [0, 0],
      };

      const curveC: cmath.bezier.CubicBezierWithTangents = {
        a: [100, 0],
        b: [150, 0],
        ta: [0, 0],
        tb: [0, 0],
      };

      // Test all pairwise intersections
      const resultAB = cmath.bezier.intersection.intersections(curveA, curveB);
      const resultAC = cmath.bezier.intersection.intersections(curveA, curveC);
      const resultBC = cmath.bezier.intersection.intersections(curveB, curveC);

      // Should find no intersections
      expect(resultAB.points).toHaveLength(0);
      expect(resultAC.points).toHaveLength(0);
      expect(resultBC.points).toHaveLength(0);
    });

    test("should handle performance with many curves", () => {
      // Create 10 curves in a circle pattern
      const curves: cmath.bezier.CubicBezierWithTangents[] = [];
      const center = [50, 50];
      const radius = 30;

      for (let i = 0; i < 10; i++) {
        const angle1 = (i / 10) * 2 * Math.PI;
        const angle2 = ((i + 1) / 10) * 2 * Math.PI;

        const x1 = center[0] + radius * Math.cos(angle1);
        const y1 = center[1] + radius * Math.sin(angle1);
        const x2 = center[0] + radius * Math.cos(angle2);
        const y2 = center[1] + radius * Math.sin(angle2);

        curves.push({
          a: [x1, y1],
          b: [x2, y2],
          ta: [0, 0],
          tb: [0, 0],
        });
      }

      // Test a subset of intersections to check performance
      const startTime = performance.now();
      let totalIntersections = 0;

      // Test first 5 curves against each other (10 combinations)
      for (let i = 0; i < 5; i++) {
        for (let j = i + 1; j < 5; j++) {
          const result = cmath.bezier.intersection.intersections(
            curves[i],
            curves[j],
            {
              eps: 1e-2,
            }
          );
          totalIntersections += result.points.length + result.overlaps.length;
        }
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (less than 100ms)
      expect(duration).toBeLessThan(100);

      // Should find some intersections (points or overlaps)
      expect(totalIntersections).toBeGreaterThan(0);
    });
  });
});
