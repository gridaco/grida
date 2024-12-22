import type {
  IDocumentEditorState,
  SurfaceRaycastTargeting,
} from "@/grida-canvas/state";
import { document } from "../../document-query";
import { grida } from "@/grida";

export function getSurfaceRayTarget(
  node_ids_from_point: string[],
  {
    config,
    context,
  }: {
    config: SurfaceRaycastTargeting;
    context: IDocumentEditorState;
  }
): string | null {
  const {
    document: { root_id, nodes },
  } = context;

  // Filter the nodes based on the configuration
  const filteredNodes = node_ids_from_point.filter((node_id) => {
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
  });

  // Select the target based on the configuration
  if (config.target === "deepest") {
    return filteredNodes[0]; // Deepest node (first in the array)
  }

  if (config.target === "shallowest") {
    return filteredNodes[filteredNodes.length - 1]; // Shallowest node (last in the array)
  }

  if (config.target === "next") {
    // "Next" logic: find the shallowest node above the deepest one
    const deepestNode = filteredNodes[0];
    if (!deepestNode) return null;

    // Get the parent of the deepest node
    const parentNodeId = document.getAncestors(
      context.document_ctx,
      deepestNode
    )[1];
    if (!parentNodeId) return deepestNode; // If no parent, fallback to the deepest node

    // Ensure the parent is part of the filtered nodes
    if (filteredNodes.includes(parentNodeId)) {
      return parentNodeId;
    }

    // Fallback to the deepest node if no valid parent is found
    return deepestNode;
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

export function getDoubleclickTarget(
  state: IDocumentEditorState,
  hits: string[],
  current: string
): string | undefined {
  return Array.from(hits)
    .reverse()
    .find((hit_id) => {
      const hit = document.__getNodeById(state, hit_id);
      if (hit.locked) return false; // ignore locked

      const ancestors = document.getAncestors(state.document_ctx, hit_id);
      if (ancestors.includes(current)) {
        return hit_id;
      }
    });
}
