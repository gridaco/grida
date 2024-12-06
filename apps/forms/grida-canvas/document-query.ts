import { grida } from "@/grida";
import type { IDocumentEditorState } from "./types";

type NodeID = string;

/**
 * @internal
 */
export namespace documentquery {
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
    context: grida.program.document.internal.IDocumentDefinitionRuntimeHierarchyContext,
    selection: NodeID[]
  ): NodeID[] {
    const prunedSelection: Set<NodeID> = new Set();

    for (const node of selection) {
      // Check if the node is a descendant of any already selected parent
      if (
        !Array.from(prunedSelection).some((selectedNode) =>
          isAncestor(context, selectedNode, node)
        )
      ) {
        // Remove descendants of the current node from the pruned selection
        for (const selectedNode of Array.from(prunedSelection)) {
          if (isAncestor(context, node, selectedNode)) {
            prunedSelection.delete(selectedNode);
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
    context: grida.program.document.internal.IDocumentDefinitionRuntimeHierarchyContext,
    ancestor: NodeID,
    node: NodeID
  ): boolean {
    const { __ctx_nid_to_parent_id } = context;
    let current = node;

    while (current) {
      const parent = __ctx_nid_to_parent_id[current];
      if (parent === ancestor) return true; // Ancestor found
      current = parent;
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
    context: grida.program.document.internal.IDocumentDefinitionRuntimeHierarchyContext,
    node_id: string
  ): NodeID[] {
    const { __ctx_nid_to_parent_id } = context;
    const ancestors: string[] = [];
    let current = node_id;

    // Traverse upwards to collect ancestors
    while (current) {
      const parent = __ctx_nid_to_parent_id[current];
      if (!parent) break; // Stop at root node
      ancestors.unshift(parent); // Insert at the beginning for root-first order
      current = parent;
    }

    return ancestors;
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
    context: grida.program.document.internal.IDocumentDefinitionRuntimeHierarchyContext,
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

  export function getParentId(
    context: grida.program.document.internal.IDocumentDefinitionRuntimeHierarchyContext,
    node_id: string
  ): NodeID | null {
    return context.__ctx_nid_to_parent_id[node_id] || null;
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
    repositories: grida.program.document.IDocumentNodesRepository[],
    node_id: string
  ): grida.program.nodes.Node {
    const repo = repositories.find((repo) => repo.nodes[node_id]);
    if (repo) return repo.nodes[node_id];
    throw new Error(`node not found with node_id: "${node_id}"`);
  }
}
