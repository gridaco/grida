describe("snap", () => {
  it("noop", () => {
    expect(true).toBe(true);
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
