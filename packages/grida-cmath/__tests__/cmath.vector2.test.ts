import { cmath } from "..";

describe("cmath.vector2", () => {
  describe("add", () => {
    it("should correctly add multiple vectors", () => {
      const v1: cmath.Vector2 = [1, 2];
      const v2: cmath.Vector2 = [3, 4];
      const v3: cmath.Vector2 = [-1, -1];

      const result = cmath.vector2.add(v1, v2, v3);

      expect(result).toEqual([3, 5]); // Expected result: [3, 5]
    });

    it("should return [0, 0] for no input vectors", () => {
      const result = cmath.vector2.add();

      expect(result).toEqual([0, 0]); // Expected result: [0, 0]
    });
  });

  describe("sub", () => {
    it("should correctly subtract one vector from another", () => {
      const v1: cmath.Vector2 = [5, 7];
      const v2: cmath.Vector2 = [2, 3];

      const result = cmath.vector2.sub(v1, v2);

      expect(result).toEqual([3, 4]); // Expected result: [3, 4]
    });

    it("should handle negative results", () => {
      const v1: cmath.Vector2 = [2, 3];
      const v2: cmath.Vector2 = [5, 7];

      const result = cmath.vector2.sub(v1, v2);

      expect(result).toEqual([-3, -4]); // Expected result: [-3, -4]
    });
  });

  describe("multiply", () => {
    it("should correctly multiply two vectors element-wise", () => {
      const v1: cmath.Vector2 = [2, 3];
      const v2: cmath.Vector2 = [4, 5];

      const result = cmath.vector2.multiply(v1, v2);

      expect(result).toEqual([8, 15]); // Expected result: [8, 15]
    });

    it("should return [0, 0] when one vector is [0, 0]", () => {
      const v1: cmath.Vector2 = [2, 3];
      const v2: cmath.Vector2 = [0, 0];

      const result = cmath.vector2.multiply(v1, v2);

      expect(result).toEqual([0, 0]); // Expected result: [0, 0]
    });
  });

  describe("angle", () => {
    it("should calculate the angle for a point in the first quadrant", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [1, 1];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(45); // Expected angle: 45 degrees
    });

    it("should calculate the angle for a point in the second quadrant", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [-1, 1];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(135); // Expected angle: 135 degrees
    });

    it("should calculate the angle for a point in the third quadrant", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [-1, -1];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(225); // Expected angle: 225 degrees
    });

    it("should calculate the angle for a point in the fourth quadrant", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [1, -1];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(315); // Expected angle: 315 degrees
    });

    it("should calculate the angle for a point on the positive x-axis", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [1, 0];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(0); // Expected angle: 0 degrees
    });

    it("should calculate the angle for a point on the negative x-axis", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [-1, 0];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(180); // Expected angle: 180 degrees
    });

    it("should calculate the angle for a point on the positive y-axis", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [0, 1];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(90); // Expected angle: 90 degrees
    });

    it("should calculate the angle for a point on the negative y-axis", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [0, -1];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(270); // Expected angle: 270 degrees
    });

    it("should return 0 for the origin point", () => {
      const origin: cmath.Vector2 = [0, 0];
      const point: cmath.Vector2 = [0, 0];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(0); // Expected angle: 0 degrees
    });

    it("should calculate the angle for a non-origin origin point", () => {
      const origin: cmath.Vector2 = [1, 1];
      const point: cmath.Vector2 = [2, 2];

      const angle = cmath.vector2.angle(origin, point);

      expect(angle).toBeCloseTo(45); // Expected angle: 45 degrees relative to new origin
    });
  });

  describe("intersects", () => {
    it("should return true for overlapping segments", () => {
      const segmentA: cmath.Vector2 = [1, 5];
      const segmentB: cmath.Vector2 = [4, 8];

      const result = cmath.vector2.intersects(segmentA, segmentB);

      expect(result).toBe(true); // Expected: true
    });

    it("should return true for touching segments", () => {
      const segmentA: cmath.Vector2 = [1, 5];
      const segmentB: cmath.Vector2 = [5, 10];

      const result = cmath.vector2.intersects(segmentA, segmentB);

      expect(result).toBe(true); // Expected: true
    });

    it("should return false for non-overlapping segments", () => {
      const segmentA: cmath.Vector2 = [1, 5];
      const segmentB: cmath.Vector2 = [6, 10];

      const result = cmath.vector2.intersects(segmentA, segmentB);

      expect(result).toBe(false); // Expected: false
    });

    it("should return true for segments with zero-length that overlap", () => {
      const segmentA: cmath.Vector2 = [3, 3];
      const segmentB: cmath.Vector2 = [3, 5];

      const result = cmath.vector2.intersects(segmentA, segmentB);

      expect(result).toBe(true); // Expected: true
    });

    it("should return false for zero-length segments that do not overlap", () => {
      const segmentA: cmath.Vector2 = [3, 3];
      const segmentB: cmath.Vector2 = [4, 4];

      const result = cmath.vector2.intersects(segmentA, segmentB);

      expect(result).toBe(false); // Expected: false
    });
  });

  describe("intersection", () => {
    it("should return the intersecting segment for overlapping segments", () => {
      const segmentA: cmath.Vector2 = [1, 5];
      const segmentB: cmath.Vector2 = [3, 7];

      const result = cmath.vector2.intersection(segmentA, segmentB);

      expect(result).toEqual([3, 5]); // Expected: [3, 5]
    });

    it("should return the intersecting segment for fully contained segments", () => {
      const segmentA: cmath.Vector2 = [2, 6];
      const segmentB: cmath.Vector2 = [3, 5];

      const result = cmath.vector2.intersection(segmentA, segmentB);

      expect(result).toEqual([3, 5]); // Expected: [3, 5]
    });

    it("should return the intersecting segment for touching segments", () => {
      const segmentA: cmath.Vector2 = [1, 5];
      const segmentB: cmath.Vector2 = [5, 10];

      const result = cmath.vector2.intersection(segmentA, segmentB);

      expect(result).toEqual([5, 5]); // Expected: [5, 5]
    });

    it("should return null for non-overlapping segments", () => {
      const segmentA: cmath.Vector2 = [1, 5];
      const segmentB: cmath.Vector2 = [6, 10];

      const result = cmath.vector2.intersection(segmentA, segmentB);

      expect(result).toBeNull(); // Expected: null
    });

    it("should handle zero-length segments that overlap", () => {
      const segmentA: cmath.Vector2 = [3, 3];
      const segmentB: cmath.Vector2 = [3, 5];

      const result = cmath.vector2.intersection(segmentA, segmentB);

      expect(result).toEqual([3, 3]); // Expected: [3, 3]
    });

    it("should return null for zero-length segments that do not overlap", () => {
      const segmentA: cmath.Vector2 = [3, 3];
      const segmentB: cmath.Vector2 = [4, 4];

      const result = cmath.vector2.intersection(segmentA, segmentB);

      expect(result).toBeNull(); // Expected: null
    });

    it("should return the segment itself when two segments are identical", () => {
      const segmentA: cmath.Vector2 = [1, 5];
      const segmentB: cmath.Vector2 = [1, 5];

      const result = cmath.vector2.intersection(segmentA, segmentB);

      expect(result).toEqual([1, 5]); // Expected: [1, 5]
    });

    it("should return null for segments in reverse order that do not overlap", () => {
      const segmentA: cmath.Vector2 = [6, 10];
      const segmentB: cmath.Vector2 = [1, 5];

      const result = cmath.vector2.intersection(segmentA, segmentB);

      expect(result).toBeNull(); // Expected: null
    });

    it("should handle segments where one is fully contained within the other", () => {
      const segmentA: cmath.Vector2 = [1, 10];
      const segmentB: cmath.Vector2 = [3, 7];

      const result = cmath.vector2.intersection(segmentA, segmentB);

      expect(result).toEqual([3, 7]); // Expected: [3, 7]
    });
  });
});
