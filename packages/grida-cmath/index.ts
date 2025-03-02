import assert from "assert";

/**
 * cmath, a 2D canvas math module.
 */
export namespace cmath {
  export const PI = Math.PI;
  export const abs = Math.abs;
  export const sqrt = Math.sqrt;
  export const cos = Math.cos;
  export const sin = Math.sin;
  export const asin = Math.asin;
  export const tan = Math.tan;

  /**
   * Represents a single axis in 2D space.
   *
   * Also known as horizontal (x-axis) or vertical (y-axis) direction.
   */
  export type Axis = "x" | "y";

  export const counterAxis = (axis: Axis) => {
    return axis === "x" ? "y" : "x";
  };

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
   * A 2-dimensional vector. (commonly used for positions, sizes, segment, etc.)
   */
  export type Vector2 = [number, number];

  /**
   * Represents a 1D range (line segment). where a <= b
   *
   * - [a] start
   * - [b] end
   * - [length] b - a
   * - [center] (a + b / 2) or (a + length / 2) = mean of a and b
   */
  export type Range = [number, number];

  /**
   * A 4-dimensional vector. (commonly used for areas, colors, etc.)
   */
  export type Vector4 = [number, number, number, number];

  /**
   * Represents a 2D affine transformation matrix.
   *
   * A 2D affine transform is used to perform linear transformations (e.g., scaling, rotation, skewing)
   * and translations (shifting position) in 2D space. The matrix is represented as a 2x3 matrix:
   *
   * ```
   * [ a, b, tx ]
   * [ c, d, ty ]
   * ```
   *
   * Where:
   * - `a` and `d` are scaling factors along the x and y axes, respectively.
   * - `b` and `c` are the skewing (shearing) factors.
   * - `tx` and `ty` are translation (movement) along the x and y axes, respectively.
   *
   * ### Mathematical Formulation
   * When applied to a vector `[x, y]`, the transform produces a new vector `[x', y']` as follows:
   *
   * ```
   * x' = a * x + b * y + tx
   * y' = c * x + d * y + ty
   * ```
   *
   * ### Example Transformations
   * - **Translation**:
   *   ```
   *   [ 1, 0, tx ]
   *   [ 0, 1, ty ]
   *   ```
   *   Moves a point by `tx` along the x-axis and `ty` along the y-axis.
   *
   * - **Scaling**:
   *   ```
   *   [ sx, 0, 0 ]
   *   [ 0, sy, 0 ]
   *   ```
   *   Scales a point by `sx` along the x-axis and `sy` along the y-axis.
   *
   * - **Rotation (θ degrees)**:
   *   ```
   *   [ cos(θ), -sin(θ), 0 ]
   *   [ sin(θ),  cos(θ), 0 ]
   *   ```
   *   Rotates a point counterclockwise by `θ` degrees about the origin.
   *
   * - **Skewing**:
   *   ```
   *   [ 1, tan(α), 0 ]
   *   [ tan(β), 1, 0 ]
   *   ```
   *   Skews a point horizontally by angle `α` and vertically by angle `β`.
   *
   * ### Common Use Cases
   * - Transforming shapes or points in 2D graphics.
   * - Applying geometric transformations in computer graphics or simulations.
   * - Modeling affine transformations in coordinate systems.
   *
   * @example
   * // Rotate a vector [1, 0] by 90 degrees and translate by [2, 3]
   * const transform: Transform = [
   *   [0, -1, 2], // Rotation and translation
   *   [1,  0, 3],
   * ];
   * ```
   */
  export type Transform = [[number, number, number], [number, number, number]];

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
  export type RectangleDimension = "width" | "height";

  export type CardinalDirection =
    | "n"
    | "e"
    | "s"
    | "w"
    | "ne"
    | "se"
    | "sw"
    | "nw";

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

  export function clamp(value: Scalar, min: Scalar, max: Scalar): Scalar {
    return Math.min(Math.max(value, min), max);
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

  /**
   * Determines whether an angle (in degrees) is closer to the x-axis (horizontal)
   * or the y-axis (vertical).
   *
   * - "x" if the angle is closer to 0° or 180°
   * - "y" if the angle is closer to 90° or 270°
   *
   * @param angle - The angle in degrees (can be any real number).
   * @returns `"x"` if closer to horizontal, `"y"` if closer to vertical.
   *
   * @example
   * closestAxis(10);   // "x"
   * closestAxis(85);   // "y"
   * closestAxis(179);  // "x"
   * closestAxis(270);  // "y"
   */
  export function angleToAxis(angle: number): Axis {
    // 1) Normalize to [0, 360)
    const a = ((angle % 360) + 360) % 360;

    // 2) Distances from canonical horizontal angles (0° & 180°)
    //    (360° is effectively the same as 0°, so you don't need to include both)
    const distHorizontal = Math.min(
      Math.abs(a - 0),
      Math.abs(a - 180),
      Math.abs(a - 360)
    );

    // 3) Distances from canonical vertical angles (90° & 270°)
    const distVertical = Math.min(Math.abs(a - 90), Math.abs(a - 270));

    // 4) Compare the two distances
    return distHorizontal <= distVertical ? "x" : "y";
  }

  /**
   * Move an array item to a different position. Returns a new array with the item moved to the new position.
   */
  export function arrayMove<T>(array: T[], from: number, to: number): T[] {
    const newArray = array.slice();
    newArray.splice(
      to < 0 ? newArray.length + to : to,
      0,
      newArray.splice(from, 1)[0]
    );

    return newArray;
  }

  /**
   * Checks if all elements in an array are equal, with optional tolerance.
   *
   * @param arr - The array of numbers to check.
   * @param tolerance - The allowable difference for values to be considered equal. Defaults to 0 (strict equality).
   * @returns `true` if all elements in the array are equal within the given tolerance, otherwise `false`.
   *
   * @example
   * isUniform([1, 1, 1]); // true
   * isUniform([1.001, 1.002, 1.0009], 0.01); // true
   * isUniform([1, 2, 3]); // false
   */
  export function isUniform(arr: number[], tolerance: number = 0): boolean {
    if (arr.length <= 1) return true;

    const first = arr[0];

    if (tolerance === 0) {
      return arr.every((value) => value === first);
    } else {
      return arr.every((value) => Math.abs(value - first) <= tolerance);
    }
  }

  /**
   * Finds the mode (most frequent value) in an array of numbers.
   *
   * The mode is the value that appears most often in the array. If the array is empty, `undefined` is returned.
   *
   * @param arr - An array of numbers to find the mode from.
   * @returns The most frequent number in the array, or `undefined` if the array is empty.
   *
   * @example
   * // Single mode
   * const result1 = mode([1, 2, 2, 3]);
   * console.log(result1); // 2
   *
   * @example
   * // Multiple modes (returns the first encountered)
   * const result2 = mode([1, 2, 2, 3, 3]);
   * console.log(result2); // 2 or 3
   *
   * @example
   * // Empty array
   * const result3 = mode([]);
   * console.log(result3); // undefined
   *
   * @remarks
   * - The function uses a frequency map to count occurrences and identifies the most frequent value.
   * - In the case of ties (multiple numbers with the same highest frequency), the first number encountered is returned.
   */
  export function mode(arr: number[]): number | undefined {
    const frequency: Record<number, number> = {};
    arr.forEach((num) => {
      frequency[num] = (frequency[num] || 0) + 1;
    });

    let mostFrequent: [number, number] = [undefined as any, 0];

    for (const key in frequency) {
      const count = frequency[key];
      const value = Number(key); // Convert the string key to a number
      if (count > mostFrequent[1]) {
        mostFrequent = [value, count];
      }
    }

    return mostFrequent[0];
  }

  /**
   * Calculates the mean (average) of an array of numbers.
   *
   * The mean is computed by summing all elements in the array and dividing by the number of elements.
   *
   * @param values - An array of numbers for which the mean is to be calculated.
   * @returns The mean (average) of the provided numbers.
   *
   * @throws {Error} If the input array is empty.
   *
   * @example
   * ```typescript
   * const data = [5, 10, 15, 20];
   * const avg = cmath.stats.mean(data);
   * console.log(avg); // Outputs: 12.5
   * ```
   */
  export function mean(...values: cmath.Scalar[]): cmath.Scalar {
    assert(values.length > 0, "Cannot compute mean of an empty array.");

    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  /**
   * Generates all combinations of size `k` from the given array.
   *
   * @param arr - The input array.
   * @param k - The size of each combination.
   * @returns An array of combinations (each combination is an array).
   *
   * @see https://en.wikipedia.org/wiki/Combination
   */
  export function combinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];

    const [first, ...rest] = arr;

    // Include the first element in the combination
    const includeFirst = combinations(rest, k - 1).map((combo) => [
      first,
      ...combo,
    ]);

    // Exclude the first element from the combination
    const excludeFirst = combinations(rest, k);

    return [...includeFirst, ...excludeFirst];
  }

  /**
   * Generates all permutations of size `k` from the given array.
   *
   * @param arr - The input array.
   * @param k - The size of each permutation.
   * @returns An array of permutations (each permutation is an array).
   *
   * @see https://en.wikipedia.org/wiki/Permutation
   */
  export function permutations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];

    return arr.flatMap((item, index) =>
      permutations(
        [...arr.slice(0, index), ...arr.slice(index + 1)],
        k - 1
      ).map((perm) => [item, ...perm])
    );
  }

  /**
   * Generates the power set or subsets of a given array.
   *
   * If `k` is not specified, the function returns the full power set, which includes all subsets
   * of all possible sizes (from 0 to `n`, where `n` is the length of the input array).
   * If `k` is specified, the function returns only the subsets of size `k`.
   *
   * @param arr - The input array for which the subsets are to be generated.
   * @param k - (Optional) The size of subsets to generate. If -1, all subsets are generated.
   * @returns An array of arrays representing the subsets of the input array.
   *          - If `k` is omitted, returns the full power set.
   *          - If `k` is specified, returns only the subsets of size `k`.
   *
   * @example
   * ```typescript
   * // Generate the full power set
   * const powerSet = cmath.powerset([1, 2, 3]);
   * console.log(powerSet);
   * // Output:
   * // [
   * //   [],
   * //   [1], [2], [3],
   * //   [1, 2], [1, 3], [2, 3],
   * //   [1, 2, 3]
   * // ]
   * ```
   *
   * @example
   * ```typescript
   * // Generate all subsets of size 2
   * const subsetsOfSize2 = cmath.powerset([1, 2, 3], 2);
   * console.log(subsetsOfSize2);
   * // Output:
   * // [ [1, 2], [1, 3], [2, 3] ]
   * ```
   *
   * @remarks
   * - If `k` is negative or greater than the length of the array, an empty array is returned.
   * - Includes the empty set ([]), which is part of the standard mathematical definition of a powerset.
   * - The number of subsets returned when `k` is specified is \( \binom{n}{k} \), where \( n \) is the length of the input array.
   * - This function utilizes the `cmath.combinations` function internally to generate subsets of specific sizes.
   *
   * @see https://en.wikipedia.org/wiki/Power_set
   */
  export function powerset<T>(arr: T[], k: number = -1): T[][] {
    if (k === -1) {
      // Generate the full power set
      const result: T[][] = [[]]; // Start with the empty set
      for (let size = 1; size <= arr.length; size++) {
        result.push(...cmath.combinations(arr, size));
      }
      return result;
    } else {
      // Validate the `k` parameter
      if (k < 0 || k > arr.length) {
        return []; // No subsets possible for invalid `k`
      }
      // Generate subsets of size `k`
      return cmath.combinations(arr, k);
    }
  }
}

/**
 * Vector2 computations.
 */
export namespace cmath.vector2 {
  /**
   * The zero vector `[0, 0]`.
   */
  export const zero: Vector2 = [0, 0];

  /**
   * Constructs a 2D vector where one of the components (`a` or `b`) is assigned to the main axis (`x` or `y`).
   *
   * This function allows flexible assignment of scalar values to specific axes in 2D space
   * based on the specified main axis.
   *
   * @param a - The scalar value to assign to the main axis.
   * @param b - The scalar value to assign to the counter axis.
   * @param mainAxis - The primary axis (`"x"` or `"y"`) to which `a` should be assigned.
   *
   * @returns A 2D vector `[a, b]` if `mainAxis` is `"x"`, or `[b, a]` if `mainAxis` is `"y"`.
   *
   * @example
   * ```typescript
   * // Assign 5 to the x-axis and 10 to the y-axis
   * const vector1 = cmath.vector2.withMainAxis(5, 10, "x");
   * console.log(vector1); // [5, 10]
   *
   * // Assign 5 to the y-axis and 10 to the x-axis
   * const vector2 = cmath.vector2.withMainAxis(5, 10, "y");
   * console.log(vector2); // [10, 5]
   * ```
   *
   * @remarks
   * This is particularly useful in scenarios where the primary axis needs to be specified dynamically,
   * such as when configuring flexible layouts or computations in 2D space.
   */
  export function axisOriented(a: Scalar, b: Scalar, mainAxis: Axis): Vector2 {
    if (mainAxis === "x") {
      return [a, b];
    } else {
      return [b, a];
    }
  }

  export function isZero(vector: Vector2): boolean {
    return vector[0] === 0 && vector[1] === 0;
  }

