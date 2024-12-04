import { cmath } from "./math";

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
