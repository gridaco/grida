import { cmath } from "..";

const sortnum = (a: number, b: number) => a - b;

describe("snap.spacing.projection", () => {
  it("should calculate projections for non-overlapping ranges", () => {
    const ranges: cmath.Range[] = [
      [0, 10],
      [20, 30],
    ];

    const result = cmath.ext.snap.spacing.repeatRangeProjections(ranges);

    expect(result.a.flat()).toEqual([40]); // Projection based on b2 + space
    expect(result.b.flat()).toEqual([-10]); // Projection based on a1 - space
  });

  it("should return empty projections for overlapping ranges", () => {
    const ranges: cmath.Range[] = [
      [0, 10],
      [5, 15],
    ];

    const result = cmath.ext.snap.spacing.repeatRangeProjections(ranges);

    expect(result.a.flat()).toEqual([]); // No valid projections
    expect(result.b.flat()).toEqual([]); // No valid projections
  });

  it("should handle multiple non-overlapping ranges", () => {
    const ranges: cmath.Range[] = [
      [0, 10], // 1
      [20, 30], // 2
      [40, 50], // 3
    ];

    const result = cmath.ext.snap.spacing.repeatRangeProjections(ranges);

    expect(result.a).toEqual([
      [40], // 1_2
      [80], // 1_3
      [60], // 2_3
    ]);
    expect(result.b.flat().sort(sortnum)).toEqual([-30, -10, 10]);
  });

  it("should handle a single range (no combinations possible)", () => {
    const ranges: cmath.Range[] = [[0, 10]];

    const result = cmath.ext.snap.spacing.repeatRangeProjections(ranges);

    expect(result.a.flat()).toEqual([]); // No combinations possible
    expect(result.b.flat()).toEqual([]); // No combinations possible
  });

  it("should handle empty input", () => {
    const ranges: cmath.Range[] = [];

    const result = cmath.ext.snap.spacing.repeatRangeProjections(ranges);

    expect(result.a.flat()).toEqual([]);
    expect(result.b.flat()).toEqual([]);
  });

  it("should ignore invalid combinations (negative space)", () => {
    const ranges: cmath.Range[] = [
      [0, 10],
      [5, 15], // Overlapping range
      [20, 30],
    ];

    const result = cmath.ext.snap.spacing.repeatRangeProjections(ranges);

    expect(result.a.flat().sort(sortnum)).toEqual([35, 40]); // Only valid projection
    expect(result.b.flat().sort(sortnum)).toEqual([-10, 0]); // Only valid projection
  });

  it("should handle multiple ranges with 5 inputs", () => {
    const ranges: cmath.Range[] = [
      [0, 10], // First range
      [15, 25], // Second range
      [30, 40], // Third range
      [50, 60], // Fourth range
      [70, 80], // Fifth range
    ];

    const result = cmath.ext.snap.spacing.repeatRangeProjections(ranges);

    const sortnum = (a: number, b: number) => a - b;

    expect(result.a.flat().sort(sortnum)).toEqual([
      30, 45, 60, 70, 85, 90, 100, 110, 125, 140,
    ]);
    expect(result.b.flat().sort(sortnum)).toEqual([
      -60, -40, -30, -20, -10, -5, 0, 10, 20, 40,
    ]);
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