  export function add(...vectors: Vector2[]): Vector2 {
    return vectors.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [
      0, 0,
    ] as Vector2);
  }

  export function sub(...vectors: Vector2[]): Vector2 {
    if (vectors.length === 1) {
      return vectors[0];
    }
    return vectors.reduce((acc, [x, y]) => [acc[0] - x, acc[1] - y]);
  }

  export function quantize(vector: Vector2, step: number | Vector2): Vector2 {
    return [
      cmath.quantize(vector[0], typeof step === "number" ? step : step[0]),
      cmath.quantize(vector[1], typeof step === "number" ? step : step[1]),
    ];
  }

  export function multiply(...vectors: Vector2[]): Vector2 {
    // Ensure there is at least one vector
    if (vectors.length === 0) {
      throw new Error("At least one vector is required for multiplication.");
    }

    // Start with [1, 1] as the identity for multiplication
    return vectors.reduce((acc, [x, y]) => [acc[0] * x, acc[1] * y], [
      1, 1,
    ] as Vector2);
  }

  /**
   * Inverts a 2D vector by negating both its components.
   *
   * @param vector - The vector to invert, in the format `[x, y]`.
   * @returns A new vector `[−x, −y]` with both components inverted.
   *
   * @example
   * const v: cmath.Vector2 = [3, -4];
   * const inverted = cmath.vector2.invert(v);
   * console.log(inverted); // [-3, 4]
   */
  export function invert(vector: Vector2): Vector2 {
    return [-vector[0], -vector[1]];
  }

  /**
   * Calculates the angle in degrees of a 2D point relative to an origin.
   *
   * This function computes the angle formed by the vector from the origin to the point
   * relative to the positive x-axis, measured counterclockwise.
   *
   * @param pointA - The origin point [x0, y0].
   * @param pointB - The target point [x, y].
   * @returns The angle in degrees, normalized to [0, 360).
   *
   * @example
   * const origin: cmath.Vector2 = [0, 0];
   * const point: cmath.Vector2 = [1, 1];
   * const angle = cmath.vector2.angle(origin, point);
   * console.log(angle); // 45
   */
  export function angle(pointA: Vector2, pointB: Vector2): number {
    const [x0, y0] = pointA;
    const [x, y] = pointB;

    // Calculate the angle in radians
    const radians = Math.atan2(y - y0, x - x0);

    // Convert to degrees
    const degrees = radians * (180 / Math.PI);

    // Normalize the angle to [0, 360)
    return (degrees + 360) % 360;
  }

  /**
   * Rotates a 2D vector by a specified angle.
   *
   * This function applies a rotation transformation to a given vector `[x, y]`,
   * rotating it counterclockwise around the origin by the specified angle in degrees.
   *
   * @param vector - The 2D vector to rotate, represented as `[x, y]`.
   * @param angle - The rotation angle in degrees. Positive values indicate counterclockwise rotation.
   * @returns A new vector `[rotatedX, rotatedY]` representing the rotated vector.
   *
   * @example
   * // Rotate the vector [1, 0] by 90 degrees
   * const vector: cmath.Vector2 = [1, 0];
   * const rotated = cmath.vector2.rotate(vector, 90);
   * console.log(rotated); // Outputs: [0, 1]
   *
   * @example
   * // Rotate the vector [1, 1] by -45 degrees
   * const vector: cmath.Vector2 = [1, 1];
   * const rotated = cmath.vector2.rotate(vector, -45);
   * console.log(rotated); // Outputs: [~1.414, 0]
   *
   * @remarks
   * - The angle is converted from degrees to radians internally, as trigonometric functions in JavaScript operate in radians.
   * - The rotation is performed around the origin `(0, 0)`.
   * - If the angle is `0`, the input vector is returned unchanged.
   */
  export function rotate(vector: Vector2, angle: number): Vector2 {
    const radians = (angle * Math.PI) / 180;
    const [x, y] = vector;

    return [
      x * Math.cos(radians) - y * Math.sin(radians),
      x * Math.sin(radians) + y * Math.cos(radians),
    ];
  }

  /**
   * Checks if two 1D segments intersect or overlap.
   *
   * @param segmentA - The first segment [startA, endA].
   * @param segmentB - The second segment [startB, endB].
   * @returns `true` if the segments intersect or overlap, otherwise `false`.
   */
  export const intersects = (segmentA: Vector2, segmentB: Vector2): boolean =>
    segmentA[1] >= segmentB[0] && segmentB[1] >= segmentA[0];

  /**
   * Calculates the intersection of two 1D segments.
   *
   * @param segmentA - The first segment as [startA, endA].
   * @param segmentB - The second segment as [startB, endB].
   * @returns A `Vector2` representing the intersection segment, or `null` if the segments do not intersect.
   *
   * @example
   * // Overlapping segments
   * const intersection = cmath.vector2.intersection([1, 5], [3, 7]);
   * console.log(intersection); // [3, 5]
   *
   * // Non-overlapping segments
   * const noIntersection = cmath.vector2.intersection([1, 5], [6, 8]);
   * console.log(noIntersection); // null
   */
  export function intersection(
    segmentA: cmath.Vector2,
    segmentB: cmath.Vector2
  ): cmath.Vector2 | null {
    const start = Math.max(segmentA[0], segmentB[0]); // Largest start point
    const end = Math.min(segmentA[1], segmentB[1]); // Smallest end point

    // If the segments don't intersect, return null
    if (start > end) {
      return null;
    }

    // Return the intersecting segment as [start, end]
    return [start, end];
  }

  export function min(...vectors: Vector2[]): Vector2 {
    return vectors.reduce(
      (acc, [x, y]) => [Math.min(acc[0], x), Math.min(acc[1], y)],
      [Infinity, Infinity] as Vector2
    );
  }

  export function max(...vectors: Vector2[]): Vector2 {
    return vectors.reduce(
      (acc, [x, y]) => [Math.max(acc[0], x), Math.max(acc[1], y)],
      [-Infinity, -Infinity] as Vector2
    );
  }

  /**
   * Calculates the Euclidean distance between two 2D vectors.
   *
   * The Euclidean distance is the straight-line distance between two points in a 2D space.
   * It is computed using the formula:
   * \[
   * d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}
   * \]
   *
   * @param a - The first 2D vector `[x1, y1]`.
   * @param b - The second 2D vector `[x2, y2]`.
   * @returns The Euclidean distance as a number.
   *
   * @example
   * // Distance between two points
   * const a: cmath.Vector2 = [3, 4];
   * const b: cmath.Vector2 = [6, 8];
   * const dist = cmath.vector2.distance(a, b);
   * console.log(dist); // Outputs: 5
   *
   * @remarks
   * - Uses `Math.hypot` for precision and efficiency.
   * - The distance is always a non-negative scalar value.
   */
  export function distance(a: Vector2, b: Vector2): number {
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  /**
   * Applies a 2D transformation matrix to a vector.
   *
   * This function takes a 2D vector `[x, y]` and applies an affine transformation
   * using the provided transformation matrix. The transformation includes
   * scaling, rotation, and translation.
   *
   * The transformation matrix is in the format:
   * ```
   * [[a, b, tx],
   *  [c, d, ty]]
   * ```
   * where:
   * - `a` and `d` represent scaling along the x-axis and y-axis, respectively.
   * - `b` and `c` represent rotation.
   * - `tx` and `ty` represent translation along the x-axis and y-axis.
   *
   * @param vector - The input 2D vector `[x, y]` to transform.
   * @param transform - The 2D transformation matrix.
   * @returns The transformed vector `[x', y']` after applying the transformation.
   *
   * @example
   * // Rotate a vector [1, 0] by 90 degrees and translate by [2, 3]
   * const vector: cmath.Vector2 = [1, 0];
   * const transform: cmath.Transform = [
   *   [0, -1, 2],
   *   [1, 0, 3],
   * ];
   * const result = cmath.vector2.transform(vector, transform);
   * console.log(result); // [2, 4]
   *
   * @example
   * // Apply scaling transformation
   * const vector: cmath.Vector2 = [2, 3];
   * const transform: cmath.Transform = [
   *   [2, 0, 0],
   *   [0, 3, 0],
   * ];
   * const result = cmath.vector2.transform(vector, transform);
   * console.log(result); // [4, 9]
   *
   * @remarks
   * - This function is useful in computer graphics, physics simulations, and other
   *   mathematical computations where 2D transformations are required.
   * - The transformation matrix must be well-formed; otherwise, the behavior is undefined.
   */
  export function transform(
    vector: Vector2,
    transform: cmath.Transform
  ): Vector2 {
    const [[a, b, tx], [c, d, ty]] = transform;
    const [x, y] = vector;

    return [a * x + b * y + tx, c * x + d * y + ty];
  }

  export function identical(a: Vector2, b: Vector2): boolean {
    return a[0] === b[0] && a[1] === b[1];
  }
}

export namespace cmath.vector4 {
  export function identical(a: Vector4, b: Vector4): boolean {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  }
}

export namespace cmath.compass {
  /**
   * Inverted cardinal directions `nw -> se, ne -> sw` and so on
   *
   * @internal
   */
  const __inverted_cardinal_directions = {
    nw: "se",
    ne: "sw",
    sw: "ne",
    se: "nw",
    n: "s",
    e: "w",
    s: "n",
    w: "e",
  } as const;

  /**
   * Inverts a cardinal direction to its opposite.
   *
   * This function takes a cardinal direction (e.g., "n", "e", "nw") and returns
   * its opposite direction (e.g., "n" becomes "s", "ne" becomes "sw").
   *
   * @param direction - The cardinal direction to invert. Must be one of the following:
   *   - `"n"`: North
   *   - `"e"`: East
   *   - `"s"`: South
   *   - `"w"`: West
   *   - `"ne"`: North-East
   *   - `"se"`: South-East
   *   - `"sw"`: South-West
   *   - `"nw"`: North-West
   * @returns The inverted cardinal direction, as follows:
   *   - `"n"` -> `"s"`
   *   - `"e"` -> `"w"`
   *   - `"s"` -> `"n"`
   *   - `"w"` -> `"e"`
   *   - `"ne"` -> `"sw"`
   *   - `"se"` -> `"nw"`
   *   - `"sw"` -> `"ne"`
   *   - `"nw"` -> `"se"`
   *
   * @example
   * const inverted = cmath.invertCardinalDirection("n");
   * console.log(inverted); // "s"
   *
   * const invertedDiagonal = cmath.invertCardinalDirection("ne");
   * console.log(invertedDiagonal); // "sw"
   *
   * @remarks
   * - This function is useful for geometric computations or UI layouts where
   *   directional relationships need to be reversed.
   */
  export function invertDirection(
    direction: CardinalDirection
  ): CardinalDirection {
    return __inverted_cardinal_directions[direction];
  }

  /**
   * Converts a strictly orthogonal cardinal direction (n, e, s, w) to the corresponding
   * rectangle side (top, right, bottom, left).
   *
   * Diagonal directions (ne, nw, se, sw) return `undefined`.
   *
   * @param direction - The cardinal direction to convert, one of:
   *   - `"n"` (north)
   *   - `"e"` (east)
   *   - `"s"` (south)
   *   - `"w"` (west)
   *   - or a diagonal (e.g. `"ne"`) which yields `undefined`.
   *
   * @returns The corresponding `RectangleSide` ("top", "right", "bottom", "left")
   *          if the direction is orthogonal, otherwise `undefined`.
   *
   * @example
   * ```
   * const side1 = toRectangleSide("n");
   * // side1 === "top"
   *
   * const side2 = toRectangleSide("ne");
   * // side2 === undefined
   * ```
   *
   * @remarks
   * This is often used for translating a directional label (`"n"`, `"s"`, etc.)
   * to an actual rectangle edge in UI layouts or alignment logic.
   */
  export function toRectangleSide(
    direction: CardinalDirection
  ): RectangleSide | undefined {
    switch (direction) {
      case "n":
        return "top";
      case "e":
        return "right";
      case "s":
        return "bottom";
      case "w":
        return "left";
    }
  }
}

export namespace cmath.rect {
  const __axis_map = {
    dimension: {
      x: "width",
      y: "height",
    },
  } as const;

  /**
   * get size of the rectangle in the given axis
   *
   * - `x` -> `width`
   * - `y` -> `height`
   *
   * @param rect
   * @param axis
   * @returns size of the rectangle in the given axis
   */
  export function getAxisDimension(rect: Rectangle, axis: Axis): number {
    return rect[__axis_map.dimension[axis]];
  }

  /**
   * Quantizes the position and size of a rectangle by snapping its coordinates and dimensions
   * to the nearest multiples of the given step.
   *
   * @remarks
   * This function may lose precision and distort the rectangle's original geometry
   * because it applies quantization to each property individually.
   *
   * @param rect - The rectangle to quantize.
   * @param step - A single step value or a 2D vector ([xStep, yStep]).
   * @returns A new rectangle with quantized `x`, `y`, `width`, and `height`.
   */
  export function quantize(rect: Rectangle, step: Scalar | Vector2): Rectangle {
    if (typeof step === "number") {
      return {
        x: cmath.quantize(rect.x, step),
        y: cmath.quantize(rect.y, step),
        width: cmath.quantize(rect.width, step),
        height: cmath.quantize(rect.height, step),
      };
    } else {
      return {
        x: cmath.quantize(rect.x, step[0]),
        y: cmath.quantize(rect.y, step[1]),
        width: cmath.quantize(rect.width, step[0]),
        height: cmath.quantize(rect.height, step[1]),
      };
    }
  }

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
   * Normalizes a rectangle to ensure positive width and height.
   *
   * This function adjusts the rectangle's `x` and `y` coordinates
   * to ensure that the rectangle is defined with non-negative `width` and `height`.
   * If the original rectangle has negative width or height, the function modifies
   * the rectangle's position (`x` and `y`) and dimensions to maintain equivalence.
   *
   * @param rect - The input rectangle, which may have negative width or height.
   * @returns A new rectangle with positive `width` and `height`,
   *          and adjusted `x` and `y` coordinates.
   *
   * @example
   * // Rectangle with negative width
   * const rect = { x: 10, y: 20, width: -30, height: 40 };
   * const normalized = cmath.rect.positive(rect);
   * console.log(normalized);
   * // { x: -20, y: 20, width: 30, height: 40 }
   *
   * @example
   * // Rectangle with negative height
   * const rect = { x: 10, y: 20, width: 30, height: -40 };
   * const normalized = cmath.rect.positive(rect);
   * console.log(normalized);
   * // { x: 10, y: -20, width: 30, height: 40 }
   *
   * @example
   * // Rectangle with both negative width and height
   * const rect = { x: 10, y: 20, width: -30, height: -40 };
   * const normalized = cmath.rect.positive(rect);
   * console.log(normalized);
   * // { x: -20, y: -20, width: 30, height: 40 }
   *
   * @remarks
   * - This function is useful for ensuring that rectangles are represented
   *   with positive dimensions, especially in computations where negative
   *   dimensions can cause unexpected results.
   * - The `x` and `y` coordinates are adjusted to maintain the rectangle's
   *   equivalent area.
   */
  export function positive(rect: Rectangle): Rectangle {
    return {
      x: Math.min(rect.x, rect.x + rect.width),
      y: Math.min(rect.y, rect.y + rect.height),
      width: Math.abs(rect.width),
      height: Math.abs(rect.height),
    };
  }

  export function aspectratio(rect: cmath.Rectangle): cmath.Scalar {
    const { width, height } = rect;
    return width / height;
  }

  /**
   * Computes the scale factors required to transform rectangle `a` to rectangle `b`.
   *
   * The position of the rectangles is not considered.
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
   * Computes the 2D transform matrix that maps rectangle `a` onto rectangle `b`.
   *
   * Essentially, we want a transform `T` such that:
   * `point_in_b = T * point_in_a`
   *
   * The result is an affine transform (2×3 matrix) that:
   * 1. Translates `a` to the origin,
   * 2. Scales it by the ratio of widths and heights of `b` / `a`,
   * 3. Translates it to the position of `b`.
   *
   * @param a - The source rectangle.
   * @param b - The target rectangle.
   *
   * @returns A 2D transform matrix in the format:
   *   ```
   *   [
   *     [scaleX, 0, translateX],
   *     [0, scaleY, translateY],
   *   ]
   *   ```
   *
   * @example
   * ```ts
   * const a = { x: 0, y: 0, width: 100, height: 50 };
   * const b = { x: 200, y: 300, width: 400, height: 200 };
   *
   * const t = cmath.rect.getRelativeTransform(a, b);
   * const result = cmath.rect.transform(a, t);
   *
   * // Now `result` should be identical to `b`.
   * console.log(result);
   * // => { x: 200, y: 300, width: 400, height: 200 }
   * ```
   */
  export function getRelativeTransform(
    a: cmath.Rectangle,
    b: cmath.Rectangle
  ): cmath.Transform {
    // If A has zero dimension, prevent division by zero by treating scale as 1.
    const scaleX = a.width === 0 ? 1 : b.width / a.width;
    const scaleY = a.height === 0 ? 1 : b.height / a.height;

    // Step 1: Translate A so its origin is at (0,0).
    const T1: cmath.Transform = [
      [1, 0, -a.x],
      [0, 1, -a.y],
    ];

    // Step 2: Scale by (scaleX, scaleY).
    const T2: cmath.Transform = [
      [scaleX, 0, 0],
      [0, scaleY, 0],
    ];

    // Step 3: Finally translate to B’s (x, y).
    const T3: cmath.Transform = [
      [1, 0, b.x],
      [0, 1, b.y],
    ];

    // Compose final: T3 * T2 * T1
    const step1 = cmath.transform.multiply(T2, T1);
    return cmath.transform.multiply(T3, step1);
  }

