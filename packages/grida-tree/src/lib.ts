/**
 * Move one or more nodes under a target node (mutates the input map in-place).
 * @param nodes – Record mapping node IDs to objects that each have a children array.
 * @param sources – Single node ID or array of node IDs to move.
 * @param target – Target parent node ID to move into.
 * @param index – Desired insertion index in the target's children array; -1 (default) appends at end.
 * @param key – The key name for the children array property (defaults to "children").
 * @returns The same `nodes` map, now mutated.
 * @mutates nodes – the input map's children arrays are modified directly.
 *
 * @example
 * ```ts
 * const nodes: Record<string, { children: string[] }> = {
 *   a: { children: ["b","c"] },
 *   b: { children: [] },
 *   c: { children: [] }
 * };
 *
 * mv(nodes, "c", "b", 0);
 * // now nodes.b.children === ["c"]
 *
 * // Custom key example:
 * const customNodes: Record<string, { items: string[] }> = {
 *   a: { items: ["b","c"] },
 *   b: { items: [] },
 *   c: { items: [] }
 * };
 * mv(customNodes, "c", "b", 0, "items");
 * ```
 *
 * @remark
 * - This function is not recursive. It only moves direct children of the target node.
 * - This function does not check for cycles.
 */
export function mv<
  K extends string = "children",
  T extends Record<K, string[]> = Record<K, string[]>,
>(
  nodes: Record<string, T>,
  sources: string | string[],
  target: string,
  index = -1,
  key: K = "children" as K
): Record<string, T> {
  const srcs = Array.isArray(sources) ? sources : [sources];
  const pos_specified = index >= 0;
  let pos = index;

  if (!(target in nodes)) {
    throw new Error(`mv: cannot move to '${target}': No such node`);
  }

  if (!nodes[target][key]) {
    throw new Error(`mv: cannot move to '${target}': No ${key as string}`);
  }

  for (const src of srcs) {
    if (!(src in nodes)) {
      throw new Error(`mv: cannot move '${src}': No such node`);
    }

    // detach from old parent (if any)
    for (const node of Object.values(nodes)) {
      const list = node[key];
      if (!list) continue;
      const i = list.indexOf(src);
      if (i !== -1) {
        list.splice(i, 1);
        break;
      }
    }

    const kids = nodes[target][key];
    // determine insertion position
    const insert_at = !pos_specified || pos > kids.length ? kids.length : pos;
    kids.splice(insert_at, 0, src);
    if (pos_specified) pos++;
  }

  return nodes;
}
/**
 * Remove a node from the flat tree and unlink it from any parent's children array.
 *
 * @typeParam K – The key name for the children array property.
 * @typeParam T – Node shape with a children array at key K.
 * @param nodes – Record mapping node IDs to node objects.
 * @param id – ID of the node to remove.
 * @param key – The key name for the children array property (defaults to "children").
 * @returns void
 * @mutates nodes – the input map's children arrays are modified directly.
 * @throws {Error} If `id` does not exist in `nodes`.
 * @example
 * ```ts
 * const nodes = {
 *   parent: { children: ['child'] },
 *   child:   { children: [] }
 * };
 * unlink(nodes, 'child');
 * // now nodes.parent.children === []
 *
 * // Custom key example:
 * const customNodes = {
 *   parent: { items: ['child'] },
 *   child:  { items: [] }
 * };
 * unlink(customNodes, 'child', 'items');
 * ```
 */
export function unlink<
  K extends string = "children",
  T extends Partial<Record<K, string[]>> = Partial<Record<K, string[]>>,
>(nodes: Record<string, T>, id: string, key: K = "children" as K): void {
  if (!(id in nodes)) {
    throw new Error(`unlink: cannot unlink '${id}': No such node`);
  }

  for (const node of Object.values(nodes)) {
    const list = node[key];
    if (!list) continue;
    const idx = list.indexOf(id);
    if (idx >= 0) {
      list.splice(idx, 1);
    }
  }

  delete nodes[id];
}

/**
 * Recursively remove a node and its subtree, delegating actual removal to `unlink`,
 * and return a list of all IDs that were removed.
 *
 * @typeParam K – The key name for the children array property.
 * @typeParam T – Node shape with optional children array at key K.
 * @param nodes – Record mapping node IDs to node objects.
 * @param id – ID of the root node to remove.
 * @param key – The key name for the children array property (defaults to "children").
 * @returns Array of removed IDs, in removal order (children first, then the node itself).
 * @mutates nodes – the input map's children arrays are modified directly.
 * @throws {Error} If `id` does not exist in `nodes`.
 * @example
 * ```ts
 * const nodes = {
 *   a: { children: ['b'] },
 *   b: { children: [] }
 * };
 * rm(nodes, 'a');
 * // now nodes is {}
 *
 * // Custom key example:
 * const customNodes = {
 *   a: { items: ['b'] },
 *   b: { items: [] }
 * };
 * rm(customNodes, 'a', 'items');
 * ```
 */
export function rm<
  K extends string = "children",
  T extends Partial<Record<K, string[]>> = Partial<Record<K, string[]>>,
>(nodes: Record<string, T>, id: string, key: K = "children" as K): string[] {
  if (!(id in nodes)) {
    throw new Error(`rm: cannot remove '${id}': No such node`);
  }

  const removed: string[] = [];

  // remove children first
  const childrenList = nodes[id][key];
  if (childrenList) {
    for (const child of [...childrenList]) {
      removed.push(...rm(nodes, child, key));
    }
  }

  // then unlink this node
  unlink(nodes, id, key);
  removed.push(id);

  return removed;
}
