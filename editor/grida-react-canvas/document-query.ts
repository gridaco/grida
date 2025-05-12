import grida from "@grida/schema";
import type { IDocumentEditorState } from "./state";
import assert from "assert";

type NodeID = string & {};

const HARD_MAX_WHILE_LOOP = 5000;

/**
 * @internal
 */
export namespace document {
  /**
   * Queries nodes in the document hierarchy based on a specified selector.
   *
   * @param context - The runtime hierarchy context containing the node structure and relationships.
   * @param selection - The currently selected nodes, represented as an array of node IDs.
   * @param selector - A `Selector` indicating the query type:
   *  - `"*"`: Selects all nodes.
   *  - `"~"`: Selects siblings of the current selection.
   *    - If a single node is selected, returns its siblings.
   *    - If multiple nodes are selected, ensures all selected nodes are siblings and returns their siblings.
   *    - If no nodes are selected, defaults to `"*"` (all nodes).
   *  - `">"`: Selects the direct children of the currently selected nodes.
   *  - `"selection"`: Returns the currently selected nodes.
   *  - `NodeID[]`: A specific array of node IDs to query directly.
   *
   * @returns An array of node IDs matching the specified query.
   *
   * @example
   * // Example context
   * const context = {
   *   __ctx_nid_to_parent_id: {
   *     "node1": null,    // Root node
   *     "node2": "node1", // Child of node1
   *     "node3": "node1", // Child of node1
   *     "node4": "node2", // Child of node2
   *   },
   *   __ctx_nids: new Set(["node1", "node2", "node3", "node4"]),
   * };
   *
   * // Query all nodes
   * const allNodes = querySelector(context, [], "*");
   * console.log(allNodes); // ["node1", "node2", "node3", "node4"]
   *
   * // Query siblings of "node2"
   * const siblings = querySelector(context, ["node2"], "~");
   * console.log(siblings); // ["node3"]
   *
   * // Query children of "node1"
   * const children = querySelector(context, ["node1"], ">");
   * console.log(children); // ["node2", "node3"]
   *
   * // Query specific nodes
   * const specificNodes = querySelector(context, [], ["node2", "node3"]);
   * console.log(specificNodes); // ["node2", "node3"]
   *
   * // Query current selection
   * const currentSelection = querySelector(context, ["node4"], "selection");
   * console.log(currentSelection); // ["node4"]
   */
  export function querySelector(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    selection: NodeID[],
    selector: grida.program.document.Selector
  ): NodeID[] {
    switch (selector) {
      case "*": {
        return Array.from(context.__ctx_nids);
      }
      case "~": {
        // check if selection is empty / single / multiple
        if (selection.length === 0) {
          // when empty, select with * (all)
          return Array.from(context.__ctx_nids);
        } else if (selection.length === 1) {
          return document.getSiblings(context, selection[0]);
        } else {
          // multiple selection
          // when multiple, ensure that the current selection is a subset of the siblings (shares the same parent) / if not, ignore.

          const parentIds = selection.map((node_id) =>
            document.getParentId(context, node_id)
          );
          const uniqueParentIds = new Set(parentIds);
          const is_siblings = uniqueParentIds.size === 1;

          if (!is_siblings) return [];
          const siblings = document.getSiblings(context, selection[0]);
          return siblings;
        }
      }
      case ">": {
        return selection.flatMap((node_id) =>
          document.getChildren(context, node_id)
        );
      }
      case "..": {
        return selection.flatMap((node_id) => {
          const parent = document.getParentId(context, node_id);
          return parent ? [parent] : [];
        });
      }
      case "selection": {
        return selection;
      }
      default: {
        assert(Array.isArray(selector), "selection must be an array");
        return selector;
      }
    }
  }

  /**
   * [UX]
   *
   * filters nodes by hierarchy in a UX friendly matter.
   *
   * When a parent and child is requested to be selected at the same time, only the parent shall be selected.
   * This is to prevent recursive mutation of selected nodes in a nested way.
   *
   * Without this filtering, when modifying a tralsate or rotation will cause the nested children to be mutated as well.
   *
   * @example
   * - input: [a, a.0, a.1, a.1.9, b, c, d.0, z.9.9.9]
   * - output: [a, b, c, d.0, z.9.9.9]
   */
  export function pruneNestedNodes(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    selection: NodeID[]
  ): NodeID[] {
    const prunedSelection: Set<NodeID> = new Set();

    for (const node of selection) {
      // Check if the node is a descendant of any already selected parent
      if (
        !Array.from(prunedSelection).some((selected) =>
          isAncestor(context, selected, node)
        )
      ) {
        // Remove descendants of the current node from the pruned selection
        for (const selected of Array.from(prunedSelection)) {
          if (isAncestor(context, node, selected)) {
            prunedSelection.delete(selected);
          }
        }

        // Add the current node
        prunedSelection.add(node);
      }
    }

    return Array.from(prunedSelection);
  }

