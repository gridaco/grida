import { intersection } from "./bounding-box";
import type { Box } from "../types";

/**
 * The spacing guide display infromation interface.
 *
 * the top, right, bottom, left spacing is relative to box.
 *
 * the box is usually calculated with two givven input a and b. and its intersection or the origin (a)
 */
interface SpacingGuide {
  box: Box;
  /**
   * top, right, bottom, left
   */
  spacing: [number, number, number, number];
}

/**
 *
 * calculates the base box and the spacing of **nearest** t, r, b, l with givven a and b boxes.
 *
 * the a and b boxes are formed with [x, y, x2, y2] format.
 *
 * - if the two boxes does not intersect, the base box will be the origin (a).
 * - if one of the box is contained in another in the space grid, the base box will be the contained (smaller) box.
 * - if the two boxes intersect, the base box will be the intersection of the two boxes.
 *
 * the top, right, bottom, left spacing is relative to the base box.
 *
 * For example
 * - a = [10, 10, 20, 20], b = [20, 20, 30, 30], then the spacing is [10, 0, 0, 10] and the base box is [20, 20, 20, 20]
 * - a = [10, 10, 20, 20], b = [15, 15, 25, 25], then the spacing is [5, 5, 5, 5] and the base box is [15, 15, 20, 20]
 * - a = [450, 450, 550, 550], b = [0, 0, 1000, 1000], then the spacing is [450, 450, 450, 450] and the base box is [450, 450, 550, 550]
 * - a = [0, 0, 1000, 1000], b = [450, 450, 550, 550], then the spacing is [450, 450, 450, 450] and the base box is [450, 450, 550, 550]
 * - a = [0, 0, 50, 50], b = [0, 0, 20, 20], then the spacing is [0, 30, 30, 0] and the base box is [0, 0, 20, 20]
 * - a = [10, 10, 20, 20], b = [30, 30, 40, 40], then the spacing is [20, 10, 10, 20] and the base box is [10, 10, 20, 20]
 *
 */
export function spacing_guide(a: Box, b: Box): SpacingGuide {
  let box: Box;

  const [a_x, a_y, a_x2, a_y2] = a;
  const [b_x, b_y, b_x2, b_y2] = b;

  // no intersection (if the interecting space is 0, it is also considered as no intersection)
  if (a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]) {
    box = a;
  }

  // a contains b
  else if (a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3]) {
    box = b;
  }

  // b contains a
  else if (a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3]) {
    box = a;
  }

  // intersection
  else {
    // calculate the intersection of two boxes as a coordinate [x, y, x2, y2]
    box = intersection(a, b);
  }

  // calculate the spacing of t, r, b, l
  const spacing: [number, number, number, number] = [
    nearest(a_y, b_y, b_y2),
    nearest(a_x2, b_x, b_x2),
    nearest(a_y2, b_y, b_y2),
    nearest(a_x, b_x, b_x2),
  ];

  return { box, spacing };
}

const nearest = (a: number, ...b: number[]) => {
  return Math.min(...b.map((v) => Math.abs(v - a)));
};
