import type { Box, XY, XYWHR } from "../types";
import { boundingbox } from "./bounding-box";

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

/**
 * get center of a list of rectangles and the scale factor to fit them all.
 *
 * the rectangle contains x, y, w, h and rotation as r.
 *
 * the output is a bounding box x1, y1, x2, y2 and scale.
 */
export function centerOf(
  viewbound: Box,
  m: number = 0,
  ...rects: Rect[]
): {
  box: Box;
  /**
   * center of the givven rects
   */
  center: XY;
  translate: XY;
  scale: number;
} {
  const xywhrs = rects.map((r) => {
    return [r.x, r.y, r.width, r.height, r.rotation ?? 0] as XYWHR;
  });
  if (!rects || rects.length === 0) {
    return {
      box: viewbound,
      center: [0, 0],
      translate: [
        viewbound[0] + (viewbound[0] + viewbound[2]) / 2,
        viewbound[1] + (viewbound[1] + viewbound[3]) / 2,
      ],
      scale: 1,
    };
  }

  const [x1, y1, x2, y2] = boundingbox(xywhrs, 2);
  // box containing the rects.
  const box: Box = [x1, y1, x2, y2];
  // center of the box, viewbound not considered.
  const boxcenter: XY = [(x1 + x2) / 2, (y1 + y2) / 2];
  // scale factor to fix the box to the viewbound.
  const scale = scaleToFit(viewbound, box, m);
  // center of the viewbound.
  const vbcenter: XY = [
    viewbound[0] + (viewbound[0] + viewbound[2]) / 2,
    viewbound[1] + (viewbound[1] + viewbound[3]) / 2,
  ];

  // translate x, y to center the box's center into the viewbound's center considering the scale.
  const translate: XY = [
    vbcenter[0] - boxcenter[0] * scale,
    vbcenter[1] - boxcenter[1] * scale,
  ];

  // apply viewbound's offset to the translate.
  // (this works, but not fully tested)
  translate[0] -= viewbound[0];
  translate[1] -= viewbound[1];

  return {
    box: box,
    center: boxcenter,
    translate: translate,
    scale: scale,
  };
}

function rotate(x: number, y: number, r: number): [number, number] {
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [x * cos - y * sin, x * sin + y * cos];
}

/**
 * scale to fit a box into b box. with optional margin.
 * @param a box a container
 * @param b box b contained
 * @param m optional margin @default 0 (does not get affected by the scale)
 * @returns how much to scale should be applied to b to fit a
 *
 * @example
 * const a = [0, 0, 100, 100];
 * const b = [0, 0, 200, 200];
 * const m = 50;
 * => scaleToFit(a, b, m) === 0.4
 *
 * const a = [0, 0, 100, 100];
 * const b = [0, 0, 50, 50];
 * const m = 50;
 * => scaleToFit(a, b, m) === 1
 *
 */
export function scaleToFit(a: Box, b: Box, m: number = 0): number {
  if (!a || !b) {
    return 1;
  }

  const [ax1, ay1, ax2, ay2] = a;
  const [bx1, by1, bx2, by2] = b;

  const aw = ax2 - ax1;
  const ah = ay2 - ay1;
  const bw = bx2 - bx1;
  const bh = by2 - by1;

  const sw = scaleToFit1D(aw, bw, m);
  const sh = scaleToFit1D(ah, bh, m);

  return Math.min(sw, sh);
}

/**
 *
 * @param a line a
 * @param b line b
 * @param m margin
 *
 * @returns the scale factor to be applied to b to fit a with margin
 */
export function scaleToFit1D(a: number, b: number, m: number = 0): number {
  const aw = a;
  const bw = b + m * 2;

  return aw / bw;
}