  /**
   * Determines whether a given node (`ancestor`) is an ancestor of another node (`node`).
   *
   * This function traverses upwards in the hierarchy from the specified node,
   * checking each parent node until it reaches the root or finds the specified ancestor.
   *
   * @param context - The runtime hierarchy context containing the mapping of node IDs to their parent IDs.
   * @param ancestor - The node ID to check as a potential ancestor.
   * @param node - The node ID to check as a descendant.
   * @returns `true` if the specified `ancestor` is an ancestor of the given `node`; otherwise, `false`.
   *
   * @example
   * // Example context
   * const context = {
   *   __ctx_nid_to_parent_id: {
   *     "node4": "node3",
   *     "node3": "node2",
   *     "node2": "node1",
   *     "node1": null, // root node has no parent
   *   }
   * };
   *
   * // Check if "node2" is an ancestor of "node4"
   * const result = isAncestor(context, "node2", "node4");
   * console.log(result); // true
   *
   * // Check if "node1" is an ancestor of "node4"
   * const result = isAncestor(context, "node1", "node4");
   * console.log(result); // true
   *
   * // Check if "node3" is an ancestor of "node2"
   * const result = isAncestor(context, "node3", "node2");
   * console.log(result); // false
   */
  function isAncestor(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    ancestor: NodeID,
    node: NodeID
  ): boolean {
    const { __ctx_nid_to_parent_id } = context;
    let current: string | null = node;

    let i = 0;
    while (current) {
      const parent: string | null = current
        ? __ctx_nid_to_parent_id[current]
        : null;
      if (parent === ancestor) return true; // Ancestor found
      current = parent;
      if (i++ > HARD_MAX_WHILE_LOOP) {
        reportError("HARD_MAX_WHILE_LOOP");
        break;
      }
    }

    return false; // Ancestor not found
  }

  /**
   * Retrieves a list of ancestor node IDs for a given node, starting from the root
   * and ending with the parent of the specified node.
   *
   * @param context - The runtime hierarchy context containing the mapping of node IDs to their parent IDs.
   * @param node_id - The ID of the node for which ancestors are to be retrieved.
   * @returns An array of ancestor node IDs in **root-first order**, excluding the current node.
   *          - The first element (`res[0]`) is the root node.
   *          - The last element (`res[res.length - 1]`) is the immediate parent of the given node.
   *
   * @example
   * // Example context
   * const context = {
   *   __ctx_nid_to_parent_id: {
   *     "node4": "node3",
   *     "node3": "node2",
   *     "node2": "node1",
   *     "node1": null, // root node has no parent
   *   }
   * };
   *
   * // Get ancestors for "node4"
   * const ancestors = documentquery.getAncestors(context, "node4");
   * console.log(ancestors); // ["node1", "node2", "node3"]
   *
   * // Explanation:
   * // - "node1" is the root node.
   * // - "node2" is the parent of "node3".
   * // - "node3" is the parent of "node4".
   */
  export function getAncestors(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    node_id: string
  ): NodeID[] {
    const { __ctx_nid_to_parent_id } = context;
    const ancestors: string[] = [];
    let current = node_id;

    // Traverse upwards to collect ancestors
    let i = 0;
    while (current) {
      const parent = __ctx_nid_to_parent_id[current];
      if (!parent) break; // Stop at root node
      ancestors.unshift(parent); // Insert at the beginning for root-first order
      current = parent;

      if (i++ > HARD_MAX_WHILE_LOOP) {
        reportError("HARD_MAX_WHILE_LOOP");
        break;
      }
    }

    return ancestors;
  }

  export function getDepth(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    node_id: string
  ): number {
    return getAncestors(context, node_id).length;
  }

