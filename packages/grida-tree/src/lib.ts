export namespace tree {
  export type Key = string;
  export type RmResult = Key[];

  /**
   * flat tree ops
   *
   * flat tree represents the structure, that each nodes are flattened via kye, yet each node has a pointer to its children.
   *
   * ```ts
   * flat_tree = {
   *   "root": {
   *     "children": ["a", "b"]
   *   },
   *   "a": {
   *     "children": ["c"]
   *   }
   * }
   * ```
   */
  export namespace flat_with_children {
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
        const insert_at =
          !pos_specified || pos > kids.length ? kids.length : pos;
        kids.splice(insert_at, 0, src);
        if (pos_specified) pos++;
      }

      return nodes;
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
    >(
      nodes: Record<string, T>,
      id: string,
      key: K = "children" as K
    ): string[] {
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
  }

  export namespace lut {
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
      readonly lu_keys: Array<Key>;
      /**
       * Maps each node ID to its respective parent node ID, facilitating upward traversal.
       * Root nodes have a parent value of `null`.
       */
      readonly lu_parent: Record<Key, Key | null>;
      /**
       * Maps each node ID to an array of its child node IDs, enabling efficient downward traversal.
       *
       * Note: This does NOT guarantee the order of children. For ordered traversal, refer to the
       * original node's `children` array in your tree structure.
       */
      readonly lu_children: Record<Key, Array<Key>>;
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

  /**
   * Graph-based tree structure with explicit node and link separation.
   *
   * The `graph` namespace provides a data structure and system for managing tree hierarchies
   * where **nodes** (the actual data) and **links** (the relationships between nodes) are
   * stored and managed separately. This design provides a clean, efficient way to work with
   * large tree structures without the complexity of nested objects or the fragility of
   * parent-pointer approaches.
   *
   * ## Core Design Principles
   *
   * ### 1. Explicit Separation of Data and Structure
   * Unlike traditional tree implementations, `graph` keeps data and relationships separate:
   * - **Nodes**: A flat record of your actual data `Record<string, T>`
   * - **Links**: A separate record of parent-child relationships `Record<string, string[] | undefined>`
   *
   * This separation provides several benefits:
   * - No need to re-wrap or re-map data when structure changes
   * - Data remains immutable while structure can be modified
   * - Easy to maintain different views of the same data
   * - Clear separation of concerns
   *
   * ### 2. Single Source of Truth
   * The graph serves as your **main source of truth** for hierarchical data. Instead of:
   * - Maintaining duplicate structures (e.g., flat + nested)
   * - Re-computing relationships on every operation
   * - Storing derived or redundant parent/child references
   *
   * You work directly with the graph, which keeps everything synchronized and consistent.
   *
   * ### 3. Safe, Predictable Operations
   * All tree manipulation methods maintain graph integrity:
   * - Moving nodes updates all relevant links automatically
   * - Removing nodes cleans up orphaned references
   * - Operations are atomic and don't leave the graph in an invalid state
   *
   * ## When to Use This
   *
   * Use `tree.graph` when you need:
   * - A robust, manipulable tree structure as your primary data model
   * - Frequent structural changes (add, move, remove, reorder)
   * - To work with large trees (thousands of nodes)
   * - A single source of truth for hierarchical data
   * - Type-safe operations on your domain objects
   *
   * For read-only querying, consider {@link lut.TreeLUT} which provides efficient lookups.
   * For simple operations on existing structures, see {@link flat_with_children}.
   *
   * ## Example
   *
   * ```ts
   * import { tree } from "@grida/tree";
   *
   * interface PageNode {
   *   id: string;
   *   name: string;
   *   type: "frame" | "text" | "image";
   * }
   *
   * // Create a graph with explicit nodes and links
   * const graph = new tree.graph.Graph<PageNode>({
   *   nodes: {
   *     "page": { id: "page", name: "Page 1", type: "frame" },
   *     "header": { id: "header", name: "Header", type: "frame" },
   *     "title": { id: "title", name: "Title", type: "text" },
   *   },
   *   links: {
   *     "page": ["header"],      // page contains header
   *     "header": ["title"],     // header contains title
   *     "title": undefined,      // title has no children
   *   }
   * });
   *
   * // Move title from header to page
   * graph.mv("title", "page");
   *
   * // Get current state
   * const state = graph.snapshot();
   * console.log(state.links["page"]); // ["header", "title"]
   * console.log(state.links["header"]); // []
   * ```
   *
   * @see {@link IGraph} for the graph data structure interface
   * @see {@link Graph} for graph manipulation methods
   */
  export namespace graph {
    /**
     * Graph data structure interface with explicit node and link separation.
     *
     * This interface represents a tree structure where:
     * - `nodes` contains the actual data objects
     * - `links` contains the parent-child relationships
     *
     * The separation allows for efficient tree operations without modifying node data,
     * and enables the same node data to be used in multiple graph structures if needed.
     *
     * @typeParam T - The type of data stored in each node
     *
     * @example
     * ```ts
     * interface MyData {
     *   name: string;
     *   value: number;
     * }
     *
     * const graph: IGraph<MyData> = {
     *   nodes: {
     *     "root": { name: "Root", value: 0 },
     *     "child": { name: "Child", value: 1 },
     *   },
     *   links: {
     *     "root": ["child"],    // root has one child
     *     "child": undefined,   // child has no children
     *   }
     * };
     * ```
     *
     * @remarks
     * - Node keys in `nodes` and `links` must be synchronized
     * - A link value of `undefined` or empty array `[]` means no children
     * - Links are stored as arrays to preserve child order
     * - The graph does not enforce referential integrity automatically;
     *   use the {@link Graph} class for safe operations
     */
    export interface IGraph<T> {
      /**
       * The actual data nodes, keyed by node ID.
       * Contains your domain objects without any tree-specific properties.
       */
      nodes: Record<string, T>;
      /**
       * The hierarchical relationships between nodes.
       * Each key maps to an array of child node IDs, or undefined if no children.
       * The order of children in the array represents their visual/logical order.
       */
      links: Record<string, string[] | undefined>;
    }

    /**
     * Graph Policy Interface - Universal constraints for tree structure validation.
     *
     * `IGraphPolicy` provides a flexible, extensible system for defining structural rules
     * and constraints on tree operations. Policies are independent of node data shape (`T`)
     * and operate purely on structural relationships, making them composable and reusable
     * across different tree types.
     *
     * ## Design Philosophy
     *
     * **Separation of Concerns:**
     * - Policies define WHAT is allowed (constraints)
     * - Graph methods define HOW to execute (operations)
     * - Node data defines content (domain objects)
     *
     * **Flexibility:**
     * - All methods are optional (defaults to permissive behavior)
     * - Policies can be node-specific (different rules for different node types)
     * - Composable and extensible without modifying core graph code
     *
     * **Performance:**
     * - Policies are queried only when needed (before mutations)
     * - Simple checks (O(1)) per operation
     * - No overhead when using default policy
     *
     * ## When to Use Policies
     *
     * Use policies to enforce:
     * - **Type constraints**: "Text nodes cannot have children"
     * - **Capacity limits**: "Containers can have max 100 children"
     * - **Relationship rules**: "Images cannot contain frames"
     * - **Hierarchy rules**: "Root nodes cannot be children"
     * - **Business logic**: "Locked nodes cannot be moved"
     *
     * ## Integration with Graph Operations
     *
     * When integrated, policies will be checked before mutations:
     * - `mv()` - Check `can_be_child`, `can_be_parent`, `can_link`, `max_out_degree`
     * - `order()` - No policy checks (internal reordering)
     * - `rm()` / `unlink()` - No policy checks (removal always allowed)
     *
     * Failed policy checks will throw descriptive errors instead of performing invalid operations.
     *
     * @typeParam T - The type of node data (your domain objects)
     *
     * @example
     * ```ts
     * // Example 1: Design tool with scene/frame/text/image hierarchy
     * interface DesignNode {
     *   type: "scene" | "frame" | "text" | "image" | "group";
     * }
     *
     * const designPolicy: IGraphPolicy<DesignNode> = {
     *   // Leaf nodes (text, image) cannot have children
     *   max_out_degree: (node) => {
     *     if (node.type === "text" || node.type === "image") return 0;
     *     return Infinity; // Containers (scene, frame, group) have unlimited children
     *   },
     *
     *   // Only container types can be parents
     *   can_be_parent: (node) => {
     *     return ["scene", "frame", "group"].includes(node.type);
     *   },
     *
     *   // Scenes are top-level only (cannot be nested)
     *   can_be_child: (node) => node.type !== "scene",
     *
     *   // Prevent self-parenting and group nesting
     *   can_link: (parent, parent_id, child, child_id) => {
     *     if (parent_id === child_id) return false; // No self-parenting
     *     if (parent.type === "group" && child.type === "group") return false;
     *     return true;
     *   }
     * };
     *
     * // Use with graph:
     * const graph = new Graph(graphData, designPolicy);
     * graph.mv("scene", "frame"); // ❌ Throws: Scenes cannot be children
     * graph.mv("frame", "text"); // ❌ Throws: Text cannot be a parent
     * ```
     *
     * @example
     * ```ts
     * // Example 2: Capacity limits
     * interface ListNode {
     *   type: "list" | "item";
     *   maxItems?: number;
     * }
     *
     * const listPolicy: IGraphPolicy<ListNode> = {
     *   max_out_degree: (node) => {
     *     if (node.type === "list") {
     *       return node.maxItems ?? 10; // Default max 10 items
     *     }
     *     return 0; // Items cannot have children
     *   }
     * };
     * ```
     *
     * @example
     * ```ts
     * // Example 3: Root node constraints
     * interface DocumentNode {
     *   id: string;
     *   isRoot?: boolean;
     * }
     *
     * const rootPolicy: IGraphPolicy<DocumentNode> = {
     *   // Root nodes cannot become children
     *   can_be_child: (node) => !node.isRoot,
     *
     *   // All nodes can be parents (even roots)
     *   can_be_parent: () => true
     * };
     * ```
     *
     * @remarks
     * **All methods are optional** - If not provided, defaults to permissive behavior:
     * - `max_out_degree` → `Infinity` (unlimited children)
     * - `can_link` → `true` (all links allowed)
     * - `can_be_parent` → `true` (any node can be parent)
     * - `can_be_child` → `true` (any node can be child)
     *
     * **Performance Considerations:**
     * - Keep policy checks simple and fast (O(1) preferred)
     * - Avoid expensive operations (database queries, deep traversals)
     * - Cache computed values when possible
     *
     * **Error Handling:**
     * - Policy violations will throw descriptive errors
     * - Graph remains unchanged when policy check fails
     * - No partial updates (atomic operations)
     *
     * @see {@link DEFAULT_POLICY_INFINITE} for the default permissive policy
     * @see {@link Graph} for graph operations (integration coming soon)
     */
    export interface IGraphPolicy<T> {
      /**
       * Maximum number of children a node can have.
       *
       * This constraint is checked before adding children to a node. Use this to enforce:
       * - **Leaf nodes**: Return `0` for nodes that cannot have children
       * - **Capacity limits**: Return a number for maximum children allowed
       * - **Containers**: Return `Infinity` for unlimited children (default)
       *
       * @param node - The node data that would become the parent
       * @param id - The node's ID in the graph
       * @returns Maximum children allowed, or `Infinity` for unlimited
       *
       * @example
       * ```ts
       * // Basic: Leaf vs container nodes
       * max_out_degree: (node) => {
       *   if (node.type === "leaf") return 0;
       *   if (node.type === "container") return Infinity;
       *   return 10; // Default max
       * }
       * ```
       *
       * @example
       * ```ts
       * // Dynamic limits based on node properties
       * max_out_degree: (node) => {
       *   if (node.isLeaf) return 0;
       *   return node.maxChildren ?? Infinity;
       * }
       * ```
       *
       * @example
       * ```ts
       * // Type-specific constraints
       * max_out_degree: (node) => {
       *   switch (node.type) {
       *     case "text":
       *     case "image":
       *       return 0; // Cannot have children
       *     case "list":
       *       return 100; // Max 100 items
       *     case "frame":
       *       return Infinity; // Unlimited
       *     default:
       *       return Infinity;
       *   }
       * }
       * ```
       *
       * @remarks
       * - Checked before `mv()` when adding a child
       * - **Not checked** when node already has max children (use `can_link` for that)
       * - Return `0` to create leaf nodes (no children allowed)
       * - Return `Infinity` for containers (unlimited children)
       * - Default (when not provided): `Infinity`
       */
      max_out_degree?(node: T, id: Key): number | typeof Infinity;

      /**
       * Whether a specific parent-child link is allowed.
       *
       * This is the most granular constraint, checked before creating any parent-child
       * relationship. Use this for:
       * - **Type compatibility**: "Images cannot contain frames"
       * - **Relationship rules**: "Locked parents cannot accept children"
       * - **Capacity enforcement**: Check current child count vs limit
       * - **Business logic**: Custom domain-specific rules
       *
       * @param parent - The parent node data
       * @param parent_id - The parent node's ID
       * @param child - The child node data
       * @param child_id - The child node's ID
       * @returns `true` if the link is allowed, `false` otherwise
       *
       * @example
       * ```ts
       * // Basic type compatibility
       * can_link: (parent, parent_id, child, child_id) => {
       *   // Text nodes cannot contain anything
       *   if (parent.type === "text") return false;
       *   // Images can only contain text
       *   if (parent.type === "image") return child.type === "text";
       *   return true;
       * }
       * ```
       *
       * @example
       * ```ts
       * // Enforce capacity limits with current child count
       * can_link: (parent, parent_id, child, child_id) => {
       *   // Assuming you have access to the graph's links
       *   const currentChildren = graph.links[parent_id]?.length ?? 0;
       *   const maxChildren = parent.maxChildren ?? Infinity;
       *   return currentChildren < maxChildren;
       * }
       * ```
       *
       * @example
       * ```ts
       * // Prevent cycles (if you have ancestry info)
       * can_link: (parent, parent_id, child, child_id) => {
       *   // Prevent self-parenting
       *   if (parent_id === child_id) return false;
       *   // Prevent adding ancestor as child (requires lut or cache)
       *   // if (isAncestor(child_id, parent_id)) return false;
       *   return true;
       * }
       * ```
       *
       * @example
       * ```ts
       * // Type-based relationship constraints
       * can_link: (parent, parent_id, child, child_id) => {
       *   // Scenes can only contain frames and groups (not text/image directly)
       *   if (parent.type === "scene") {
       *     return child.type === "frame" || child.type === "group";
       *   }
       *   // Groups cannot contain other groups (flat organization)
       *   if (parent.type === "group" && child.type === "group") {
       *     return false;
       *   }
       *   // All other combinations allowed
       *   return true;
       * }
       * ```
       *
       * @remarks
       * - **Most specific check** - called after `can_be_parent`, `can_be_child`, `max_out_degree`
       * - Checked before every `mv()` operation
       * - Receives both parent and child data for maximum flexibility
       * - Use for complex business logic and relationship rules
       * - Default (when not provided): `true` (all links allowed)
       *
       * @see {@link can_be_parent} for parent-only constraints
       * @see {@link can_be_child} for child-only constraints
       * @see {@link max_out_degree} for simple capacity limits
       */
      can_link?(parent: T, parent_id: Key, child: T, child_id: Key): boolean;

      /**
       * Whether a node can be a parent (have children).
       *
       * This is a node-level constraint checked before allowing a node to accept children.
       * Use this for:
       * - **Type constraints**: "Text nodes cannot be parents"
       * - **State constraints**: "Disabled nodes cannot have children"
       * - **Role constraints**: "Leaf nodes cannot become containers"
       *
       * @param node - The node data that would become a parent
       * @param id - The node's ID in the graph
       * @returns `true` if the node can be a parent, `false` otherwise
       *
       * @example
       * ```ts
       * // Type-based parent constraints
       * can_be_parent: (node) => {
       *   // Only container types can be parents
       *   return ["frame", "group", "container"].includes(node.type);
       * }
       * ```
       *
       * @example
       * ```ts
       * // Container vs content type constraints
       * can_be_parent: (node) => {
       *   // Containers can have children
       *   if (node.type === "container" || node.type === "folder") return true;
       *   // Content types cannot have children
       *   if (node.type === "content" || node.type === "asset") return false;
       *   return true;
       * }
       * ```
       *
       * @example
       * ```ts
       * // Role-based constraints
       * can_be_parent: (node) => {
       *   // Only certain roles can have children
       *   return node.role === "container" || node.role === "folder";
       * }
       * ```
       *
       * @remarks
       * - Checked before `mv()` when node would receive a child
       * - More efficient than `can_link` for simple "can/cannot be parent" checks
       * - Use when constraint depends only on the parent node
       * - Use `can_link` if you need to check parent-child compatibility
       * - Default (when not provided): `true` (any node can be parent)
       *
       * @see {@link can_be_child} for child constraints
       * @see {@link can_link} for relationship-specific constraints
       * @see {@link max_out_degree} for capacity constraints
       */
      can_be_parent?(node: T, id: Key): boolean;

      /**
       * Whether a node can be a child (have a parent).
       *
       * This is a node-level constraint checked before allowing a node to be moved.
       * Use this for:
       * - **Type constraints**: "Root nodes cannot be children"
       * - **State constraints**: "Locked nodes cannot be moved"
       * - **Role constraints**: "Top-level containers must stay at root"
       *
       * @param node - The node data that would become a child
       * @param id - The node's ID in the graph
       * @returns `true` if the node can be a child, `false` otherwise
       *
       * @example
       * ```ts
       * // Root node constraints
       * can_be_child: (node) => {
       *   // Root nodes cannot be children
       *   return !node.isRoot;
       * }
       * ```
       *
       * @example
       * ```ts
       * // Type-based movement constraints
       * can_be_child: (node) => {
       *   // Root-level types cannot be nested (like pages, artboards, scenes)
       *   if (node.type === "page" || node.type === "artboard") return false;
       *   // Master components stay at top level
       *   if (node.type === "master") return false;
       *   return true;
       * }
       * ```
       *
       * @example
       * ```ts
       * // Category-based constraints
       * can_be_child: (node) => {
       *   // System nodes cannot be moved
       *   if (node.category === "system") return false;
       *   // Only user-created content can be repositioned
       *   return node.category === "user" || node.category === "template";
       * }
       * ```
       *
       * @example
       * ```ts
       * // Type-based constraints
       * can_be_child: (node) => {
       *   // Pages and artboards must stay at root level
       *   return node.type !== "page" && node.type !== "artboard";
       * }
       * ```
       *
       * @remarks
       * - Checked before `mv()` when moving a node
       * - More efficient than `can_link` for simple "can/cannot be moved" checks
       * - Use when constraint depends only on the child node
       * - Use `can_link` if you need to check parent-child compatibility
       * - Default (when not provided): `true` (any node can be child)
       *
       * @see {@link can_be_parent} for parent constraints
       * @see {@link can_link} for relationship-specific constraints
       */
      can_be_child?(node: T, id: Key): boolean;
    }

    /**
     * Default permissive policy that allows all operations.
     *
     * This policy imposes **no constraints** on tree structure, allowing:
     * - Any node to be a parent (unlimited children)
     * - Any node to be a child (freely movable)
     * - Any parent-child relationship
     * - Unlimited tree depth and breadth
     *
     * ## When to Use
     *
     * Use the default policy when:
     * - You don't need structural constraints
     * - Building a general-purpose tree without type-specific rules
     * - Prototyping before adding constraints
     * - Maximum flexibility is required
     *
     * ## Performance
     *
     * The default policy has **zero overhead**:
     * - All checks return immediately (O(1))
     * - No function calls in hot paths (can be inlined)
     * - Equivalent to having no policy at all
     *
     * @example
     * ```ts
     * // Explicit use of default policy
     * const graph = new Graph(graphData, DEFAULT_POLICY_INFINITE);
     *
     * // Equivalent to not providing a policy (when supported):
     * const graph = new Graph(graphData);
     * ```
     *
     * @example
     * ```ts
     * // Extend the default policy for partial constraints
     * const myPolicy: IGraphPolicy<MyNode> = {
     *   ...DEFAULT_POLICY_INFINITE,
     *   // Only override what you need
     *   max_out_degree: (node) => node.type === "leaf" ? 0 : Infinity,
     * };
     * ```
     *
     * @remarks
     * - **Type-safe**: Works with any node type via `any`
     * - **Composable**: Can be spread and overridden
     * - **Zero cost**: No runtime overhead when used
     * - **Default behavior**: Matches graph behavior before policies
     *
     * @see {@link IGraphPolicy} for creating custom policies
     */
    export const DEFAULT_POLICY_INFINITE: IGraphPolicy<any> = {
      max_out_degree: () => Infinity,
      can_link: () => true,
      can_be_parent: () => true,
      can_be_child: () => true,
    };

    /**
     * Graph manipulation class providing safe tree operations with optional policy constraints.
     *
     * This class wraps an {@link IGraph} and provides methods to safely manipulate
     * the tree structure while maintaining data integrity. All structural changes
     * (move, remove, reorder) are handled through this class to ensure the graph
     * remains in a consistent state.
     *
     * @typeParam T - The type of data stored in each node
     *
     * @example
     * ```ts
     * interface DocumentNode {
     *   id: string;
     *   type: string;
     *   name: string;
     * }
     *
     * const graph = new Graph<DocumentNode>({
     *   nodes: {
     *     "doc": { id: "doc", type: "document", name: "My Doc" },
     *     "section1": { id: "section1", type: "section", name: "Section 1" },
     *     "section2": { id: "section2", type: "section", name: "Section 2" },
     *   },
     *   links: {
     *     "doc": ["section1", "section2"],
     *     "section1": undefined,
     *     "section2": undefined,
     *   }
     * });
     *
     * // Reorder sections
     * graph.order("section2", "front");
     *
     * // Move section1 inside section2
     * graph.mv("section1", "section2", 0);
     *
     * // Remove section2 and its subtree (including section1)
     * const removed = graph.rm("section2");
     * console.log(removed); // ["section1", "section2"]
     * ```
     *
     * @example
     * ```ts
     * // Using with policy constraints
     * interface DesignNode {
     *   type: "scene" | "frame" | "text" | "image";
     * }
     *
     * const policy: IGraphPolicy<DesignNode> = {
     *   max_out_degree: (node) => {
     *     if (node.type === "text" || node.type === "image") return 0;
     *     return Infinity;
     *   },
     *   can_be_child: (node) => node.type !== "scene",
     * };
     *
     * const graph = new Graph<DesignNode>(graphData, policy);
     * graph.mv("frame", "text"); // ❌ Throws: text cannot have children
     * graph.mv("scene", "frame"); // ❌ Throws: scene cannot be a child
     * ```
     *
     * @remarks
     * **Mutability Pattern:**
     * - This class **modifies the constructor data directly** (in-place mutation)
     * - All methods mutate the graph reference passed to the constructor
     * - This design works seamlessly with immutability libraries like Immer:
     *   you can pass a draft to the constructor and mutations will apply to that draft
     * - Use {@link snapshot} to get a copy of the current state when needed
     *
     * **Policy Constraints:**
     * - Optional {@link IGraphPolicy} can be provided to enforce structural rules
     * - Policies are checked before mutations (atomic operations)
     * - Failed policy checks throw descriptive errors
     * - Use {@link DEFAULT_POLICY_INFINITE} for no constraints (default)
     *
     * **Validation:**
     * - The graph validates node existence; invalid operations will throw
     * - Error messages follow file-system conventions for familiarity
     * - Policy violations provide specific error messages
     *
     * @example
     * ```ts
     * // Using with Immer (or similar immutability patterns)
     * import { produce } from "immer";
     *
     * const state = {
     *   graph: {
     *     nodes: { root: {...}, child: {...} },
     *     links: { root: ["child"], child: undefined }
     *   }
     * };
     *
     * const nextState = produce(state, draft => {
     *   // Pass draft.graph to constructor - mutations apply to draft
     *   const graph = new Graph(draft.graph);
     *   graph.rm("child");
     *   // draft.graph is now modified, producing new immutable state
     * });
     * ```
     */
    export class Graph<T> {
      constructor(
        private readonly graph: IGraph<T>,
        private readonly policy: IGraphPolicy<T> = DEFAULT_POLICY_INFINITE
      ) {}

      /**
       * Ensures a node has a children array in links, initializing if needed.
       *
       * @param id - The node ID to ensure children for
       * @returns The children array for the node (guaranteed to be defined)
       * @internal
       */
      private enschildren(id: Key): string[] {
        return (this.graph.links[id] ??= []);
      }

      /**
       * Creates a snapshot of the current graph state.
       *
       * This method returns a copy of the graph structure, useful for:
       * - Implementing undo/redo functionality
       * - Creating checkpoints before operations
       * - Comparing graph states
       * - Exporting graph data
       *
       * @returns A new IGraph object with copied nodes and links
       *
       * @example
       * ```ts
       * const graph = new Graph({ nodes: {...}, links: {...} });
       * const before = graph.snapshot();
       *
       * graph.mv("child", "newParent");
       *
       * const after = graph.snapshot();
       * // before and after are independent objects
       * ```
       *
       * @remarks
       * - The `nodes` record is shallow-copied (node objects are not cloned)
       * - The `links` record and all child arrays are deep-copied for independence
       * - If you need deep copies of node data, clone the nodes separately
       */
      snapshot(): IGraph<T> {
        return {
          nodes: { ...this.graph.nodes },
          links: Object.fromEntries(
            Object.entries(this.graph.links).map(([key, children]) => [
              key,
              children ? [...children] : children,
            ])
          ),
        };
      }
      //

      /**
       * Recursively remove a node and its entire subtree from the graph.
       *
       * This method removes the specified node along with all of its descendants,
       * cleaning up all associated links. The removal is recursive, so if the node
       * has children, those children and their children are also removed.
       *
       * @param key - The node ID to remove
       * @returns Array of removed node IDs in removal order (children first, then parent)
       * @throws {Error} If the node does not exist
       * @mutates Modifies the graph in-place by removing nodes and updating links
       *
       * @example
       * ```ts
       * // Tree: root -> [a -> [b, c], d]
       * const removed = graph.rm("a");
       * console.log(removed); // ["b", "c", "a"]
       * // Now the tree is: root -> [d]
       * ```
       *
       * @remarks
       * - Children are removed before parents (depth-first)
       * - All links referencing the removed nodes are cleaned up
       * - For removing a single node without its children, use {@link unlink}
       * - The return value can be used to implement undo functionality
       *
       * @see {@link unlink} for removing a node without its children
       */
      rm(key: Key): RmResult {
        if (!(key in this.graph.nodes)) {
          throw new Error(`rm: cannot remove '${key}': No such node`);
        }

        const removed: string[] = [];

        // Remove children first (depth-first)
        const children = this.graph.links[key];
        if (children && children.length > 0) {
          for (const child of [...children]) {
            removed.push(...this.rm(child));
          }
        }

        // Then unlink this node
        this.unlink(key);
        removed.push(key);

        return removed;
      }

      /**
       * Unlink (delete) a single node from the graph without removing its children.
       *
       * This method removes only the specified node from the graph. If the node has children,
       * those children become orphaned (detached from the tree). This is useful when you want
       * to remove a node but preserve its subtree for re-attachment elsewhere.
       *
       * @param key - The node ID to unlink
       * @throws {Error} If the node does not exist
       * @mutates Modifies the graph in-place by removing the node and updating parent links
       *
       * @example
       * ```ts
       * // Tree: root -> a -> b
       * graph.unlink("a");
       * // Now: root (b exists but is orphaned)
       *
       * // b can be re-attached
       * graph.mv("b", "root");
       * // Now: root -> b
       * ```
       *
       * @remarks
       * - Only the specified node is removed; children are not affected
       * - Children of the removed node become orphaned and may need re-attachment
       * - For removing a node and its entire subtree, use {@link rm}
       * - The node's entry is removed from both `nodes` and `links`
       *
       * @see {@link rm} for recursive removal including children
       * @see {@link mv} for re-attaching orphaned nodes
       */
      unlink(key: Key): void {
        if (!(key in this.graph.nodes)) {
          throw new Error(`unlink: cannot unlink '${key}': No such node`);
        }

        // Remove this node from any parent's links
        for (const nodeKey in this.graph.links) {
          const children = this.graph.links[nodeKey];
          if (children) {
            const idx = children.indexOf(key);
            if (idx >= 0) {
              children.splice(idx, 1);
            }
          }
        }

        // Delete the node itself
        delete this.graph.nodes[key];
        delete this.graph.links[key];
      }

      /**
       * Move one or more nodes to a new parent at a specific position.
       *
       * This method relocates nodes within the tree, updating all relevant links automatically.
       * Nodes are detached from their current parent (if any) and attached to the target parent
       * at the specified index.
       *
       * @param sources - Single node ID or array of node IDs to move
       * @param target - Target parent node ID to move into
       * @param index - Insertion index in target's children array. -1 (default) appends at end.
       * @throws {Error} If any source node or target node does not exist
       * @mutates Modifies the graph in-place by updating links
       *
       * @example
       * ```ts
       * // Tree: root -> [a, b], b -> [c]
       * graph.mv("c", "root", 0);
       * // Now: root -> [c, a, b], b -> []
       *
       * // Move multiple nodes
       * graph.mv(["a", "b"], "c");
       * // Now: root -> [], c -> [a, b]
       *
       * // Insert at specific position
       * graph.mv("a", "root", 1);
       * // Now: root -> [c, a], b -> []
       * ```
       *
       * @remarks
       * - Nodes are automatically detached from their current parent
       * - If moving multiple nodes, they maintain their relative order
       * - Index is clamped to valid range (0 to children.length)
       * - Moving a node to its current parent changes its position among siblings
       * - Cycle detection is NOT implemented; avoid moving ancestors into descendants
       *
       * **Behavioral Note:**
       * Unlike {@link flat_with_children.mv} which throws an error when the target lacks
       * a children array, this method **auto-initializes** missing or undefined link entries.
       * This is intentional: `graph.IGraph` explicitly allows `undefined` in its type signature
       * (`links: Record<string, string[] | undefined>`), making this behavior consistent
       * with the graph's design philosophy of handling sparse structures gracefully.
       *
       * @see {@link order} for reordering within the same parent
       */
      mv(sources: Key | Key[], target: Key, index: number = -1): void {
        const srcs = Array.isArray(sources) ? sources : [sources];
        const pos_specified = index >= 0;
        let pos = index;

        // Validate target exists
        if (!(target in this.graph.nodes)) {
          throw new Error(`mv: cannot move to '${target}': No such node`);
        }

        // Validate all source nodes exist
        for (const src of srcs) {
          if (!(src in this.graph.nodes)) {
            throw new Error(`mv: cannot move '${src}': No such node`);
          }
        }

        const targetNode = this.graph.nodes[target];

        // === Policy Validation (all checks before any mutation) ===

        // 1. Check can_be_child for each source
        if (this.policy.can_be_child) {
          for (const src of srcs) {
            const srcNode = this.graph.nodes[src];
            if (!this.policy.can_be_child(srcNode, src)) {
              throw new Error(
                `mv: cannot move '${src}': Node cannot be a child`
              );
            }
          }
        }

        // 2. Check can_be_parent for target
        if (this.policy.can_be_parent) {
          if (!this.policy.can_be_parent(targetNode, target)) {
            throw new Error(
              `mv: cannot move to '${target}': Node cannot be a parent`
            );
          }
        }

        // 3. Check max_out_degree for target
        if (this.policy.max_out_degree) {
          const maxDegree = this.policy.max_out_degree(targetNode, target);
          const currentChildren = this.graph.links[target] ?? [];

          // Count how many sources are NOT already children of target
          const newSources = srcs.filter(
            (src) => !currentChildren.includes(src)
          );
          const newChildrenCount = currentChildren.length + newSources.length;

          if (maxDegree === 0) {
            throw new Error(
              `mv: cannot move to '${target}': Node cannot have children (max_out_degree = 0)`
            );
          }

          if (newChildrenCount > maxDegree) {
            throw new Error(
              `mv: cannot move to '${target}': Parent at max capacity (${currentChildren.length}/${maxDegree} children)`
            );
          }
        }

        // 4. Check can_link for each source-target pair
        if (this.policy.can_link) {
          for (const src of srcs) {
            const srcNode = this.graph.nodes[src];
            if (!this.policy.can_link(targetNode, target, srcNode, src)) {
              throw new Error(
                `mv: cannot link '${target}' -> '${src}': Link not allowed by policy`
              );
            }
          }
        }

        // === All validations passed, proceed with mutation ===

        // Ensure target has a children array
        const targetChildren = this.enschildren(target);

        // Move each source node
        for (const src of srcs) {
          // Detach from old parent (if any)
          for (const nodeKey in this.graph.links) {
            const children = this.graph.links[nodeKey];
            if (!children) continue;
            const i = children.indexOf(src);
            if (i !== -1) {
              children.splice(i, 1);
              break;
            }
          }

          // Attach to new parent at specified position
          const insert_at =
            !pos_specified || pos > targetChildren.length
              ? targetChildren.length
              : pos;
          targetChildren.splice(insert_at, 0, src);
          if (pos_specified) pos++;
        }
      }

      /**
       * Reorder a node within its current parent's children array.
       *
       * This method changes the position of a node among its siblings without changing
       * its parent. Useful for z-index type operations or list reordering.
       *
       * @param key - The node ID to reorder
       * @param order - Ordering directive:
       *   - `"front"` - Move to the end (highest z-index)
       *   - `"back"` - Move to the start (lowest z-index)
       *   - `"forward"` - Move one position toward the end
       *   - `"backward"` - Move one position toward the start
       *   - `number` - Move to specific index
       * @throws {Error} If the node does not exist
       * @mutates Modifies the graph in-place by reordering links
       *
       * @example
       * ```ts
       * // Tree: parent -> [a, b, c, d]
       * graph.order("b", "front");
       * // Now: parent -> [a, c, d, b]
       *
       * graph.order("d", "back");
       * // Now: parent -> [d, a, c, b]
       *
       * graph.order("c", "forward");
       * // Now: parent -> [d, a, b, c]
       *
       * graph.order("b", 0);
       * // Now: parent -> [b, d, a, c]
       * ```
       *
       * @remarks
       * - Only affects the node's position among siblings
       * - Does not change the node's parent
       * - Numeric indices are clamped to valid range
       * - "forward" and "backward" are relative to current position
       * - Has no effect if the node has no parent (orphan node)
       *
       * @see {@link mv} for moving nodes to a different parent
       */
      order(
        key: Key,
        order: "back" | "front" | "backward" | "forward" | number
      ): void {
        // Validate node exists
        if (!(key in this.graph.nodes)) {
          throw new Error(`order: cannot reorder '${key}': No such node`);
        }

        // Find parent (the node that has this key in its children)
        let parent_children: string[] | null = null;
        for (const nodeKey in this.graph.links) {
          const children = this.graph.links[nodeKey];
          if (!children) continue;
          if (children.includes(key)) {
            parent_children = children;
            break;
          }
        }

        // If node has no parent (orphan), nothing to reorder
        if (!parent_children) return;

        const currentIndex = parent_children.indexOf(key);
        if (currentIndex === -1) return;

        // Calculate target index mathematically
        const lengthAfterRemoval = parent_children.length - 1;
        let targetIndex: number;

        if (typeof order === "number") {
          targetIndex = order;
        } else {
          // Map order directives to mathematical offsets/positions
          const orderMap = {
            back: 0,
            backward: currentIndex - 1,
            front: lengthAfterRemoval,
            forward: currentIndex + 1,
          };
          targetIndex = orderMap[order];
        }

        // Clamp to valid range [0, lengthAfterRemoval]
        targetIndex = Math.max(0, Math.min(lengthAfterRemoval, targetIndex));

        // No-op optimization: if target equals current, skip the operation
        if (targetIndex === currentIndex) return;

        // Perform the reorder: remove and reinsert at target position
        parent_children.splice(currentIndex, 1);
        parent_children.splice(targetIndex, 0, key);
      }
    }
  }
}
