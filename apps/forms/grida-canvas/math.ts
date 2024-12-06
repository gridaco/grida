import assert from "assert";

/**
 * A canvas math module.
 */
export namespace cmath {
  /**
   * Represents a single numerical value, often referred to as a scalar in mathematics and computer science.
   *
   * Scalars are used to denote quantities without direction, such as magnitude, intensity, or single-dimensional values.
   * They are fundamental in computations involving vectors, matrices, and transformations.
   *
   * @typedef Scalar
   *
   * @example
   * // A scalar value representing magnitude
   * const magnitude: cmath.Scalar = 5;
   *
   * @remarks
   * Scalars are essential for defining operations on higher-dimensional objects, such as scaling vectors or matrices.
   * They are typically implemented as `number` in most programming contexts.
   */
  export type Scalar = number;

  /**
   * A 2-dimensional vector. (commonly used for positions, sizes, etc.)
   */
  export type Vector2 = [number, number];

  /**
   * A Rectangle specifies an area that is enclosed by it’s top-left point (x, y), its width, and its height.
   *
   * width and height are non-negative values.
   */
  export type Rectangle = {
    x: number;
    y: number;
    /**
     * The width of the rectangle. Must be non-negative.
     */
    width: number;
    /**
     * The height of the rectangle. Must be non-negative.
     */
    height: number;
  };

  export type RectangleSide = "top" | "right" | "bottom" | "left";

  /**
   * Quantizes a value to the nearest multiple of a specified step.
   *
   * This function maps a continuous value to a discrete set of steps,
   * making it useful for rounding, grid alignment, or discretization in
   * mathematical and graphical computations.
   *
   * @param value - The value to quantize.
   * @param step - The step size for quantization. Must be a positive number.
   * @returns The quantized value, snapped to the nearest multiple of the step.
   *
   * @example
   * // Quantize to the nearest multiple of 10
   * cmath.quantize(15, 10); // Returns 20
   *
   * // Quantize to a decimal step size
   * cmath.quantize(0.1123, 0.1); // Returns 0.1
   *
   * // Quantize to a finer step
   * cmath.quantize(7.35, 0.25); // Returns 7.25
   */
  export function quantize(value: Scalar, step: number): Scalar {
    if (step <= 0) {
      throw new Error("Step size must be a positive number.");
    }
    // Invert step size to normalize the value.
    // This scaling ensures that 'value' is effectively measured in units of 'step'.
    // By multiplying 'value' by 'factor', we transform the range so that the rounding operation
    // works on a normalized integer-like scale (avoiding issues with small or fractional steps).
    // This is critical for consistent behavior when 'step' is a fractional value like 0.1 or 0.01.
    const factor = 1 / step;
    return Math.round(value * factor) / factor;
  }
}

/**
 * Vector2 computations.
 */
export namespace cmath.vector2 {
  export function add(...vectors: Vector2[]): Vector2 {
    return vectors.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [
      0, 0,
    ] as Vector2);
  }

  export function subtract(a: Vector2, b: Vector2): Vector2 {
    return [a[0] - b[0], a[1] - b[1]];
  }
}

