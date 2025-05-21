export type TreeMap = Record<string, string[]>;

/**
 * Move one or more nodes under a target node (mutates the input tree in-place).
 * @param context - The context of the tree.
 * @param sources - Single node id or array of node ids to move.
 * @param target - Target node id to move into.
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

  if (!(target in tree)) {
    throw new Error(`mv: cannot move to '${target}': No such node`);
  }

  for (const src of nodes) {
    if (!(src in tree)) {
      throw new Error(`mv: cannot move '${src}': No such node`);
    }

    // detach from old parent (if any)
    for (const id of Object.keys(tree)) {
      const idx = tree[id].indexOf(src);
      if (idx !== -1) {
        tree[id].splice(idx, 1);
        break;
      }
    }

    // attach under target
    tree[target].push(src);
  }

  return true;
}
