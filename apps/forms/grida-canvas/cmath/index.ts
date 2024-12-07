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

  /**
   * Finds the nearest value to a given number from a list of target numbers.
   *
   * This function calculates the absolute difference between the given value and each target,
   * and returns the target with the smallest difference.
   *
   * @param value - The reference number to which the nearest target is determined.
   * @param points - A list of numbers to compare against the reference number.
   * @returns The number from the list of targets that is closest to the given value.
   *          If the list is empty, `Infinity` is returned.
   *
   * @example
   * const nearestValue = nearest(10, 3, 7, 15, 20);
   * console.log(nearestValue); // Outputs: 7
   *
   * const nearestValueEmpty = nearest(10);
   * console.log(nearestValueEmpty); // Outputs: Infinity
   *
   * @remarks
   * If multiple targets have the same absolute difference to the given value, the first
   * one encountered in the list will be returned.
   */
  export function nearest(value: Scalar, ...points: Scalar[]): Scalar {
    return Math.min(...points.map((t) => Math.abs(t - value)));
  }

  /**
   * Converts an angle to its principal angle within the range [-180, 180).
   *
   * A principal angle is the equivalent angle that falls within a standard range.
   * This function ensures the input angle is normalized to the range [-180, 180),
   * where negative values represent clockwise rotation and positive values represent counterclockwise rotation.
   *
   * @param angle - The input angle in degrees, which can be any value (positive, negative, or greater than 360).
   * @returns The equivalent principal angle within the range [-180, 180).
   *
   * @example
   * // Normalize angles greater than 180 degrees
   * const angle1 = toPrincipalAngle(270); // Returns -90
   *
   * @example
   * // Normalize angles less than -180 degrees
   * const angle2 = toPrincipalAngle(-450); // Returns -90
   *
   * @example
   * // Handle angles within the range [-180, 180)
   * const angle3 = toPrincipalAngle(45); // Returns 45
   *
   * @example
   * // Normalize angles greater than 360 degrees
   * const angle4 = toPrincipalAngle(540); // Returns 180
   *
   * @remarks
   * - Uses modular arithmetic to ensure the angle is wrapped to the desired range.
   * - This is commonly used in applications like computer graphics, navigation, and physics to standardize angle measurements.
   */
  export function principalAngle(angle: number): number {
    return ((angle + 180) % 360) - 180;
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

  /**
   * Calculates the angle in degrees of a 2D point relative to an origin.
   *
   * This function computes the angle formed by the vector from the origin to the point
   * relative to the positive x-axis, measured counterclockwise.
   *
   * @param origin - The origin point [x0, y0].
   * @param point - The target point [x, y].
   * @returns The angle in degrees, normalized to [0, 360).
   *
   * @example
   * const origin: cmath.Vector2 = [0, 0];
   * const point: cmath.Vector2 = [1, 1];
   * const angle = cmath.vector2.angle(origin, point);
   * console.log(angle); // 45
   */
  export function angle(origin: Vector2, point: Vector2): number {
    const [x0, y0] = origin;
    const [x, y] = point;

    // Calculate the angle in radians
    const radians = Math.atan2(y - y0, x - x0);

    // Convert to degrees
    const degrees = radians * (180 / Math.PI);

    // Normalize the angle to [0, 360)
    return (degrees + 360) % 360;
  }
}

export namespace cmath.rect {
  /**
   * Translates a rectangle by a given vector.
   *
   * This function adjusts the position of a rectangle (`x` and `y`) by adding a translation vector.
   * The dimensions (`width` and `height`) remain unchanged.
   *
   * @param rect - The rectangle to be translated, defined by its position (`x`, `y`) and dimensions (`width`, `height`).
   * @param t - The translation vector `[tx, ty]`, where `tx` is the horizontal translation and `ty` is the vertical translation.
   * @returns A new rectangle with updated `x` and `y` values, and the same `width` and `height` as the original.
   *
   * @example
   * // Translate a rectangle by a positive vector
   * const rect = { x: 10, y: 20, width: 30, height: 40 };
   * const translation = [5, 10];
   * const result = cmath.rect.translate(rect, translation);
   * console.log(result); // { x: 15, y: 30, width: 30, height: 40 }
   *
   * @example
   * // Translate a rectangle by a negative vector
   * const rect = { x: 10, y: 20, width: 30, height: 40 };
   * const translation = [-5, -10];
   * const result = cmath.rect.translate(rect, translation);
   * console.log(result); // { x: 5, y: 10, width: 30, height: 40 }
   *
   * @example
   * // Translate a rectangle by a zero vector (no movement)
   * const rect = { x: 10, y: 20, width: 30, height: 40 };
   * const translation = [0, 0];
   * const result = cmath.rect.translate(rect, translation);
   * console.log(result); // { x: 10, y: 20, width: 30, height: 40 }
   *
   * @remarks
   * - The translation vector affects only the `x` and `y` properties of the rectangle.
   * - The rectangle's dimensions (`width` and `height`) are preserved.
   */
  export function translate(rect: Rectangle, t: Vector2): Rectangle {
    return {
      x: rect.x + t[0],
      y: rect.y + t[1],
      width: rect.width,
      height: rect.height,
    };
  }

