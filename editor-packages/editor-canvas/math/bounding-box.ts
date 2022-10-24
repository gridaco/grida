import type { XYWH, Box, XYWHR, XY } from "../types";

export function xywh_to_bounding_box({
  xywh,
  scale,
}: {
  xywh: XYWH;
  scale: number;
}): Box {
  const [x, y, w, h] = xywh;

  // return the bounding box in [number, number, number, number] form with givven x, y, w, h, rotation and scale.
  const [x1, y1, x2, y2] = [
    x * scale,
    y * scale,
    x * scale + w * scale,
    y * scale + h * scale,
  ];
  return [x1, y1, x2, y2];
}

/**
 * @deprecated - not tested
 * @param box
 * @param zoom
 * @returns
 */
export function zoom_box(box: Box, zoom: number): Box {
  const [x1, y1, x2, y2] = box;
  const [w, h] = [x2 - x1, y2 - y1];
  const [dw, dh] = [w * zoom, h * zoom];
  return [x1 * zoom, y1 * zoom, x1 + dw, y1 + dh];
}

type BoundingBoxInput =
  | (Box & { type?: 0 })
  | (XYWH & { type?: 1 })
  | (XYWHR & { type?: 2 });

export function boundingbox(
  rects: BoundingBoxInput[],
  t?: BoundingBoxInput["type"]
): Box {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const rect of rects) {
    const [_x1, _y1, _x2, _y2] = to_box(rect, t);
    x1 = Math.min(x1, _x1);
    y1 = Math.min(y1, _y1);
    x2 = Math.max(x2, _x2);
    y2 = Math.max(y2, _y2);
  }
  return [x1, y1, x2, y2];
}

export function is_point_inside_box(point: XY, box: Box) {
  const [x, y] = point;
  const [x1, y1, x2, y2] = box;
  return x >= x1 && x <= x2 && y >= y1 && y <= y2;
}

/**
 // TODO: handle rotation. (no rotation for now)
 * 
 * @param rect 
 * @returns 
 */
const to_box = (rect: BoundingBoxInput, t?: BoundingBoxInput["type"]): Box => {
  let _x1,
    _y1,
    _x2,
    _y2,
    _r = 0;

  switch (rect.type ?? t) {
    case 0: {
      [_x1, _y1, _x2, _y2] = rect;
    }
    case 1: {
      const [x, y, w, h] = rect;
      _x1 = x;
      _y1 = y;
      _x2 = x + w;
      _y2 = y + h;
    }
    case 2: {
      const [x, y, w, h, r] = rect;
      _x1 = x;
      _y1 = y;
      _x2 = x + w;
      _y2 = y + h;
      _r = r;
    }
  }

  return [_x1, _y1, _x2, _y2];
};

export function box_to_xywh(box: Box): XYWH {
  const [x1, y1, x2, y2] = box;
  return [x1, y1, x2 - x1, y2 - y1];
}

export function box_to_xywhr(box: Box): XYWHR {
  const [x1, y1, x2, y2] = box;
  return [x1, y1, x2 - x1, y2 - y1, 0];
}
