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

export namespace tree {
  /**
   * Tree lookup table interface for efficient hierarchical queries on flat tree structures.
   *
   * This interface is designed for **in-memory, runtime-only** use and should not be used for persisting data.
   * It exists to provide efficient access to the parent and child relationships within a tree structure without
   * modifying the core node structure directly.
   *
   * ## Why We Use This Interface
   * This interface allows for a structured, performant way to manage tree hierarchy relationships without introducing
   * a `parent_id` property on each node. By using an in-memory lookup table, we avoid potential issues with nullable
   * `parent_id` fields, which could lead to unpredictable coding experiences. Additionally, maintaining these
   * relationships within a dedicated lookup table promotes separation of concerns, keeping core node definitions
   * stable and interface-compatible.
   *
   * ## Functionality
   * - **Get Parent Node by Child ID**: Efficiently map a node's ID to its parent node ID with O(1) lookup.
   * - **Get Child Nodes by Parent ID**: Access a list of child node IDs for any given parent node with O(1) lookup.
   * - **Traverse Ancestors**: Walk up the tree from any node to its root.
   * - **Query Depth**: Calculate how deep a node is in the hierarchy.
   * - **Find Siblings**: Locate nodes that share the same parent.
   *
   * ## Management Notes
   * - This interface should be populated and managed only during runtime.
   * - It is recommended to initialize the lookup table during tree loading or initial rendering using {@link TreeLUT.from}.
   * - If the tree hierarchy is updated (e.g., nodes are added, removed, or moved), this lookup table should be
   *   refreshed to reflect the current relationships.
   * - For optimal performance, the lookup table should be created once and reused for multiple queries.
   *
   * @see {@link TreeLUT} for methods to query and traverse the tree efficiently.
   * @see {@link TreeLUT.from} for creating a lookup table from a flat tree structure.
   */
  export interface ITreeLUT {
    /**
     * Array of all node IDs in the tree, facilitating traversal and lookup.
     */
    readonly lu_keys: Array<string>;
    /**
     * Maps each node ID to its respective parent node ID, facilitating upward traversal.
     * Root nodes have a parent value of `null`.
     */
    readonly lu_parent: Record<string, string | null>;
    /**
     * Maps each node ID to an array of its child node IDs, enabling efficient downward traversal.
     *
     * Note: This does NOT guarantee the order of children. For ordered traversal, refer to the
     * original node's `children` array in your tree structure.
     */
    readonly lu_children: Record<string, string[]>;
  }

  /**
   * Tree lookup table for efficient hierarchical queries on flat tree structures.
   * Provides methods for traversing and querying tree relationships.
   *
   * @example
   * ```ts
   * const lut: ITreeLUT = {
   *   lu_keys: ["root", "a", "b", "c"],
   *   lu_parent: { root: null, a: "root", b: "root", c: "a" },
   *   lu_children: { root: ["a", "b"], a: ["c"], b: [], c: [] }
   * };
   * const tree = new TreeLUT(lut);
   * console.log(tree.depthOf("c")); // 2
   * console.log(tree.parentOf("c")); // "a"
   * ```
   */
  export class TreeLUT {
    constructor(readonly lut: ITreeLUT) {}

    /**
     * Creates a TreeLUT from a flat tree structure.
     * Builds the lookup table by analyzing parent-child relationships from the nodes' children arrays.
     *
     * @typeParam K - The key name for the children array property
     * @typeParam T - Node shape with a children array at key K
     * @param nodes - Record mapping node IDs to node objects
     * @param key - The key name for the children array property (defaults to "children")
     * @returns A new TreeLUT instance with computed lookup tables
     *
     * @example
     * ```ts
     * const nodes = {
     *   root: { children: ["a", "b"] },
     *   a: { children: ["c"] },
     *   b: { children: [] },
     *   c: { children: [] }
     * };
     * const tree = TreeLUT.from(nodes);
     * console.log(tree.depthOf("c")); // 2
     *
     * // Custom key example:
     * const customNodes = {
     *   root: { items: ["a", "b"] },
     *   a: { items: ["c"] },
     *   b: { items: [] },
     *   c: { items: [] }
     * };
     * const customTree = TreeLUT.from(customNodes, "items");
     * console.log(customTree.depthOf("c")); // 2
     * ```
     */
    static from<
      K extends string = "children",
      T extends Partial<Record<K, string[]>> = Partial<Record<K, string[]>>,
    >(nodes: Record<string, T>, key: K = "children" as K): TreeLUT {
      const lu_keys = Object.keys(nodes);
      const lu_parent: Record<string, string | null> = {};
      const lu_children: Record<string, string[]> = {};

      // First, default every node's parent to null and children to empty array
      for (const node_id of lu_keys) {
        lu_parent[node_id] = null;
        lu_children[node_id] = [];
      }

      // Then walk through and hook up actual parent/children relationships
      for (const node_id in nodes) {
        const node = nodes[node_id];
        const children = node[key];

        // If the node has children, map each child to its parent and add to the parent's child array
        if (Array.isArray(children)) {
          for (const child_id of children) {
            lu_parent[child_id] = node_id;
            lu_children[node_id].push(child_id);
          }
        }
      }

      return new TreeLUT({
        lu_keys,
        lu_parent,
        lu_children,
      });
    }