  /**
   * Applies a general 2D affine transform (including translate, scale, rotate, and skew)
   * to each corner of a rectangle, then returns the bounding box of the transformed corners.
   *
   * @param rect - The source rectangle `{ x, y, width, height }`.
   * @param transform - The 2D transform matrix:
   *   ```
   *   [
   *     [a, b, tx],
   *     [c, d, ty],
   *   ]
   *   ```
   * @returns A new rectangle representing the bounding box of the transformed corners.
   *
   * @example
   * const rect: cmath.Rectangle = { x: 10, y: 20, width: 30, height: 40 };
   * // Affine transform matrix with skew
   * const t: cmath.Transform = [
   *   [1, 0.2, 100],
   *   [0.3, 1, 50],
   * ];
   * const result = cmath.rect.transform(rect, t);
   * console.log(result);
   * // Example => { x: 110, y: 73, width: 42, height: 53 }
   */
  export function transform(
    rect: cmath.Rectangle,
    transform: cmath.Transform
  ): cmath.Rectangle {
    const [[a, b, tx], [c, d, ty]] = transform;
    const { x, y, width, height } = rect;

    // All 4 corners of the rectangle
    const corners: cmath.Vector2[] = [
      [x, y], // Top-left
      [x + width, y], // Top-right
      [x, y + height], // Bottom-left
      [x + width, y + height], // Bottom-right
    ];

    // Transform each corner
    const transformedCorners = corners.map(([cx, cy]) => {
      const xNew = a * cx + b * cy + tx;
      const yNew = c * cx + d * cy + ty;
      return [xNew, yNew] as cmath.Vector2;
    });

    // Compute bounding box
    const xs = transformedCorners.map(([X]) => X);
    const ys = transformedCorners.map(([_, Y]) => Y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
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

  /**
   * Creates a rectangle that fully bounds the given points.
   *
   * This function computes the minimum bounding rectangle that encloses all the input points.
   * At least 1 point is required.
   *
   * @param points - An array of points (at least 1) to calculate the bounding rectangle.
   * @returns A rectangle with `x`, `y`, `width`, and `height`.
   *
   * @example
   * const rect = cmath.rect.fromPoints([[10, 20], [30, 40], [15, 25]]);
   * console.log(rect); // { x: 10, y: 20, width: 20, height: 20 }
   *
   * const pointRect = cmath.rect.fromPoints([[10, 20]]);
   * console.log(pointRect); // { x: 10, y: 20, width: 0, height: 0 }
   */
  export function fromPoints(points: cmath.Vector2[]): cmath.Rectangle {
    if (points.length <= 0) {
      throw new Error(
        "At least one point is required to compute a bounding rectangle."
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

  export type Rectangle9Points = {
    topLeft: Vector2;
    topRight: Vector2;
    bottomRight: Vector2;
    bottomLeft: Vector2;
    topCenter: Vector2;
    rightCenter: Vector2;
    bottomCenter: Vector2;
    leftCenter: Vector2;
    center: Vector2;
  };

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
   * //   bottomRight: [40, 60],
   * //   bottomLeft: [10, 60],
   * //   topCenter: [25, 20],
   * //   rightCenter: [40, 40],
   * //   bottomCenter: [25, 60],
   * //   leftCenter: [10, 40],
   * //   center: [25, 40],
   * // }
   */
  export function to9Points(rect: Rectangle): Rectangle9Points {
    const { x, y, width, height } = rect;

    // Compute the points
    return {
      topLeft: [x, y],
      topRight: [x + width, y],
      bottomRight: [x + width, y + height],
      bottomLeft: [x, y + height],
      topCenter: [x + width / 2, y],
      rightCenter: [x + width, y + height / 2],
      bottomCenter: [x + width / 2, y + height],
      leftCenter: [x, y + height / 2],
      center: [x + width / 2, y + height / 2],
    };
  }

  /**
   * A chunk array of 9 control points of a rectangle, with the exact order:
   *
   * `[topLeft, topRight, bottomRight, bottomLeft, topCenter, rightCenter, bottomCenter, leftCenter, center]`
   */
  export type TRectangle9PointsChunk<T> = [
    T, // topLeft
    T, // topRight
    T, // bottomRight
    T, // bottomLeft
    T, // topCenter
    T, // rightCenter
    T, // bottomCenter
    T, // leftCenter
    T, // center
  ];

  export function to9PointsChunk(
    r: cmath.Rectangle
  ): TRectangle9PointsChunk<cmath.Vector2> {
    // prettier-ignore
    //      0        1         2            3           4          5            6             7           8
    const { topLeft, topRight, bottomRight, bottomLeft, topCenter, rightCenter, bottomCenter, leftCenter, center } = cmath.rect.to9Points(r)
    // prettier-ignore
    //      0        1         2            3           4          5            6             7           8
    return [topLeft, topRight, bottomRight, bottomLeft, topCenter, rightCenter, bottomCenter, leftCenter, center];
  }

  export function getCardinalPoint(
    rect: cmath.Rectangle,
    point: CardinalDirection
  ): Vector2 {
    const { x, y, width, height } = rect;
    switch (point) {
      case "n":
        return [x + width / 2, y];
      case "e":
        return [x + width, y + height / 2];
      case "s":
        return [x + width / 2, y + height];
      case "w":
        return [x, y + height / 2];
      case "ne":
        return [x + width, y];
      case "se":
        return [x + width, y + height];
      case "sw":
        return [x, y + height];
      case "nw":
        return [x, y];
    }
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
   * const center = cmath.rect.getCenter(rect);
   * console.log(center); // [25, 40]
   *
   * @example
   * // Handles rectangles with zero width or height
   * const rect = { x: 10, y: 20, width: 0, height: 40 };
   * const center = cmath.rect.getCenter(rect);
   * console.log(center); // [10, 40]
   */
  export function getCenter(rect: cmath.Rectangle): cmath.Vector2 {
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
   * Calculates the overlapping projection of an array of rectangles along the **counter-axis** of the specified projection axis.
   *
   * The projection axis determines which axis to analyze for overlap:
   * - `"x"`: Projects along the `y` axis (compares vertical ranges).
   * - `"y"`: Projects along the `x` axis (compares horizontal ranges).
   *
   * This function determines if all rectangles have overlapping projections along the **counter-axis** of the specified projection axis. It returns the intersecting range as a `Vector2` or `null` if no intersection exists.
   *
   * @param rectangles - An array of rectangles to project.
   * @param projectionAxis - The axis to calculate projections on ("x" for comparing vertical ranges, "y" for comparing horizontal ranges).
   * @returns {Range} representing the overlapping range of projections along the counter-axis, or `null` if the rectangles do not overlap.
   *
   *
   * ### Visual Explanation
   *
   * This illustrates the projection: projectionAxis = "y" (compare x ranges)
   * ```
   * | 0  1  2  3  4  5  6  7  8  9  10
   * |       +--------------+         |
   * |       |      A       |         |
   * |       |              |         |
   * |       +--------------+         |
   * |            [2 — 7]             |
   * |                                |
   * |                +--------+      |
   * |                |    B   |      |
   * |                |        |      |
   * |                +--------+      |
   * |                  [5 — 8]       |
   * |                                |
   * |                   +--------+   |
   * |                   |   C    |   |
   * |                   |        |   |
   * |                   +--------+   |
   * |                    [6 — 9]     |
   * |                                |
   * |                   +--+         |
   * |                  [6 — 7]       |
   * |               (Overlapping)    |
   * ```
   *
   * @example
   * ```typescript
   * const rectangles = [
   *   { x: 10, y: 20, width: 30, height: 40 },
   *   { x: 20, y: 25, width: 40, height: 35 },
   *   { x: 25, y: 15, width: 30, height: 50 },
   * ];
   * const projection = cmath.rect.axisAlignedProjection(rectangles, "x");
   * console.log(projection); // Outputs: [25, 40] (overlapping vertical range)
   * ```
   *
   * @remarks
   * - The function reduces the projections of all rectangles along the counter-axis into a single overlapping range.
   * - Returns `null` if no overlap exists between the projections.
   * - The rectangles are treated as axis-aligned (non-rotated).
   */
  export function axisProjectionIntersection(
    rectangles: cmath.Rectangle[],
    projectionAxis: Axis
  ): Range | null {
    if (rectangles.length < 2) {
      throw new Error(
        "At least two rectangles are required to compute axis-aligned projection."
      );
    }

    // Map rectangles to projections along the counter-axis
    const projections = rectangles.map((rect) => {
      if (projectionAxis === "x") {
        // If projecting along the x-axis, compare y ranges (vertical segments)
        return [rect.y, rect.y + rect.height] as cmath.Vector2;
      } else {
        // If projecting along the y-axis, compare x ranges (horizontal segments)
        return [rect.x, rect.x + rect.width] as cmath.Vector2;
      }
    });

    // Reduce the projections to find the intersecting range
    return projections.reduce<cmath.Vector2 | null>(
      (currentIntersection, projection) => {
        if (!currentIntersection) return null; // No overlap so far, propagate null
        return cmath.vector2.intersection(currentIntersection, projection); // Calculate intersection
      },
      projections[0] // Start with the first projection
    );
  }

  /**
   * Checks if two rectangles are identical.
   *
   * Two rectangles are considered identical if their positions (`x`, `y`) and dimensions (`width`, `height`)
   * are exactly the same.
   *
   * @param rectA - The first rectangle to compare.
   * @param rectB - The second rectangle to compare.
   * @returns `true` if the rectangles are identical, otherwise `false`.
   *
   * @example
   * const rect1 = { x: 10, y: 20, width: 30, height: 40 };
   * const rect2 = { x: 10, y: 20, width: 30, height: 40 };
   * const isIdentical = cmath.rect.identical(rect1, rect2);
   * console.log(isIdentical); // true
   *
   * @example
   * const rect1 = { x: 10, y: 20, width: 30, height: 40 };
   * const rect2 = { x: 10, y: 25, width: 30, height: 40 };
   * const isIdentical = cmath.rect.identical(rect1, rect2);
   * console.log(isIdentical); // false
   *
   * @remarks
   * - The function performs a strict equality check on the `x`, `y`, `width`, and `height` properties.
   */
  export function isIdentical(
    rectA: cmath.Rectangle,
    rectB: cmath.Rectangle
  ): boolean {
    return (
      rectA.x === rectB.x &&
      rectA.y === rectB.y &&
      rectA.width === rectB.width &&
      rectA.height === rectB.height
    );
  }

  /**
   * Checks if all rectangles in the given array are uniform (identical in position and dimensions).
   *
   * Two rectangles are considered uniform if their `x`, `y`, `width`, and `height`
   * properties are exactly the same.
   *
   * @param rects - An array of rectangles to check.
   * @returns `true` if all rectangles are uniform, or if the array contains zero or one rectangle. Otherwise, `false`.
   *
   * @example
   * const rect1 = { x: 10, y: 20, width: 30, height: 40 };
   * const rect2 = { x: 10, y: 20, width: 30, height: 40 };
   * const rect3 = { x: 15, y: 25, width: 35, height: 45 };
   *
   * isUniform(rect1, rect2); // true
   * isUniform(rect1, rect2, rect3); // false
   * isUniform(); // true (empty input is considered uniform)
   */
  export function isUniform(...rects: cmath.Rectangle[]): boolean {
    if (rects.length <= 1) return true;

    const [first, ...rest] = rects;

    return rest.every((rect) => cmath.rect.isIdentical(first, rect));
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
   * const rect = cmath.rect.union(rectangles);
   * console.log(rect); // { x: 10, y: 10, width: 60, height: 50 }
   */
  export function union(rectangles: Rectangle[]): Rectangle {
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
   * Applies padding to a rectangle, expanding it while preserving its center.
   *
   * The padding can be specified as a uniform number (applied to all sides) or as an object with optional
   * properties: `top`, `right`, `bottom`, and `left`. The resulting rectangle has its center unchanged,
   * with its width increased by the sum of the left and right paddings, and its height increased by the sum
   * of the top and bottom paddings.
   *
   * @param rect - The original rectangle.
   * @param padding - A uniform padding number or an object specifying padding for each side.
   * @returns A new rectangle with the padding applied and the same center as the original.
   *
   * @example
   * // Uniform padding of 10 on all sides:
   * const rect = { x: 50, y: 50, width: 100, height: 80 };
   * const padded = cmath.rect.pad(rect, 10);
   * // Result: { x: 40, y: 40, width: 120, height: 100 }
   *
   * @example
   * // Different padding for each side:
   * const rect = { x: 50, y: 50, width: 100, height: 80 };
   * const padded = cmath.rect.pad(rect, { top: 5, right: 15, bottom: 10, left: 20 });
   * // The center of `padded` is the same as the center of `rect`.
   */
  export function pad(
    rect: Rectangle,
    padding:
      | number
      | { top?: number; right?: number; bottom?: number; left?: number }
  ): Rectangle {
    let top: number, right: number, bottom: number, left: number;
    if (typeof padding === "number") {
      top = right = bottom = left = padding;
    } else {
      top = padding.top ?? 0;
      right = padding.right ?? 0;
      bottom = padding.bottom ?? 0;
      left = padding.left ?? 0;
    }
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const newWidth = rect.width + left + right;
    const newHeight = rect.height + top + bottom;
    return {
      x: centerX - newWidth / 2,
      y: centerY - newHeight / 2,
      width: newWidth,
      height: newHeight,
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
    if (rectangles.length < 2) return rectangles;

    // Compute the bounding rectangle of all input rectangles
    const boundingRect = union(rectangles);

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

  /**
   * Aligns rectangle `a` relative to rectangle `b` along a specified axis.
   *
   * @param a the rectangle to align
   * @param b the rectangle to align to
   * @param alignment - The alignment type of each axis (horizontal and vertical).
   */
  export function alignA(
    a: Rectangle,
    b: Rectangle,
    alignment: {
      horizontal?: "none" | "min" | "max" | "center";
      vertical?: "none" | "min" | "max" | "center";
    }
  ): Rectangle {
    let newX = a.x;
    let newY = a.y;

    // Horizontal alignment
    if (alignment.horizontal) {
      switch (alignment.horizontal) {
        case "min":
          newX = b.x;
          break;
        case "max":
          newX = b.x + b.width - a.width;
          break;
        case "center":
          newX = b.x + (b.width - a.width) / 2;
          break;
      }
    }

    // Vertical alignment
    if (alignment.vertical) {
      switch (alignment.vertical) {
        case "min":
          newY = b.y;
          break;
        case "max":
          newY = b.y + b.height - a.height;
          break;
        case "center":
          newY = b.y + (b.height - a.height) / 2;
          break;
      }
    }

    return {
      x: newX,
      y: newY,
      width: a.width,
      height: a.height,
    };
  }

  /**
   * Calculates the gaps (spaces) between adjacent rectangles along a specified axis.
   *
   * @param rectangles - An array of rectangles to calculate the gaps for.
   * @param axis - The axis to calculate the gaps along ("x" or "y").
   * @returns An array of numbers representing the gaps between adjacent rectangles, excluding the last rectangle.
   *
   * @example
   * const rectangles = [
   *   { x: 10, y: 20, width: 30, height: 40 },
   *   { x: 50, y: 20, width: 30, height: 40 },
   *   { x: 90, y: 20, width: 30, height: 40 },
   * ];
   * const gaps = getDistribution(rectangles, "x");
   * console.log(gaps); // [10, 10]
   */
  export function getGaps(rectangles: cmath.Rectangle[], axis: Axis): number[] {
    if (rectangles.length < 2) {
      return [];
    }

    // Sort rectangles based on their starting position along the specified axis
    const sorted = [...rectangles].sort((a, b) =>
      axis === "x" ? a.x - b.x : a.y - b.y
    );

    // Calculate gaps between adjacent rectangles
    const gaps: number[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentEnd =
        axis === "x"
          ? sorted[i].x + sorted[i].width
          : sorted[i].y + sorted[i].height;
      const nextStart = axis === "x" ? sorted[i + 1].x : sorted[i + 1].y;

      const gap = nextStart - currentEnd;
      gaps.push(gap);
    }

    return gaps;
  }

  /**
   * Calculates the uniform gap between adjacent rectangles along a specified axis.
   *
   * @param rectangles - An array of rectangles to calculate the uniform gap for.
   * @param axis - The axis to calculate the gap along ("x" or "y").
   * @param tolerance - The maximum allowed deviation from a uniform gap.
   *
   * @returns `[unfiorm, gaps]` A tuple containing the uniform gap (if found, most present or biggest) and an array of gaps between adjacent rectangles.
   *
   */
  export function getUniformGap(
    rectangles: cmath.Rectangle[],
    axis: Axis,
    tolerance: number = 0
  ): [unfiorm: number | undefined, gaps: number[]] {
    // Calculate the gaps between rectangles along the specified axis
    const gaps = getGaps(rectangles, axis);

    if (gaps.length === 0) {
      return [undefined, []]; // No gaps if fewer than 2 rectangles
    }

    // Check if all gaps are uniform within the specified tolerance
    const is_uniform = cmath.isUniform(gaps, tolerance);
    if (is_uniform) {
      const most = cmath.mode(gaps);
      if (most !== undefined) {
        return [most, gaps];
      } else {
        return [Math.max(...gaps), gaps];
      }
    } else {
      return [undefined, gaps];
    }
  }

  /**
   * Distributes rectangles evenly along a specified axis within the bounding box of the rectangles,
   * while respecting the original input/output index order.
   *
   * The rectangles are repositioned to maintain equal spacing between their edges, calculated relative
   * to their sorted positions along the specified axis (`x` or `y`). However, the output preserves
   * the input order of rectangles, ensuring that the final output array corresponds 1:1 to the input.
   *
   * @param rectangles - An array of rectangles to distribute.
   * @param axis - The axis to distribute along ("x" or "y").
   * @returns A new array of rectangles with updated positions, respecting the original input/output order.
   *
   * ### Behaviour
   * - **Input Order Respected**: The output array maintains the same indexing as the input array,
   *   even though the internal logic calculates new positions based on the sorted positions of rectangles.
   * - **Even Spacing**: Rectangles are repositioned to have equal gaps between their edges, distributed
   *   within the bounding box of the original rectangles.
   * - **No Shape Modification**: The width, height, and other properties of each rectangle remain unchanged.
   *
   * @example
   * const rectangles = [
   *   { x: 90, y: 20, width: 30, height: 40 },
   *   { x: 10, y: 20, width: 30, height: 40 },
   *   { x: 50, y: 20, width: 30, height: 40 },
   * ];
   *
   * const distributed = cmath.rect.distributeEvenly(rectangles, "x");
   * console.log(distributed);
   * // Output:
   * // [
   * //   { x: 10, y: 20, width: 30, height: 40 }, // Moved to correct position for first
   * //   { x: 50, y: 20, width: 30, height: 40 }, // Moved to correct position for second
   * //   { x: 90, y: 20, width: 30, height: 40 }, // Moved to correct position for third
   * // ]
   *
   * @remarks
   * - The function ensures rectangles are repositioned evenly but retains their original order in the output array.
   * - The repositioning logic calculates gaps based on the sorted positions of rectangles along the specified axis.
   * - If fewer than 2 rectangles are provided, the input is returned unchanged.
   */
  export function distributeEvenly(
    rectangles: cmath.Rectangle[],
    axis: Axis
  ): cmath.Rectangle[] {
    if (rectangles.length < 2) return rectangles;

    // Calculate bounding box and total available size
    const boundingBox = cmath.rect.union(rectangles);
    const start = axis === "x" ? boundingBox.x : boundingBox.y;
    const totalSize = axis === "x" ? boundingBox.width : boundingBox.height;

    // Calculate the total size occupied by the rectangles
    const totalRectSize = rectangles.reduce(
      (sum, rect) => sum + (axis === "x" ? rect.width : rect.height),
      0
    );

    // Determine the new gap size for even distribution
    const gapSize = (totalSize - totalRectSize) / (rectangles.length - 1);

    // Sort rectangles by position along the specified axis
    const sortedIndexes = [...rectangles.map((_, index) => index)].sort(
      (a, b) =>
        axis === "x"
          ? rectangles[a].x - rectangles[b].x
          : rectangles[a].y - rectangles[b].y
    );

    // Distribute rectangles evenly along the axis
    let currentPosition = start;
    const distributed = new Array(rectangles.length);
    for (const index of sortedIndexes) {
      const rect = rectangles[index];
      distributed[index] = {
        ...rect,
        [axis]: currentPosition, // Update position along the axis
      };
      currentPosition += (axis === "x" ? rect.width : rect.height) + gapSize;
    }

    return distributed;
  }
}

/**
 * Boolean operations on rectangles for vector graphics calculations.
 *
 * This module provides functions to perform basic boolean operations on rectangles,
 * tailored for vector graphics use cases where precise layout and bounding calculations
 * are required.
 *
 * - **intersect: A ∩ B**
 *   Computes the intersecting region of A and B, returning a single rectangle (or null if there is no overlap).
 *
 * - **subtract: A - B**
 *   Subtracts B from A, returning an array of rectangles that represent the area of A excluding the overlapping region with B.
 *
 * - **exclude: A ⊖ B**
 *   Computes the symmetric difference, defined as (A ∪ B) minus (A ∩ B), returning an array of rectangles that represent the non-overlapping portions of A and B.
 */
export namespace cmath.rect.boolean {
  /**
   * Subtracts rectangle `b` from rectangle `a`, returning the remaining disjoint subregions.
   *
   * In the context of vector graphics calculations, this function computes the boolean
   * difference \(A - B\) by removing the overlapping area of `b` (if any) from `a`. The operation
   * returns an array of rectangles representing the parts of `a` that are not covered by `b`.
   * Only the portion of `b` that overlaps with `a` is subtracted; the resulting regions will always be
   * confined within `a`.
   *
   * @param a - The rectangle from which to subtract.
   * @param b - The rectangle to subtract.
   * @returns An array of rectangles representing the area of `a` after subtracting the overlap with `b`.
   *
   * @example
   * ```typescript
   * const a: Rectangle = { x: 10, y: 10, width: 30, height: 30 };
   * const b: Rectangle = { x: 20, y: 20, width: 10, height: 10 };
   * const result = cmath.rect.boolean.subtract(a, b);
   * // result:
   * // [
   * //   { x: 10, y: 10, width: 30, height: 10 }, // top region of A above B
   * //   { x: 10, y: 30, width: 30, height: 10 }, // bottom region of A below B
   * //   { x: 10, y: 20, width: 10, height: 10 }, // left region of A left of B
   * //   { x: 30, y: 20, width: 10, height: 10 }  // right region of A right of B
   * // ]
   * ```
   */
  export function subtract(a: Rectangle, b: Rectangle): Rectangle[] {
    const inter = cmath.rect.intersection(a, b);
    if (!inter) return [a];

    const result: Rectangle[] = [];

    // Top region: area of `a` above the intersection.
    if (a.y < inter.y) {
      result.push({
        x: a.x,
        y: a.y,
        width: a.width,
        height: inter.y - a.y,
      });
    }

    // Bottom region: area of `a` below the intersection.
    if (a.y + a.height > inter.y + inter.height) {
      result.push({
        x: a.x,
        y: inter.y + inter.height,
        width: a.width,
        height: a.y + a.height - (inter.y + inter.height),
      });
    }

    // Left region: area of `a` to the left of the intersection (within the vertical span of the intersection).
    if (a.x < inter.x) {
      result.push({
        x: a.x,
        y: inter.y,
        width: inter.x - a.x,
        height: inter.height,
      });
    }

    // Right region: area of `a` to the right of the intersection (within the vertical span of the intersection).
    if (a.x + a.width > inter.x + inter.width) {
      result.push({
        x: inter.x + inter.width,
        y: inter.y,
        width: a.x + a.width - (inter.x + inter.width),
        height: inter.height,
      });
    }

    return result;
  }
}

/**
 * Alignment utilities for mathematical and graphical computations.
 *
 * @example
 * - Align scalar values to a grid
 * - Align 2D vectors to the nearest target positions
 */
export namespace cmath.align {
  /**
   * Aligns a scalar value to the nearest value in an array of scalars if it is within a specified threshold.
   *
   * This function is useful for aligning scalar values (e.g., positions, sizes, or grid alignment) to a discrete set of
   * target values while ensuring the alignment occurs only within a defined threshold.
   *
   * @param point - The scalar value to align.
   * @param targets - An array of existing scalar values to align to.
   * @param threshold - The maximum allowed distance for alignment. Must be non-negative.
   *
   * @returns A tuple `[value, distance, indices]` where:
   * - `value`: is the nearest scalar (if within threshold) or the original `point` (if not).
   * - `distance`: is the signed distance `point - value` to that nearest scalar. (or `Infinity` if not aligned).
   * - `indices` are all target indices whose distance matches the minimum distance exactly.
   *
   * @throws If `threshold` is negative or if `targets` is empty.
   *
   * @example
   * ```ts
   * // Suppose we have targets [10, 20, 20, 40], and point=22 with threshold=5.
   * // The minimal distance is 2 (to '20'), and note there are two '20's.
   * // So the function returns value=20, distance=2 (signed=22 - 20), indices=[1,2].
   *
   * const [value, dist, indices] = cmath.align.scalar(22, [10, 20, 20, 40], 5);
   * console.log(value);   // 20
   * console.log(dist);    // 2
   * console.log(indices); // [1, 2]
   * ```
   */
  export function scalar(
    point: Scalar,
    targets: Scalar[],
    threshold: number
  ): [value: Scalar, distance: number, indicies: number[]] {
    assert(threshold >= 0, "Threshold must be a non-negative number.");
    assert(targets.length > 0, "At least one target is required.");

    // 1) Find the absolute minimum distance among all targets
    let minAbsDistance = Infinity;
    let bestSignedDistance = 0;
    let bestValue: number | null = null;

    // We also gather all indices that match this minimum distance
    const bestIndices: number[] = [];

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const signedDist = point - target;
      const absDist = Math.abs(signedDist);

      if (absDist < minAbsDistance) {
        // Found a strictly closer target
        minAbsDistance = absDist;
        bestValue = target;
        bestSignedDistance = signedDist;
        bestIndices.length = 0; // clear out any previous indices
        bestIndices.push(i);
      } else if (absDist === minAbsDistance) {
        // This target is equally close as the min
        bestIndices.push(i);
      }
    }

    // 2) Check threshold
    // If the min distance is greater than threshold, do NOT snap
    if (minAbsDistance > threshold) {
      return [point, Infinity, []];
    }

    // 3) Return the snapped scalar + signed distance + all equally-close indices
    return [bestValue!, bestSignedDistance, bestIndices];
  }

  /**
   * Aligns a 2D vector to the nearest vector(s) from an array of target vectors if it is within a specified threshold.
   *
   * This function is useful for aligning 2D points (e.g., grid or object alignment),
   * ensuring that alignment only occurs if the distance to the target is within a given threshold.
   *
   * @param point - The 2D vector `[x, y]` to align.
   * @param targets - An array of 2D vectors to which the point might align.
   * @param threshold - The maximum allowed Euclidean distance for alignment. Must be non-negative.
   * @returns A tuple `[value, distance, indices]` where:
   *   - `value`: The nearest target vector if within threshold, otherwise the original `point`.
   *   - `distance`: The Euclidean distance `dist(point, value)` if alignment occurs; otherwise `Infinity`.
   *   - `indices`: **All** target indices whose distance from `point` is exactly equal to the minimum distance (ties).
   *
   * @throws If `threshold` is negative or if `targets` is empty.
   *
   * @example
   * // Suppose we have multiple points at the same nearest distance:
   * //   targets = [[0, 0], [5, 5], [5, 5], [10, 10]]
   * //   point = [6, 6], threshold = 3
   * // The minimal distance (~1.414) is to both [5, 5] entries (indices 1 and 2).
   * //
   * // The function returns:
   * //   value   = [5, 5]
   * //   distance = ~1.41421356237
   * //   indices  = [1, 2]
   *
   * const [snappedVec, dist, tiedIndices] = cmath.align.vector2([6, 6], [[0,0],[5,5],[5,5],[10,10]], 3);
   * console.log(snappedVec);   // [5, 5]
   * console.log(dist);         // ~1.41421356237
   * console.log(tiedIndices);  // [1, 2]
   */
  export function vector2(
    point: cmath.Vector2,
    targets: cmath.Vector2[],
    threshold: number
  ): [value: cmath.Vector2, distance: number, indices: number[]] {
    assert(threshold >= 0, "Threshold must be a non-negative number.");
    assert(targets.length > 0, "At least one target is required.");

    let minDistance = Infinity;
    let bestValue: cmath.Vector2 | null = null;
    const bestIndices: number[] = [];

    // 1) Find absolute minimum distance among all targets
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const dist = cmath.vector2.distance(point, target);

      if (dist < minDistance) {
        // Found a strictly closer target
        minDistance = dist;
        bestValue = target;
        bestIndices.length = 0; // Reset
        bestIndices.push(i);
      } else if (dist === minDistance) {
        // This target ties for closest
        bestIndices.push(i);
      }
    }

    // 2) Check threshold
    if (minDistance > threshold) {
      // Return original point if no target is within threshold
      return [point, Infinity, []];
    }

    // 3) Return the snapped vector, distance, and all equally-close indices
    return [bestValue!, minDistance, bestIndices];
  }
}

export namespace cmath.bezier {
  /**
   * Represents a cubic Bézier curve segment.
   *
   * A cubic Bézier curve is defined by a start point, an end point, and two control points.
   * These control points determine the curvature of the segment.
   *
   * The parametric equation for a cubic Bézier curve is:
   * \[
   * B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3 \quad \text{where } t \in [0, 1]
   * \]
   *
   * Where:
   * - \( P_0 \): Start point of the curve.
   * - \( P_1 \): First control point.
   * - \( P_2 \): Second control point.
   * - \( P_3 \): End point of the curve.
   *
   * @property x1 - The x-coordinate of the first control point (absolute).
   * @property y1 - The y-coordinate of the first control point (absolute).
   * @property x2 - The x-coordinate of the second control point (absolute).
   * @property y2 - The y-coordinate of the second control point (absolute).
   * @property x - The x-coordinate of the end point (absolute).
   * @property y - The y-coordinate of the end point (absolute).
   *
   * @example
   * ```typescript
   * const bezier: CubicBezier = {
   *   x1: 20, // First control point
   *   y1: 40,
   *   x2: 60, // Second control point
   *   y2: 80,
   *   x: 100, // End point
   *   y: 120,
   * };
   * ```
   *
   * @remarks
   * - Cubic Bézier curves are commonly used in vector graphics, animation, and UI design to create smooth transitions and shapes.
   * - This structure assumes absolute positioning for all points.
   */
  export type CubicBezier = {
    x1: number; // First control point (absolute)
    y1: number;
    x2: number; // Second control point (absolute)
    y2: number;
    x: number; // End point (absolute)
    y: number;
  };

  /**
   * @property a - Position of the starting vertex.
   * @property b - Position of the ending vertex.
   * @property ta - Tangent at the starting vertex (relative to the vertex).
   * @property tb - Tangent at the ending vertex (relative to the vertex).
   */
  export type CubicBezierWithTangents = {
    a: Vector2;
    b: Vector2;
    ta: Vector2;
    tb: Vector2;
  };

  /**
   * Solves a quadratic equation \( a x^2 + b x + c = 0 \).
   * @param a - Quadratic coefficient \( a \).
   * @param b - Linear coefficient \( b \).
   * @param c - Constant term \( c \).
   * @returns The real roots in the interval \([-\infty, \infty]\). Returns an empty array if none exist.
   */
  function solve_quad(a: number, b: number, c: number): number[] {
    const D = b * b - 4 * a * c;
    if (D < 0) return [];
    if (D === 0) return [-b / (2 * a)];
    const sqrtD = Math.sqrt(D);
    return [(-b + sqrtD) / (2 * a), (-b - sqrtD) / (2 * a)];
  }

  /**
   * Returns the derivative coefficients \([A, B, C]\) of the cubic polynomial for calculating \(`p'(t) = 0`\).
   * @param p0 - The start point coordinate.
   * @param p1 - The first control point coordinate.
   * @param p2 - The second control point coordinate.
   * @param p3 - The end point coordinate.
   * @returns Coefficients \([A, B, C]\) for the derivative cubic equation \( A t^2 + B t + C = 0 \).
   */
  function cubic_deriv_coeffs(
    p0: number,
    p1: number,
    p2: number,
    p3: number
  ): [number, number, number] {
    const c0 = -p0 + 3 * p1 - 3 * p2 + p3; // for t^3
    const c1 = 3 * p0 - 6 * p1 + 3 * p2; // for t^2
    const c2 = -3 * p0 + 3 * p1; // for t^1
    // derivative => 3*c0*t^2 + 2*c1*t + c2 = 0
    return [3 * c0, 2 * c1, c2];
  }

  /**
   * Evaluates a cubic Bézier function at parameter `t` in \([0, 1]\).
   * @param p0 - The start coordinate.
   * @param p1 - The first control coordinate (absolute).
   * @param p2 - The second control coordinate (absolute).
   * @param p3 - The end coordinate.
   * @param t - Parameter in \([0, 1]\).
   * @returns The evaluated cubic value at `t`.
   */
  function cubic_eval(
    p0: number,
    p1: number,
    p2: number,
    p3: number,
    t: number
  ): number {
    const mt = 1 - t;
    return (
      mt * mt * mt * p0 +
      3 * mt * mt * t * p1 +
      3 * mt * t * t * p2 +
      t * t * t * p3
    );
  }

  /**
   * Calculates the exact bounding box of a single cubic Bézier segment by finding all extrema.
   * @param a - The start vertex \([x, y]\).
   * @param ta - The start tangent (relative to `a`).
   * @param b - The end vertex \([x, y]\).
   * @param tb - The end tangent (relative to `b`).
   * @returns The bounding box \(\{ x, y, width, height \}\) that encloses the entire cubic.
   */
  export function getBBox(segment: CubicBezierWithTangents): Rectangle {
    const { a, b, ta, tb } = segment;
    if (ta[0] === 0 && ta[1] === 0 && tb[0] === 0 && tb[1] === 0) {
      return cmath.rect.fromPoints([a, b]);
    }
    const c1: Vector2 = [a[0] + ta[0], a[1] + ta[1]];
    const c2: Vector2 = [b[0] + tb[0], b[1] + tb[1]];

    const dx = cubic_deriv_coeffs(a[0], c1[0], c2[0], b[0]);
    const dy = cubic_deriv_coeffs(a[1], c1[1], c2[1], b[1]);
    const tx = solve_quad(dx[0], dx[1], dx[2]);
    const ty = solve_quad(dy[0], dy[1], dy[2]);

    const candidates = new Set<number>([0, 1]);
    for (const t of tx) if (t >= 0 && t <= 1) candidates.add(t);
    for (const t of ty) if (t >= 0 && t <= 1) candidates.add(t);

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const t of Array.from(candidates)) {
      const x = cubic_eval(a[0], c1[0], c2[0], b[0], t);
      const y = cubic_eval(a[1], c1[1], c2[1], b[1], t);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Converts an SVG elliptical arc to one or more cubic Bézier curve segments.
   *
   * The `a2c` function transforms the parameters of an SVG elliptical arc into a series of cubic Bézier curves,
   * which are widely used in vector graphics for their smoothness and compatibility with various rendering engines.
   *
   * This implementation is inspired by Snap.svg's `a2c` function and adheres to the SVG specification's
   * [Arc Implementation Notes](https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes).
   *
   * **Note:** The function does not include the start point (`x1`, `y1`) in its output. It is assumed that the
   * start point is managed externally. The returned array consists of control points and end points for cubic Bézier curves.
   *
   * @param x1 - The x-coordinate of the starting point of the arc.
   * @param y1 - The y-coordinate of the starting point of the arc.
   * @param rx - The x-axis radius of the ellipse. Must be a non-negative number.
   * @param ry - The y-axis radius of the ellipse. Must be a non-negative number.
   * @param angle - The rotation angle of the ellipse in degrees, indicating how the ellipse is rotated relative to the x-axis.
   * @param large_arc_flag - A flag indicating whether the arc spans greater than 180 degrees (`1`) or not (`0`).
   * @param sweep_flag - A flag indicating the direction of the arc sweep. `1` for clockwise, `0` for counterclockwise.
   * @param x2 - The x-coordinate of the ending point of the arc.
   * @param y2 - The y-coordinate of the ending point of the arc.
   * @param recursive - (Optional) Internal parameter used for recursive splitting of the arc into smaller segments.
   *                    This parameter should not be provided by external callers.
   *
   * @returns An array of numbers representing one or more cubic Bézier curve segments.
   * Each cubic Bézier segment is represented by six consecutive numbers in the format:
   * `[c1x, c1y, c2x, c2y, x, y]`, where:
   * - `c1x, c1y` are the coordinates of the first control point.
   * - `c2x, c2y` are the coordinates of the second control point.
   * - `x, y` are the coordinates of the end point of the curve.
   *
   * If the arc spans more than 120 degrees, the function splits it into multiple cubic Bézier segments to maintain accuracy.
   *
   * @example
   * // Convert a simple arc to a single cubic Bézier curve
   * const bezierSegments = a2c(0, 0, 50, 50, 0, 0, 1, 50, 50);
   * console.log(bezierSegments);
   * // Output: [27.614237491539665, 0, 50, 22.385762508460335, 50, 50]
   *
   * @example
   * // Convert a large arc (270 degrees) into multiple cubic Bézier curves
   * const bezierSegments = a2c(0, 0, 100, 100, 0, 1, 1, 100, 0);
   * console.log(bezierSegments);
   * // Output: [c1x, c1y, c2x, c2y, x, y, ...]
   *
   * @example
   * // Handle a rotated ellipse arc
   * const bezierSegments = a2c(0, 0, 50, 100, 45, 0, 1, 50, 100);
   * console.log(bezierSegments);
   * // Output: [rotated_c1x, rotated_c1y, rotated_c2x, rotated_c2y, rotated_x, rotated_y]
   *
   * @throws {Error} If either `rx` or `ry` is negative.
   * @throws {Error} If non-numeric values are provided as inputs.
   *
   * @remarks
   * - The function assumes that the input radii (`rx`, `ry`) are non-negative. Negative radii will cause the function to throw an error.
   * - The rotation angle (`angle`) is measured in degrees and is converted internally to radians for calculations.
   * - If the input arc spans more than 120 degrees, the function recursively splits it into smaller segments to ensure that each cubic Bézier curve accurately represents the arc.
   * - The function handles cases where the arc needs to be adjusted based on the large arc and sweep flags, adhering to the SVG specification.
   * - The `recursive` parameter is intended for internal use only and should not be supplied by external callers.
   *
   * @see [SVG 1.1 Implementation Notes - Elliptical Arcs](https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes)
   * @see [Snap.svg's a2c Function](https://github.com/adobe-webplatform/Snap.svg/blob/master/src/path.js#L752)
   */
  export function a2c(
    x1: number,
    y1: number,
    rx: number,
    ry: number,
    angle: number,
    large_arc_flag: 0 | 1,
    sweep_flag: 0 | 1,
    x2: number,
    y2: number,
    recursive?: [number, number, number, number]
  ): number[] {
    // for more information of where this math came from visit:
    // http://www.w3.org/TR/SVG11/implnote.html#ArcImplementationNotes
    var _120 = (cmath.PI * 120) / 180,
      rad = (cmath.PI / 180) * (+angle || 0);

    var res: number[] = [];

    var xy: { x: number; y: number };

    const rotate = function (x: number, y: number, rad: number) {
      var X = x * cmath.cos(rad) - y * cmath.sin(rad),
        Y = x * cmath.sin(rad) + y * cmath.cos(rad);
      return { x: X, y: Y };
    };

    if (!rx || !ry) {
      return [x1, y1, x2, y2, x2, y2];
    }
    if (!recursive) {
      xy = rotate(x1, y1, -rad);
      x1 = xy.x;
      y1 = xy.y;
      xy = rotate(x2, y2, -rad);
      x2 = xy.x;
      y2 = xy.y;
      var x = (x1 - x2) / 2,
        y = (y1 - y2) / 2;
      var h = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (h > 1) {
        h = cmath.sqrt(h);
        rx = h * rx;
        ry = h * ry;
      }
      var rx2 = rx * rx,
        ry2 = ry * ry,
        k =
          (large_arc_flag == sweep_flag ? -1 : 1) *
          cmath.sqrt(
            cmath.abs(
              (rx2 * ry2 - rx2 * y * y - ry2 * x * x) /
                (rx2 * y * y + ry2 * x * x)
            )
          ),
        cx = (k * rx * y) / ry + (x1 + x2) / 2,
        cy = (k * -ry * x) / rx + (y1 + y2) / 2,
        f1 =
          // @ts-expect-error
          cmath.asin(((y1 - cy) / ry).toFixed(9)),
        f2 =
          // @ts-expect-error
          cmath.asin(((y2 - cy) / ry).toFixed(9));

      f1 = x1 < cx ? cmath.PI - f1 : f1;
      f2 = x2 < cx ? cmath.PI - f2 : f2;
      f1 < 0 && (f1 = cmath.PI * 2 + f1);
      f2 < 0 && (f2 = cmath.PI * 2 + f2);
      if (sweep_flag && f1 > f2) {
        f1 = f1 - cmath.PI * 2;
      }
      if (!sweep_flag && f2 > f1) {
        f2 = f2 - cmath.PI * 2;
      }
    } else {
      f1 = recursive[0];
      f2 = recursive[1];
      cx = recursive[2];
      cy = recursive[3];
    }
    var df = f2 - f1;
    if (cmath.abs(df) > _120) {
      var f2old = f2,
        x2old = x2,
        y2old = y2;
      f2 = f1 + _120 * (sweep_flag && f2 > f1 ? 1 : -1);
      x2 = cx + rx * cmath.cos(f2);
      y2 = cy + ry * cmath.sin(f2);
      res = a2c(x2, y2, rx, ry, angle, 0, sweep_flag, x2old, y2old, [
        f2,
        f2old,
        cx,
        cy,
      ]);
    }
    df = f2 - f1;
    var c1 = cmath.cos(f1),
      s1 = cmath.sin(f1),
      c2 = cmath.cos(f2),
      s2 = cmath.sin(f2),
      t = cmath.tan(df / 4),
      hx = (4 / 3) * rx * t,
      hy = (4 / 3) * ry * t,
      m1 = [x1, y1],
      m2 = [x1 + hx * s1, y1 - hy * c1],
      m3 = [x2 + hx * s2, y2 - hy * c2],
      m4 = [x2, y2];
    m2[0] = 2 * m1[0] - m2[0];
    m2[1] = 2 * m1[1] - m2[1];
    if (recursive) {
      // @ts-ignore
      return [m2, m3, m4].concat(res);
    } else {
      // @ts-ignore
      res = [m2, m3, m4].concat(res).join().split(",");
      var newres = [];
      for (var i = 0, ii = res.length; i < ii; i++) {
        newres[i] =
          i % 2
            ? rotate(res[i - 1], res[i], rad).y
            : rotate(res[i], res[i + 1], rad).x;
      }
      return newres;
    }
  }
}

export namespace cmath.transform {
  export const identity: Transform = [
    [1, 0, 0],
    [0, 1, 0],
  ];

  /** 2x3 matrix multiply: C = A * B */
  export function multiply(A: Transform, B: Transform): Transform {
    return [
      [
        A[0][0] * B[0][0] + A[0][1] * B[1][0],
        A[0][0] * B[0][1] + A[0][1] * B[1][1],
        A[0][0] * B[0][2] + A[0][1] * B[1][2] + A[0][2],
      ],
      [
        A[1][0] * B[0][0] + A[1][1] * B[1][0],
        A[1][0] * B[0][1] + A[1][1] * B[1][1],
        A[1][0] * B[0][2] + A[1][1] * B[1][2] + A[1][2],
      ],
    ];
  }

  /**
   * Applies a scaling transformation to a 2D transform matrix around a specified absolute origin.
   *
   * This function adjusts the scaling of an existing transformation matrix
   * by translating to a defined `transformOrigin`, applying the scaling, and then translating back.
   *
   * @param scale - The scaling factor. Can be a single number (uniform scaling) or a `Vector2` for non-uniform scaling.
   * @param transform - The original 2D transform matrix to which the scaling will be applied.
   * @param transformOrigin - The absolute origin `[originX, originY]` around which the scaling is performed.
   * @returns A new transform matrix with the scaling applied around the specified `transformOrigin`.
   *
   * ### Example
   * ```typescript
   * const transform: cmath.Transform = [
   *   [1, 0, 10], // ScaleX, ShearY, TranslateX
   *   [0, 1, 20], // ShearX, ScaleY, TranslateY
   * ];
   * const scaleFactor: number = 2;
   * const transformOrigin: cmath.Vector2 = [50, 50];
   *
   * const scaled = cmath.transform.scale(scaleFactor, transform, transformOrigin);
   * console.log(scaled);
   * // Output: [
   * //   [2, 0, -40], // Adjusted scaling and translation
   * //   [0, 2, -80],
   * // ]
   * ```
   *
   * ### Remarks
   * - The `transformOrigin` is provided in absolute coordinates.
   * - The function ensures the scaling operation is performed relative to the specified origin.
   * - Uniform scaling is applied if `scale` is a single number; otherwise, non-uniform scaling is applied.
   */
  export function scale(
    scale: number | cmath.Vector2,
    transform: Transform,
    transformOrigin: cmath.Vector2
  ): Transform {
    const [scaleX, scaleY] = typeof scale === "number" ? [scale, scale] : scale;

    // Translate to origin
    const translateToOrigin: Transform = [
      [1, 0, -transformOrigin[0]],
      [0, 1, -transformOrigin[1]],
    ];

    // Apply scaling
    const scalingMatrix: Transform = [
      [scaleX, 0, 0],
      [0, scaleY, 0],
    ];

    // Translate back from origin
    const translateBack: Transform = [
      [1, 0, transformOrigin[0]],
      [0, 1, transformOrigin[1]],
    ];

    // Combine: Translate to origin -> Scale -> Translate back
    const scaledTransform = multiply(
      translateBack,
      multiply(scalingMatrix, translateToOrigin)
    );

    // Apply scaling to the existing transform
    return multiply(scaledTransform, transform);
  }
  /**
   * Extracts the scaling factors from a 2D transformation matrix.
   *
   * @param transform - The transformation matrix to extract the scale from.
   * @returns A `Vector2` containing the scaling factors `[scaleX, scaleY]`.
   *
   * @example
   * const transform: cmath.Transform = [
   *   [2, 0, 10], // ScaleX, ShearY, TranslateX
   *   [0, 3, 20], // ShearX, ScaleY, TranslateY
   * ];
   * const scale = cmath.transform.getScale(transform);
   * console.log(scale); // Output: [2, 3]
   */
  export function getScale(transform: cmath.Transform): cmath.Vector2 {
    const scaleX = Math.sqrt(transform[0][0] ** 2 + transform[0][1] ** 2);
    const scaleY = Math.sqrt(transform[1][0] ** 2 + transform[1][1] ** 2);

    return [scaleX, scaleY];
  }

  /**
   * Extracts the translation components (translateX, translateY) from a 2D transformation matrix.
   *
   * @param transform - The transformation matrix to extract the translation from.
   * @returns A `Vector2` containing the translation `[translateX, translateY]`.
   *
   * @example
   * const transform: cmath.Transform = [
   *   [1, 0, 10], // ScaleX, ShearY, TranslateX
   *   [0, 1, 20], // ShearX, ScaleY, TranslateY
   * ];
   * const translate = cmath.transform.getTranslate(transform);
   * console.log(translate); // Output: [10, 20]
   */
  export function getTranslate(transform: cmath.Transform): cmath.Vector2 {
    return [transform[0][2], transform[1][2]];
  }

  /**
   * Applies a translation to a 2D transform matrix.
   *
   * @param transform - The original 2D transform matrix.
   * @param delta - The translation vector `[deltaX, deltaY]` to apply.
   * @returns A new transform matrix with the translation applied.
   *
   * @example
   * const transform: cmath.Transform = [
   *   [1, 0, 10], // ScaleX, ShearY, TranslateX
   *   [0, 1, 20], // ShearX, ScaleY, TranslateY
   * ];
   * const delta: cmath.Vector2 = [5, -10];
   * const translated = cmath.transform.translate(transform, delta);
   * console.log(translated);
   * // Output:
   * // [
   * //   [1, 0, 15], // TranslateX becomes 10 + 5 = 15
   * //   [0, 1, 10], // TranslateY becomes 20 - 10 = 10
   * // ]
   */
  export function translate(
    transform: Transform,
    delta: cmath.Vector2
  ): Transform {
    const [deltaX, deltaY] = delta;

    return [
      [transform[0][0], transform[0][1], transform[0][2] + deltaX],
      [transform[1][0], transform[1][1], transform[1][2] + deltaY],
    ];
  }

  /**
   * Produces a relative 2D transform matrix for a linear gradient at `deg` degrees
   * in a normalized 1x1 space (Figma-like behavior).
   */
  export function computeRelativeLinearGradientTransform(
    deg: number
  ): Transform {
    // Convert to radians
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Translate center to origin
    const Tneg: Transform = [
      [1, 0, -0.5],
      [0, 1, -0.5],
    ];

    // Rotate
    const R: Transform = [
      [cos, -sin, 0],
      [sin, cos, 0],
    ];

    // Translate origin back to center
    const Tpos: Transform = [
      [1, 0, 0.5],
      [0, 1, 0.5],
    ];

    // Compose final = Tpos * R * Tneg
    const TR = multiply(R, Tneg);
    return multiply(Tpos, TR);
  }

  /**
   * Extracts the approximate rotation angle (in degrees) from a 2×3 affine transform matrix.
   *
   * @param transform - The 2D transform matrix:
   *   [
   *     [a, b, tx],
   *     [c, d, ty]
   *   ]
   * @returns The rotation angle in degrees, derived via `atan2(c, a)`.
   *
   * @remarks
   * - This assumes the matrix is primarily rotation (plus optional uniform scaling).
   *   If there's skew or non-uniform scaling, the computed angle might be off.
   * - The returned angle is in the range (-180, 180].
   */
  export function angle(transform: Transform): number {
    const [[a, b, _tx], [c, d, _ty]] = transform;
    const radians = Math.atan2(c, a); // typical for rotation matrix: a = cosθ, c = sinθ
    const degrees = radians * (180 / Math.PI);
    return degrees;
  }
}

/**
 * Algorithms and utilities for rectangle packing, bin packing, and layout optimization.
 *
 * Provides core implementations for various rectangle packing algorithms useful for graphical canvas
 * applications, UI layout management, and efficient spatial utilization scenarios.
 *
 * ### Common Use Cases:
 * - Arranging graphical elements dynamically on a canvas.
 * - Sprite sheet generation.
 * - UI element placement and responsive layout systems.
 * - Spatial optimization tasks such as texture atlas management.
 *
 * @remarks
 * These algorithms are optimized for performance and clarity, suitable for real-time graphical
 * applications where efficiency is critical.
 *
 */
export namespace cmath.packing {
  /**
   * Calculates the next viable placement for a rectangular agent within a bounded domain.
   *
   * Given a rectangular domain V, an agent of dimensions (w, h), and a set of occupied regions A,
   * this function computes a candidate placement R ⊆ V such that R ∩ a = ∅ for every a ∈ A.
   *
   * @param view - The domain rectangle V defined by (x, y, width, height).
   * @param agent - An object with dimensions {width: number, height: number} for the agent.
   * @param anchors - An array of rectangles representing occupied regions A (which may extend beyond V).
   * @returns A rectangle R = (x, y, w, h) representing the placement of the agent, or null if none exists.
   *
   * @remarks
   * This function implements a foundational variation of the MaxRects algorithm:
   * 1. Initialize F = {V}.
   * 2. For each a ∈ A, replace each r ∈ F with r \ a.
   * 3. Select a candidate r ∈ F such that r.width ≥ w and r.height ≥ h, using a lexicographical minimality criterion.
   */
  export function next_placement(
    view: Rectangle,
    agent: { width: number; height: number },
    anchors: Rectangle[]
  ): Rectangle | null {
    let freeRegions: Rectangle[] = [view];
    for (const anchor of anchors) {
      let updatedRegions: Rectangle[] = [];
      for (const region of freeRegions) {
        updatedRegions.push(...cmath.rect.boolean.subtract(region, anchor));
      }
      freeRegions = updatedRegions;
    }
    const candidates = freeRegions.filter(
      (r) => r.width >= agent.width && r.height >= agent.height
    );
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.y - b.y || a.x - b.x);
    const chosen = candidates[0];
    return {
      x: chosen.x,
      y: chosen.y,
      width: agent.width,
      height: agent.height,
    };
  }
}

/**
 * Rasterization utilities for drawing lines between points (e.g., "connect the dots")
 * in integer pixel coordinates, returning the set of covered pixels.
 */
export namespace cmath.raster {
  /**
   * Returns the fractional part of a number.
   *
   * @param x - The input number.
   * @returns The fractional part of x.
   *
   * @example
   * ```ts
   * const frac = fract(3.14); // 0.14
   * ```
   */
  export function fract(x: number): number {
    return x - Math.floor(x);
  }

  /**
   * Computes a pseudo-random noise value for the given 2D coordinates.
   *
   * This function generates white noise based on the input coordinates by using a simple hash
   * based on the sine function and a set of pre-determined constants. The constants
   * `12.9898`, `78.233`, and `43758.5453` are used as "magic numbers" that have been empirically
   * chosen to produce a good spread of values. They ensure that small differences in input coordinates
   * yield significant changes in the output, a technique commonly seen in GLSL noise implementations.
   *
   * The calculation performed is:
   *   noise(x, y) = fract(sin(x * 12.9898 + y * 78.233) * 43758.5453)
   * where `fract` returns the fractional part of a number.
   *
   * @param x - The x-coordinate.
   * @param y - The y-coordinate.
   * @returns A pseudo-random noise value in the range [0, 1].
   *
   * @example
   * ```ts
   * const value = cmath.raster.noise(12.34, 56.78);
   * console.log(value); // e.g., 0.8453
   * ```
   *
   * @remarks
   * While this method is fast and useful for generating grain or noise patterns in graphics applications,
   * it is not suitable for high-quality noise generation.
   */
  export function noise(x: number, y: number): number {
    return fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
  }

  /**
   * A Bitmap represents a raw grid of pixels.
   *
   * This is a foundational model for 2D raster-based graphics.
   * It contains the width, height, and a flat array of pixel data (RGBA).
   *
   * @example
   * const bmp: Bitmap = {
   *   width: 256,
   *   height: 256,
   *   data: new Uint8ClampedArray(256 * 256 * 4),
   * };
   */
  export type Bitmap = {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  };

  /**
   * Tiles a source bitmap over a specified target area.
   *
   * This function creates a new bitmap by repeating (tiling) the source bitmap
   * to cover the target dimensions. The source image is repeated both horizontally
   * and vertically using modulo arithmetic.
   *
   * @param source - The source bitmap to tile.
   * @param width - The desired width of the output bitmap.
   * @param height - The desired height of the output bitmap.
   * @returns A new Bitmap object with the given target dimensions, filled by tiling the source.
   *
   * @example
   * const sourceBitmap: Bitmap = { width: 100, height: 100, data: sourceData };
   * const tiledBitmap = cmath.raster.tile(sourceBitmap, 300, 200);
   * // tiledBitmap now has width 300 and height 200, with the 100x100 source repeated.
   */
  export function tile(source: Bitmap, width: number, height: number): Bitmap {
    const out = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Wrap around source coordinates using modulo arithmetic.
        const srcX = x % source.width;
        const srcY = y % source.height;
        const srcIdx = (srcY * source.width + srcX) * 4;
        const tgtIdx = (y * width + x) * 4;

        out[tgtIdx] = source.data[srcIdx];
        out[tgtIdx + 1] = source.data[srcIdx + 1];
        out[tgtIdx + 2] = source.data[srcIdx + 2];
        out[tgtIdx + 3] = source.data[srcIdx + 3];
      }
    }

    return { width: width, height: height, data: out };
  }

  /**
   * Scales a Bitmap by separate factors along the x and y axes.
   *
   * This function creates a new Bitmap that is a scaled version of the source Bitmap.
   * The scaling factors are applied independently to the width and height.
   *
   * When scaling up (i.e. when either factor > 1), each destination pixel is mapped
   * back to a source pixel using a nearest-neighbor approach (via Math.floor). This
   * means that multiple destination pixels may be filled with the same source pixel's
   * value, resulting in a blocky, pixelated appearance. No interpolation or smoothing
   * is performed by this algorithm.
   *
   * @param bitmap - The source Bitmap to scale.
   * @param factor - The scaling factors as a 2D vector [factorX, factorY]. Both values must be positive.
   * @returns A new Bitmap with its dimensions scaled by the specified factors.
   *
   * @example
   * ```ts
   * const originalBitmap: Bitmap = { width: 100, height: 100, data: originalData };
   * const scaledBitmap = cmath.raster.scale(originalBitmap, [2, 1.5]);
   * // scaledBitmap.width ≈ 200, scaledBitmap.height ≈ 150.
   * ```
   *
   * @remarks
   * When scaling up, each destination pixel is computed by mapping its coordinate back to
   * the source image using nearest-neighbor sampling (via Math.floor). This approach replicates
   * source pixels over multiple destination pixels, which can result in a blocky or pixelated
   * appearance when the image is enlarged.
   */
  export function scale(bitmap: Bitmap, factor: [number, number]): Bitmap {
    const [factorX, factorY] = factor;
    if (factorX <= 0 || factorY <= 0) {
      throw new Error("Scaling factors must be positive.");
    }
    const width = Math.max(1, Math.floor(bitmap.width * factorX));
    const height = Math.max(1, Math.floor(bitmap.height * factorY));
    const out = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Compute the corresponding source pixel using inverse mapping.
        const srcX = Math.floor(x / factorX);
        const srcY = Math.floor(y / factorY);
        const srcIdx = (srcY * bitmap.width + srcX) * 4;
        const dstIdx = (y * width + x) * 4;

        out[dstIdx] = bitmap.data[srcIdx];
        out[dstIdx + 1] = bitmap.data[srcIdx + 1];
        out[dstIdx + 2] = bitmap.data[srcIdx + 2];
        out[dstIdx + 3] = bitmap.data[srcIdx + 3];
      }
    }

    return { width: width, height: height, data: out };
  }

  /**
   * Resizes a bitmap to the specified dimensions using nearest-neighbor scaling.
   * Internally, this computes scaling factors and delegates to {@link scale}.
   *
   * @param bitmap - The source bitmap to resize.
   * @param dst - The destination dimensions as [width, height].
   * @returns A new bitmap with the resized dimensions.
   *
   * @example
   * ```ts
   * const resized = cmath.raster.resize(originalBitmap, [200, 150]);
   * ```
   */
  export function resize(bitmap: Bitmap, dst: cmath.Vector2): Bitmap {
    const [w2, h2] = dst;
    const factorX = w2 / bitmap.width;
    const factorY = h2 / bitmap.height;
    return scale(bitmap, [factorX, factorY]);
  }

  /**
   * Pads a Bitmap to the specified dimensions without scaling the source.
   * The source image is centered on a new canvas filled with a background color.
   *
   * @param bitmap - The source Bitmap.
   * @param dst - The destination dimensions as [width, height].
   * @param bg - The background color as an RGBA array. Default is transparent [0, 0, 0, 0].
   * @returns A new Bitmap with the source image centered on a padded canvas.
   *
   * @example
   * ```ts
   * const padded = cmath.raster.pad(originalBitmap, [300, 300], [255, 255, 255, 255]);
   * ```
   */
  export function pad(
    bitmap: Bitmap,
    dst: cmath.Vector2,
    bg: cmath.Vector4 = [0, 0, 0, 0]
  ): Bitmap {
    const [dstWidth, dstHeight] = dst;
    const out = new Uint8ClampedArray(dstWidth * dstHeight * 4);

    // Fill the new canvas with the background color.
    for (let i = 0; i < dstWidth * dstHeight; i++) {
      const idx = i * 4;
      out[idx] = bg[0];
      out[idx + 1] = bg[1];
      out[idx + 2] = bg[2];
      out[idx + 3] = bg[3];
    }

    // Center the source image on the new canvas.
    const offsetX = Math.floor((dstWidth - bitmap.width) / 2);
    const offsetY = Math.floor((dstHeight - bitmap.height) / 2);

    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        const srcIdx = (y * bitmap.width + x) * 4;
        const dstX = x + offsetX;
        const dstY = y + offsetY;
        if (dstX < 0 || dstX >= dstWidth || dstY < 0 || dstY >= dstHeight)
          continue;
        const dstIdx = (dstY * dstWidth + dstX) * 4;
        out[dstIdx] = bitmap.data[srcIdx];
        out[dstIdx + 1] = bitmap.data[srcIdx + 1];
        out[dstIdx + 2] = bitmap.data[srcIdx + 2];
        out[dstIdx + 3] = bitmap.data[srcIdx + 3];
      }
    }

    return { width: dstWidth, height: dstHeight, data: out };
  }

  /**
   * Computes a Gaussian weight based on a normalized distance.
   *
   * This function calculates a weight using a Gaussian function:
   *
   *   f(x) = exp(-x² / (2σ²))
   *
   * In this implementation, we reformulate it using a parameter `k` (where k = 1/(2σ²)).
   * The `hardness` parameter, ranging from 0 to 1, interpolates between two preset k values,
   * controlling the steepness of the falloff:
   *
   * - When hardness is 0, a higher k (e.g., 10) is used, resulting in a very steep decay.
   * - When hardness is 1, a lower k (e.g., 2) is used, producing a gentler decay.
   *
   * This mathematical function is useful for simulating gradual transitions.
   * For example, in a digital painting application, you might use this function to compute
   * the per-pixel opacity of a painting stroke—pixels near the center of the stroke receive a
   * higher weight, while those further away fade out rapidly.
   *
   * @param normDist - The normalized distance from the center (typically in the range [0, 1]).
   * @param hardness - A value between 0 and 1 that adjusts the steepness of the falloff.
   *                   A value of 0 produces a rapid decay (concentrating the effect near the center),
   *                   whereas 1 produces a gentler decay.
   * @returns The computed weight.
   *
   * @example
   * // In a digital painting tool, calculate the opacity weight for a pixel:
   * const normDist = 0.5; // e.g., pixel is halfway from the stroke's center to its edge.
   * const hardness = 0.0; // soft setting: steep decay
   * const opacityWeight = gaussian(normDist, hardness);
   *
   * // Use `opacityWeight` to modulate the alpha channel when blending the stroke.
   */
  export function gaussian(normDist: number, hardness: number): number {
    const kHard = 2; // Lower k: gentler falloff.
    const kSoft = 10; // Higher k: steeper falloff.
    const k = hardness * kHard + (1 - hardness) * kSoft;
    return Math.exp(-k * normDist * normDist);
  }

  /**
   * Generalized smoothstep function.
   *
   * This function is analogous to GLSL's built-in smoothstep (and its variant "smootherstep"),
   * but allows you to specify the order (N) for a customizable falloff curve.
   *
   * @param N - The order of the smoothStep (e.g., N=2 corresponds to the common "smootherstep").
   * @param x - A value in the range [0, 1].
   * @returns The smoothed value.
   */
  export function smoothstep(N: number, x: number): number {
    x = clamp(x, 0, 1);
    let result = 0;
    for (let n = 0; n <= N; ++n) {
      result +=
        pascaltriangle(-N - 1, n) *
        pascaltriangle(2 * N + 1, N - n) *
        Math.pow(x, N + n + 1);
    }
    return result;
  }

  /**
   * Computes the binomial coefficient using a generalized formulation of Pascal's Triangle.
   *
   * This function calculates the value of the binomial coefficient (often read as "a choose b") without
   * explicitly using factorials. It supports cases where `a` may be negative by using a generalized
   * formulation derived from Pascal's Triangle.
   *
   * @param a - The upper parameter in the binomial coefficient expression; can be negative.
   * @param b - The lower parameter (a non-negative integer) representing the number of selections.
   * @returns The computed binomial coefficient.
   *
   * @remarks
   * The calculation performed is equivalent to:
   * \[
   * \binom{a}{b} = \frac{a \cdot (a-1) \cdot \ldots \cdot (a-b+1)}{b!}
   * \]
   * This iterative approach avoids direct factorial computation, which allows for handling negative values for `a`.
   */
  export function pascaltriangle(a: number, b: number): number {
    let result = 1;
    for (let i = 0; i < b; ++i) {
      result *= (a - i) / (i + 1);
    }
    return result;
  }

  /**
   * Returns all integer pixel coordinates (x, y) along a straight line
   * between (x0, y0) and (x1, y1) using Bresenham's algorithm.
   *
   * @param a - start point in integer pixel coordinates (x, y).
   * @param b - end point in integer pixel coordinates (x, y).
   * @returns An array of {@link cmath.Vector2} objects for each pixel along the line.
   *
   * @example
   * ```ts
   * const linePixels = cmath.raster.bresenhamLine([10, 10], [15, 20]);
   * // linePixels => [
   * //   [10, 10],
   * //   [10, 11],
   * //   [10, 12],
   * //   ...
   * // ]
   * ```
   */
  export function bresenham(
    a: cmath.Vector2,
    b: cmath.Vector2
  ): Array<Vector2> {
    let [x0, y0] = a;
    let [x1, y1] = b;
    const pixels: Array<cmath.Vector2> = [];
    let dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;

    while (true) {
      pixels.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return pixels;
  }

  /**
   * Computes all integer pixel coordinates within a circle centered at `center` with radius `radius`.
   * Optionally, clips the points to the bounding box specified by `clipRect`.
   *
   * @param center - The center of the circle `[cx, cy]`.
   * @param radius - The radius of the circle in pixels.
   * @param clipRect - An optional `{ x, y, width, height }` rectangle for clipping.
   *                   If omitted, no clipping is applied.
   * @returns A list of `[x, y]` pixel coordinates inside the circle.
   *
   * @example
   * // Circle fill with no clipping
   * const pixels = circle([50, 50], 10);
   *
   * @example
   * // Circle fill, clipped to a rectangle at (40,40) of size 100x100
   * const clippedPixels = circle([50, 50], 10, { x: 40, y: 40, width: 100, height: 100 });
   */
  export function circle(
    center: cmath.Vector2,
    radius: number,
    clipRect?: cmath.Rectangle
  ): Array<cmath.Vector2> {
    const [cx, cy] = center;
    const rSq = radius * radius;
    const results: Array<cmath.Vector2> = [];

    // If we have a clipRect, define bounds; otherwise, -∞ to +∞
    const minX = clipRect ? clipRect.x : -Infinity;
    const minY = clipRect ? clipRect.y : -Infinity;
    const maxX = clipRect ? clipRect.x + clipRect.width - 1 : Infinity;
    const maxY = clipRect ? clipRect.y + clipRect.height - 1 : Infinity;

    const yStart = Math.floor(cy - radius);
    const yEnd = Math.floor(cy + radius);

    for (let y = yStart; y <= yEnd; y++) {
      const dy = y - cy;
      const horizontalSpan = Math.sqrt(rSq - dy * dy);
      if (isNaN(horizontalSpan)) continue; // outside circle

      const left = Math.floor(cx - horizontalSpan);
      const right = Math.floor(cx + horizontalSpan);

      for (let x = left; x <= right; x++) {
        // Clip to rectangle if provided
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        results.push([x, y]);
      }
    }

    return results;
  }

  export function ellipse(
    center: cmath.Vector2,
    radius: cmath.Vector2
  ): cmath.Vector2[] {
    const [cx, cy] = center;
    const [rx, ry] = radius;
    const points: cmath.Vector2[] = [];
    const startX = Math.ceil(cx - rx);
    const endX = Math.floor(cx + rx);
    const startY = Math.ceil(cy - ry);
    const endY = Math.floor(cy + ry);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) {
          points.push([x, y]);
        }
      }
    }
    return points;
  }

  /**
   * Generates an array of integer pixel coordinates within a given rectangle.
   *
   * This function returns all pixel coordinates contained within the specified rectangle.
   * The rectangle is defined by its top-left corner (`x`, `y`) and its dimensions (`width`, `height`).
   *
   * @param rect - A rectangle defined by `{ x, y, width, height }`.
   * @returns An array of `[x, y]` tuples, where each tuple represents an integer pixel coordinate inside the rectangle.
   *
   * @example
   * ```ts
   * const rect = { x: 40, y: 35, width: 20, height: 30 };
   * const points = cmath.raster.rectangle(rect);
   * // points will contain coordinates for pixels within the rectangle spanning:
   * // x from 40 to 60 and y from 35 to 65.
   * ```
   */
  export function rectangle(rect: cmath.Rectangle): cmath.Vector2[] {
    const points: cmath.Vector2[] = [];
    const startX = Math.ceil(rect.x);
    const endX = Math.floor(rect.x + rect.width);
    const startY = Math.ceil(rect.y);
    const endY = Math.floor(rect.y + rect.height);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        points.push([x, y]);
      }
    }
    return points;
  }

