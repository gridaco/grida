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
  const xTargets = targets
    .map(([x]) => x)
    .filter((x): x is number => x !== null);
  const yTargets = targets
    .map(([_, y]) => y)
    .filter((y): y is number => y !== null);

  // Separate the scalar points for each axis
  const xPoints = points.map(([x]) => x);
  const yPoints = points.map(([_, y]) => y);

  // Snap each axis using snap1D
  const xSnap = snap1D(xPoints, xTargets, threshold[0], epsilon);
  const ySnap = snap1D(yPoints, yTargets, threshold[1], epsilon);

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

/**
 * Snaps an array of scalar points to the nearest target points within a specified threshold.
 *
 * @param origins - An array of scalar points to snap.
 * @param targets - An array of existing scalar points to snap to.
 * @param threshold - The maximum allowed distance for snapping.
 * @param epsilon - The tolerance for delta matching.
 * @returns An object containing:
 *          - `translated`: The snapped points.
 *          - `distance`: The delta applied.
 *          - `snapped_origin_indicies`: Indices of origins that were snapped.
 *          - `snapped_target_indicies`: Indices of targets that were snapped to.
 */
export function snap1D(
  origins: number[],
  targets: number[],
  threshold: number,
  epsilon = 0
): {
  translated: number[];
  distance: number;
  snapped_origin_indicies: number[];
  snapped_target_indicies: number[];
} {
  if (targets.length === 0) {
    return {
      translated: origins,
      distance: 0,
      snapped_origin_indicies: [],
      snapped_target_indicies: [],
    };
  }

  assert(threshold >= 0, "Threshold must be a non-negative number.");
  assert(epsilon >= 0, "Epsilon must be a non-negative number.");

  let minDelta = Infinity;
  let signedDelta = 0;
  const snapped_origin_indicies: number[] = [];
  const snapped_target_indicies = new Set<number>();

  // Iterate through each origin to find the minimal delta
  for (let i = 0; i < origins.length; i++) {
    const point = origins[i];
    // Find the closest snapping target
    const [snap, delta, indicies] = cmath.snap.scalar(
      point,
      targets,
      threshold
    );

    const signedDeltaForPoint = snap - point;

    if (Math.abs(delta) <= threshold) {
      if (
        minDelta === Infinity ||
        Math.abs(signedDeltaForPoint - signedDelta) <= epsilon
      ) {
        snapped_origin_indicies.push(i);
        indicies.forEach((idx) => snapped_target_indicies.add(idx));

        // Update minDelta and signedDelta if a smaller delta is found
        if (Math.abs(delta) < Math.abs(minDelta)) {
          minDelta = delta;
          signedDelta = signedDeltaForPoint;
        }
      }
    }
  }

  // If no snapping occurs, return the original points
  if (minDelta === Infinity) {
    return {
      translated: origins,
      distance: 0,
      snapped_origin_indicies: [],
      snapped_target_indicies: [],
    };
  }

  // Compute the final snapping delta
  const delta = signedDelta;

  // Apply the delta to all points
  const translated = origins.map((p) => p + delta);

  return {
    translated,
    distance: delta,
    snapped_origin_indicies,
    snapped_target_indicies: Array.from(snapped_target_indicies),
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
