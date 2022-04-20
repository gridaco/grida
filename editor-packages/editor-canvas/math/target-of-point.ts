// TODO:
/**
 * if the array's order represents the reversed index (depth) set this to true.
 */

import type { Tree, XY, XYWH } from "../types";

/**
 * get the hovering target node from nested children tree.
 * - ignore invisible nodes.
 * - target is layer in higher level. (e.g. child of a parent is hovering target if both matches the point)
 */
export function target_of_point<T extends Tree>(
  {
    point,
    zoom,
    tree,
    offset = [0, 0],
    ignore,
    margin = 0,
    reverse = true,
  }: {
    /**
     * relative mouse point from canvas 0, 0
     */
    point: XY;
    zoom: number;
    tree: T[];
    /**
     * offset of the canvas (canvas xy transform)
     */
    offset: XY;
    ignore?: (item: T) => boolean;
    margin?: number;
    reverse?: boolean;
  },
  depth = 0
): T | undefined {
  const [ox, oy] = offset;

  const items = reverse ? Array.from(tree).reverse() : tree;

  for (const item of items) {
    if (
      is_point_in_xywh(point, [
        (item.absoluteX + ox) * zoom,
        (item.absoluteY + oy) * zoom,
        item.width * zoom + margin,
        item.height * zoom + margin,
      ])
    ) {
      if (ignore?.(item)) {
        // TODO: invalid logic gate
        continue;
      }
      if (item.children) {
        const hovering_child = target_of_point(
          {
            point,
            zoom,
            tree: item.children as T[],
            ignore,
            margin,
            offset,
            reverse,
          },
          depth + 1
        );
        if (hovering_child) {
          return hovering_child;
        }
      }

      return item;
    }
  }
}

function is_point_in_xywh(point: XY, xywh: XYWH): boolean {
  const [x, y] = point;
  const [x0, y0, w, h] = xywh;
  const inbound = x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
  return inbound;
}
