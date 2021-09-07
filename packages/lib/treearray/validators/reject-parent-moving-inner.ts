import { TreeNodeWithUnevenSortDataArrayItem } from "../sortable";

type TreeNodeWithUnevenSortDataArrayItemWithDepth =
  TreeNodeWithUnevenSortDataArrayItem & {
    depth: number;
  };
/**
 * reject the movement of the parent to it's children's or its' inner
 *
 * prevent "parent" to move anywhere under "parent"
 *
 * ```
 * - parent       (this can move to ...)
 *  - child       (X)
 *  - child       (X)
 *  - child       (X)
 *    - child     (X)
 *    - child     (X)
 * - other parent (O)
 *  - other child (O)
 *  - other child (O)
 *  - other child (O)
 * ```
 *
 * @returns boolean - true if rejected
 */
export function reject_parent_moving_inner({
  data,
  moving,
  target,
}: {
  data: TreeNodeWithUnevenSortDataArrayItemWithDepth[];
  moving: TreeNodeWithUnevenSortDataArrayItemWithDepth;
  target: TreeNodeWithUnevenSortDataArrayItemWithDepth;
}): boolean {
  if (moving.depth < target.depth) {
    let t = target;
    while (t?.parent) {
      // if target's parent is somehow moving item or its' child (via iteration)
      if (t.parent == moving.id) {
        return true;
      }

      // iterating target don't have to go upper than the moving item's initial depth.
      if (t.depth == moving.depth) {
        break;
      }

      // assign new targeet, the parent of current target.
      t = data.find((i) => i.id == t.parent);
    }
  }
  return false;
}
