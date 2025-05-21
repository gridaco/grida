/**
 * Move one or more nodes under a target node (mutates the input map in-place).
 * @param nodes – Record mapping node IDs to objects that each have a `children: string[]` array.
 * @param sources – Single node ID or array of node IDs to move.
 * @param target – Target parent node ID to move into.
 * @param index – Desired insertion index in the target’s children array; -1 (default) appends at end.
 * @returns The same `nodes` map, now mutated.
 * @mutates nodes – the input map’s `children` arrays are modified directly.
 *
 * @example
 * ```ts
 * const nodes: Record<string,Node> = {
 *   a: { children: ["b","c"] },
 *   b: { children: [] },
 *   c: { children: [] }
 * };
 *
 * mv(nodes, "c", "b", 0);
 * // now nodes.b.children === ["c"]
 * ```
 */
export function mv<T extends { children: string[] }>(
  nodes: Record<string, T>,
  sources: string | string[],
  target: string,
  index = -1
): Record<string, T> {
  const srcs = Array.isArray(sources) ? sources : [sources];
  const pos_specified = index >= 0;
  let pos = index;

  if (!(target in nodes)) {
    throw new Error(`mv: cannot move to '${target}': No such node`);
  }

  for (const src of srcs) {
    if (!(src in nodes)) {
      throw new Error(`mv: cannot move '${src}': No such node`);
    }

    // detach from old parent (if any)
    for (const node of Object.values(nodes)) {
      const i = node.children.indexOf(src);
      if (i !== -1) {
        node.children.splice(i, 1);
        break;
      }
    }

    const kids = nodes[target].children;
    // determine insertion position
    const insert_at = !pos_specified || pos > kids.length ? kids.length : pos;
    kids.splice(insert_at, 0, src);
    if (pos_specified) pos++;
  }

  return nodes;
}
