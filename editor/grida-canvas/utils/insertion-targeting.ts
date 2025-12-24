import cmath from "@grida/cmath";
import type { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";

/**
 * Resolves target parent ID from current selection for insert operation.
 *
 * Logic:
 * - If selected node is a container -> use it as parent (insert as child)
 * - If selected node is not a container -> use its parent (insert as sibling)
 * - If no selection -> return null (scene-level)
 *
 * @param state - Current editor state
 * @param selection - Current selection array
 * @returns Target parent node ID or null for scene-level insertion
 */
export function resolveInsertTargetParent(
  state: editor.state.IEditorState,
  selection: string[]
): string | null {
  if (selection.length === 0) return null;

  const node_id = selection[0];
  const node = dq.__getNodeById(state, node_id);

  if (node.type === "container") {
    return node_id;
  }

  return dq.getParentId(state.document_ctx, node_id);
}

/**
 * Resolves target parent IDs from a selection array.
 *
 * Logic:
 * - If selected node is a container -> use it as parent (paste as child)
 * - If selected node is not a container -> use its parent as parent (paste as sibling)
 * - Returns array of target parent IDs (null represents scene-level)
 * - Filters out nodes that are in the copiedIds (can't paste into originals)
 */
export function resolvePasteTargetParents(
  state: editor.state.IEditorState,
  selection: string[],
  copiedIds: string[]
): Array<string | null> {
  return Array.from(
    new Set(
      selection
        .map((node_id) => {
          const node = dq.__getNodeById(state, node_id);

          // If node is a container, use it as target parent (paste as child)
          if (node.type === "container") {
            return node_id;
          }

          // Otherwise, use its parent as target parent (paste as sibling)
          const parent_id = dq.getParentId(state.document_ctx, node_id);

          // Parent can be null (scene) or a container
          if (!parent_id) return null;

          const parent = dq.__getNodeById(state, parent_id);
          // Only return valid container parents
          return parent?.type === "container" ? parent_id : null;
        })
        .filter((target_id) => {
          // Ensure target parent is not one of the originals
          if (target_id && copiedIds.includes(target_id)) return false;
          return true;
        })
    )
  );
}

/**
 * Performs hit-tested nested placement resolution.
 *
 * Starting from the top-most element at the center of `rect`, the function
 * searches down the hit-test stack for a container whose bounding rectangle
 * fully contains `rect`. The first such container found within `maxDepth`
 * levels is returned.
 *
 * @param rect - Rectangle of the element to place (in canvas space).
 * @param geometry - Geometry query interface for hit testing and bounds.
 * @param isContainer - Predicate that returns `true` if a node ID represents a
 *                      container capable of nesting children.
 * @param maxDepth - Optional maximum depth of hit-test results to consider.
 * @returns The ID of the containing node, or `null` if none is found.
 */
export function hitTestNestedInsertionTarget(
  rect: cmath.Rectangle,
  geometry: {
    getNodeIdsFromPoint(point: cmath.Vector2): string[];
    getNodeAbsoluteBoundingRect(id: string): cmath.Rectangle | null;
  },
  isContainer: (id: string) => boolean,
  maxDepth = Infinity
): string | null {
  const center = cmath.rect.getCenter(rect);
  const hits = geometry.getNodeIdsFromPoint(center);
  const depth = Math.min(maxDepth, hits.length);
  for (let i = 0; i < depth; i++) {
    const id = hits[i];
    if (!isContainer(id)) continue;
    const hitRect = geometry.getNodeAbsoluteBoundingRect(id);
    if (hitRect && cmath.rect.contains(hitRect, rect)) {
      return id;
    }
  }
  return null;
}

