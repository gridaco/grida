/**
 * TreeMap: adjacency-list representation of an ordered tree. (Ordered Adjacency List Tree)
 *
 * Maps each node ID to an ordered array of its child node IDs, preserving insertion order.
 * @example
 * ```json
 * {
 *   "a": ["b", "c"],
 *   "b": [],
 *   "c": []
 * }
 * ```
 */
export type TreeMap = Record<string, string[]>;

/**
 * Move one or more nodes under a target node (mutates the input tree in-place).
 * @param tree - The context of the tree.
 * @param sources - Single node id or array of node ids to move.
 * @param target - Target node id to move into.
 * @param index - desired insertion index in the target's children array; -1 (default) appends at end
 * @returns true if successful.
 * @mutates tree - the input tree is modified directly
 */
export function mv(
  tree: TreeMap,
  sources: string | string[],
  target: string,
  index = -1
): boolean {
  const nodes = Array.isArray(sources) ? sources : [sources];
  const pos_specified = index >= 0;
  let pos = index;

  if (!(target in tree)) {
    throw new Error(`mv: cannot move to '${target}': No such node`);
  }

  for (const src of nodes) {
    if (!(src in tree)) {
      throw new Error(`mv: cannot move '${src}': No such node`);
    }

    // detach from old parent (if any)
    for (const id of Object.keys(tree)) {
      const child_index = tree[id].indexOf(src);
      if (child_index !== -1) {
        tree[id].splice(child_index, 1);
        break;
      }
    }

    const children = tree[target];
    // determine insertion position
    const insert_at =
      !pos_specified || pos > children.length ? children.length : pos;
    children.splice(insert_at, 0, src);
    if (pos_specified) pos++; // keep relative order for the next
  }

  return true;
}
