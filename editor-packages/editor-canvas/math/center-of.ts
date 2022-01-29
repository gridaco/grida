import type { Box, XY } from "../types";

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
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
  ...rects: Rect[]
): {
  box: Box;
  center: XY;
  translate: XY;
  scale: number;
} {
  console.log("get center of", rects, "in", viewbound);
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

  const [x1, y1, x2, y2] = bound(...rects);
  // box containing the rects.
  const box: Box = [x1, y1, x2, y2];
  // center of the box, viewbound not considered.
  const boxcenter: XY = [(x1 + x2) / 2, (y1 + y2) / 2];
  // scale factor to fix the box to the viewbound.
  const scale = Math.min(scaleToFit(box, viewbound), 1); // no need to zoom-in
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

  console.log(translate, scale);

  return {
    box: box,
    center: boxcenter,
    translate: translate,
    scale: scale,
  };
}

function bound(...rects: Rect[]): Box {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const rect of rects) {
    const { x, y, width: w, height: h } = rect;
    // TODO: handle rotation. (no rotation for now)
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x + w);
    y2 = Math.max(y2, y + h);
  }
  return [x1, y1, x2, y2];
}

function rotate(x: number, y: number, r: number): [number, number] {
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [x * cos - y * sin, x * sin + y * cos];
}

function scaleToFit(a: Box, b: Box): number {
  if (!a || !b) {
    return 1;
  }
  const [ax1, ay1, ax2, ay2] = a;
  const [bx1, by1, bx2, by2] = b;
  const aw = ax2 - ax1;
  const ah = ay2 - ay1;
  const bw = bx2 - bx1;
  const bh = by2 - by1;
  const scale = Math.min(bw / aw, bh / ah);
  return scale;
}