  /**
   * Performs a flood fill on a bitmap starting from the given coordinate.
   *
   * The algorithm fills contiguous pixels that match the target color (the color at the starting point)
   * with the provided fillColor using an iterative stack-based approach.
   *
   * **Note:** This function modifies the input bitmap's data directly.
   *
   * @param bitmap - The bitmap to fill.
   * @param pos - The x y coordinate to start filling.
   * @param fill - The color to fill with, as [r, g, b, a].
   *
   * @remarks
   * The function first checks whether the starting pixel's color is already identical to the fillColor.
   * If they match, it returns immediately without performing any fill operations.
   */
  export function floodfill(
    bitmap: Bitmap,
    pos: cmath.Vector2,
    fill: Vector4
  ): void {
    const [x, y] = pos;
    const { width, height, data } = bitmap;
    const idx = (y * width + x) * 4;
    const targetColor: Vector4 = [
      data[idx],
      data[idx + 1],
      data[idx + 2],
      data[idx + 3],
    ];
    if (cmath.vector4.identical(targetColor, fill)) return;

    const stack: [number, number][] = [[x, y]];

    while (stack.length) {
      const [x, y] = stack.pop()!;
      const i = (y * width + x) * 4;
      const currColor: Vector4 = [
        data[i],
        data[i + 1],
        data[i + 2],
        data[i + 3],
      ];
      if (!cmath.vector4.identical(currColor, targetColor)) continue;

      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];

      if (x > 0) stack.push([x - 1, y]);
      if (x < width - 1) stack.push([x + 1, y]);
      if (y > 0) stack.push([x, y - 1]);
      if (y < height - 1) stack.push([x, y + 1]);
    }
  }
}

