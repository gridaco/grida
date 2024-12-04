import { cmath } from "./math";

describe("cmath.quantize", () => {
  it("should quantize to the nearest multiple of the step", () => {
    expect(cmath.quantize(15, 10)).toBe(20);
    expect(cmath.quantize(14, 10)).toBe(10);
    expect(cmath.quantize(16, 10)).toBe(20);
  });

  it("should quantize with decimal step sizes", () => {
    expect(cmath.quantize(0.1123, 0.1)).toBe(0.1);
    expect(cmath.quantize(0.15, 0.1)).toBe(0.2);
    expect(cmath.quantize(0.05, 0.1)).toBe(0.1);
  });

  it("should handle finer step sizes", () => {
    expect(cmath.quantize(7.35, 0.25)).toBe(7.25);
    expect(cmath.quantize(7.4, 0.25)).toBe(7.5);
    expect(cmath.quantize(7.1, 0.25)).toBe(7.0);
  });

  it("should return the value if step size is 1", () => {
    expect(cmath.quantize(5, 1)).toBe(5);
    expect(cmath.quantize(7.3, 1)).toBe(7);
    expect(cmath.quantize(7.8, 1)).toBe(8);
  });

  it("should throw an error if step is zero or negative", () => {
    expect(() => cmath.quantize(15, 0)).toThrow(
      "Step size must be a positive number."
    );
    expect(() => cmath.quantize(15, -10)).toThrow(
      "Step size must be a positive number."
    );
  });

  it("should handle very small step sizes", () => {
    expect(cmath.quantize(0.123456, 0.0001)).toBeCloseTo(0.1235);
    expect(cmath.quantize(0.123456, 0.00001)).toBeCloseTo(0.12346);
    expect(cmath.quantize(0.123456, 0.000001)).toBeCloseTo(0.123456);
  });
});

