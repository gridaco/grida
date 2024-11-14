import { grida } from "@/grida";
import type { IDocumentEditorState } from "./types";

/**
 * @internal
 */
export namespace documentquery {
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
