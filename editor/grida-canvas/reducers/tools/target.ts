import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";

/**
 * Determines if a node type should be treated as selectable even when it's a root node with children.
 * Container nodes are treated as containers (non-selectable when root with children).
 * Group and boolean nodes are treated as selectable nodes (selectable even when root with children).
 */
function is_selectable_root_with_children(
  node_type: grida.program.nodes.NodeType
): boolean {
  switch (node_type) {
    case "container":
      return false; // Container nodes are not selectable when root with children
    case "group":
    case "boolean":
      return true; // Group and boolean nodes are selectable even when root with children
    default:
      return false; // Other node types are not selectable when root with children
  }
}

export function getRayTarget(
  hits: string[],
  {
    config,
    context,
  }: {
    config: editor.state.HitTestingConfig;
    context: editor.state.IEditorState;
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
      const top_id = context.scene_id
        ? dq.getTopIdWithinScene(
            context.document_ctx,
            node_id,
            context.scene_id
          )
        : dq.getRootId(context.document_ctx, node_id);
      const maybeichildren = context.document.links[node_id];

      // Check if this is a root node with children that should be ignored
      if (
        maybeichildren &&
        maybeichildren.length > 0 &&
        config.ignores_root_with_children &&
        node_id === top_id &&
        !is_selectable_root_with_children(node.type)
      ) {
        return false; // Ignore the root node if configured and not selectable
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
        dq.getDepth(context.document_ctx, a) -
        dq.getDepth(context.document_ctx, b)
      );
    });

  switch (config.target) {
    // TODO: can use for loop for optimization
    // TODO: this should also take relative depth into account (also moving up)
    // BASED ON GRAPH-DISTANCE
    case "auto": {
      const selection_sibling_ids = new Set(
        selection
          .map((node_id) => dq.getSiblings(context.document_ctx, node_id))
          .flat()
      );

      const priority = (node_id: string) => {
        if (selection.includes(node_id)) {
          return -2;
        }

        if (selection_sibling_ids.has(node_id)) {
          return -1;
        }

        const a_parent = dq.getParentId(context.document_ctx, node_id);
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
  state: editor.state.IEditorState,
  hits: string[]
): string[] {
  const { document_ctx } = state;

  // [marquee selection target]
  // 1. shall not be a root node
  // 2. shall not be a locked node
  // 3. the parent of this node shall also be hit by the marquee (unless it's the root node)
  const target_node_ids = hits.filter((hit_id) => {
    const root_id = state.scene_id
      ? dq.getTopIdWithinScene(document_ctx, hit_id, state.scene_id)
      : dq.getRootId(document_ctx, hit_id);
    const hit = dq.__getNodeById(state, hit_id);

    // (1) shall not be a root node (if configured)
    const maybeichildren = state.document.links[hit_id];
    if (
      maybeichildren &&
      maybeichildren.length > 0 &&
      state.pointer_hit_testing_config.ignores_root_with_children &&
      hit_id === root_id &&
      !is_selectable_root_with_children(hit.type)
    )
      return false;

    // (2) shall not be a locked node

    if (!hit) return false;
    if (hit.locked) return false;

    // (3). the parent of this node shall also be hit by the marquee (unless it's the root node)
    const parent_id = dq.getParentId(document_ctx, hit_id);

    // Direct child of scene (root level) - always include
    if (parent_id === null || parent_id === state.scene_id) {
      return true;
    }

    // Nested node - parent must also be hit
    if (!hits.includes(parent_id)) {
      return false;
    }

    // Check if parent is locked
    const parent = dq.__getNodeById(state, parent_id);
    if (!parent || parent.locked) {
      return false;
    }

    return true;
  });

  return target_node_ids;
}
