// TODO:
/**
 * if the array's order represents the reversed index (depth) set this to true.
 */

/**
 * get the hovering target node from nested children tree.
 * - ignore invisible nodes.
 * - target is layer in higher level. (e.g. child of a parent is hovering target if both matches the point)
 */
export function get_hovering_target<T extends Tree>({
  point,
  zoom,
  tree,
  offset = [0, 0],
  ignore,
  margin = 0,
}: {
  /**
   * relative mouse point from canvas 0, 0
   */
  point: [number, number];
  zoom: number;
  tree: T[];
  /**
   * offset of the canvas (canvas xy transform)
   */
  offset: [number, number];
  ignore?: (item: T) => boolean;
  margin?: number;
}): T | undefined {
  const [ox, oy] = offset;
  for (const item of tree) {
    if (
      is_point_in_xywh(point, [
        (item.absoluteX + ox) * zoom,
        (item.absoluteY + oy) * zoom,
        item.width * zoom + margin,
        item.height * zoom + margin,
      ])
    ) {
      if (ignore && ignore(item)) {
        // TODO: invalid logic gate
        continue;
      }
      if (item.children) {
        const hovering_child = get_hovering_target({
          point,
          zoom,
          tree: item.children as T[],
          ignore,
          margin,
          offset,
        });
        if (hovering_child) {
          return hovering_child;
        }
      }
      return item;
    }
  }
}

function is_point_in_xywh(
  point: [number, number],
  xywh: [number, number, number, number]
): boolean {
  const [x, y] = point;
  const [x0, y0, w, h] = xywh;
  const inbound = x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
  return inbound;
}

interface Tree {
  id: string;
  /**
   * absolute x point.
   */
  absoluteX: number;
  /**
   * absolute y point.
   */
  absoluteY: number;
  width: number;
  height: number;
  children?: Tree[] | undefined;
}
