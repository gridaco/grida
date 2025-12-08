import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";
import tree from "@grida/tree";

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

/**
 * Find nearest node by pure graph distance only (no tie-breaking).
 * Editor-specific implementation for measurement mode.
 *
 * This function works bidirectionally - it finds the shortest path from selection
 * to ANY candidate, regardless of parent/child relationship (parent->child, child->parent,
 * siblings, cousins, etc.).
 *
 * When multiple candidates have the same distance, prefers the deepest one (the one
 * actually being hovered at the mouse position).
 */
function findNearestByPureGraphDistance(
  context: editor.state.IEditorState,
  candidates: string[],
  selection: string[]
): string | null {
  if (candidates.length === 0 || selection.length === 0) {
    return null;
  }

  // Calculate distance from each candidate to each selected node
  const candidateDistances = candidates.map((candidate) => {
    const distances = selection.map((selected) =>
      tree.distance.getGraphDistance(context.document_ctx, candidate, selected)
    );
    const minDistance = Math.min(...distances);
    const depth = dq.getDepth(context.document_ctx, candidate);
    return { nodeId: candidate, distance: minDistance, depth };
  });

  // Find minimum distance
  const minDist = Math.min(...candidateDistances.map((c) => c.distance));

  // Find all candidates with minimum distance
  const nearestCandidates = candidateDistances.filter(
    (c) => c.distance === minDist
  );

  // When distances are equal, prefer the deepest one (the one actually being hovered)
  // Sort by depth descending (deepest first)
  nearestCandidates.sort((a, b) => b.depth - a.depth);

  return nearestCandidates[0]?.nodeId ?? null;
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
  nested_first: boolean = false,
  isMeasurementMode: boolean = false
): string | null {
  const {
    selection,
    document: { nodes },
  } = context;

  // Filter the nodes based on the configuration
  const filtered = hits
    .filter((node_id) => {
      const node = nodes[node_id];

      // Check if node exists first (before accessing node properties)
      // This can happen since the hover is triggered from the event target,
      // where the new document state is not applied yet
      if (!node) {
        return false; // Ignore nodes that don't exist
      }

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
    case "auto": {
      // Use graph distance when selection is not empty
      if (selection.length > 0) {
        // Special case: when nested_first is true, we're looking for descendants only (double-click "go deeper")
        // Filter to only descendants of the selected node(s), then find the nearest by graph distance
        if (nested_first) {
          const descendants = filtered.filter((candidate) => {
            // Exclude the selected node itself (we want to go deeper, not stay at same level)
            if (selection.includes(candidate)) {
              return false;
            }
            // Check if candidate is a descendant of any selected node
            return selection.some((selected) => {
              const ancestors = dq.getAncestors(
                context.document_ctx,
                candidate
              );
              return ancestors.includes(selected);
            });
          });

          // If we have descendants, find the nearest one by graph distance (not deepest)
          if (descendants.length > 0) {
            const nearest = tree.distance.findNearestByGraphDistance(
              context.document_ctx,
              descendants,
              selection,
              { preferChildren: false } // Don't use preferChildren here since we already filtered to descendants
            );
            if (nearest !== null) {
              return nearest;
            }
          }
          // If no descendants found, fall through to graph distance logic
        }

        // Use pure shortest path for measurement mode (no tie-breaking, works bidirectionally)
        if (isMeasurementMode) {
          // In measurement mode, exclude selected nodes from candidates (we want to measure TO a different node)
          const measurementCandidates = filtered.filter(
            (candidate) => !selection.includes(candidate)
          );
          // If no candidates after filtering, return null
          if (measurementCandidates.length === 0) {
            return null;
          }
          // Find nearest by pure graph distance
          const nearest = findNearestByPureGraphDistance(
            context,
            measurementCandidates,
            selection
          );
          // If found, return it
          if (nearest !== null) {
            return nearest;
          }
          // Fallback: if no result, return null (shouldn't happen, but safety check)
          return null;
        }

        // Normal mode: use graph distance with tie-breaking
        const nearest = tree.distance.findNearestByGraphDistance(
          context.document_ctx,
          filtered,
          selection,
          { preferChildren: nested_first }
        );
        // If graph distance found a result, return it
        // Otherwise fallback to depth-based (shouldn't happen, but safety check)
        if (nearest !== null) {
          return nearest;
        }
      }

      // Fallback to depth-based selection when selection is empty or graph distance failed
      // This maintains backward compatibility
      return filtered[0]; // shallowest node
    }
    case "deepest": {
      // Filter out scene nodes - scenes should not be selectable as deepest
      const nonSceneNodes = filtered.filter((node_id) => {
        const node = nodes[node_id];
        return node?.type !== "scene";
      });

      // If all nodes are scenes, return null
      if (nonSceneNodes.length === 0) {
        return null;
      }

      // Find the deepest node among non-scene nodes
      // The filtered array is already sorted by depth (shallowest first),
      // so reverse to get deepest first
      const deepest = nonSceneNodes.reverse()[0];

      // Special case: If meta key is pressed and we're hovering a root container
      // (container node directly under scene), ensure it's selectable
      if (deepest) {
        const parent_id = dq.getParentId(context.document_ctx, deepest);
        const node = nodes[deepest];
        const isRootContainer =
          (parent_id === null || parent_id === context.scene_id) &&
          node?.type === "container";

        // Root containers are already included in nonSceneNodes, so just return deepest
        // This ensures root containers can be selected when meta key is pressed
        return deepest;
      }

      return null;
    }
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
