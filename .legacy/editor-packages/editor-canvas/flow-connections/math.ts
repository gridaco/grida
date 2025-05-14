import type { XY } from "../types";

/**
 * get the direction based on two points (vector), a and b.
 * returns the most powerful direction, e.g. [0, 0], [10, 50] -> "s"
 * if the power is the same, return "e" | "w" first, then "s" | "n".
 *
 * examples
 * - [0, 0], [10, 50] -> "s"
 * - [0, 0], [10, 0] -> "e"
 * - [0, 0], [0, 50] -> "s"
 * - [0, 0], [0, 0] -> "e"
 * - [0, 0], [-10, 50] -> "n"
 * - [0, 0], [-10, 0] -> "w"
 * - [0, 0], [-10, -50] -> "n"
 * - [0, 0], [-10, 0] -> "w"
 * - [0, 0], [-100, -100] -> "w"
 *
 * @param a
 * @param b
 * @returns
 */
export function get_direction(a: XY, b: XY): "n" | "s" | "e" | "w" {
  const [x, y] = a;
  const [x2, y2] = b;

  const x_diff = x2 - x;
  const y_diff = y2 - y;

  if (Math.abs(x_diff) >= Math.abs(y_diff)) {
    if (x_diff > 0) {
      return "e";
    } else {
      return "w";
    }
  }

  if (y_diff > 0) {
    return "s";
  }

  return "n";
}
