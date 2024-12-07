import assert from "assert";
import { cmath } from ".";
/**
 * Snaps an array of points to the nearest target point while maintaining relative positions.
 * The entire set of points is translated to align with the nearest target.
 *
 * @param points - An array of 2D points (Vector2) to snap.
 * @param targets - An array of existing 2D points to snap to.
 * @param threshold - The maximum allowed single-axis distance for snapping.
 * @returns The snapped points and the translation applied:
 *          - `value`: The translated points.
 *          - `distance`: The distance vector to the nearest target.
 */
/**
 * Snaps an array of points to the nearest target point along each axis independently.
 * The snapping delta is computed for each axis separately and applied to all points.
 *
 * @param points - An array of 2D points (Vector2) to snap.
 * @param targets - An array of existing 2D points to snap to.
 * @param threshold - The maximum allowed single-axis distance for snapping.
 * @returns The snapped points and the delta applied:
 *          - `value`: The translated points.
 *          - `distance`: The delta vector applied to align the points.
 */
export function axisAligned(
  points: cmath.Vector2[],
  targets: cmath.Vector2[],
  threshold: cmath.Vector2
): [
  value: cmath.Vector2[],
  distance: cmath.Vector2,
  anchors: { x: cmath.Vector2[]; y: cmath.Vector2[] },
] {
  if (targets.length === 0) return [points, [0, 0], { x: [], y: [] }];
  assert(threshold[0] >= 0, "Threshold must be a non-negative number.");
  assert(threshold[1] >= 0, "Threshold must be a non-negative number.");

  // Separate target points into x and y components
  const targetXs = targets.map(([x]) => x);
  const targetYs = targets.map(([_, y]) => y);

  // Initialize variables to store anchors and deltas
  const xAnchors: cmath.Vector2[] = [];
  const yAnchors: cmath.Vector2[] = [];
  let minDeltaX = Infinity;
  let minDeltaY = Infinity;
  let signedDeltaX = 0;
  let signedDeltaY = 0;

  // Find the closest snapping target and determine anchors for X and Y axes
  for (const point of points) {
    // Find the closest snapping target for X-axis
    const [snapX, deltaX] = cmath.snap.scalar(point[0], targetXs, threshold[0]);
    const signedDeltaForX = snapX - point[0];

    if (Math.abs(deltaX) <= threshold[0]) {
      if (minDeltaX === Infinity || signedDeltaForX === signedDeltaX) {
        xAnchors.push(point); // Add points with identical deltas
        minDeltaX = deltaX; // Keep track of the smallest delta
        signedDeltaX = signedDeltaForX; // Track the snapping translation
      }
    }

    // Find the closest snapping target for Y-axis
    const [snapY, deltaY] = cmath.snap.scalar(point[1], targetYs, threshold[1]);
    const signedDeltaForY = snapY - point[1];

    if (Math.abs(deltaY) <= threshold[1]) {
      if (minDeltaY === Infinity || signedDeltaForY === signedDeltaY) {
        yAnchors.push(point); // Add points with identical deltas
        minDeltaY = deltaY; // Keep track of the smallest delta
        signedDeltaY = signedDeltaForY; // Track the snapping translation
      }
    }
  }

  // If no snapping occurs, return original points
  if (minDeltaX === Infinity && minDeltaY === Infinity) {
    return [points, [0, 0], { x: [], y: [] }];
  }

  // Compute the final translation delta (signed values)
  const delta: cmath.Vector2 = [
    minDeltaX === Infinity ? 0 : signedDeltaX,
    minDeltaY === Infinity ? 0 : signedDeltaY,
  ];

  // Apply translation to all points
  const snappedPoints: cmath.Vector2[] = points.map(([x, y]) => [
    x + delta[0],
    y + delta[1],
  ]);

  return [snappedPoints, delta, { x: xAnchors, y: yAnchors }];
}
