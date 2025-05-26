import cmath from "..";

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
    it("[chunk] should return an 9-length array with 9 points with the exact index", () => {
      const rect: cmath.Rectangle = { x: 10, y: 20, width: 30, height: 40 };
      const points = cmath.rect.to9PointsChunk(rect);

      expect(points).toEqual([
        [10, 20], // topLeft
        [40, 20], // topRight
        [40, 60], // bottomRight
        [10, 60], // bottomLeft
        [25, 20], // topCenter
        [40, 40], // rightCenter
        [25, 60], // bottomCenter
        [10, 40], // leftCenter
        [25, 40], // center
      ]);
    });

    it("should return an object with 9 named control points", () => {
      const rect: cmath.Rectangle = { x: 10, y: 20, width: 30, height: 40 };
      const points = cmath.rect.to9Points(rect);

      expect(points).toEqual({
        topLeft: [10, 20],
        topRight: [40, 20],
        bottomRight: [40, 60],
        bottomLeft: [10, 60],
        topCenter: [25, 20],
        rightCenter: [40, 40],
        bottomCenter: [25, 60],
        leftCenter: [10, 40],
        center: [25, 40],
      });
    });

    it("should handle rectangles with zero width or height", () => {
      const rect: cmath.Rectangle = { x: 10, y: 20, width: 0, height: 40 };
      const points = cmath.rect.to9Points(rect);

      expect(points).toEqual({
        topLeft: [10, 20],
        topRight: [10, 20], // Same as topLeft
        bottomRight: [10, 60], // Same as bottomLeft
        bottomLeft: [10, 60],
        topCenter: [10, 20], // Same as topLeft
        rightCenter: [10, 40], // Same as leftCenter
        bottomCenter: [10, 60], // Same as bottomLeft
        leftCenter: [10, 40],
        center: [10, 40],
      });
    });

    it("should handle rectangles with negative dimensions", () => {
      const rect: cmath.Rectangle = { x: 10, y: 20, width: -30, height: -40 };
      const points = cmath.rect.to9Points(rect);

      expect(points).toEqual({
        topLeft: [10, 20],
        topRight: [-20, 20],
        bottomRight: [-20, -20],
        bottomLeft: [10, -20],
        topCenter: [-5, 20],
        rightCenter: [-20, 0],
        bottomCenter: [-5, -20],
        leftCenter: [10, 0],
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

  describe("offset", () => {
    const rect = { x: 10, y: 10, width: 100, height: 50 };

    test("returns [0, 0] when point is inside the rectangle", () => {
      expect(cmath.rect.offset(rect, [50, 30])).toEqual([0, 0]);
    });

    test("returns negative x when point is left of the rectangle", () => {
      expect(cmath.rect.offset(rect, [5, 30])).toEqual([-5, 0]);
    });

    test("returns positive x when point is right of the rectangle", () => {
      expect(cmath.rect.offset(rect, [120, 30])).toEqual([10, 0]);
    });

    test("returns negative y when point is above the rectangle", () => {
      expect(cmath.rect.offset(rect, [50, 5])).toEqual([0, -5]);
    });

    test("returns positive y when point is below the rectangle", () => {
      expect(cmath.rect.offset(rect, [50, 70])).toEqual([0, 10]);
    });

    test("returns negative x and y when point is top-left of the rectangle", () => {
      expect(cmath.rect.offset(rect, [5, 5])).toEqual([-5, -5]);
    });

    test("returns positive x and y when point is bottom-right of the rectangle", () => {
      expect(cmath.rect.offset(rect, [120, 70])).toEqual([10, 10]);
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

  describe("pad", () => {
    test("applies uniform padding", () => {
      const rect = { x: 50, y: 50, width: 100, height: 80 };
      const padded = cmath.rect.pad(rect, 10);
      // Original center: (50 + 100/2, 50 + 80/2) = (100, 90)
      // New dimensions: width = 100 + 10 + 10 = 120, height = 80 + 10 + 10 = 100
      // New x = 100 - 120/2 = 40, New y = 90 - 100/2 = 40
      expect(padded).toEqual({ x: 40, y: 40, width: 120, height: 100 });
    });

    test("applies non-uniform padding", () => {
      const rect = { x: 50, y: 50, width: 100, height: 80 };
      const padded = cmath.rect.pad(rect, {
        top: 5,
        right: 15,
        bottom: 10,
        left: 20,
      });
      // Original center: (100, 90)
      // New width = 100 + 20 + 15 = 135, New height = 80 + 5 + 10 = 95
      // New x = 100 - 135/2 = 32.5, New y = 90 - 95/2 = 42.5
      expect(padded).toEqual({ x: 32.5, y: 42.5, width: 135, height: 95 });
    });

    test("returns same rectangle when padding is 0", () => {
      const rect = { x: 10, y: 20, width: 50, height: 60 };
      const padded = cmath.rect.pad(rect, 0);
      expect(padded).toEqual(rect);
    });
  });

  describe("inset", () => {
    test("applies uniform inset", () => {
      const rect = { x: 50, y: 50, width: 100, height: 80 };
      const insetRect = cmath.rect.inset(rect, 10);
      // Original center: (50+50, 50+40) = (100, 90)
      // New width = 100 - 20 = 80, New height = 80 - 20 = 60
      // New x = 100 - 80/2 = 60, New y = 90 - 60/2 = 60
      expect(insetRect).toEqual({ x: 60, y: 60, width: 80, height: 60 });
    });

    test("applies non-uniform inset", () => {
      const rect = { x: 50, y: 50, width: 100, height: 80 };
      const insetRect = cmath.rect.inset(rect, {
        top: 5,
        right: 15,
        bottom: 10,
        left: 20,
      });
      // Original center: (100, 90)
      // New width = 100 - (20+15) = 65, New height = 80 - (5+10) = 65
      // New x = 100 - 65/2 = 67.5, New y = 90 - 65/2 = 57.5
      expect(insetRect).toEqual({ x: 67.5, y: 57.5, width: 65, height: 65 });
    });

    test("returns same rectangle when inset is 0", () => {
      const rect = { x: 10, y: 20, width: 50, height: 60 };
      const insetRect = cmath.rect.inset(rect, 0);
      expect(insetRect).toEqual(rect);
    });

    test("clamps dimensions to non-negative when inset is too large (uniform)", () => {
      const rect = { x: 50, y: 50, width: 30, height: 30 };
      // Uniform inset of 20 leads to new width = 30 - 40 = -10 and height = -10, so clamped to 0.
      // Center: (65, 65)
      const insetRect = cmath.rect.inset(rect, 20);
      expect(insetRect).toEqual({ x: 65, y: 65, width: 0, height: 0 });
    });

    test("clamps width to non-negative when inset is too large in one dimension", () => {
      const rect = { x: 10, y: 10, width: 100, height: 50 };
      // Apply non-uniform inset: left=60, right=60, top=5, bottom=5.
      // New width = 100 - (60+60) = -20 (clamped to 0), new height = 50 - (5+5) = 40.
      // Center remains at (10+50, 10+25) = (60, 35)
      // New rect: x = 60 - 0/2 = 60, y = 35 - 40/2 = 15
      const insetRect = cmath.rect.inset(rect, {
        left: 60,
        right: 60,
        top: 5,
        bottom: 5,
      });
      expect(insetRect).toEqual({ x: 60, y: 15, width: 0, height: 40 });
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

  describe("getUniformGap", () => {
    it("should return [undefined, []] if fewer than 2 rectangles", () => {
      const rects = [{ x: 10, y: 20, width: 30, height: 40 }];
      const [gap, gaps] = cmath.rect.getUniformGap(rects, "x", 0);
      expect(gap).toBeUndefined();
      expect(gaps).toEqual([]);
    });

    it("should return [gap, [gap]] when exactly 2 rectangles have the same gap", () => {
      const rects = [
        { x: 10, y: 10, width: 20, height: 20 },
        { x: 40, y: 10, width: 20, height: 20 },
      ];
      const [gap, gaps] = cmath.rect.getUniformGap(rects, "x", 0);
      expect(gap).toBe(10); // only one gap => 40 - (10 + 20) = 10
      expect(gaps).toEqual([10]);
    });

    it("should return [mode, gaps] if all gaps are uniform within tolerance", () => {
      const rects = [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 15, y: 0, width: 10, height: 10 },
        { x: 30, y: 0, width: 10, height: 10 },
      ];
      // Actual gaps: [5, 5]
      const [uniformGap, gaps] = cmath.rect.getUniformGap(rects, "x", 0.1);
      expect(uniformGap).toBe(5);
      expect(gaps).toEqual([5, 5]);
    });

    it("should return [undefined, gaps] if gaps are not uniform", () => {
      const rects = [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 15, y: 0, width: 10, height: 10 },
        { x: 28, y: 0, width: 10, height: 10 },
      ];
      // Actual gaps: [5, 3]
      const [uniformGap, gaps] = cmath.rect.getUniformGap(rects, "x", 0);
      expect(uniformGap).toBeUndefined();
      expect(gaps).toEqual([5, 3]);
    });

    it("should consider tolerance when deciding if gaps are uniform", () => {
      const rects = [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 14, y: 0, width: 10, height: 10 },
        { x: 28, y: 0, width: 10, height: 10 },
      ];
      // Actual gaps: [4, 4], but let's say tolerance=1 => uniform enough
      const [uniformGap, gaps] = cmath.rect.getUniformGap(rects, "x", 1);
      expect(uniformGap).toBe(4);
      expect(gaps).toEqual([4, 4]);
    });

    it("should return the mode if multiple gap values are all within tolerance", () => {
      // Gaps: [5, 5, 6, 5] => all within tolerance=1.
      // mode is 5
      const rects = [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 15, y: 0, width: 10, height: 10 },
        { x: 30, y: 0, width: 10, height: 10 },
        { x: 46, y: 0, width: 10, height: 10 },
        { x: 61, y: 0, width: 10, height: 10 },
      ];
      const [uniformGap, gaps] = cmath.rect.getUniformGap(rects, "x", 1);
      expect(gaps).toEqual([5, 5, 6, 5]);
      expect(uniformGap).toBe(5);
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

describe("cmath.rect.boolean", () => {
  describe("subtract", () => {
    test("returns original rectangle when no intersection", () => {
      const a = { x: 10, y: 10, width: 30, height: 30 };
      const b = { x: 50, y: 50, width: 10, height: 10 };
      expect(cmath.rect.boolean.subtract(a, b)).toEqual([a]);
    });

    test("returns empty array when b fully covers a", () => {
      const a = { x: 10, y: 10, width: 30, height: 30 };
      const b = { x: 5, y: 5, width: 40, height: 40 };
      expect(cmath.rect.boolean.subtract(a, b)).toEqual([]);
    });

    test("returns four subregions for full inner intersection", () => {
      const a = { x: 10, y: 10, width: 30, height: 30 };
      const b = { x: 20, y: 20, width: 10, height: 10 };
      const expected = [
        { x: 10, y: 10, width: 30, height: 10 }, // top region
        { x: 10, y: 30, width: 30, height: 10 }, // bottom region
        { x: 10, y: 20, width: 10, height: 10 }, // left region
        { x: 30, y: 20, width: 10, height: 10 }, // right region
      ];
      expect(cmath.rect.boolean.subtract(a, b)).toEqual(expected);
    });

    test("returns two subregions for partial overlap from one side", () => {
      const a = { x: 10, y: 10, width: 30, height: 30 };
      // b overlaps a from above such that the intersection is { x: 25, y: 10, width: 15, height: 15 }
      const b = { x: 25, y: 5, width: 20, height: 20 };
      const expected = [
        { x: 10, y: 25, width: 30, height: 15 }, // bottom region
        { x: 10, y: 10, width: 15, height: 15 }, // left region
      ];
      expect(cmath.rect.boolean.subtract(a, b)).toEqual(expected);
    });

    test("returns original rectangle when b has zero area", () => {
      const a = { x: 10, y: 10, width: 30, height: 30 };
      const b = { x: 20, y: 20, width: 0, height: 0 };
      expect(cmath.rect.boolean.subtract(a, b)).toEqual([a]);
    });

    test("returns original rectangle when rectangles only touch edges", () => {
      const a = { x: 10, y: 10, width: 30, height: 30 };
      // b touches a's right edge (x:40) exactly
      const b = { x: 40, y: 10, width: 20, height: 30 };
      expect(cmath.rect.boolean.subtract(a, b)).toEqual([a]);
    });
  });
});
