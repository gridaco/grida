import cmath from "../index";
import { measure, Measurement } from "../_measurement";

describe("cmath.measurement", () => {
  describe("measure", () => {
    describe("non-intersecting rectangles", () => {
      test("should measure spacing when rectangles are separated horizontally", () => {
        const a: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 10 };
        const b: cmath.Rectangle = { x: 20, y: 0, width: 10, height: 10 };

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b,
          box: a,
          distance: [0, 10, 0, 0], // [top, right, bottom, left]
        });
      });

      test("should measure spacing when rectangles are separated vertically", () => {
        const a: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 10 };
        const b: cmath.Rectangle = { x: 0, y: 20, width: 10, height: 10 };

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b,
          box: a,
          distance: [0, 0, 10, 0], // [top, right, bottom, left]
        });
      });

      test("should measure spacing when rectangles are separated diagonally", () => {
        const a: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 10 };
        const b: cmath.Rectangle = { x: 20, y: 20, width: 10, height: 10 };

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b,
          box: a,
          distance: [0, 10, 10, 0], // [top, right, bottom, left]
        });
      });

      test("should handle rectangles with negative coordinates", () => {
        const a: cmath.Rectangle = { x: -10, y: -10, width: 10, height: 10 };
        const b: cmath.Rectangle = { x: 10, y: 10, width: 10, height: 10 };

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b,
          box: a,
          distance: [0, 10, 10, 0], // [top, right, bottom, left]
        });
      });
    });

    describe("intersecting rectangles", () => {
      test("should measure overlap when rectangles intersect", () => {
        const a: cmath.Rectangle = { x: 0, y: 0, width: 20, height: 20 };
        const b: cmath.Rectangle = { x: 10, y: 10, width: 20, height: 20 };

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b,
          box: { x: 10, y: 10, width: 10, height: 10 }, // intersection
          distance: [10, 10, 10, 10], // [top, right, bottom, left]
        });
      });

      test("should handle partial intersection", () => {
        const a: cmath.Rectangle = { x: 0, y: 0, width: 15, height: 15 };
        const b: cmath.Rectangle = { x: 10, y: 10, width: 15, height: 15 };

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b,
          box: { x: 10, y: 10, width: 5, height: 5 }, // intersection
          distance: [10, 10, 10, 10], // [top, right, bottom, left]
        });
      });
    });

    describe("contained rectangles", () => {
      test("should measure when a contains b", () => {
        const a: cmath.Rectangle = { x: 0, y: 0, width: 30, height: 30 };
        const b: cmath.Rectangle = { x: 10, y: 10, width: 10, height: 10 };

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b,
          box: b, // contained rectangle
          distance: [10, 10, 10, 10], // [top, right, bottom, left]
        });
      });

      test("should measure when b contains a", () => {
        const a: cmath.Rectangle = { x: 10, y: 10, width: 10, height: 10 };
        const b: cmath.Rectangle = { x: 0, y: 0, width: 30, height: 30 };

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b,
          box: a, // contained rectangle
          distance: [10, 10, 10, 10], // [top, right, bottom, left]
        });
      });
    });

    describe("edge cases", () => {
      test("should return null for identical rectangles", () => {
        const rect: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 10 };
        const result = measure(rect, rect);
        expect(result).toBeNull();
      });

      test("should handle zero-size rectangles", () => {
        const a: cmath.Rectangle = { x: 0, y: 0, width: 0, height: 0 };
        const b: cmath.Rectangle = { x: 10, y: 10, width: 10, height: 10 };

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b,
          box: a,
          distance: [0, 10, 10, 0], // [top, right, bottom, left] - corrected based on actual behavior
        });
      });

      test("should handle rectangles touching edges", () => {
        const a: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 10 };
        const b: cmath.Rectangle = { x: 10, y: 0, width: 10, height: 10 };

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b,
          box: a,
          distance: [0, 0, 0, 0], // [top, right, bottom, left]
        });
      });

      test("should handle rectangles touching corners", () => {
        const a: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 10 };
        const b: cmath.Rectangle = { x: 10, y: 10, width: 10, height: 10 };

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b,
          box: a,
          distance: [0, 0, 0, 0], // [top, right, bottom, left]
        });
      });
    });

    describe("distance calculation accuracy", () => {
      test("should calculate correct distances for complex layout", () => {
        const a: cmath.Rectangle = { x: 5, y: 5, width: 20, height: 15 };
        const b: cmath.Rectangle = { x: 30, y: 25, width: 10, height: 10 };

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b,
          box: a,
          distance: [0, 5, 5, 0], // [top, right, bottom, left]
        });
      });

      test("should handle floating point coordinates", () => {
        const a: cmath.Rectangle = { x: 1.5, y: 2.5, width: 10.5, height: 8.5 };
        const b: cmath.Rectangle = {
          x: 15.2,
          y: 12.3,
          width: 5.8,
          height: 6.7,
        };

        const result = measure(a, b);

        // Use toBeCloseTo for floating point comparisons to handle precision issues
        expect(result).toBeDefined();
        expect(result?.a).toEqual(a);
        expect(result?.b).toEqual(b);
        expect(result?.box).toEqual(a);
        expect(result?.distance[0]).toBeCloseTo(0, 10);
        expect(result?.distance[1]).toBeCloseTo(3.2, 10);
        expect(result?.distance[2]).toBeCloseTo(1.3, 10);
        expect(result?.distance[3]).toBeCloseTo(0, 10);
      });
    });

    describe("Vector2 support", () => {
      test("should measure Vector2 to Vector2 distances", () => {
        const a: cmath.Vector2 = [0, 0];
        const b: cmath.Vector2 = [10, 10];

        const result = measure(a, b);

        expect(result).toEqual({
          a: { x: 0, y: 0, width: 0, height: 0 },
          b: { x: 10, y: 10, width: 0, height: 0 },
          box: { x: 0, y: 0, width: 0, height: 0 },
          distance: [0, 10, 10, 0], // [top, right, bottom, left]
        });
      });

      test("should measure Vector2 to Rectangle distances", () => {
        const a: cmath.Vector2 = [5, 5];
        const b: cmath.Rectangle = { x: 10, y: 10, width: 20, height: 20 };

        const result = measure(a, b);

        expect(result).toEqual({
          a: { x: 5, y: 5, width: 0, height: 0 },
          b,
          box: { x: 5, y: 5, width: 0, height: 0 },
          distance: [0, 5, 5, 0], // [top, right, bottom, left]
        });
      });

      test("should measure Rectangle to Vector2 distances", () => {
        const a: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 10 };
        const b: cmath.Vector2 = [20, 20];

        const result = measure(a, b);

        expect(result).toEqual({
          a,
          b: { x: 20, y: 20, width: 0, height: 0 },
          box: a,
          distance: [0, 10, 10, 0], // [top, right, bottom, left]
        });
      });

      test("should handle Vector2 points inside Rectangle", () => {
        const a: cmath.Vector2 = [5, 5];
        const b: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 10 };

        const result = measure(a, b);

        expect(result).toEqual({
          a: { x: 5, y: 5, width: 0, height: 0 },
          b,
          box: { x: 5, y: 5, width: 0, height: 0 },
          distance: [0, 0, 0, 0], // [top, right, bottom, left] - point is inside rectangle
        });
      });

      test("should return null for identical Vector2 points", () => {
        const point: cmath.Vector2 = [5, 5];
        const result = measure(point, point);
        expect(result).toBeNull();
      });

      test("should handle Vector2 points with negative coordinates", () => {
        const a: cmath.Vector2 = [-5, -5];
        const b: cmath.Vector2 = [5, 5];

        const result = measure(a, b);

        expect(result).toEqual({
          a: { x: -5, y: -5, width: 0, height: 0 },
          b: { x: 5, y: 5, width: 0, height: 0 },
          box: { x: -5, y: -5, width: 0, height: 0 },
          distance: [0, 10, 10, 0], // [top, right, bottom, left]
        });
      });

      test("should handle Vector2 points touching Rectangle edges", () => {
        const a: cmath.Vector2 = [10, 5];
        const b: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 10 };

        const result = measure(a, b);

        expect(result).toEqual({
          a: { x: 10, y: 5, width: 0, height: 0 },
          b,
          box: { x: 10, y: 5, width: 0, height: 0 },
          distance: [0, 0, 0, 0], // [top, right, bottom, left]
        });
      });

      test("should handle Vector2 points touching Rectangle corners", () => {
        const a: cmath.Vector2 = [10, 10];
        const b: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 10 };

        const result = measure(a, b);

        expect(result).toEqual({
          a: { x: 10, y: 10, width: 0, height: 0 },
          b,
          box: { x: 10, y: 10, width: 0, height: 0 },
          distance: [0, 0, 0, 0], // [top, right, bottom, left]
        });
      });

      test("should handle floating point Vector2 coordinates", () => {
        const a: cmath.Vector2 = [1.5, 2.5];
        const b: cmath.Vector2 = [5.8, 6.7];

        const result = measure(a, b);

        expect(result).toBeDefined();
        expect(result?.a).toEqual({ x: 1.5, y: 2.5, width: 0, height: 0 });
        expect(result?.b).toEqual({ x: 5.8, y: 6.7, width: 0, height: 0 });
        expect(result?.box).toEqual({ x: 1.5, y: 2.5, width: 0, height: 0 });
        expect(result?.distance[0]).toBeCloseTo(0, 10);
        expect(result?.distance[1]).toBeCloseTo(4.3, 10);
        expect(result?.distance[2]).toBeCloseTo(4.2, 10);
        expect(result?.distance[3]).toBeCloseTo(0, 10);
      });
    });

    describe("backward compatibility", () => {
      test("should maintain existing Rectangle behavior", () => {
        // This test ensures that existing Rectangle-only code continues to work
        const a: cmath.Rectangle = { x: 0, y: 0, width: 10, height: 10 };
        const b: cmath.Rectangle = { x: 20, y: 20, width: 10, height: 10 };

        const result = measure(a, b);

        // Should work exactly as before
        expect(result).toEqual({
          a,
          b,
          box: a,
          distance: [0, 10, 10, 0], // [top, right, bottom, left]
        });
      });

      test("should handle mixed Rectangle and Vector2 inputs", () => {
        // This demonstrates the new mixed functionality
        const vertex: cmath.Vector2 = [5, 5];
        const region: cmath.Rectangle = { x: 10, y: 10, width: 20, height: 20 };

        const result = measure(vertex, region);

        expect(result).toEqual({
          a: { x: 5, y: 5, width: 0, height: 0 },
          b: region,
          box: { x: 5, y: 5, width: 0, height: 0 },
          distance: [0, 5, 5, 0], // [top, right, bottom, left]
        });
      });
    });
  });
});
