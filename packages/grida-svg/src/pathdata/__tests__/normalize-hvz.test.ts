import { describe, test, expect } from "vitest";
import { SVGPathData } from "../index.js";

function testNormalizeHVZ(input: string, expected: string) {
  expect(new SVGPathData(input).normalizeHVZ().encode()).toEqual(
    new SVGPathData(expected).encode()
  );
}

describe("HVZA normalization", () => {
  // currently z/Z is always absolute
  test("should transform relative h v z", () => {
    testNormalizeHVZ(
      "m 10 10 h 100 v 100 z",
      "m 10 10 l 100 0 l 0 100 L 10 10"
    );
  });

  test("should transform absolute h v z", () => {
    testNormalizeHVZ(
      "M 10 10 H 100 V 100 Z",
      "M 10 10 L 100 10 L 100 100 L 10 10"
    );
  });

  test("should transform degenerate arcs", () => {
    testNormalizeHVZ(
      "M 10 10 A 0 10 0 0 0 100 100 a 20 0 0 0 0 20 0",
      "M 10 10 L 100 100 l 20 0"
    );
  });

  test("should transform bezier curves that are lines", () => {
    // Cubic bezier with all control points on the same line
    // M10,10 C40,20 70,30 100,40 (start at 10,10, end at 100,40, control points at 40,20 and 70,30)
    // This is a straight line because all points are collinear
    testNormalizeHVZ("M 10 10 C 40 20 70 30 100 40", "M 10 10 L 100 40");

    // Same test with relative coordinates
    testNormalizeHVZ("M 10 10 c 30 10 60 20 90 30", "M 10 10 l 90 30");

    // Simple horizontal line
    testNormalizeHVZ("M 10 10 C 40 10 70 10 100 10", "M 10 10 L 100 10");

    // Simple vertical line
    testNormalizeHVZ("M 10 10 C 10 40 10 70 10 100", "M 10 10 L 10 100");

    // Control points on line but outside the segment - should NOT be linearized
    testNormalizeHVZ(
      "M 50 50 C 0 0 150 150 100 100",
      "M 50 50 C 0 0 150 150 100 100"
    );

    // Control points not on line - should not be linearized
    testNormalizeHVZ(
      "M 10 10 C 40 60 70 -10 100 40",
      "M 10 10 C 40 60 70 -10 100 40"
    );

    // One control point on line, the other not - should not be linearized
    testNormalizeHVZ(
      "M 10 10 C 40 20 70 60 100 40",
      "M 10 10 C 40 20 70 60 100 40"
    );
  });

  test("should transform quad curves that are lines", () => {
    // Quadratic bezier with control point on the same line
    // M10,10 Q55,25 100,40 (start at 10,10, end at 100,40, control point at 55,25)
    // This is a straight line because all points are collinear
    testNormalizeHVZ("M 10 10 Q 55 25 100 40", "M 10 10 L 100 40");
    // Same test with relative coordinates
    testNormalizeHVZ("M 10 10 q 45 15 90 30", "M 10 10 l 90 30");

    // Simple horizontal line
    testNormalizeHVZ("M 10 10 Q 55 10 100 10", "M 10 10 L 100 10");

    // Simple vertical line
    testNormalizeHVZ("M 10 10 Q 10 55 10 100", "M 10 10 L 10 100");

    // Control point on line but outside the segment - should NOT be linearized
    testNormalizeHVZ("M 50 50 Q 150 150 100 100", "M 50 50 Q 150 150 100 100");

    // Control point not on line - should not be linearized
    testNormalizeHVZ("M 10 10 Q 55 60 100 40", "M 10 10 Q 55 60 100 40");
  });

  test("should properly handle edge cases for curve normalization", () => {
    // Closed shape with multiple curve segments
    testNormalizeHVZ(
      "M 10 10 C 20 10 30 10 40 10 C 40 20 40 30 40 40 C 30 40 20 40 10 40 C 10 30 10 20 10 10 Z",
      "M 10 10 L 40 10 L 40 40 L 10 40L10 10 L 10 10"
    );

    // Nearly collinear but with minor deviation - should not be linearized
    testNormalizeHVZ(
      "M 10 10 C 40 20.001 70 30.001 100 40",
      "M 10 10 C 40 20.001 70 30.001 100 40"
    );

    // Zero-length segment with collinear control points - should be linearized
    testNormalizeHVZ("M 50 50 C 50 50 50 50 50 50", "M 50 50 L 50 50");
  });
});
