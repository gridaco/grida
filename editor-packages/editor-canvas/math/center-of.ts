type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

type Box = [number, number, number, number];

/**
 * get center of a list of rectangles and the scale factor to fit them all.
 *
 * the rectangle contains x, y, w, h and rotation as r.
 *
 * the output is a bounding box x1, y1, x2, y2 and scale.
 */
export function centerOf(
  bound: Box,
  ...rects: Rect[]
): {
  box: Box;
  center: [number, number];
  scale: number;
} {
  if (!rects || rects.length === 0) {
    return {
      box: [0, 0, 0, 0],
      center: [0, 0],
      scale: 1,
    };
  }

  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;

  for (const rect of rects) {
    const { x, y, width: w, height: h, rotation: r } = rect;
    const [cx, cy] = rotate(x + w / 2, y + h / 2, r);
    x1 = Math.min(x1, cx - w / 2);
    y1 = Math.min(y1, cy - h / 2);
    x2 = Math.max(x2, cx + w / 2);
    y2 = Math.max(y2, cy + h / 2);
  }
  const ww = x2 - x1;
  const hh = y2 - y1;
  const box: Box = [x1, y1, x2, y2];

  return {
    box: box,
    center: [(x1 + x2) / 2, (y1 + y2) / 2],
    scale: scaleToFit(bound, box),
  };
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