export namespace cmath.range {
  /**
   * Calculates the mean (average center) of multiple numerical ranges.
   *
   * @param ranges - A variable number of ranges, each represented as a `[start, end]` tuple.
   * @returns The mean center as a single number.
   *
   * @example
   * ```typescript
   * const meanCenter = cmath.range.mean([0, 10], [20, 30], [40, 50]);
   * console.log(meanCenter); // Output: 25
   * ```
   */
  export function mean(...ranges: Range[]): number {
    return (
      ranges
        .map(([start, end]) => (start + end) / 2)
        .reduce((sum, midpoint) => sum + midpoint, 0) / ranges.length
    );
  }

  export function fromRectangle(rect: Rectangle, axis: cmath.Axis): Range {
    return [rect[axis], rect[axis] + cmath.rect.getAxisDimension(rect, axis)];
  }

  export function length(range: Range): number {
    return range[1] - range[0];
  }

  /**
   * returns 3 point chunk, [start, mid, end]
   * @param range
   * @returns
   */
  export function to3PointsChunk(range: Range): [number, number, number] {
    return [range[0], (range[0] + range[1]) / 2, range[1]];
  }

  /**
   * Groups ranges by their uniform gaps.
   *
   * This function identifies subsets of ranges where the gaps between consecutive ranges
   * are consistent within a specified tolerance. Gaps are calculated as the distance
   * between the end of one range and the start of the next. Overlapping ranges are ignored.
   *
   * @param ranges - An array of numerical ranges, each represented as a `[start, end]` tuple.
   * @param tolerance - The allowable deviation for gaps to be considered uniform. Defaults to `0`.
   * @returns An array of grouped ranges with uniform gaps. Each group contains:
   *   - `loop`: The indices of the ranges in the group.
   *   - `min`: The minimum start value among the grouped ranges.
   *   - `max`: The maximum end value among the grouped ranges.
   *   - `gap`: The uniform gap between consecutive ranges (always non-negative). 0 when only one range is present.
   *
   * @example
   * ```typescript
   * const ranges: cmath.Range[] = [
   *   [0, 10],
   *   [15, 25],
   *   [30, 40],
   * ];
   * const result = cmath.range.groupRangesByUniformGap(ranges);
   * console.log(result);
   * // Output:
   * // [
   * //   { loop: [0], min: 0, max: 10, gap: 0 },
   * //   { loop: [1], min: 15, max: 25, gap: 0 },
   * //   { loop: [2], min: 30, max: 40, gap: 0 },
   * //   { loop: [0, 1], min: 0, max: 25, gap: 5 },
   * //   { loop: [0, 2], min: 0, max: 40, gap: 20 },
   * //   { loop: [1, 2], min: 15, max: 40, gap: 5 },
   * //   { loop: [0, 1, 2], min: 0, max: 40, gap: 5 },
   * // ]
   * ```
   *
   * @remarks
   * - The function uses the power set approach, which has exponential time complexity. It's recommended to use it with a reasonable number of ranges.
   * - Overlapping ranges are allowed as long as the gaps between their end and start points are consistent.
   * - The `tolerance` parameter allows for slight variations in gaps, which is useful in scenarios with floating-point precision issues.
   */
  export function groupRangesByUniformGap(
    ranges: Range[],
    k: number = -1,
    tolerance: number = 0
  ): {
    loop: number[];
    min: number;
    max: number;
    gap: number;
  }[] {
    const subsets = cmath.powerset(ranges, k);
    const result: {
      loop: number[];
      min: number;
      max: number;
      gap: number;
    }[] = [];

    main: for (const subset of subsets) {
      if (subset.length === 0) continue;

      if (subset.length === 1) {
        const idx = ranges.indexOf(subset[0]);
        const [start, end] = subset[0];
        result.push({ loop: [idx], min: start, max: end, gap: 0 });
        continue;
      }

      const subsetIndices = ranges
        .map((r, i) => (subset.includes(r) ? i : -1))
        .filter((i) => i !== -1);

      const sorted = subsetIndices
        .slice()
        .sort((a, b) => ranges[a][0] - ranges[b][0]);

      const distances: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const [p0, p1] = [ranges[sorted[i - 1]], ranges[sorted[i]]];
        const dist = p1[0] - p0[1];
        if (dist < 0) continue main;
        distances.push(dist);
      }

      if (cmath.isUniform(distances, tolerance)) {
        const starts = sorted.map((i) => ranges[i][0]);
        const ends = sorted.map((i) => ranges[i][1]);
        result.push({
          loop: sorted,
          min: Math.min(...starts),
          max: Math.max(...ends),
          gap: distances[0] ?? 0,
        });
      }
    }
    return result;
  }
}

