import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";
import tree from "@grida/tree";

/**
 * Gets the top/root node ID for a given node within a scene context.
 * Returns the node_id itself if no top/root can be determined.
 */
function getTopNodeId(
  context: editor.state.IEditorState,
  node_id: string
): string {
  if (context.scene_id) {
    const top_id = dq.getTopIdWithinScene(
      context.document_ctx,
      node_id,
      context.scene_id
    );
    return top_id ?? node_id;
  } else {
    const root_id = dq.getRootId(context.document_ctx, node_id);
    return root_id ?? node_id;
  }
}

/**
 * Checks if a root node with children should be filtered out based on scene constraints.
 * In single mode: root nodes with children are filtered out.
 * In normal mode: root containers are treated normally (no filtering).
 */
function shouldFilterRootNodeWithChildren(
  context: editor.state.IEditorState,
  node_id: string,
  top_id: string,
  children: string[] | undefined
): boolean {
  if (!context.scene_id || !children || children.length === 0) {
    return false;
  }

  if (node_id !== top_id) {
    return false;
  }

  const scene = context.document.nodes[
    context.scene_id
  ] as grida.program.nodes.SceneNode;
  // Only filter in single mode
  return scene.constraints.children === "single";
}

/**
 * Find nearest node by graph distance for measurement mode.
 * Uses the core tree module with sibling preference.
 *
 * This function works bidirectionally - it finds the shortest path from selection
 * to ANY candidate, regardless of parent/child relationship (parent->child, child->parent,
 * siblings, cousins, etc.).
 *
 * For measurement mode, siblings are treated as closer (preferred when distances are equal),
 * as siblings are typically more relevant for measurement purposes.
 */
function findNearestByPureGraphDistance(
  context: editor.state.IEditorState,
  candidates: string[],
  selection: string[]
): string | null {
  // Use weighted graph distance for measurement mode
  // This makes siblings have weight 0.9 (instead of 2, and less than parent's 1),
  // so they're preferred over parents without needing tie-breakers.
  // This is mathematically sound using standard weighted graph distance concepts
  return tree.distance.findNearestByGraphDistance(
    context.document_ctx,
    candidates,
    selection,
    {
      weights: { sibling: 0.9 }, // Treat siblings as distance 0.9 (closer than parent-child 1)
      preferChildren: true,
    }
  );
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

      const top_id = getTopNodeId(context, node_id);
      const maybeichildren = context.document.links[node_id];

      // In single mode: skip hit testing for root nodes with children
      // In normal mode: treat root containers normally (no special filtering)
      if (
        shouldFilterRootNodeWithChildren(
          context,
          node_id,
          top_id,
          maybeichildren
        )
      ) {
        return false; // Ignore the root node in single mode
      }

      if (config.ignores_locked && node.locked) {
        return false; // Ignore locked nodes if configured
      }

      return true; // Include this node
    })
    .sort((a, b) => {
      // Sort by depth (shallowest first) for "auto" mode fallback
      // Rust already orders correctly within same depth (topmost first),
      // so we preserve that order by using original hits index as tie-breaker
      const depthDiff =
        dq.getDepth(context.document_ctx, a) -
        dq.getDepth(context.document_ctx, b);
      return depthDiff !== 0 ? depthDiff : hits.indexOf(a) - hits.indexOf(b);
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
        // Prioritize siblings for better hover UX (siblings are typically more relevant)
        const nearest = tree.distance.findNearestByGraphDistance(
          context.document_ctx,
          filtered,
          selection,
          {
            weights: { sibling: 0.9 }, // Treat siblings as distance 0.9 (closer than parent-child 1)
            preferChildren: nested_first,
          }
        );
        // If graph distance found a result, return it
        // Otherwise fallback to depth-based (shouldn't happen, but safety check)
        if (nearest !== null) {
          return nearest;
        }
      }

      // Fallback to depth-based selection when selection is empty or graph distance failed
      // This maintains backward compatibility
      return filtered[0] ?? null; // shallowest node
    }
    case "deepest": {
      // Filter out scene nodes - scenes should not be selectable as deepest
      const nonSceneNodes = filtered.filter((node_id) => {
        const node = nodes[node_id];
        return node?.type !== "scene";
      });

      if (nonSceneNodes.length === 0) {
        return null;
      }

      // Find max depth in one pass, then return first node at that depth (topmost)
      // Since filtered preserves original hits order for same-depth nodes, first match is topmost
      let maxDepth = -1;
      let deepestNode: string | null = null;
      for (const node_id of nonSceneNodes) {
        const depth = dq.getDepth(context.document_ctx, node_id);
        if (depth > maxDepth) {
          maxDepth = depth;
          deepestNode = node_id;
        }
      }
      return deepestNode;
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
    const root_id = getTopNodeId(state, hit_id);
    const hit = dq.__getNodeById(state, hit_id);

    // (1) In single mode: shall not be a root node with children
    // In normal mode: treat root containers normally (no special filtering)
    const maybeichildren = state.document.links[hit_id];
    if (
      shouldFilterRootNodeWithChildren(state, hit_id, root_id, maybeichildren)
    ) {
      return false;
    }

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
