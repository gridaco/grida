import { cmath } from "..";

describe("cmath.rect", () => {
  describe("fromPoints", () => {
    it("should create a rectangle that bounds more than two points", () => {
      const points: cmath.Vector2[] = [
        [10, 20],
        [30, 40],
        [15, 25],
        [5, 35],
      ];
      const rect = cmath.rect.fromPoints(points);
      expect(rect).toEqual({ x: 5, y: 20, width: 25, height: 20 });
    });

    it("should throw an error if less than 1 points are provided", () => {
      expect(() => cmath.rect.fromPoints([])).toThrow();
    });

    it("should handle points with negative coordinates", () => {
      const points: cmath.Vector2[] = [
        [-10, -20],
        [30, 40],
        [0, -5],
      ];
      const rect = cmath.rect.fromPoints(points);
      expect(rect).toEqual({ x: -10, y: -20, width: 40, height: 60 });
    });

    it("should handle points forming a line (zero width or height)", () => {
      const points: cmath.Vector2[] = [
        [10, 20],
        [10, 30],
        [10, 25],
      ];
      const rect = cmath.rect.fromPoints(points);
      expect(rect).toEqual({ x: 10, y: 20, width: 0, height: 10 });
    });
  });

  describe("toPoints", () => {
    it("should return an object with 9 named control points", () => {
      const rect: cmath.Rectangle = { x: 10, y: 20, width: 30, height: 40 };
      const points = cmath.rect.to9Points(rect);

      expect(points).toEqual({
        topLeft: [10, 20],
        topRight: [40, 20],
        bottomLeft: [10, 60],
        bottomRight: [40, 60],
        topCenter: [25, 20],
        leftCenter: [10, 40],
        rightCenter: [40, 40],
        bottomCenter: [25, 60],
        center: [25, 40],
      });
    });

    it("should handle rectangles with zero width or height", () => {
      const rect: cmath.Rectangle = { x: 10, y: 20, width: 0, height: 40 };
      const points = cmath.rect.to9Points(rect);

      expect(points).toEqual({
        topLeft: [10, 20],
        topRight: [10, 20], // Same as topLeft
        bottomLeft: [10, 60],
        bottomRight: [10, 60], // Same as bottomLeft
        topCenter: [10, 20], // Same as topLeft
        leftCenter: [10, 40],
        rightCenter: [10, 40], // Same as leftCenter
        bottomCenter: [10, 60], // Same as bottomLeft
        center: [10, 40],
      });
    });

    it("should handle rectangles with negative dimensions", () => {
      const rect: cmath.Rectangle = { x: 10, y: 20, width: -30, height: -40 };
      const points = cmath.rect.to9Points(rect);

      expect(points).toEqual({
        topLeft: [10, 20],
        topRight: [-20, 20],
        bottomLeft: [10, -20],
        bottomRight: [-20, -20],
        topCenter: [-5, 20],
        leftCenter: [10, 0],
        rightCenter: [-20, 0],
        bottomCenter: [-5, -20],
        center: [-5, 0],
      });
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

  describe("intersection", () => {
    test("rectangles fully overlap", () => {
      const rectA = { x: 10, y: 10, width: 30, height: 30 };
      const rectB = { x: 15, y: 15, width: 20, height: 20 };
      const result = cmath.rect.intersection(rectA, rectB);

      expect(result).toEqual({ x: 15, y: 15, width: 20, height: 20 });
    });

    test("rectangles partially overlap", () => {
      const rectA = { x: 10, y: 10, width: 30, height: 30 };
      const rectB = { x: 25, y: 25, width: 20, height: 20 };
      const result = cmath.rect.intersection(rectA, rectB);

      expect(result).toEqual({ x: 25, y: 25, width: 15, height: 15 });
    });

    test("rectangles just touch at an edge", () => {
      const rectA = { x: 10, y: 10, width: 30, height: 30 };
      const rectB = { x: 40, y: 10, width: 20, height: 30 };
      const result = cmath.rect.intersection(rectA, rectB);

      expect(result).toBeNull();
    });

    test("rectangles are completely separate", () => {
      const rectA = { x: 10, y: 10, width: 30, height: 30 };
      const rectB = { x: 50, y: 50, width: 20, height: 20 };
      const result = cmath.rect.intersection(rectA, rectB);

      expect(result).toBeNull();
    });

    test("one rectangle completely contains the other", () => {
      const rectA = { x: 10, y: 10, width: 50, height: 50 };
      const rectB = { x: 20, y: 20, width: 10, height: 10 };
      const result = cmath.rect.intersection(rectA, rectB);

      expect(result).toEqual({ x: 20, y: 20, width: 10, height: 10 });
    });

    test("rectangles share only a corner", () => {
      const rectA = { x: 10, y: 10, width: 20, height: 20 };
      const rectB = { x: 30, y: 30, width: 20, height: 20 };
      const result = cmath.rect.intersection(rectA, rectB);

      expect(result).toBeNull();
    });

    test("zero-width or zero-height rectangles", () => {
      const rectA = { x: 10, y: 10, width: 0, height: 20 };
      const rectB = { x: 10, y: 15, width: 20, height: 10 };
      const result = cmath.rect.intersection(rectA, rectB);

      expect(result).toBeNull();
    });
  });

  describe("union", () => {
    it("should compute the union rectangle for multiple rectangles", () => {
      const rectangles: cmath.Rectangle[] = [
        { x: 10, y: 10, width: 30, height: 40 },
        { x: 50, y: 20, width: 20, height: 30 },
        { x: 0, y: 5, width: 10, height: 10 },
      ];
      const boundingRect = cmath.rect.union(rectangles);
      expect(boundingRect).toEqual({ x: 0, y: 5, width: 70, height: 45 });
    });

    it("should handle a single rectangle as input", () => {
      const rectangles: cmath.Rectangle[] = [
        { x: 10, y: 20, width: 30, height: 40 },
      ];
      const boundingRect = cmath.rect.union(rectangles);
      expect(boundingRect).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    });

    it("should throw an error for an empty array of rectangles", () => {
      expect(() => cmath.rect.union([])).toThrow(
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

  describe("translate", () => {
    it("should translate a rectangle by a positive vector", () => {
      const rect: cmath.Rectangle = { x: 10, y: 20, width: 30, height: 40 };
      const translation: cmath.Vector2 = [5, 10];

      const result = cmath.rect.translate(rect, translation);

      expect(result).toEqual({ x: 15, y: 30, width: 30, height: 40 });
    });

    it("should translate a rectangle by a negative vector", () => {
      const rect: cmath.Rectangle = { x: 10, y: 20, width: 30, height: 40 };
      const translation: cmath.Vector2 = [-5, -10];

      const result = cmath.rect.translate(rect, translation);

      expect(result).toEqual({ x: 5, y: 10, width: 30, height: 40 });
    });

    it("should translate a rectangle by a zero vector (no movement)", () => {
      const rect: cmath.Rectangle = { x: 10, y: 20, width: 30, height: 40 };
      const translation: cmath.Vector2 = [0, 0];

      const result = cmath.rect.translate(rect, translation);

      expect(result).toEqual(rect); // No change expected
    });
  });

  describe("scale", () => {
    it("should scale a single rectangle with uniform scaling", () => {
      const rect = { x: 10, y: 20, width: 30, height: 40 };
      const origin: cmath.Vector2 = [0, 0];
      const scale: cmath.Vector2 = [2, 2];

      const result = cmath.rect.scale(rect, origin, scale);

      expect(result).toEqual({ x: 20, y: 40, width: 60, height: 80 });
    });

    it("should scale a single rectangle with non-uniform scaling", () => {
      const rect = { x: 10, y: 20, width: 30, height: 40 };
      const origin: cmath.Vector2 = [0, 0];
      const scale: cmath.Vector2 = [2, 1.5];

      const result = cmath.rect.scale(rect, origin, scale);

      expect(result).toEqual({ x: 20, y: 30, width: 60, height: 60 });
    });

    it("should scale a rectangle relative to a non-origin point", () => {
      const rect = { x: 10, y: 20, width: 30, height: 40 };
      const origin: cmath.Vector2 = [10, 20];
      const scale: cmath.Vector2 = [2, 2];

      const result = cmath.rect.scale(rect, origin, scale);

      expect(result).toEqual({ x: 10, y: 20, width: 60, height: 80 });
    });

    it("should handle no scaling (scale factors = 1)", () => {
      const rect = { x: 10, y: 20, width: 30, height: 40 };
      const origin: cmath.Vector2 = [0, 0];
      const scale: cmath.Vector2 = [1, 1];

      const result = cmath.rect.scale(rect, origin, scale);

      expect(result).toEqual(rect);
    });

    it("should handle scaling with negative scaling factors", () => {
      const rect = { x: 10, y: 20, width: 30, height: 40 };
      const origin: cmath.Vector2 = [0, 0];
      const scale: cmath.Vector2 = [-1, -1];

      const result = cmath.rect.scale(rect, origin, scale);

      // Expect flipped dimensions and adjusted position
      expect(result).toEqual({ x: -10, y: -20, width: -30, height: -40 });
    });

    it("should handle rectangles with zero width or height", () => {
      const rect = { x: 10, y: 20, width: 0, height: 40 };
      const origin: cmath.Vector2 = [0, 0];
      const scale: cmath.Vector2 = [2, 2];

      const result = cmath.rect.scale(rect, origin, scale);

      expect(result).toEqual({ x: 20, y: 40, width: 0, height: 80 });
    });

    it("should scale multiple rectangles as part of a group transform", () => {
      const rects = [
        { x: 10, y: 20, width: 30, height: 40 },
        { x: 50, y: 60, width: 20, height: 30 },
        { x: 0, y: 0, width: 10, height: 10 },
      ];
      const origin: cmath.Vector2 = [0, 0];
      const scale: cmath.Vector2 = [2, 2];

      const results = rects.map((rect) =>
        cmath.rect.scale(rect, origin, scale)
      );

      expect(results).toEqual([
        { x: 20, y: 40, width: 60, height: 80 },
        { x: 100, y: 120, width: 40, height: 60 },
        { x: 0, y: 0, width: 20, height: 20 },
      ]);
    });
  });

  describe("transform", () => {
    it("should translate a rectangle", () => {
      const rect = { x: 10, y: 20, width: 30, height: 40 };
      const t: cmath.Transform = [
        [1, 0, 100], // move +100 on x
        [0, 1, 50], // move +50 on y
      ];
      const result = cmath.rect.transform(rect, t);
      // Expect bounding box to also shift by [100, 50]
      expect(result).toEqual({ x: 110, y: 70, width: 30, height: 40 });
    });

    it("should scale a rectangle around the origin (0,0)", () => {
      const rect = { x: 10, y: 20, width: 10, height: 20 };
      const t: cmath.Transform = [
        [2, 0, 0], // scale x by 2
        [0, 3, 0], // scale y by 3
      ];
      const result = cmath.rect.transform(rect, t);
      // (10,20) -> (20,60), (20,40) -> (40,120)
      // so bounding box: x=20, y=60, w=20, h=60
      expect(result).toEqual({ x: 20, y: 60, width: 20, height: 60 });
    });

    it("should handle skew transformations (nonzero b, c)", () => {
      const rect = { x: 0, y: 0, width: 10, height: 10 };
      const t: cmath.Transform = [
        [1, 0.5, 0], // skew x
        [0.3, 1, 0], // skew y
      ];
      const result = cmath.rect.transform(rect, t);
      // Corners:
      //   (0,0)   -> (0,0)
      //   (10,0)  -> (10*1 + 0*0.5, 10*0.3 + 0*1) = (10, 3)
      //   (0,10)  -> (0*1 + 10*0.5, 0*0.3 + 10*1) = (5, 10)
      //   (10,10) -> (10 + 5, 3 + 10) = (15, 13)
      // bounding box => x=0, y=0, width=15, height=13
      expect(result).toEqual({ x: 0, y: 0, width: 15, height: 13 });
    });

    it("should combine translation, scale, and skew", () => {
      const rect = { x: 2, y: 2, width: 4, height: 4 };
      const t: cmath.Transform = [
        [2, 1, 5], // scale x by 2, skew x by 1, translate x by 5
        [0.5, 2, 10], // skew y by 0.5, scale y by 2, translate y by 10
      ];
      const result = cmath.rect.transform(rect, t);
      // Check bounding box logically:
      // corners (2,2), (6,2), (2,6), (6,6)
      // transform each, then find bounding box
      expect(result.x).toBeCloseTo(2 * 2 + 2 * 1 + 5); // = 4 + 2 + 5 = 11
      expect(result.y).toBeCloseTo(2 * 0.5 + 2 * 2 + 10); // = 1 + 4 + 10 = 15
      // The other corners produce max bounds
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });
  });

  describe("getRelativeTransform", () => {
    it("maps rect A corners onto rect B corners", () => {
      const a = { x: 0, y: 0, width: 100, height: 50 };
      const b = { x: 200, y: 300, width: 400, height: 200 };
      const t = cmath.rect.getRelativeTransform(a, b);

      // Top-left corner
      expect(cmath.vector2.transform([0, 0], t)).toEqual([200, 300]);
      // Top-right corner
      expect(cmath.vector2.transform([100, 0], t)).toEqual([600, 300]);
      // Bottom-left corner
      expect(cmath.vector2.transform([0, 50], t)).toEqual([200, 500]);
      // Bottom-right corner
      expect(cmath.vector2.transform([100, 50], t)).toEqual([600, 500]);
    });

    it("handles a smaller rect (A) mapped onto a larger rect (B)", () => {
      const a = { x: 50, y: 50, width: 50, height: 50 };
      const b = { x: 100, y: 100, width: 500, height: 300 };
      const t = cmath.rect.getRelativeTransform(a, b);

      // Top-left
      expect(cmath.vector2.transform([50, 50], t)).toEqual([100, 100]);
      // Bottom-right
      expect(cmath.vector2.transform([100, 100], t)).toEqual([600, 400]);
    });

    it("handles negative coordinates for rect A", () => {
      const a = { x: -100, y: -50, width: 200, height: 100 };
      const b = { x: 0, y: 0, width: 100, height: 50 };
      const t = cmath.rect.getRelativeTransform(a, b);

      // A’s top-left → B’s top-left
      expect(cmath.vector2.transform([-100, -50], t)).toEqual([0, 0]);
      // A’s bottom-right → B’s bottom-right
      expect(cmath.vector2.transform([100, 50], t)).toEqual([100, 50]);
    });

    it("maps a zero-dimension rect A onto B", () => {
      const a = { x: 10, y: 10, width: 0, height: 0 };
      const b = { x: 50, y: 50, width: 100, height: 50 };
      const t = cmath.rect.getRelativeTransform(a, b);

      // Even though A has zero size, its 'point' still maps to B's top-left
      expect(cmath.vector2.transform([10, 10], t)).toEqual([50, 50]);
    });

    it("handles rect A partially overlapped with B (still maps corners correctly)", () => {
      const a = { x: 20, y: 20, width: 80, height: 60 };
      const b = { x: 50, y: 30, width: 160, height: 120 };
      const t = cmath.rect.getRelativeTransform(a, b);

      // Top-left corner
      expect(cmath.vector2.transform([20, 20], t)).toEqual([50, 30]);
      // Bottom-right corner
      expect(cmath.vector2.transform([100, 80], t)).toEqual([210, 150]);
    });

    it("should transform rect A into rect B", () => {
      const a = { x: 0, y: 0, width: 100, height: 50 };
      const b = { x: 200, y: 300, width: 400, height: 200 };

      const t = cmath.rect.getRelativeTransform(a, b);
      const aTransformed = cmath.rect.transform(a, t);

      expect(aTransformed).toEqual(b);
    });
  });
});