export namespace cmath.ext.snap {
  /**
   * A Vector2 that can take null values for each axis.
   *
   * This is for representing snap points that is infinity (or ignore) in counter axis.
   *
   * E.g. for 2D snapping, but where each axis are snapped independently.
   */
  export type AxisAlignedPoint =
    | [number, number]
    | [number, null]
    | [null, number];

  export type Snap1DResult = {
    /**
     * the distance (delta) needs to be applied to the agents to snap within the threshold.
     *
     * `Infinity` if no snap.
     *
     * @example
     *
     * const translated = agents.map((p) => p + distance);
     */
    distance: Scalar;

    /**
     * the indices of the agents that satisfied the snap.
     */
    hit_agent_indices: Scalar[];

    /**
     * the indices of the anchors that the agents snapped to.
     */
    hit_anchor_indices: Scalar[];
  };

  /**
   * Snaps an array of scalar points to the nearest target points within a specified threshold.
   *
   * @param agents - An array of scalar points to snap.
   * @param anchors - An array of existing scalar points to snap to.
   * @param threshold - The maximum allowed distance for snapping.
   * @param tolerance - The tolerance for delta matching.
   * @returns {Snap1DResult} The result of the snapping operation.
   */
  export function snap1D(
    agents: Scalar[],
    anchors: Scalar[],
    threshold: Scalar,
    tolerance = 0
  ): Snap1DResult {
    if (anchors.length === 0) {
      return {
        distance: Infinity,
        hit_agent_indices: [],
        hit_anchor_indices: [],
      };
    }

    assert(threshold >= 0, "Threshold must be a non-negative number.");
    assert(tolerance >= 0, "Epsilon must be a non-negative number.");

    let minDelta = Infinity;
    let signedDelta = 0;
    const hit_agent_indicies: number[] = [];
    const hit_anchor_indicies = new Set<number>();

    // Iterate through each origin to find the minimal delta
    for (let i = 0; i < agents.length; i++) {
      const point = agents[i];
      // Find the closest snapping target
      const [snap, delta, indicies] = cmath.align.scalar(
        point,
        anchors,
        threshold
      );

      const signedDeltaForPoint = snap - point;

      if (Math.abs(delta) <= threshold) {
        if (
          minDelta === Infinity ||
          Math.abs(signedDeltaForPoint - signedDelta) <= tolerance
        ) {
          hit_agent_indicies.push(i);
          indicies.forEach((idx) => hit_anchor_indicies.add(idx));

          // Update minDelta and signedDelta if a smaller delta is found
          if (Math.abs(delta) < Math.abs(minDelta)) {
            minDelta = delta;
            signedDelta = signedDeltaForPoint;
          }
        }
      }
    }

    // If no snapping occurs
    if (minDelta === Infinity) {
      return {
        distance: Infinity,
        hit_agent_indices: [],
        hit_anchor_indices: [],
      };
    }

    // Compute the final snapping delta
    const delta = signedDelta;

    return {
      distance: delta,
      hit_agent_indices: hit_agent_indicies,
      hit_anchor_indices: Array.from(hit_anchor_indicies),
    };
  }