  /**
   * Applies a 2D scaling transformation to a rectangle relative to a given origin.
   *
   * This function modifies the rectangle's position and dimensions by applying
   * scaling factors along the x-axis and y-axis. Negative scaling factors
   * result in a reflection across the respective axis.
   *
   * @param rect - The rectangle to be transformed, defined by its position (x, y) and dimensions (width, height).
   * @param origin - The point ([originX, originY]) relative to which the scaling is applied.
   * @param scale - The scaling factors ([scaleX, scaleY]) for the x-axis and y-axis.
   * @returns A new rectangle transformed by the specified scaling operation.
   *
   * @remarks
   * - Scaling is performed as an affine transformation: `newX = originX + (x - originX) * scaleX` and similarly for `y`.
   * - The width and height are directly scaled by `scaleX` and `scaleY`, respectively.
   * - Negative scale factors reflect the rectangle across the corresponding axis.
   *
   * @example
   * // Uniform scaling
   * const rect = { x: 10, y: 20, width: 30, height: 40 };
   * const origin = [0, 0];
   * const scale = [2, 2];
   * cmath.rect.scale(rect, origin, scale); // { x: 20, y: 40, width: 60, height: 80 }
   *
   * @example
   * // Non-uniform scaling
   * const rect = { x: 10, y: 20, width: 30, height: 40 };
   * const origin = [0, 0];
   * const scale = [2, 1.5];
   * cmath.rect.scale(rect, origin, scale); // { x: 20, y: 30, width: 60, height: 60 }
   *
   * @example
   * // Reflection using negative scaling
   * const rect = { x: 10, y: 20, width: 30, height: 40 };
   * const origin = [0, 0];
   * const scale = [-1, -1];
   * cmath.rect.scale(rect, origin, scale); // { x: -10, y: -20, width: -30, height: -40 }
   */
  export function scale(
    rect: cmath.Rectangle,
    origin: cmath.Vector2,
    scale: cmath.Vector2
  ): cmath.Rectangle {
    const { x, y, width, height } = rect;
    const [originX, originY] = origin;
    const [scaleX, scaleY] = scale;

    // Apply affine scaling
    return {
      x: originX + (x - originX) * scaleX,
      y: originY + (y - originY) * scaleY,
      width: width * scaleX,
      height: height * scaleY,
    };
  }

  /**
   * Computes the scale factors required to transform rectangle `a` to rectangle `b`.
   *
   * @param a - The original rectangle.
   * @param b - The target rectangle.
   * @returns The scale factors [scaleX, scaleY].
   *
   * @example
   * const a = { x: 10, y: 20, width: 100, height: 100 };
   * const b = { x: 10, y: 20, width: 200, height: 300 };
   * const scale = getScaleFactors(a, b); // [2, 3]
   */
  export function getScaleFactors(
    a: cmath.Rectangle,
    b: cmath.Rectangle
  ): cmath.Vector2 {
    const scaleX = b.width / a.width;
    const scaleY = b.height / a.height;

    return [scaleX, scaleY];
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
   * Calculates the center point of a rectangle.
   *
   * The center point is defined as the midpoint of the rectangle's width and height.
   *
   * @param rect - The rectangle to calculate the center for, defined by its position (`x`, `y`) and dimensions (`width`, `height`).
   * @returns A `Vector2` representing the center point `[centerX, centerY]`.
   *
   * @example
   * const rect = { x: 10, y: 20, width: 30, height: 40 };
   * const center = cmath.rect.center(rect);
   * console.log(center); // [25, 40]
   *
   * @example
   * // Handles rectangles with zero width or height
   * const rect = { x: 10, y: 20, width: 0, height: 40 };
   * const center = cmath.rect.center(rect);
   * console.log(center); // [10, 40]
   */
  export function center(rect: cmath.Rectangle): cmath.Vector2 {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    return [centerX, centerY];
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
   * Checks if a rectangle contains a point.
   *
   * @param point - The point to check, as a `[x, y]` tuple.
   * @param rect - The rectangle in `{ x, y, width, height }` format.
   * @returns `true` if the point is inside the rectangle, otherwise `false`.
   *
   * @example
   * const point = [15, 25];
   * const rect = { x: 10, y: 20, width: 30, height: 40 };
   * const isInside = cmath.rect.containsPoint(point, rect);
   * console.log(isInside); // true
   */
  export function containsPoint(
    rect: cmath.Rectangle,
    point: cmath.Vector2
  ): boolean {
    const [px, py] = point;
    const { x, y, width, height } = rect;
    return px >= x && px <= x + width && py >= y && py <= y + height;
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
}

export namespace cmath.measure {}
export namespace cmath.auxiliary_line {}
export namespace cmath.auxiliary_line.rectangular {
  // fromPointToVector
  // sideToPoint
}