describe("cmath.rect", () => {
  describe("fromPoints", () => {
    it("should create a rectangle with positive width and height from two points", () => {
      const rect = cmath.rect.fromPoints([
        [10, 20],
        [30, 40],
      ]);
      expect(rect).toEqual({ x: 10, y: 20, width: 20, height: 20 });
    });

    it("should normalize points to ensure positive width and height", () => {
      const rect = cmath.rect.fromPoints([
        [30, 40],
        [10, 20],
      ]);
      expect(rect).toEqual({ x: 10, y: 20, width: 20, height: 20 });
    });

    it("should handle points on the same line (zero width)", () => {
      const rect = cmath.rect.fromPoints([
        [10, 20],
        [10, 40],
      ]);
      expect(rect).toEqual({ x: 10, y: 20, width: 0, height: 20 });
    });

    it("should handle points on the same line (zero height)", () => {
      const rect = cmath.rect.fromPoints([
        [10, 20],
        [30, 20],
      ]);
      expect(rect).toEqual({ x: 10, y: 20, width: 20, height: 0 });
    });

    it("should handle identical points (zero width and height)", () => {
      const rect = cmath.rect.fromPoints([
        [10, 20],
        [10, 20],
      ]);
      expect(rect).toEqual({ x: 10, y: 20, width: 0, height: 0 });
    });

    it("should work with negative coordinates", () => {
      const rect = cmath.rect.fromPoints([
        [-10, -20],
        [30, 40],
      ]);
      expect(rect).toEqual({ x: -10, y: -20, width: 40, height: 60 });
    });

    it("should normalize negative coordinates and flip points if needed", () => {
      const rect = cmath.rect.fromPoints([
        [30, 40],
        [-10, -20],
      ]);
      expect(rect).toEqual({ x: -10, y: -20, width: 40, height: 60 });
    });
  });

  describe("contains", () => {
    it("should return true when rectangle A is fully contained within rectangle B", () => {
      const a: cmath.Rectangle = { x: 20, y: 20, width: 40, height: 40 };
      const b: cmath.Rectangle = { x: 10, y: 10, width: 100, height: 100 };
      expect(cmath.rect.contains(a, b)).toBe(true);
    });

    it("should return false when rectangle A is partially outside rectangle B", () => {
      const a: cmath.Rectangle = { x: 90, y: 90, width: 30, height: 30 };
      const b: cmath.Rectangle = { x: 10, y: 10, width: 100, height: 100 };
      expect(cmath.rect.contains(a, b)).toBe(false);
    });

    it("should return false when rectangle A is completely outside rectangle B", () => {
      const a: cmath.Rectangle = { x: 200, y: 200, width: 50, height: 50 };
      const b: cmath.Rectangle = { x: 10, y: 10, width: 100, height: 100 };
      expect(cmath.rect.contains(a, b)).toBe(false);
    });

    it("should return false when rectangle A is larger than rectangle B", () => {
      const a: cmath.Rectangle = { x: 5, y: 5, width: 150, height: 150 };
      const b: cmath.Rectangle = { x: 10, y: 10, width: 100, height: 100 };
      expect(cmath.rect.contains(a, b)).toBe(false);
    });
  });

  describe("intersects", () => {
    it("should return true when rectangle A intersects rectangle B partially", () => {
      const a: cmath.Rectangle = { x: 50, y: 50, width: 50, height: 50 };
      const b: cmath.Rectangle = { x: 70, y: 70, width: 50, height: 50 };
      expect(cmath.rect.intersects(a, b)).toBe(true);
    });

    it("should return true when rectangle A is fully inside rectangle B", () => {
      const a: cmath.Rectangle = { x: 20, y: 20, width: 40, height: 40 };
      const b: cmath.Rectangle = { x: 10, y: 10, width: 100, height: 100 };
      expect(cmath.rect.intersects(a, b)).toBe(true);
    });

    it("should return false when rectangle A is completely outside rectangle B", () => {
      const a: cmath.Rectangle = { x: 200, y: 200, width: 50, height: 50 };
      const b: cmath.Rectangle = { x: 10, y: 10, width: 100, height: 100 };
      expect(cmath.rect.intersects(a, b)).toBe(false);
    });

    it("should return true when rectangle A shares a border with rectangle B", () => {
      const a: cmath.Rectangle = { x: 100, y: 50, width: 50, height: 50 };
      const b: cmath.Rectangle = { x: 50, y: 50, width: 50, height: 50 };
      expect(cmath.rect.intersects(a, b)).toBe(true);
    });
  });

  describe("getBoundingRect", () => {
    it("should compute the bounding rectangle for multiple rectangles", () => {
      const rectangles: cmath.Rectangle[] = [
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 20, width: 20, height: 30 },
        { x: 0, y: 5, width: 10, height: 10 },
      ];
      const boundingRect = cmath.rect.getBoundingRect(rectangles);
      expect(boundingRect).toEqual({ x: 0, y: 5, width: 70, height: 45 });
    });

    it("should handle a single rectangle as input", () => {
      const rectangles: cmath.Rectangle[] = [
        { x: 10, y: 20, width: 30, height: 40 },
      ];
      const boundingRect = cmath.rect.getBoundingRect(rectangles);
      expect(boundingRect).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    });

    it("should throw an error for an empty array of rectangles", () => {
      expect(() => cmath.rect.getBoundingRect([])).toThrow(
        "Cannot compute bounding rect for an empty array of rectangles."
      );
    });
  });

  describe("align", () => {
    it("should align rectangles to the left", () => {
      const rectangles: cmath.Rectangle[] = [
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 20, width: 20, height: 30 },
      ];

      const aligned = cmath.rect.align(rectangles, { horizontal: "min" });
      expect(aligned).toEqual([
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 10, y: 20, width: 20, height: 30 },
      ]);
    });

    it("should align rectangles to the right", () => {
      const rectangles: cmath.Rectangle[] = [
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 20, width: 20, height: 30 },
      ];

      const aligned = cmath.rect.align(rectangles, { horizontal: "max" });
      expect(aligned).toEqual([
        { x: 40, y: 10, width: 30, height: 40 },
        { x: 50, y: 20, width: 20, height: 30 },
      ]);
    });

    it("should align rectangles to the top", () => {
      const rectangles: cmath.Rectangle[] = [
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 20, width: 20, height: 30 },
      ];

      const aligned = cmath.rect.align(rectangles, { vertical: "min" });
      expect(aligned).toEqual([
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 10, width: 20, height: 30 },
      ]);
    });

    it("should align rectangles to the bottom", () => {
      const rectangles: cmath.Rectangle[] = [
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 20, width: 20, height: 30 },
      ];

      const aligned = cmath.rect.align(rectangles, { vertical: "max" });
      expect(aligned).toEqual([
        //
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 20, width: 20, height: 30 },
      ]);
    });

    it("should center rectangles horizontally", () => {
      const rectangles: cmath.Rectangle[] = [
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 20, width: 20, height: 30 },
      ];

      const aligned = cmath.rect.align(rectangles, { horizontal: "center" });
      expect(aligned).toEqual([
        { x: 25, y: 10, width: 30, height: 40 },
        { x: 30, y: 20, width: 20, height: 30 },
      ]);
    });

    it("should center rectangles vertically", () => {
      const rectangles: cmath.Rectangle[] = [
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 20, width: 20, height: 30 },
      ];

      const aligned = cmath.rect.align(rectangles, { vertical: "center" });
      expect(aligned).toEqual([
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 15, width: 20, height: 30 },
      ]);
    });

    it("should align rectangles both horizontally and vertically", () => {
      const rectangles: cmath.Rectangle[] = [
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 20, width: 20, height: 30 },
      ];

      const aligned = cmath.rect.align(rectangles, {
        horizontal: "center",
        vertical: "center",
      });
      expect(aligned).toEqual([
        { x: 25, y: 10, width: 30, height: 40 },
        { x: 30, y: 15, width: 20, height: 30 },
      ]);
    });

    it("should return the same rectangles for 'none' alignment", () => {
      const rectangles: cmath.Rectangle[] = [
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 20, width: 20, height: 30 },
      ];

      const aligned = cmath.rect.align(rectangles, {
        horizontal: "none",
        vertical: "none",
      });
      expect(aligned).toEqual(rectangles);
    });
  });
});