  export type Snap2DAxisonfig = {
    /**
     * false: no snap, otherwise threshold value.
     */
    x: false | number;
    /**
     * false: no snap, otherwise threshold value.
     */
    y: false | number;
  };

  export type Sanp2DAxisAlignedResult = {
    x: cmath.ext.snap.Snap1DResult | null;
    y: cmath.ext.snap.Snap1DResult | null;
  };

  /**
   * Snaps an array of points to the nearest target point along each axis independently.
   * The snapping delta is computed for each axis separately and applied to all points.
   *
   * @param agents - An array of 2D points (Vector2) to snap.
   * @param anchors - An array of existing 2D points to snap to.
   * @param threshold - The maximum allowed single-axis distance for snapping.
   * @returns The snapped points and the delta applied:
   *          - `value`: The translated points.
   *          - `distance`: The delta vector applied to align the points.
   */
  export function snap2DAxisAligned(
    agents: cmath.Vector2[],
    anchors: cmath.ext.snap.AxisAlignedPoint[],
    config: Snap2DAxisonfig,
    tolerance = 0
  ): Sanp2DAxisAlignedResult {
    assert(agents.length > 0, "Agents must contain at least one point.");

    if (anchors.length === 0) {
      return {
        x: null,
        y: null,
      };
    }

    // Separate the scalar points for each axis
    const x_agent_points = agents.map(([x]) => x);
    const y_agent_points = agents.map(([_, y]) => y);

    // Separate anchor points into x and y components
    const x_anchor_points = anchors
      .map(([x]) => x)
      .filter((x): x is number => x !== null);
    const y_anchor_points = anchors
      .map(([_, y]) => y)
      .filter((y): y is number => y !== null);

    // snap each axis
    let x_snap: cmath.ext.snap.Snap1DResult | null = null;
    if (config.x) {
      assert(config.x > 0, "Threshold must be a non-negative number.");
      x_snap = cmath.ext.snap.snap1D(
        x_agent_points,
        x_anchor_points,
        config.x,
        tolerance
      );
    }

    let y_snap: cmath.ext.snap.Snap1DResult | null = null;
    if (config.y) {
      assert(config.y > 0, "Threshold must be a non-negative number.");
      y_snap = cmath.ext.snap.snap1D(
        y_agent_points,
        y_anchor_points,
        config.y,
        tolerance
      );
    }

    return {
      x: x_snap,
      y: y_snap,
    };
  }