  /**
   * Retrieves all sibling nodes of a specified node.
   *
   * @param context - The runtime hierarchy context containing the mapping of node IDs to their parent IDs.
   * @param node_id - The ID of the node for which siblings are to be retrieved.
   * @returns An array of sibling node IDs that share the same parent as the specified node.
   *          The array excludes the input node itself.
   *
   * @example
   * // Example context
   * const context = {
   *   __ctx_nid_to_parent_id: {
   *     "node1": null, // root node
   *     "node2": "node1",
   *     "node3": "node1",
   *     "node4": "node2",
   *   }
   * };
   *
   * // Get siblings for "node3"
   * const siblings = getSiblings(context, "node3");
   * console.log(siblings); // ["node2"]
   *
   * // Get siblings for "node1" (root node)
   * const siblings = getSiblings(context, "node1");
   * console.log(siblings); // []
   */
  export function getSiblings(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    node_id: string
  ): NodeID[] {
    const parent_id = getParentId(context, node_id);

    if (!parent_id) {
      // If the node has no parent, it is at the root level, and all nodes without parents are its "siblings."
      return Object.keys(context.__ctx_nid_to_parent_id).filter(
        (id) => context.__ctx_nid_to_parent_id[id] === null
      );
    }

    // Filter all nodes that share the same parent but exclude the input node itself.
    return Object.keys(context.__ctx_nid_to_parent_id).filter(
      (id) => context.__ctx_nid_to_parent_id[id] === parent_id && id !== node_id
    );
  }

  /**
   * Retrieves all child nodes of a specified node.
   *
   * @param context - The runtime hierarchy context containing the mapping of node IDs to their parent IDs.
   * @param node_id - The ID of the node for which children are to be retrieved.
   * @returns An array of child node IDs that have the specified node as their parent.
   *
   * @example
   * // Example context
   * const context = {
   *   __ctx_nid_to_parent_id: {
   *     "node1": null,    // Root node
   *     "node2": "node1", // Child of node1
   *     "node3": "node1", // Child of node1
   *     "node4": "node2", // Child of node2
   *   }
   * };
   *
   * // Get children of "node1"
   * const children = getChildren(context, "node1");
   * console.log(children); // ["node2", "node3"]
   *
   * // Get children of "node2"
   * const children = getChildren(context, "node2");
   * console.log(children); // ["node4"]
   *
   * // Get children of a root node with no children
   * const children = getChildren(context, "node3");
   * console.log(children); // []
   */
  export function getChildren(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    node_id: string,
    recursive = false
  ): NodeID[] {
    const { __ctx_nid_to_parent_id } = context;
    const directChildren = Object.keys(__ctx_nid_to_parent_id).filter(
      (id) => __ctx_nid_to_parent_id[id] === node_id
    );

    if (!recursive) {
      return directChildren;
    }

    const allChildren = [...directChildren];
    for (const child of directChildren) {
      allChildren.push(...getChildren(context, child, true));
    }
    return allChildren;
  }

  export function getParentId(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    node_id: string
  ): NodeID | null {
    return context.__ctx_nid_to_parent_id[node_id] ?? null;
  }

  export function getTopId(
    context: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext,
    node_id: string
  ): NodeID | null {
    // veryfi if exists
    if (context.__ctx_nids.includes(node_id)) {
      const ancestors = getAncestors(context, node_id);
      return ancestors[0] ?? node_id;
    } else {
      return null;
    }
  }

  /**
   * @internal
   * @param state - state or draft
   * @param node_id
   * @returns
   */
  export function __getNodeById<S extends IDocumentEditorState>(
    state: S,
    node_id: string
  ): S["document"]["nodes"][string] {
    ///
    /// NOTE: once migrated, this function SHALL NOT lookup the templates table.
    ///
    const { document, templates } = state;
    const node = document.nodes[node_id];
    if (node) return node as S["document"]["nodes"][string];

    if (templates) {
      const templates_arr = Object.values(templates);
      const found = __getSubNodeById(templates_arr, node_id);
      if (found) return found as S["document"]["nodes"][string];
    }

    throw new Error(`node not found with node_id: "${node_id}"`);
  }

  /**
   * @deprecated
   * @param repositories
   * @param node_id
   * @returns
   */
  function __getSubNodeById(
    repositories: grida.program.document.INodesRepository[],
    node_id: string
  ): grida.program.nodes.Node {
    const repo = repositories.find((repo) => repo.nodes[node_id]);
    if (repo) return repo.nodes[node_id];
    throw new Error(`node not found with node_id: "${node_id}"`);
  }

  //
  export function hierarchy(
    node_id: string,
    ctx: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext
  ): { id: string; depth: number }[] {
    const collectNodeIds = (
      nodeId: string,
      depth: number,
      result: { id: string; depth: number }[] = []
    ): { id: string; depth: number }[] => {
      result.push({ id: nodeId, depth }); // Add current node ID with its depth

      // Get children from context
      const children = ctx.__ctx_nid_to_children_ids[nodeId] ?? [];
      for (const childId of children) {
        collectNodeIds(childId, depth + 1, result); // Increase depth for children
      }

      return result;
    };

    // Start traversal from the root node
    return collectNodeIds(node_id, 0);
  }