describe("cmath.snap", () => {
  describe("scalar", () => {
    it("should snap to the nearest scalar within the threshold", () => {
      expect(cmath.snap.scalar(15, [10, 20, 25], 6)).toBe(10);
    });

    it("should return the original scalar if no scalars are within the threshold", () => {
      expect(cmath.snap.scalar(15, [1, 2, 3], 5)).toBe(15);
    });

    it("should snap to the closest scalar when multiple are within the threshold", () => {
      expect(cmath.snap.scalar(15, [14, 16, 18], 2)).toBe(14);
    });

    it("should return the exact match if it exists in the scalars", () => {
      expect(cmath.snap.scalar(15, [10, 15, 20], 5)).toBe(15);
    });

    it("should handle an empty list of scalars", () => {
      expect(cmath.snap.scalar(15, [], 5)).toBe(15);
    });

    it("should handle negative scalars and thresholds", () => {
      expect(cmath.snap.scalar(-5, [-10, -3, 0], 3)).toBe(-3);
    });

    it("should handle scalars exactly at the threshold boundary", () => {
      expect(cmath.snap.scalar(15, [20], 5)).toBe(20);
      expect(cmath.snap.scalar(15, [21], 5)).toBe(15); // Out of threshold
    });
  });

  describe("vector2", () => {
    it("should snap to the nearest point within the threshold for both axes", () => {
      const point: cmath.Vector2 = [12, 15];
      const points: cmath.Vector2[] = [
        [10, 14],
        [12, 14],
        [20, 20],
      ];
      const threshold: cmath.Vector2 = [2, 2];

      const snappedPoint = cmath.snap.vector2(point, points, threshold);
      expect(snappedPoint).toEqual([12, 14]);
    });

    it("should return the original point if no points are within the threshold", () => {
      const point: cmath.Vector2 = [12, 15];
      const points: cmath.Vector2[] = [
        [10, 10],
        [20, 20],
      ];
      const threshold: cmath.Vector2 = [1, 1];

      const snappedPoint = cmath.snap.vector2(point, points, threshold);
      expect(snappedPoint).toEqual(point);
    });

    it("should snap independently for x and y axes", () => {
      const point: cmath.Vector2 = [12, 15];
      const points: cmath.Vector2[] = [
        [12, 14],
        [13, 15],
      ];
      const threshold: cmath.Vector2 = [2, 2];

      const snappedPoint = cmath.snap.vector2(point, points, threshold);
      expect(snappedPoint).toEqual([12, 15]);
    });

    it("should snap to a point with exact match", () => {
      const point: cmath.Vector2 = [12, 15];
      const points: cmath.Vector2[] = [
        [12, 15],
        [10, 14],
        [20, 20],
      ];
      const threshold: cmath.Vector2 = [5, 5];

      const snappedPoint = cmath.snap.vector2(point, points, threshold);
      expect(snappedPoint).toEqual([12, 15]);
    });

    it("should handle negative coordinates", () => {
      const point: cmath.Vector2 = [-10, -15];
      const points: cmath.Vector2[] = [
        [-10, -14], // Snap y
        [-12, -15], // Snap x
      ];
      const threshold: cmath.Vector2 = [2, 2];

      const snappedPoint = cmath.snap.vector2(point, points, threshold);
      expect(snappedPoint).toEqual([-10, -15]);
    });

    it("should not snap if the threshold for any axis is 0", () => {
      const point: cmath.Vector2 = [12, 15];
      const points: cmath.Vector2[] = [
        [12, 14],
        [13, 15],
      ];
      const threshold: cmath.Vector2 = [0, 0];

      const snappedPoint = cmath.snap.vector2(point, points, threshold);
      expect(snappedPoint).toEqual(point);
    });

    it("should handle an empty list of points", () => {
      const point: cmath.Vector2 = [12, 15];
      const points: cmath.Vector2[] = [];
      const threshold: cmath.Vector2 = [2, 2];

      const snappedPoint = cmath.snap.vector2(point, points, threshold);
      expect(snappedPoint).toEqual(point);
    });

    it("should snap correctly for points exactly at the threshold boundary", () => {
      const point: cmath.Vector2 = [12, 15];
      const points: cmath.Vector2[] = [
        [14, 15], // x-axis threshold match
        [12, 17], // y-axis threshold match
      ];
      const threshold: cmath.Vector2 = [2, 2];

      const snappedPointX = cmath.snap.vector2(point, [points[0]], threshold);
      const snappedPointY = cmath.snap.vector2(point, [points[1]], threshold);

      expect(snappedPointX).toEqual([14, 15]);
      expect(snappedPointY).toEqual([12, 17]);
    });
  });
});
