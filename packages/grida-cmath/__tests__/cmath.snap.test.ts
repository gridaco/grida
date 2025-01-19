import { cmath } from "..";

describe("cmath.snap", () => {
  describe("scalar", () => {
    it("should snap to the nearest scalar and return the distance", () => {
      const [snapped, distance] = cmath.snap.scalar(15, [10, 20, 25], 6);
      expect(snapped).toBe(10);
      expect(distance).toBe(5);
    });

    it("should return the original scalar and Infinity if no target is within the threshold", () => {
      const [snapped, distance] = cmath.snap.scalar(15, [1, 2, 3], 5);
      expect(snapped).toBe(15);
      expect(distance).toBe(Infinity);
    });

    it("should snap to the closest scalar when multiple are within the threshold", () => {
      const [snapped, distance] = cmath.snap.scalar(15, [14, 16, 18], 2);
      expect(snapped).toBe(14);
      expect(distance).toBe(1);
    });

    it("should return the exact match if it exists in the scalars", () => {
      const [snapped, distance] = cmath.snap.scalar(15, [10, 15, 20], 5);
      expect(snapped).toBe(15);
      expect(distance).toBe(0);
    });

    it("should handle negative scalars and thresholds", () => {
      const [snapped, distance] = cmath.snap.scalar(-5, [-10, -3, 0], 3);
      expect(snapped).toBe(-3);
      expect(distance).toBe(-2);
    });

    it("should handle scalars exactly at the threshold boundary", () => {
      const [snapped, distance] = cmath.snap.scalar(15, [20], 5);
      expect(snapped).toBe(20);
      expect(distance).toBe(-5);
    });

    it("should throw an error when the list of scalars is empty", () => {
      expect(() => {
        cmath.snap.scalar(15, [], 5);
      }).toThrow();
    });
  });

  describe("vector2", () => {
    test("snaps to the nearest vector within threshold", () => {
      const point: cmath.Vector2 = [5, 5];
      const targets: cmath.Vector2[] = [
        [0, 0], // distance ~7.07
        [10, 10], // distance ~7.07
        [6, 7], // distance ~2.24
      ];
      const threshold = 5;

      const [snappedPoint, distance, indices] = cmath.snap.vector2(
        point,
        targets,
        threshold
      );

      // We expect it to snap to [6, 7] since its distance (~2.24) is under threshold=5
      expect(snappedPoint).toEqual([6, 7]);
      expect(distance).toBeCloseTo(2.236, 3); // 3 decimal places
      expect(indices).toEqual([2]); // Only index 2 is within threshold
    });

    test("returns the original point if no target is within threshold", () => {
      const point: cmath.Vector2 = [5, 5];
      const targets: cmath.Vector2[] = [
        [10, 10], // distance ~7.07
        [20, 20], // distance ~21.21
      ];
      const threshold = 5; // smaller than either distance

      const [snappedPoint, distance, indices] = cmath.snap.vector2(
        point,
        targets,
        threshold
      );

      // None of the targets are within threshold=5
      expect(snappedPoint).toEqual([5, 5]);
      expect(distance).toBe(Infinity);
      expect(indices).toEqual([]);
    });

    test("handles exact matching of a vector in targets", () => {
      const point: cmath.Vector2 = [5, 5];
      const targets: cmath.Vector2[] = [
        [0, 0],
        [5, 5], // exact match
        [10, 10],
      ];
      const threshold = 10;

      const [snappedPoint, distance, indices] = cmath.snap.vector2(
        point,
        targets,
        threshold
      );

      // Snaps to the exact match => distance=0, index=1
      expect(snappedPoint).toEqual([5, 5]);
      expect(distance).toBe(0);
      expect(indices).toEqual([1]);
    });

    test("handles multiple vectors within threshold and picks the closest", () => {
      const point: cmath.Vector2 = [5, 5];
      const targets: cmath.Vector2[] = [
        [7, 7], // distance ~2.83
        [9, 5], // distance = 4
        [4, 8], // distance ~3.16
        [10, 10], // distance ~7.07
      ];
      const threshold = 5; // Enough to include [7,7], [9,5], [4,8]

      const [snappedPoint, distance, indices] = cmath.snap.vector2(
        point,
        targets,
        threshold
      );

      // The nearest among [7,7], [9,5], [4,8] is [7,7] with ~2.83
      expect(snappedPoint).toEqual([7, 7]);
      expect(distance).toBeCloseTo(2.828, 3);
      expect(indices).toEqual([0]);
    });

    test("handles threshold = 0 (requires exact match)", () => {
      const point: cmath.Vector2 = [5, 5];
      const targets: cmath.Vector2[] = [
        [5, 6],
        [3, 5],
        [5, 5], // Only this is an exact match
        [10, 5],
      ];
      const threshold = 0;

      const [snappedPoint, distance, indices] = cmath.snap.vector2(
        point,
        targets,
        threshold
      );

      expect(snappedPoint).toEqual([5, 5]);
      expect(distance).toBe(0);
      expect(indices).toEqual([2]); // Only the exact match is included
    });

    test("throws error if threshold is negative", () => {
      const point: cmath.Vector2 = [5, 5];
      const targets: cmath.Vector2[] = [[10, 10]];
      const threshold = -1;

      expect(() => cmath.snap.vector2(point, targets, threshold)).toThrow(
        "Threshold must be a non-negative number."
      );
    });

    test("throws error if targets array is empty", () => {
      const point: cmath.Vector2 = [5, 5];
      const targets: cmath.Vector2[] = [];

      expect(() => cmath.snap.vector2(point, targets, 10)).toThrow(
        "At least one target is required."
      );
    });
  });

  // describe("axisAligned", () => {
  //   it("should snap to the nearest point within the threshold for both axes", () => {
  //     const point: cmath.Vector2 = [12, 15];
  //     const points: cmath.Vector2[] = [
  //       [10, 14],
  //       [12, 14],
  //       [20, 20],
  //     ];
  //     const threshold: cmath.Vector2 = [2, 2];

  //     const [snappedPoint] = cmath.snap.axisAligned(point, points, threshold);
  //     expect(snappedPoint).toEqual([12, 14]);
  //   });

  //   it("should return the original point if no points are within the threshold", () => {
  //     const point: cmath.Vector2 = [12, 15];
  //     const points: cmath.Vector2[] = [
  //       [10, 10],
  //       [20, 20],
  //     ];
  //     const threshold: cmath.Vector2 = [1, 1];

  //     const [snappedPoint] = cmath.snap.axisAligned(point, points, threshold);
  //     expect(snappedPoint).toEqual(point);
  //   });

  //   it("should snap independently for x and y axes", () => {
  //     const point: cmath.Vector2 = [12, 15];
  //     const points: cmath.Vector2[] = [
  //       [12, 14],
  //       [13, 15],
  //     ];
  //     const threshold: cmath.Vector2 = [2, 2];

  //     const [snappedPoint] = cmath.snap.axisAligned(point, points, threshold);
  //     expect(snappedPoint).toEqual([12, 15]);
  //   });

  //   it("should snap to a point with exact match", () => {
  //     const point: cmath.Vector2 = [12, 15];
  //     const points: cmath.Vector2[] = [
  //       [12, 15],
  //       [10, 14],
  //       [20, 20],
  //     ];
  //     const threshold: cmath.Vector2 = [5, 5];

  //     const [snappedPoint] = cmath.snap.axisAligned(point, points, threshold);
  //     expect(snappedPoint).toEqual([12, 15]);
  //   });

  //   it("should handle negative coordinates", () => {
  //     const point: cmath.Vector2 = [-10, -15];
  //     const points: cmath.Vector2[] = [
  //       [-10, -14], // Snap y
  //       [-12, -15], // Snap x
  //     ];
  //     const threshold: cmath.Vector2 = [2, 2];

  //     const [snappedPoint] = cmath.snap.axisAligned(point, points, threshold);
  //     expect(snappedPoint).toEqual([-10, -15]);
  //   });

  //   it("should not snap if the threshold for any axis is 0", () => {
  //     const point: cmath.Vector2 = [12, 15];
  //     const points: cmath.Vector2[] = [
  //       [12, 14],
  //       [13, 15],
  //     ];
  //     const threshold: cmath.Vector2 = [0, 0];

  //     const [snappedPoint] = cmath.snap.axisAligned(point, points, threshold);
  //     expect(snappedPoint).toEqual(point);
  //   });

  //   it("should handle an empty list of points", () => {
  //     const point: cmath.Vector2 = [12, 15];
  //     const points: cmath.Vector2[] = [];
  //     const threshold: cmath.Vector2 = [2, 2];

  //     const [snappedPoint] = cmath.snap.axisAligned(point, points, threshold);
  //     expect(snappedPoint).toEqual(point);
  //   });

  //   it("should snap correctly for points exactly at the threshold boundary", () => {
  //     const point: cmath.Vector2 = [12, 15];
  //     const points: cmath.Vector2[] = [
  //       [14, 15], // x-axis threshold match
  //       [12, 17], // y-axis threshold match
  //     ];
  //     const threshold: cmath.Vector2 = [2, 2];

  //     const [snappedPointX] = cmath.snap.axisAligned(
  //       point,
  //       [points[0]],
  //       threshold
  //     );
  //     const [snappedPointY] = cmath.snap.axisAligned(
  //       point,
  //       [points[1]],
  //       threshold
  //     );

  //     expect(snappedPointX).toEqual([14, 15]);
  //     expect(snappedPointY).toEqual([12, 17]);
  //   });
  // });
});
