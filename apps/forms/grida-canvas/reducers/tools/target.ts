import type {
  IDocumentEditorState,
  SurfaceRaycastTargeting,
} from "@/grida-canvas/state";
import { document } from "../../document-query";

export function getSurfaceRayTarget(
  hits: string[],
  {
    config,
    context,
  }: {
    config: SurfaceRaycastTargeting;
    context: IDocumentEditorState;
  },
  nested_first: boolean = false
): string | null {
  const {
    selection,
    document: { root_id, nodes },
  } = context;

  // Filter the nodes based on the configuration
  const filtered = hits
    .filter((node_id) => {
      if (config.ignores_root && node_id === root_id) {
        return false; // Ignore the root node if configured
      }

      const node = nodes[node_id];

      if (!node) {
        // ensure target exists in current document (this can happen since the hover is triggered from the event target, where the new document state is not applied yet)
        return false; // Ignore nodes that don't exist
      }

      if (config.ignores_locked && node.locked) {
        return false; // Ignore locked nodes if configured
      }

      return true; // Include this node
    })
    .sort((a, b) => {
      return (
        document.getDepth(context.document_ctx, a) -
        document.getDepth(context.document_ctx, b)
      );
    });

  switch (config.target) {
    case "auto": {
      const selection_sibling_ids = new Set(
        selection
          .map((node_id) => document.getSiblings(context.document_ctx, node_id))
          .flat()
      );

      filtered.sort((a, b) => {
        if (selection.includes(a)) {
          return -2;
        }

        if (selection_sibling_ids.has(a)) {
          return -1;
        }

        const a_parent = document.getParentId(context.document_ctx, a);
        if (a_parent && selection.includes(a_parent)) {
          return nested_first ? -3 : 0;
        }

        return 0;
      });
      return filtered[0]; // shallowest node
    }
    case "deepest":
      return filtered.reverse()[0]; // Deepest node (first in the array)
    case "shallowest":
      return filtered[0]; // Shallowest node (last in the array)
  }

  // If no valid node is found, return null
  return null;
}

export function getMarqueeSelection(
  state: IDocumentEditorState,
  hits: string[]
): string[] {
  const {
    document: { root_id },
    document_ctx,
  } = state;

  // [marquee selection target]
  // 1. shall not be a root node
  // 2. shall not be a locked node
  // 3. the parent of this node shall also be hit by the marquee (unless it's the root node)
  const target_node_ids = hits.filter((hit_id) => {
    // (1) shall not be a root node
    if (hit_id === root_id) return false;

    // (2) shall not be a locked node
    const hit = document.__getNodeById(state, hit_id);
    if (!hit) return false;
    if (hit.locked) return false;

    const parent_id = document.getParentId(document_ctx, hit_id)!;
    if (parent_id === root_id) return true;
    if (!hits.includes(parent_id)) return false;

    const parent = document.__getNodeById(state, parent_id!);
    if (!parent) return false;
    if (parent.locked) return false;

    return true;
  });

  return target_node_ids;
}