  export class Context
    implements
      grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext
  {
    readonly __ctx_nids: string[] = [];
    readonly __ctx_nid_to_parent_id: Record<string, string | null> = {};
    readonly __ctx_nid_to_children_ids: Record<string, string[]> = {};
    constructor(
      init?: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext
    ) {
      if (init) {
        Object.assign(this, init);
      }
    }

    static from(document: grida.program.document.IDocumentDefinition) {
      const ctx =
        grida.program.document.internal.create_nodes_repository_runtime_hierarchy_context(
          document
        );
      return new Context(ctx);
    }

    insert(node_id: NodeID, parent_id: NodeID | null) {
      assert(this.__ctx_nids.indexOf(node_id) === -1, "node_id already exists");

      if (parent_id) {
        this.__ctx_nids.push(node_id);
        this.__ctx_nid_to_parent_id[node_id] = parent_id;

        if (!this.__ctx_nid_to_children_ids[parent_id]) {
          this.__ctx_nid_to_children_ids[parent_id] = [];
        }

        this.__ctx_nid_to_children_ids[parent_id].push(node_id);
      } else {
        // register to the document. done.
        this.__ctx_nids.push(node_id);
        this.__ctx_nid_to_parent_id[node_id] = null;
      }
    }

    /**
     * place the node as a child of the parent node.
     * this does not consider the current parent of the node. or does anything about it.
     *
     * The use of this methid is very limited.
     *
     * @param node_id
     * @param parent_id
     */
    blindlymove(node_id: NodeID, parent_id: NodeID | null) {
      this.__ctx_nid_to_parent_id[node_id] = parent_id;

      if (parent_id) {
        if (!this.__ctx_nid_to_children_ids[parent_id]) {
          this.__ctx_nid_to_children_ids[parent_id] = [];
        }
        this.__ctx_nid_to_children_ids[parent_id].push(node_id);
      } else {
        // register to the document. done.
        this.__ctx_nids.push(node_id);
      }
    }

    snapshot(): grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext {
      return {
        __ctx_nids: this.__ctx_nids.slice(),
        __ctx_nid_to_parent_id: { ...this.__ctx_nid_to_parent_id },
        __ctx_nid_to_children_ids: { ...this.__ctx_nid_to_children_ids },
      };
    }

    // [NOT USED] - did not yet decided how to implement the callback (for updating the document - none-context)
    // delete(node_id: NodeID) {
    //   const deleted_node_ids = new Set<NodeID>(node_id);
    //   // recursively delete children
    //   const children_ids = this.__ctx_nid_to_children_ids[node_id] || [];
    //   for (const child_id of children_ids) {
    //     const deleted = this.delete(child_id);
    //     deleted.forEach(deleted_node_ids.add, deleted_node_ids);
    //   }

    //   // detach from parent
    //   const parent_id = this.__ctx_nid_to_parent_id[node_id];
    //   if (parent_id) {
    //     const parent_children_ids = this.__ctx_nid_to_children_ids[parent_id];
    //     const index = parent_children_ids.indexOf(node_id);

    //     if (index > -1) {
    //       // remove from parent node's children array
    //       // (
    //       //   draft.document.nodes[parent_id] as grida.program.nodes.i.IChildren
    //       // ).children!.splice(index, 1);

    //       // remove from document context
    //       parent_children_ids.splice(index, 1);
    //     }
    //   }

    //   // delete self from context
    //   delete this.__ctx_nid_to_parent_id[node_id];
    //   delete this.__ctx_nid_to_children_ids[node_id];
    //   const index = this.__ctx_nids.indexOf(node_id);
    //   if (index > -1) {
    //     this.__ctx_nids.splice(index, 1);
    //   }

    //   return Array.from(deleted_node_ids);
    // }

    getAncestors(node_id: NodeID): NodeID[] {
      return getAncestors(this, node_id);
    }

    getDepth(node_id: NodeID): number {
      return getDepth(this, node_id);
    }
  }

  //

  export class DocumentState {
    constructor(
      private readonly document: grida.program.document.IDocumentDefinition
    ) {}

    private get nodes(): grida.program.document.INodesRepository["nodes"] {
      return this.document.nodes;
    }

    private get nodeids(): Array<string> {
      return Object.keys(this.nodes);
    }

    textnodes(): Array<grida.program.nodes.TextNode> {
      return this.nodeids
        .map((id) => this.nodes[id])
        .filter(
          (node) => node.type === "text"
        ) as grida.program.nodes.TextNode[];
    }

    fonts(): Array<string> {
      return Array.from(
        new Set(
          this.textnodes()
            .map((node) => node.fontFamily)
            .filter(Boolean) as Array<string>
        )
      );
    }
  }
}