  /**
   * Namespace for spacing-related snapping and range calculations.
   *
   * This module provides utilities for working with 1D ranges, calculating spaces between them,
   * and projecting new ranges based on existing ones.
   *
   * **Definitions & Design**
   * - loops
   *    - are aligned ranges with identical gaps (2 or more ranges). but for simplicity, we do this by combinations of ranges (exactly 2 ranges)
   * - each loop has a projected snap extension, `next` (`a`) and `center` (virtually a, b, and center, where b being mirror of a)
   *    - a projected loop data will contain multiple delta (space)
   *      - one is from ‘this’ loop, others from other loops’ space, but within the same direction.
   *    - the delta can be interpreted as ...
   *      - a = loop[-1] + delta (the a point is last loop item (biggest) plus delta.
   *      - b = loop[0] - delta (b is mirrored a)
   *      - center = mean(loop[0].a, loop[-1].b)
   * - the hit test of the range will take direction 1 or -1 (mirrored)
   *    - the `a` testing is used for testing hit between `a` and input’s `a`
   *    - the mirrored testing is used for testing hit between `b` (mirrored a) and input’s `b`
   * - how to tell why it’s snapped
   *    - when input’s a, b or c is hit, it will contain to which loop it’s hit. and the space (except c).
   *    - since the space can be originated from other loops, and multiple loops can have identical spaces, we can return all loops that contains that delta as original space, plus the hit one’s loop
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
    export type ProjectionPoint = {
      /**
       * position
       */
      p: number;

      /**
       * origin position
       */
      o: number;

      /**
       * forwared loop (gap) index (including self)
       *
       * -1 if not forwarded
       */
      fwd: number;
    };

    export type DistributionGeometry1D = {
      /**
       * the ranges to calculate the space from
       */
      ranges: cmath.Range[];

      /**
       * combinations of ranges (overlapping ignored)
       * @example
       * ```
       * ranges = [[0, 10], [20, 30], [40, 50]];
       * loops = [[0, 1], [0, 2], [1, 2]];
       * ```
       */
      loops: number[][];

      /**
       * index-aligned gaps of each loops
       *
       * @example
       *
       * ```
       * // gaps[0] is the gap between loops[0][0] and loops[0][1]
       * ranges = [[0, 10], [20, 30], [40, 50]];
       * loops = [[0, 1], [0, 2], [1, 2]];
       * gaps = [10, 30, 10];
       * ```
       */
      gaps: number[];

      /**
       * index-aligned projections of `a` points and the gap value applied to this point
       *
       * this is not conidered as a "range" since [0] and [1] is not ensured to be in the same direction. ([1] can be smaller than [0])
       *
       * from [1] anchor, the delta is applied, resulting in the [0] point.
       */
      a: ProjectionPoint[][];

      /**
       * index-aligned projections of `b` points
       *
       * this is not conidered as a "range" since [0] and [1] is not ensured to be in the same direction. ([1] can be smaller than [0])
       *
       * from [1] anchor, the delta is applied, resulting in the [0] point.
       */
      b: ProjectionPoint[][];
    };

    /**
     * calculates the space between two ranges, returns a set of projections of the next range for each combination.
     *
     * @param ranges the ranges to calculate the space from
     * @param agentLength optional agent input. the size of this agent will be used for plotting center-originated points. (if the agent fits into the gap)
     *
     * @remarks
     * - ignores the combination if overlaps (to ensure positive space)
     */
    export function plotDistributionGeometry(
      ranges: cmath.Range[],
      agentLength?: Scalar
    ): DistributionGeometry1D {
      const grouped = cmath.range.groupRangesByUniformGap(ranges, 2);

      const loops: [number, number][] = [];
      const gaps: number[] = [];
      const a: ProjectionPoint[][] = [];
      const b: ProjectionPoint[][] = [];

      grouped.forEach((group, i) => {
        const { loop, gap, min, max } = group;

        const _a: ProjectionPoint[] = [];
        const _b: ProjectionPoint[] = [];

        if (gap > 0) {
          // [default gap extensions]
          // default a b points

          _a.push({ p: max + gap, o: max, fwd: i });
          _b.push({ p: min - gap, o: min, fwd: i });

          // [center extensions]
          if (agentLength) {
            if (loop.length === 2) {
              // center a b points
              // if the agent is smaller than the gap, we can also plot the a b based on center.
              if (agentLength < gap) {
                // | (gap) |a|  |c|  |b| (gap) |
                // |       [-----------] < agent

                const center_range = [ranges[loop[0]][1], ranges[loop[1]][0]];
                const center = cmath.mean(...center_range);

                // const center = (min + max) / 2;
                const egap = (gap - agentLength) / 2; // gap that will be applied on each side
                const cpa = center - agentLength / 2;
                const cpb = center + agentLength / 2;

                _a.push({ p: cpa, o: cpa - egap, fwd: -1 });
                _b.push({ p: cpb, o: cpb + egap, fwd: -1 });
              }
            }
          }
        }

        // [forwarded gaps]
        // extended a b points with gap of the other loops where it is in the same direction
        // Compare with other loops to extend projections
        grouped.forEach((test, j) => {
          // skip self
          if (i === j) return;
          if (test.gap <= 0) return;

          // normal direction
          if (test.max < group.max) {
            _a.push({ p: group.max + test.gap, o: group.max, fwd: j });
          }

          if (test.min > group.min) {
            _b.push({ p: group.min - test.gap, o: group.min, fwd: j });
          }
        });

        // add to the result
        loops.push(loop as [number, number]);
        gaps.push(gap);
        a.push(Array.from(_a));
        b.push(Array.from(_b));
      });

      return {
        ranges,
        loops,
        gaps,
        a,
        b,
      };
    }
  }
}

export namespace cmath.ext.movement {
  /**
   * indicates a movement within 2D space.
   *
   * each can be null, when null, it treated as 0 or ignored depending on the context.
   *
   * this is to indicate the context of the movement vector, where 0 means no movement, but null means to ignore that axis.
   */
  export type Movement = [number | null, number | null];

  /**
   * normalizes the movement vector. null is treated as 0.
   * @returns a signed {@link Vector2}
   */
  export function normalize(m: Movement): Vector2 {
    return [m[0] ?? 0, m[1] ?? 0];
  }

  /**
   * returns a new movement vector with single axis locked by dominance.
   *
   * the other axis will be null.
   *
   * @param m
   * @returns
   */
  export function axisLockedByDominance(m: Movement): Movement {
    const [x, y] = m;
    const abs_x = Math.abs(x ?? 0);
    const abs_y = Math.abs(y ?? 0);

    if (abs_x > abs_y) {
      return [x, null];
    } else {
      return [null, y];
    }
  }
}

export namespace cmath.ext.viewport {
  /**
   * Opinionated transform-to-fit for a single canvas zoom.
   * Supports uniform or per-side margin, using the smaller scale to fully fit.
   *
   * @param viewport - The viewport rectangle: { x, y, width, height }
   * @param target - The bounding box of the contents: { x, y, width, height }
   * @param margin - Margin can be a single number (uniform) or [top, right, bottom, left].
   * @returns A 2D transform matrix [[scale, 0, tx], [0, scale, ty]] that fits `target` into `viewport`.
   *
   * @example
   * const viewport = { x: 0, y: 0, width: 800, height: 600 };
   * const target = { x: 100, y: 50, width: 400, height: 400 };
   * const t = transformToFit(viewport, target, [50, 20, 50, 20]);
   * // => e.g. [
   * //    [0.75, 0, 60],
   * //    [0, 0.75, 40],
   * // ]
   */
  export function transformToFit(
    viewport: cmath.Rectangle,
    target: cmath.Rectangle,
    margin: number | [number, number, number, number] = 0
  ): cmath.Transform {
    const [mt, mr, mb, ml] =
      typeof margin === "number" ? [margin, margin, margin, margin] : margin;

    // Effective viewport with margins subtracted
    const vW = viewport.width - ml - mr;
    const vH = viewport.height - mt - mb;
    if (vW <= 0 || vH <= 0 || target.width === 0 || target.height === 0) {
      // Degenerate, no transform
      return [
        [1, 0, viewport.x],
        [0, 1, viewport.y],
      ];
    }

    // Pick the smaller scale so the target fully fits
    const scale = Math.min(vW / target.width, vH / target.height);

    // Center of the "effective" viewport
    const vx = viewport.x + ml + vW / 2;
    const vy = viewport.y + mt + vH / 2;

    // Center of the target
    const tx = target.x + target.width / 2;
    const ty = target.y + target.height / 2;

    // Translate so that target center goes to viewport center
    const translateX = vx - tx * scale;
    const translateY = vy - ty * scale;

    return [
      [scale, 0, translateX],
      [0, scale, translateY],
    ];
  }
}

export namespace cmath.ui {
  /**
   * `['x', 100]` will draw a y-axis line at x=100
   */
  export type Rule = [axis: "x" | "y", offset: number];

  export type Point = {
    label?: string;
    x: number;
    y: number;
  };

  export type Line = {
    label?: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };

  /**
   * Ensures that (x1, y1) <= (x2, y2) in a canonical way.
   *
   * - If `line.x1 > line.x2`, swaps the endpoints.
   * - If `line.x1 === line.x2` but `y1 > y2`, swaps the endpoints.
   *
   * This is often useful so that two line segments describing the
   * “same” geometric positions will have identical (x1, y1, x2, y2).
   *
   * @param line - The line to be normalized, e.g. `{ x1, y1, x2, y2, label? }`.
   * @returns A new `Line` object with possibly swapped endpoints, ensuring
   *          `(x1 < x2)` or `(x1 === x2 && y1 <= y2)`.
   */
  export function normalizeLine<
    T extends {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      label?: string;
    },
  >(line: T): T {
    let { x1, y1, x2, y2 } = line;

    // If the line is “backwards” in x, or has the same x but backwards in y, swap:
    if (x1 > x2 || (x1 === x2 && y1 > y2)) {
      const tempX = x1;
      const tempY = y1;
      x1 = x2;
      y1 = y2;
      x2 = tempX;
      y2 = tempY;
    }

    // Return a new line object in the same shape:
    return {
      ...line,
      x1,
      y1,
      x2,
      y2,
    };
  }

  /**
   * Formats a number to the specified precision only when needed.
   *
   * If the number, after rounding, is an integer (i.e. no meaningful fractional part remains),
   * the function returns the integer as a string without trailing zeros. Otherwise, it formats the
   * number to the provided decimal precision using `toFixed()`.
   *
   * @param num - The number to format.
   * @param precision - The number of decimal places to round to.
   * @returns The formatted number as a string. For example:
   * - `formatNumber(1, 1)` returns `"1"`.
   * - `formatNumber(1.2222, 1)` returns `"1.2"`.
   * - `formatNumber(9.0001, 2)` returns `"9"`.
   *
   * @example
   * // Returns "1" because 9.0001 rounds to 9 with 2 decimal precision and no fractional part remains.
   * formatNumber(9.0001, 2);
   *
   * @example
   * // Returns "9.12" because the rounded value has a non-zero fractional part.
   * formatNumber(9.1234, 2);
   */
  export function formatNumber(num: number, precision: number): string {
    const factor = 10 ** precision;
    const rounded = Math.round(num * factor) / factor;
    // If no decimal part remains, return integer form; otherwise use toFixed
    return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(precision);
  }
}

// export namespace cmath.measure {}
// export namespace cmath.auxiliary_line {}
// export namespace cmath.auxiliary_line.rectangular {
//   // fromPointToVector
//   // sideToPoint
// }
