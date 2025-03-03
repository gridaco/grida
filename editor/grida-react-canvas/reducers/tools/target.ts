import type {
  IDocumentEditorState,
  SurfaceRaycastTargeting,
} from "@/grida-react-canvas/state";
import { document } from "../../document-query";

export function getRayTarget(
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
    document: { nodes },
  } = context;

  // Filter the nodes based on the configuration
  const filtered = hits
    .filter((node_id) => {
      const node = nodes[node_id];
      const top_id = document.getTopId(context.document_ctx, node_id);
      const maybeichildren = ichildren(node);
      if (
        maybeichildren &&
        maybeichildren.length > 0 &&
        config.ignores_root_with_children &&
        node_id === top_id
      ) {
        return false; // Ignore the root node if configured
      }

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
    // TODO: can use for loop for optimization
    // TODO: this should also take relative depth into account (also moving up)
    // BASED ON GRAPH-DISTANCE
    case "auto": {
      const selection_sibling_ids = new Set(
        selection
          .map((node_id) => document.getSiblings(context.document_ctx, node_id))
          .flat()
      );

      const priority = (node_id: string) => {
        if (selection.includes(node_id)) {
          return -2;
        }

        if (selection_sibling_ids.has(node_id)) {
          return -1;
        }

        const a_parent = document.getParentId(context.document_ctx, node_id);
        if (a_parent && selection.includes(a_parent)) {
          return nested_first ? -3 : 0;
        }

        return 0;
      };

      filtered.sort((a, b) => {
        return priority(a) - priority(b);
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
  const { document_ctx } = state;

  // [marquee selection target]
  // 1. shall not be a root node
  // 2. shall not be a locked node
  // 3. the parent of this node shall also be hit by the marquee (unless it's the root node)
  const target_node_ids = hits.filter((hit_id) => {
    const root_id = document.getTopId(document_ctx, hit_id)!;
    const hit = document.__getNodeById(state, hit_id);

    // (1) shall not be a root node (if configured)
    const maybeichildren = ichildren(hit);
    if (
      maybeichildren &&
      maybeichildren.length > 0 &&
      state.surface_raycast_targeting.ignores_root_with_children &&
      hit_id === root_id
    )
      return false;

    // (2) shall not be a locked node

    if (!hit) return false;
    if (hit.locked) return false;

    // (3). the parent of this node shall also be hit by the marquee (unless it's the root node)
    const parent_id = document.getParentId(document_ctx, hit_id)!;

    // root node
    if (parent_id === null) {
      return true;
    } else {
      if (parent_id === root_id) return true;
      if (!hits.includes(parent_id)) return false;
    }

    const parent = document.__getNodeById(state, parent_id!);
    if (!parent) return false;
    if (parent.locked) return false;

    return true;
  });

  return target_node_ids;
}

function ichildren(node: any): Array<any> | undefined {
  if (!node) return undefined;
  if ("children" in node && Array.isArray(node.children)) {
    return node.children;
  }
  return undefined;
}
