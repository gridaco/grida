import assert from "assert";
import { cmath } from ".";

export type SnapResult = {
  value: cmath.Vector2[];
  distance: cmath.Vector2;
  anchors: { x: cmath.Vector2[]; y: cmath.Vector2[] };
};

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
): SnapResult {
  if (targets.length === 0)
    return {
      value: points,
      distance: [0, 0],
      anchors: { x: [], y: [] },
    };
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
    return {
      value: points,
      distance: [0, 0],
      anchors: { x: [], y: [] },
    };
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

  return {
    value: snappedPoints,
    distance: delta,
    anchors: { x: xAnchors, y: yAnchors },
  };
}

/**
 * Snaps an array of scalar points to the nearest target points within a specified threshold.
 *
 * @param points - An array of scalar points to snap.
 * @param targets - An array of existing scalar points to snap to.
 * @param threshold - The maximum allowed distance for snapping.
 * @returns The snapped points and the delta applied:
 *          - `value`: The translated points.
 *          - `distance`: The snapping delta applied to align the points.
 *          - `anchors`: The target points that were used for snapping.
 */
export function snap1D(
  points: number[],
  targets: number[],
  threshold: number
): {
  value: number[];
  distance: number;
  anchors: number[];
} {
  if (targets.length === 0) {
    return {
      value: points,
      distance: 0,
      anchors: [],
    };
  }

  if (threshold < 0) {
    throw new Error("Threshold must be a non-negative number.");
  }

  let minDelta = Infinity;
  let signedDelta = 0;
  const anchors: number[] = [];

  for (const point of points) {
    // Find the closest snapping target
    const [snap, delta] = cmath.snap.scalar(point, targets, threshold);
    const signedDeltaForPoint = snap - point;

    if (Math.abs(delta) <= threshold) {
      if (minDelta === Infinity || signedDeltaForPoint === signedDelta) {
        anchors.push(point); // Add the point as an anchor
        minDelta = delta; // Update minimum delta
        signedDelta = signedDeltaForPoint; // Update the snapping translation
      }
    }
  }

  // If no snapping occurs, return the original points
  if (minDelta === Infinity) {
    return {
      value: points,
      distance: 0,
      anchors: [],
    };
  }

  // Compute the final snapping delta
  const delta = minDelta === Infinity ? 0 : signedDelta;

  // Apply the delta to all points
  const snappedPoints = points.map((p) => p + delta);

  return {
    value: snappedPoints,
    distance: delta,
    anchors,
  };
}

export namespace snap {
  //

  /**
   * Namespace for spacing-related snapping and range calculations.
   *
   * This module provides utilities for working with 1D ranges, calculating spaces between them,
   * and projecting new ranges based on existing ones.
   *
   *
   * ```
   *                            1          2
   * range       |           [-----]    [-----]             |
   * space       |                 |----|                   |
   * projections |      |----|     |----|     |----|        |
   * targets     |      |             |            |        |
   * align       |     (b)           (c)          (a)       |
   * ```
   *
   * In above example, the new segment (range) `ab` have virtually 4 possible snap points to be evenly spaced.
   * - (a) point the `a` of the new segment can snap to.
   * - (b) point the `b` of the new segment can snap to.
   * - (c) point the `center` of the new segment can snap to. (if the ab is smaller than the space)
   *  - the sub-virtual `cb`, `ca` point will be calculated as new segment is determined.
   *  - (cb) `c - length / 2` point the `b` of the new segment can snap to. (if smaller than the space)
   *  - (ca) `c + length / 2` point the `a` of the new segment can snap to. (if smaller than the space)
   *
   * Additionally, in more than 2 segment cases, the space between certain combination can also be registered as a or b point.
   * For example,
   *
   * ```
   *                         1          2                   3
   * range       |        [-----]    [-----]             [-----]        |
   * space       |              |----|     |-------------|              |
   *             |               (1_2)          (2_3)                   |
   * projections |   |----|     |----|     |----|              |----|   |
   * reason      |   (1_2)      (1_2)      (1_2)               ^(1_2)   | // the ^(1_2) is applied to 3rd
   * ```
   *
   * This way, we can provide additional ux-friendly snapping points for the user.
   */
  export namespace spacing {
    /**
     * represents a 1D range. where a <= b
     *
     * - [a] start
     * - [b] end
     * - [length] b - a
     * - [center] (a + length / 2)
     */
    export type Range = [number, number];

    function lengthOf(range: Range): number {
      return range[1] - range[0];
    }

    function centerOf(range: Range): number {
      return range[0] + lengthOf(range) / 2;
    }

    function fromRectangles(rectangles: cmath.Rectangle[]) {
      //
      const x_ranges = rectangles.map((r) => [r.x, r.x + r.width] as Range);
      repeatedpoints(x_ranges);
    }

    /**
     * calculates the space between two ranges, returns a set of projections of the next range for each combination.
     *
     * @param segments
     *
     *
     * @remarks
     * - ignores the combination if overlaps (to ensure positive space)
     */
    export function repeatedpoints(segments: Range[]): {
      /**
       * combinations of segments (overlapping ignored)
       */
      combinations: [number, number][];
      /**
       * index-aligned spaces of each combination
       */
      spaces: number[];
      /**
       * index-aligned projections of `a` points
       */
      a: number[][];
      /**
       * index-aligned projections of `b` points
       */
      b: number[][];
      /**
       * index-aligned projections of `c` points
       */
      c: number[][];
    } {
      // map all possible 1:1 combination set (with index)
      const indexes = Array.from({ length: segments.length }, (_, i) => i);
      const indicies_combinations: [number, number][] = cmath
        .combinations(indexes, 2)
        // filter out the intersecting combination
        .filter(([i, j]) => {
          return !cmath.vector2.intersects(segments[i], segments[j]);
        })
        // Sort the combinations based on segment starting positions
        .map(([i, j]) =>
          // sort the segments by `a`
          [i, j].sort((a, b) => segments[a][0] - segments[b][0])
        ) as [number, number][];

      // spaces of each combination
      const spaces: number[] = [];
      for (const [i, j] of indicies_combinations) {
        const [a1, b1] = segments[i];
        const [a2, b2] = segments[j];

        // calculate the space between the two ranges
        const space = a2 - b1;

        spaces.push(space);
      }

      const a: number[][] = [];
      const b: number[][] = [];
      const c: number[][] = [];

      for (const [i, j] of indicies_combinations) {
        const [a1, b1] = segments[i];
        const [a2, b2] = segments[j];

        // calculate the space between the two ranges
        const space = a2 - b1;

        const pa = b2 + space;
        const pb = a1 - space;
        const pc = b1 + space / 2;

        const _a = new Set<number>();
        const _b = new Set<number>();
        const _c = new Set<number>();

        _a.add(pa);
        _b.add(pb);
        _c.add(pc);

        // TODO: apply space that is only to the same direction (need extra query)
        // // extended space (from others)
        // for (const space of spaces) {
        //   _a.add(b2 + space);
        //   _b.add(a1 - space);
        // }

        a.push(Array.from(_a));
        b.push(Array.from(_b));
        c.push(Array.from(_c));
      }

      return {
        combinations: indicies_combinations,
        spaces,
        a,
        b,
        c,
      };
    }
  }
}
