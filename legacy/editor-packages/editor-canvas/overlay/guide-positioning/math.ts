import type { Box, XY } from "../../types";
type Side = "t" | "r" | "b" | "l";
type LineXYXYLR = [number, number, number, number, number, number];
/**
 * guide line representation with x, y, x2, y2, length, and rotation
 */
export function guide_line_xylr(
  box: Box,
  side: Side,
  length: number,
  zoom: number = 1
): LineXYXYLR {
  const [x, y, x2, y2] = box;
  // lenght of the line (height in css)
  const tl = length * zoom;
  // transform x
  let tx = 0;
  // transform y
  let ty = 0;
  // transform rotation
  let tr = deg(side, length);

  let tx2 = 0;
  let ty2 = 0;

  switch (side) {
    case "t":
      tx = (x + (x2 - x) / 2) * zoom;
      ty = y * zoom;
      tx2 = tx;
      ty2 = y - tl;
      break;
    case "r":
      tx = x2 * zoom;
      ty = (y + (y2 - y) / 2) * zoom;
      tx2 = x2 + tl;
      ty2 = ty;
      break;
    case "b":
      tx = (x + (x2 - x) / 2) * zoom;
      ty = y2 * zoom;
      tx2 = tx;
      ty2 = y2 + tl;
      break;
    case "l":
      tx = x * zoom;
      ty = (y + (y2 - y) / 2) * zoom;
      tx2 = tx - tl;
      ty2 = ty;
      break;
  }

  return [tx, ty, tx2, ty2, tl, tr];
}

const deg = (side: Side, length: number) => {
  let r: number = __line_rotation_by_side_map[side];
  if (length < 0) {
    r = r * -1;
  }
  return r;
};

const __line_rotation_by_side_map = {
  t: 180,
  r: 270,
  b: 0,
  l: 90,
} as const;

export function auxiliary_line_xylr(
  point: XY,
  b: Box,
  side: Side,
  zoom: number = 1
): LineXYXYLR {
  let [bx, by, bx2, by2] = b;
  const [rx, ry] = point;

  const tx = rx * zoom;
  const ty = ry * zoom;
  // prettier-ignore
  let tx2, ty2, tl, tr = 0;

  if (point_hits_box(point, b)) {
    return [point[0], point[1], NaN, NaN, 0, 0];
  } else {
    switch (side) {
      case "b":
      case "t":
        // the point is to the left of the target box, which means the line should be drawn to the righ
        if (rx < bx) {
          tl = (bx - rx) * zoom;
          tr = -90;
        } else {
          tl = (rx - bx2) * zoom;
          tr = 90;
        }
        break;

      case "r":
      case "l":
        // the point is below the target box, which means the line should be drawn to the above
        if (ry > by2) {
          tl = (ry - by2) * zoom;
          tr = 180;
        } else {
          tl = (by2 - ry) * zoom;
          tr = 0;
        }
        break;
    }

    return [tx, ty, tx2, ty2, tl, tr];
  }
}

/**
 * check if point meets the box
 * @returns
 */
function point_hits_box(point: XY, box: Box): boolean {
  const [x, y, x2, y2] = box;
  const [px, py] = point;
  const hits = px >= x && px <= x2 && py >= y && py <= y2;
  return hits;
}