    /**
     * Creates a snapshot of the current lookup table state.
     *
     * @returns A deep copy of the lookup table
     * @example
     * ```ts
     * const tree = new TreeLUT(lut);
     * const snapshot = tree.snapshot();
     * // snapshot is independent of tree.lut
     * ```
     */
    snapshot(): ITreeLUT {
      return {
        lu_keys: [...this.lut.lu_keys],
        lu_parent: { ...this.lut.lu_parent },
        lu_children: Object.fromEntries(
          Object.entries(this.lut.lu_children).map(([k, v]) => [k, [...v]])
        ),
      };
    }

    /**
     * Gets the depth (level) of a node in the tree.
     * The root node has depth 0, its children have depth 1, etc.
     *
     * @param id - The node ID to query
     * @returns The depth of the node (number of ancestors)
     * @example
     * ```ts
     * // Tree: root -> a -> c
     * tree.depthOf("root"); // 0
     * tree.depthOf("a");    // 1
     * tree.depthOf("c");    // 2
     * ```
     */
    depthOf(id: string): number {
      return Array.from(this.ancestorsOf(id)).length;
    }

    /**
     * Gets all ancestor node IDs for a given node, in root-first order.
     * Uses a generator for memory-efficient traversal.
     *
     * @param id - The node ID to query
     * @returns Generator yielding ancestor IDs from root to immediate parent
     * @example
     * ```ts
     * // Tree: root -> a -> b -> c
     * [...tree.ancestorsOf("c")]; // ["root", "a", "b"]
     * [...tree.ancestorsOf("a")]; // ["root"]
     * [...tree.ancestorsOf("root")]; // []
     * ```
     */
    *ancestorsOf(id: string): Generator<string> {
      const ancestors: string[] = [];
      let current = id;

      // Traverse upwards to collect ancestors
      while (current) {
        const parent = this.lut.lu_parent[current];
        if (!parent) break; // Stop at root node
        ancestors.unshift(parent); // Insert at the beginning for root-first order
        current = parent;
      }

      // Yield ancestors in root-first order
      for (const ancestor of ancestors) {
        yield ancestor;
      }
    }

    /**
     * Gets the immediate parent node ID of a given node.
     *
     * @param id - The node ID to query
     * @returns The parent node ID, or null if the node is a root node
     * @example
     * ```ts
     * tree.parentOf("child");  // "parent"
     * tree.parentOf("root");   // null
     * ```
     */
    parentOf(id: string): string | null {
      return this.lut.lu_parent[id] ?? null;
    }

    /**
     * Gets the topmost ancestor (root) of a given node.
     * If the node itself is a root, returns the node ID.
     *
     * @param id - The node ID to query
     * @returns The root ancestor node ID, or null if node doesn't exist
     * @example
     * ```ts
     * // Tree: root -> a -> b -> c
     * tree.topmostOf("c");    // "root"
     * tree.topmostOf("root"); // "root"
     * tree.topmostOf("invalid"); // null
     * ```
     */
    topmostOf(id: string): string | null {
      // Verify if node exists
      if (!this.lut.lu_keys.includes(id)) {
        return null;
      }
      const ancestors = Array.from(this.ancestorsOf(id));
      return ancestors[0] ?? id; // First ancestor or self if root
    }

    /**
     * Gets all sibling node IDs of a given node.
     * Siblings are nodes that share the same parent, excluding the node itself.
     *
     * @param id - The node ID to query
     * @returns Array of sibling node IDs
     * @example
     * ```ts
     * // Tree: parent -> [a, b, c]
     * tree.siblingsOf("b"); // ["a", "c"]
     * tree.siblingsOf("a"); // ["b", "c"]
     * ```
     */
    siblingsOf(id: string): string[] {
      const parent_id = this.parentOf(id);

      if (!parent_id) {
        // If the node has no parent, it is at the root level
        // All nodes without parents are its "siblings"
        return Object.keys(this.lut.lu_parent).filter(
          (key) => this.lut.lu_parent[key] === null && key !== id
        );
      }

      // Filter all nodes that share the same parent but exclude the input node itself
      return Object.keys(this.lut.lu_parent).filter(
        (key) => this.lut.lu_parent[key] === parent_id && key !== id
      );
    }

    /**
     * Gets all child node IDs of a given node.
     *
     * @param id - The node ID to query
     * @returns Array of child node IDs (empty array if no children)
     * @example
     * ```ts
     * // Tree: parent -> [a, b]
     * tree.childrenOf("parent"); // ["a", "b"]
     * tree.childrenOf("a");      // []
     * ```
     */
    childrenOf(id: string): string[] {
      return this.lut.lu_children[id] ?? [];
    }

    /**
     * Checks if a node is an ancestor of another node.
     * A node is an ancestor if it appears in the parent chain.
     *
     * @param ancestor - The potential ancestor node ID
     * @param id - The node ID to check
     * @returns True if ancestor is in the parent chain of id
     * @example
     * ```ts
     * // Tree: root -> a -> b -> c
     * tree.isAncestorOf("root", "c"); // true
     * tree.isAncestorOf("a", "c");    // true
     * tree.isAncestorOf("c", "a");    // false
     * tree.isAncestorOf("b", "b");    // false (node is not its own ancestor)
     * ```
     */
    isAncestorOf(ancestor: string, id: string): boolean {
      let current: string | null = id;

      while (current) {
        const parent: string | null = this.lut.lu_parent[current];
        if (parent === ancestor) return true; // Ancestor found
        current = parent;
      }

      return false; // Ancestor not found
    }
  }
}
