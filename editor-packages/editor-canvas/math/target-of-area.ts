import type { Tree, XY, XYWH } from "../types";

/**
 * target of area
 * calculates the target node from nested children tree recursively.
 *
 * if the current looping node matches the condition, don't go any deeper.
 * if the current looping node doesn't match the condition, go deeper, loop trough its children if present.
 *
 * for example:
 * - if the area is (0, 0, 100, 100), and the children are [ [0, 0, 50, 50], [50, 50, 50, 50] ], the target is both two items.
 * - when contain is true: if the area is (0, 0, 50, 50), and the children are [ [0, 0, 50, 50], [50, 50, 50, 50] ], the target is both two items.
 * - when contain is false: if the area is (0, 0, 50, 50), and the children are [ [0, 0, 50, 50], [50, 50, 50, 50] ], the target is only first item.
 *
 *
 * @param area - [x, y, w, h] the marquee data
 * @param tree - the tree to search
 * @param ignore - provide a function that returns boolean. if true, the current item will be ignored. this is usefull when you want to ignore grouping nodes, e.g. when command key is pressed while marquee, it should only select the deep down nodes.
 * @param margin - the margin of raycasting
 * @param contain - if true, the target node should be contained in the area. if false, the target node should be intersected with the area.
 * @param contain - reverse the order of the tree (after copy with `Array.from()`).
 *
 */
export function target_of_area<T extends Tree>(
  {
    area,
    tree,
    ignore,
    margin = 0,
    contain,
    reverse = true,
  }: {
    area: XYWH;
    tree: T[];
    margin?: number;
    contain: boolean;
    ignore?: (item: T) => boolean;
    reverse?: boolean;
  },
  depth: number = 0
): T[] {
  const items = reverse ? Array.from(tree).reverse() : tree;

  const result: T[] = [];

  for (const item of items) {
    if (ignore?.(item)) {
      continue;
    } else {
      if (
        is_rect_in_rect_raycast(
          [item.absoluteX, item.absoluteY, item.width, item.height],
          area,
          contain
        )
      ) {
        // console.log(item, )
        result.push(item);
      } else {
        if (item.children) {
          const targets = target_of_area(
            {
              area,
              tree: item.children as T[],
              ignore,
              margin,
              contain,
              reverse,
            },
            depth + 1
          );
          if (targets?.length) {
            result.push(...targets);
          }
        }
      }
    }
  }
  return result;
}

function is_rect_in_rect_raycast(a: XYWH, b: XYWH, contain: boolean): boolean {
  if (contain) {
    return is_rect_in_rect(a, b);
  } else {
    return is_rect_intersect_rect(a, b);
  }
}

/**
 * check if the rect a is contained in the rect b
 * @param a - [x, y, w, h] the first rect, where "rect a" in "rect b"
 * @param b - [x, y, w, h] the second rect, where "rect a" in "rect b"
 * @returns
 */
function is_rect_in_rect(a: XYWH, b: XYWH): boolean {
  const [x1, y1, w1, h1] = a;
  const [x2, y2, w2, h2] = b;

  throw new Error("not implemented");
  // return x1 >= x2 && y1 >= y2 && x1 + w1 <= x2 + w2 && y1 + h1 <= y2 + h2;
}

/**
 * check if two area has an intersection
 *
 * for example:
 * - a: [0, 0, 100, 100], b: [0, 0, 50, 50] => true
 * - a: [0, 0, 100, 100], b: [100, 100, 50, 50] => false
 * - a: [0, 0, 100, 100], b: [50, 50, 50, 50] => true
 * - a: [0, 0, 100, 100], b: [0, 0, 100, 100] => true
 * - a: [0, 0, -100, -100], b: [0, 0, 100, 100] => false
 * - a: [0, 0, -100, -100], b: [-10, -10, 100, 100] => true
 * - a: [0, 0, 100, 100], b: [0, 0, -100, -100] => false
 * - a: [-10, 0, 11, 1], b: [0, 0, 20, 20] => true
 *
 * @param a
 * @param b
 * @returns
 */
function is_rect_intersect_rect(a: XYWH, b: XYWH): boolean {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;

  const [ax1, ay1, ax2, ay2] = [ax, ay, ax + aw, ay + ah];
  const [bx1, by1, bx2, by2] = [bx, by, bx + bw, by + bh];

  return !(
    Math.max(ax1, ax2) < Math.min(bx1, bx2) ||
    Math.min(ax1, ax2) > Math.max(bx1, bx2) ||
    Math.min(ay1, ay2) > Math.max(by1, by2) ||
    Math.max(ay1, ay2) < Math.min(by1, by2)
  );

  // preserve below for readability (above is optimized)

  // const max_ax = Math.max(ax1, ax2);
  // const min_ax = Math.min(ax1, ax2);
  // const max_ay = Math.max(ay1, ay2);
  // const min_ay = Math.min(ay1, ay2);
  // const max_bx = Math.max(bx1, bx2);
  // const min_bx = Math.min(bx1, bx2);
  // const max_by = Math.max(by1, by2);
  // const min_by = Math.min(by1, by2);

  // return !(
  //   max_ax < min_bx ||
  //   min_ax > max_bx ||
  //   min_ay > max_by ||
  //   max_ay < min_by
  // );
}
