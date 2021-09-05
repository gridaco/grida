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
  data: any[];
  moving;
  target;
}): boolean {
  if (moving.depth < target.depth) {
    let t = target;
    while (t.parent) {
      if (t.parent == moving) {
        return true;
      }
      t = data.find((i) => i.id == t.parent);
    }
  }
  return false;
}
