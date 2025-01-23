import assert from "assert";
import { cmath } from ".";

export type SnapResult = {
  value: cmath.Vector2[];
  distance: cmath.Vector2;
  anchors: { x: cmath.Vector2[]; y: cmath.Vector2[] };
};

/**
 * A Vector2 that can take null values for each axis.
 *
 * This is for representing snap points that is infinity (or ignore) in counter axis.
 *
 * E.g. for 2D snapping, but where each axis are snapped independently.
 */
export type AxisAlignedSnapPoint =
  | [number, number]
  | [number, null]
  | [null, number];

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
export function snap2DAxisAligned(
  points: cmath.Vector2[],
  targets: AxisAlignedSnapPoint[],
  threshold: cmath.Vector2,
  epsilon = 0
): SnapResult {
  if (targets.length === 0) {
    return {
      value: points,
      distance: [0, 0],
      anchors: { x: [], y: [] },
    };
  }

  assert(threshold[0] >= 0, "Threshold must be a non-negative number.");
  assert(threshold[1] >= 0, "Threshold must be a non-negative number.");

  // Separate target points into x and y components
  const xTargets = targets.map(([x]) => x).filter((x) => x !== null);
  const yTargets = targets.map(([_, y]) => y).filter((y) => y !== null);

  // Separate the scalar points for each axis
  const xPoints = points.map(([x]) => x);
  const yPoints = points.map(([_, y]) => y);

  // Snap each axis using snap1D
  const xSnap = cmath.ext.snap.snap1D(xPoints, xTargets, threshold[0], epsilon);
  const ySnap = cmath.ext.snap.snap1D(yPoints, yTargets, threshold[1], epsilon);

  // Determine the final delta for each axis
  const deltaX = xSnap.distance;
  const deltaY = ySnap.distance;

  const xAnchors = xSnap.snapped_origin_indicies.map((i) => points[i]);
  const yAnchors = ySnap.snapped_origin_indicies.map((i) => points[i]);

  // Apply translation to all points
  const snappedPoints: cmath.Vector2[] = points.map(([x, y]) => [
    x + deltaX,
    y + deltaY,
  ]);

  return {
    value: snappedPoints,
    distance: [deltaX, deltaY],
    anchors: {
      x: xAnchors,
      y: yAnchors,
    },
  };
}

export namespace snap {
  //
}