export namespace cmath.rect {
  /**
   * Creates a rectangle that fully bounds the given points.
   *
   * This function computes the minimum bounding rectangle that encloses all the input points.
   * At least 2 points are required.
   *
   * @param points - An array of points (at least 2) to calculate the bounding rectangle.
   * @returns A rectangle with `x`, `y`, `width`, and `height`.
   *
   * @example
   * const rect = cmath.rect.fromPoints([[10, 20], [30, 40], [15, 25]]);
   * console.log(rect); // { x: 10, y: 20, width: 20, height: 20 }
   */
  export function fromPoints(points: cmath.Vector2[]): cmath.Rectangle {
    if (points.length < 2) {
      throw new Error(
        "At least two points are required to compute a bounding rectangle."
      );
    }

    // Calculate min and max for x and y
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    // Return normalized rectangle
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Returns an object containing 9 control points of a rectangle: 4 corners, 4 midpoints, and the center.
   *
   * @param rect - The rectangle to compute points from.
   * @returns An object with properties for each control point.
   *
   * @example
   * const rect = { x: 10, y: 20, width: 30, height: 40 };
   * const points = cmath.rect.to9Points(rect);
   * console.log(points);
   * // Outputs:
   * // {
   * //   topLeft: [10, 20],
   * //   topRight: [40, 20],
   * //   bottomLeft: [10, 60],
   * //   bottomRight: [40, 60],
   * //   topCenter: [25, 20],
   * //   leftCenter: [10, 40],
   * //   rightCenter: [40, 40],
   * //   bottomCenter: [25, 60],
   * //   center: [25, 40],
   * // }
   */
  export function to9Points(rect: Rectangle): {
    topLeft: Vector2;
    topRight: Vector2;
    bottomLeft: Vector2;
    bottomRight: Vector2;
    topCenter: Vector2;
    leftCenter: Vector2;
    rightCenter: Vector2;
    bottomCenter: Vector2;
    center: Vector2;
  } {
    const { x, y, width, height } = rect;

    // Compute the points
    return {
      topLeft: [x, y],
      topRight: [x + width, y],
      bottomLeft: [x, y + height],
      bottomRight: [x + width, y + height],
      topCenter: [x + width / 2, y],
      leftCenter: [x, y + height / 2],
      rightCenter: [x + width, y + height / 2],
      bottomCenter: [x + width / 2, y + height],
      center: [x + width / 2, y + height / 2],
    };
  }

  /**
   * Checks if rectangle `a` is fully contained within rectangle `b`.
   *
   * A rectangle `a` is considered contained within rectangle `b` if:
   * - The top-left corner of `a` lies within `b`.
   * - The bottom-right corner of `a` lies within `b`.
   *
   * @param a - The rectangle to test for containment.
   * @param b - The containing rectangle.
   * @returns `true` if rectangle `a` is fully contained within rectangle `b`, otherwise `false`.
   *
   * @example
   * const a = { x: 20, y: 20, width: 30, height: 30 };
   * const b = { x: 10, y: 10, width: 100, height: 100 };
   * cmath.rect.contains(a, b); // Returns true.
   */
  export function contains(a: Rectangle, b: Rectangle): boolean {
    const aRight = a.x + a.width;
    const aBottom = a.y + a.height;
    const bRight = b.x + b.width;
    const bBottom = b.y + b.height;

    return a.x >= b.x && a.y >= b.y && aRight <= bRight && aBottom <= bBottom;
  }

  /**
   * Checks if rectangle `a` intersects with rectangle `b`.
   *
   * Two rectangles are considered intersecting if they overlap, either partially or fully. Edges and corners touching
   * are also considered as an intersection.
   *
   * @param a - The first rectangle.
   * @param b - The second rectangle.
   * @returns `true` if rectangle `a` intersects with rectangle `b`, otherwise `false`.
   *
   * @example
   * const a = { x: 50, y: 50, width: 30, height: 30 };
   * const b = { x: 60, y: 60, width: 40, height: 40 };
   * cmath.rect.intersects(a, b); // Returns true.
   *
   * const c = { x: 0, y: 0, width: 20, height: 20 };
   * cmath.rect.intersects(a, c); // Returns false.
   */
  export function intersects(a: Rectangle, b: Rectangle): boolean {
    const aRight = a.x + a.width;
    const aBottom = a.y + a.height;
    const bRight = b.x + b.width;
    const bBottom = b.y + b.height;

    return !(
      (
        a.x > bRight || // `a` is to the right of `b`.
        a.y > bBottom || // `a` is below `b`.
        aRight < b.x || // `a` is to the left of `b`.
        aBottom < b.y
      ) // `a` is above `b`.
    );
  }

  /**
   * Calculates the intersection of two rectangles in the { x, y, width, height } format.
   *
   * @param a - The first rectangle.
   * @param b - The second rectangle.
   * @returns A new rectangle representing the intersection of the two rectangles.
   *          If the rectangles do not intersect, returns `null`.
   *
   * @example
   * const a = { x: 10, y: 10, width: 30, height: 30 };
   * const b = { x: 20, y: 20, width: 30, height: 30 };
   * const result = intersection(a, b);
   * console.log(result); // { x: 20, y: 20, width: 20, height: 20 }
   */
  export function intersection(
    a: cmath.Rectangle,
    b: cmath.Rectangle
  ): cmath.Rectangle | null {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);

    if (x2 <= x1 || y2 <= y1) {
      // No intersection
      return null;
    }

    return {
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
    };
  }

