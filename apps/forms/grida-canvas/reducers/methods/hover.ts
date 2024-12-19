import type { Draft } from "immer";
import type {
  IDocumentEditorState,
  SurfaceRaycastTargeting,
} from "../../state";
import { document } from "../../document-query";

export function self_updateSurfaceHoverState<S extends IDocumentEditorState>(
  draft: Draft<S>
) {
  const target = getSurfaceRayTarget(draft.surface_raycast_detected_node_ids, {
    config: draft.surface_raycast_targeting,
    context: draft,
  });

  draft.hovered_node_id = target;

  if (
    draft.surface_measurement_targeting === "on" &&
    !draft.surface_measurement_targeting_locked
  ) {
    if (target) draft.surface_measurement_target = [target];
    else {
      // set root as target
      draft.surface_measurement_target = [draft.document.root_id];
    }
  }

  return draft;
}

function getSurfaceRayTarget(
  node_ids_from_point: string[],
  {
    config,
    context,
  }: {
    config: SurfaceRaycastTargeting;
    context: IDocumentEditorState;
  }
): string | undefined {
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
    if (!deepestNode) return undefined;

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

  // If no valid node is found, return undefined
  return undefined;
}
