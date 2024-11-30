import { grida } from "@/grida";
import type { IDocumentEditorState } from "./types";

/**
 * @internal
 */
export namespace documentquery {
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
  ): string[] {
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

  export function getParentId(
    context: grida.program.document.internal.IDocumentDefinitionRuntimeHierarchyContext,
    node_id: string
  ): string | null {
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