  /**
   * Computes the bounding rectangle that fully encloses an array of rectangles.
   *
   * @param rectangles - An array of rectangles to compute the bounding box for.
   * @returns A new rectangle that bounds all the input rectangles.
   *
   * @example
   * const rectangles = [
   *   { x: 10, y: 10, width: 30, height: 40 },
   *   { x: 50, y: 20, width: 20, height: 30 },
   * ];
   * const boundingRect = cmath.rect.getBoundingRect(rectangles);
   * console.log(boundingRect); // { x: 10, y: 10, width: 60, height: 50 }
   */
  export function getBoundingRect(rectangles: Rectangle[]): Rectangle {
    if (rectangles.length === 0) {
      throw new Error(
        "Cannot compute bounding rect for an empty array of rectangles."
      );
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const rect of rectangles) {
      // Update min and max for x and y
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    }

    // Return the bounding rectangle
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Aligns an array of rectangles along a specified axis and alignment type.
   *
   * @param rectangles - An array of rectangles to align.
   * @param alignment - The alignment type of each axis (horizontal and vertical).
   * @returns A new array of rectangles with updated positions.
   */
  export function align(
    rectangles: cmath.Rectangle[],
    alignment: {
      horizontal?: "none" | "min" | "max" | "center";
      vertical?: "none" | "min" | "max" | "center";
    }
  ): cmath.Rectangle[] {
    // Compute the bounding rectangle of all input rectangles
    const boundingRect = getBoundingRect(rectangles);

    return rectangles.map((rect) => {
      let newX = rect.x;
      let newY = rect.y;

      // Horizontal alignment
      if (alignment.horizontal) {
        switch (alignment.horizontal) {
          case "min": // Align to the left
            newX = boundingRect.x;
            break;
          case "max": // Align to the right
            newX = boundingRect.x + boundingRect.width - rect.width;
            break;
          case "center": // Align to the horizontal center
            newX = boundingRect.x + (boundingRect.width - rect.width) / 2;
            break;
        }
      }

      // Vertical alignment
      if (alignment.vertical) {
        switch (alignment.vertical) {
          case "min": // Align to the top
            newY = boundingRect.y;
            break;
          case "max": // Align to the bottom
            newY = boundingRect.y + boundingRect.height - rect.height;
            break;
          case "center": // Align to the vertical center
            newY = boundingRect.y + (boundingRect.height - rect.height) / 2;
            break;
        }
      }

      return {
        ...rect,
        x: newX,
        y: newY,
      };
    });
  }

  export function translate(rect: Rectangle, t: Vector2): Rectangle {
    return {
      x: rect.x + t[0],
      y: rect.y + t[1],
      width: rect.width,
      height: rect.height,
    };
  }

  /**
   * Rotates a rectangle and computes the bounding box of the rotated rectangle.
   *
   * @param rect - The rectangle to rotate.
   * @param rotate - The rotation angle in degrees (similar to CSS rotate).
   * @returns A new rectangle representing the axis-aligned bounding box of the rotated rectangle.
   *
   * @example
   * const rect = { x: 10, y: 10, width: 50, height: 30 };
   * const rotated = cmath.rect.rotate(rect, 45);
   * console.log(rotated); // { x: 3.03, y: -7.32, width: 70.71, height: 56.57 }
   */
  export function rotate(rect: Rectangle, rotate: number): Rectangle {
    const radians = (rotate * Math.PI) / 180; // Convert degrees to radians

    // Calculate the center of the rectangle
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;

    // Get the corners of the rectangle relative to the center
    const corners: Vector2[] = [
      [rect.x - centerX, rect.y - centerY], // Top-left
      [rect.x + rect.width - centerX, rect.y - centerY], // Top-right
      [rect.x + rect.width - centerX, rect.y + rect.height - centerY], // Bottom-right
      [rect.x - centerX, rect.y + rect.height - centerY], // Bottom-left
    ];

    // Rotate each corner and compute their new positions
    const rotatedCorners = corners.map(([x, y]) => {
      const rotatedX = x * Math.cos(radians) - y * Math.sin(radians);
      const rotatedY = x * Math.sin(radians) + y * Math.cos(radians);
      return [rotatedX + centerX, rotatedY + centerY] as Vector2; // Translate back to the original center
    });

    // Compute the bounding box for the rotated corners
    const minX = Math.min(...rotatedCorners.map(([x]) => x));
    const minY = Math.min(...rotatedCorners.map(([_, y]) => y));
    const maxX = Math.max(...rotatedCorners.map(([x]) => x));
    const maxY = Math.max(...rotatedCorners.map(([_, y]) => y));

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}

/**
 * Math utilities for "snapping" features.
 *
 * @example
 * - snap to pixel grid - snap by `1`
 * - snap to objects
 */
export namespace cmath.snap {
  /**
   * Snaps a scalar value to the nearest value in an array of scalars if it is within a specified threshold.
   *
   * This function is useful for aligning scalar values (e.g., positions, sizes, or grid snapping) to a discrete set of
   * target values while ensuring the snap occurs only within a defined threshold.
   *
   * @param point - The scalar value to snap.
   * @param targets - An array of existing scalar values to snap to.
   * @param threshold - The maximum allowed distance for snapping. Must be non-negative.
   *
   * @returns A tuple `[value, distance, indicies]`:
   * - `value`: The closest scalar value from the targets within the threshold, or the original scalar if no snapping occurs.
   * - `distance`: The signed distance between the input scalar and the snapped target. Returns `Infinity` if no target is within the threshold.
   * - `indicies`: An array of indices of the targets that are within the threshold.
   *
   * @example
   * // Snap to the nearest value within a threshold
   * const [snapped, distance, indicies] = cmath.snap.scalar(15, [10, 20, 25], 6);
   * console.log(snapped); // 10
   * console.log(distance); // 5
   * console.log(indicies); // [0]
   *
   * // No snapping occurs as no target is within the threshold
   * const [snapped, distance, indicies] = cmath.snap.scalar(15, [1, 2, 3], 5);
   * console.log(snapped); // 15
   * console.log(distance); // Infinity
   * console.log(indicies); // []
   *
   * // Snap to an exact match if it exists in the targets
   * const [snapped, distance, indicies] = cmath.snap.scalar(15, [10, 15, 20], 5);
   * console.log(snapped); // 15
   * console.log(distance); // 0
   * console.log(indicies); // [1]
   *
   * @remarks
   * - The `distance` value is signed, indicating the direction of the difference between the input scalar and the snapped value.
   * - If `targets` is empty, the function returns the original scalar and `Infinity` for the distance.
   * - If `threshold` is 0, snapping will only occur for exact matches.
   * - Negative threshold values are not allowed and will throw an error.
   */
  export function scalar(
    point: Scalar,
    targets: Scalar[],
    threshold: number
  ): [value: Scalar, distance: number, indicies: number[]] {
    assert(threshold >= 0, "Threshold must be a non-negative number.");
    if (targets.length === 0) return [point, Infinity, []];

    let nearest: cmath.Scalar | null = null;
    let min_d = Infinity;
    let signedDistance = 0;
    const indicies: number[] = [];

    let i = 0;
    for (const target of targets) {
      const distance = point - target; // Signed distance
      const absDistance = Math.abs(distance); // Absolute distance for comparison

      if (absDistance <= threshold) {
        indicies.push(i);
        if (absDistance < min_d) {
          min_d = absDistance;
          nearest = target;
          signedDistance = distance; // Keep the signed distance
        }
      }
      i++;
    }

    return nearest !== null
      ? [nearest, signedDistance, indicies]
      : [point, Infinity, indicies];
  }

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
    points: Vector2[],
    targets: Vector2[],
    threshold: Vector2
  ): [
    value: Vector2[],
    distance: Vector2,
    anchors: { x: Vector2[]; y: Vector2[] },
  ] {
    if (targets.length === 0) return [points, [0, 0], { x: [], y: [] }];
    assert(threshold[0] >= 0, "Threshold must be a non-negative number.");
    assert(threshold[1] >= 0, "Threshold must be a non-negative number.");

    // Separate target points into x and y components
    const targetXs = targets.map(([x]) => x);
    const targetYs = targets.map(([_, y]) => y);

    // Initialize variables to store anchors and deltas
    const xAnchors: Vector2[] = [];
    const yAnchors: Vector2[] = [];
    let minDeltaX = Infinity;
    let minDeltaY = Infinity;
    let signedDeltaX = 0;
    let signedDeltaY = 0;

    // Find the closest snapping target and determine anchors for X and Y axes
    for (const point of points) {
      // Find the closest snapping target for X-axis
      const [snapX, deltaX] = cmath.snap.scalar(
        point[0],
        targetXs,
        threshold[0]
      );
      const signedDeltaForX = snapX - point[0];

      if (Math.abs(deltaX) <= threshold[0]) {
        if (minDeltaX === Infinity || signedDeltaForX === signedDeltaX) {
          xAnchors.push(point); // Add points with identical deltas
          minDeltaX = deltaX; // Keep track of the smallest delta
          signedDeltaX = signedDeltaForX; // Track the snapping translation
        }
      }

      // Find the closest snapping target for Y-axis
      const [snapY, deltaY] = cmath.snap.scalar(
        point[1],
        targetYs,
        threshold[1]
      );
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
    const delta: Vector2 = [
      minDeltaX === Infinity ? 0 : signedDeltaX,
      minDeltaY === Infinity ? 0 : signedDeltaY,
    ];

    // Apply translation to all points
    const snappedPoints: Vector2[] = points.map(([x, y]) => [
      x + delta[0],
      y + delta[1],
    ]);

    return [snappedPoints, delta, { x: xAnchors, y: yAnchors }];
  }
}

export namespace cmath.measure {
  //
}
