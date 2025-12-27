/**
 * Deferred selection decision logic.
 *
 * This module contains pure functions that determine what selection operations
 * should be performed (immediate vs deferred) based on the current state.
 *
 * This module is the single source of truth for all UX logic from:
 * @see docs/wg/feat-editor/ux-surface/selection.md
 *
 * All decision logic from the documentation is implemented here and can be
 * tested independently without DOM events or user interaction.
 */

import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";

export interface PointerDownContext {
  hovered_node_id: string | null;
  shiftKey: boolean;
  current_selection: string[];
  document_ctx: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext;
  /**
   * Whether empty space is within selection overlay bounds.
   *
   * @todo In the future, this should be computed within the module itself using:
   * - Selection geometry rects (from geometry provider)
   * - Pointer event canvas space position
   * This will make the module more self-contained and testable.
   *
   * For now, this is passed as a parameter from the reducer/caller.
   */
  is_empty_space_within_overlay?: boolean;
}

export interface ClickContext {
  clicked_node_id: string | null;
  deferred_selection?: {
    node_id: string | "__clear_selection__";
    operation: "reset" | "toggle";
  };
}

export type SelectionOperation =
  | { type: "immediate"; mode: "reset" | "toggle" | "add"; node_id: string }
  | { type: "immediate"; mode: "clear" }
  | {
      type: "deferred";
      operation: "reset" | "toggle";
      node_id: string | "__clear_selection__";
    }
  | { type: "none" };

export interface DragStartContext {
  hovered_node_id: string | null;
  shiftKey: boolean;
  current_selection: string[];
  /**
   * Whether empty space is within selection overlay bounds.
   *
   * @todo In the future, this should be computed within the module itself using:
   * - Selection geometry rects (from geometry provider)
   * - Pointer event canvas space position
   * This will make the module more self-contained and testable.
   *
   * For now, this is passed as a parameter from the reducer/caller.
   */
  is_empty_space_within_overlay?: boolean;
}

export type DragStartAction = "drag" | "marquee";

/**
 * Checks if a node is a child of any selected node.
 *
 * @param node_id - Node to check
 * @param selection - Currently selected node IDs
 * @param document_ctx - Document hierarchy context
 * @returns true if node is a descendant of any selected node
 */
function isChildOfSelectedNodes(
  node_id: string,
  selection: string[],
  document_ctx: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext
): boolean {
  const ancestors = dq.getAncestors(document_ctx, node_id);
  return selection.some((selected_id) => ancestors.includes(selected_id));
}

/**
 * Determines what selection operation should be performed on pointerdown.
 *
 * Implements ALL cases from docs/wg/feat-editor/ux-surface/selection.md:
 *
 * Immediate (on pointerdown):
 * - Unselected node (no Shift) → select that node
 * - Unselected node (with Shift) → add to selection
 * - Empty space outside selection overlay (no Shift) → clear selection
 *
 * Deferred (on click):
 * - Selected node (no Shift) → defer reset to that node
 * - Selected node (with Shift) → defer toggle (deselect)
 * - Child of selected node(s) → defer reset to that child
 * - Empty space within selection overlay (no Shift) → defer clear selection
 *
 * @param context - Pointer down context
 * @returns Decision: immediate operation, deferred operation, or none
 */
export function decidePointerDownSelection(
  context: PointerDownContext
): SelectionOperation {
  const {
    hovered_node_id,
    shiftKey,
    current_selection,
    document_ctx,
    is_empty_space_within_overlay,
  } = context;

  if (hovered_node_id) {
    // There is a hovered node
    const is_directly_selected = current_selection.includes(hovered_node_id);
    const is_child_of_selected =
      !is_directly_selected &&
      isChildOfSelectedNodes(hovered_node_id, current_selection, document_ctx);

    if (is_directly_selected) {
      // Selected node → defer operation
      const operation = shiftKey ? "toggle" : "reset";
      return { type: "deferred", operation, node_id: hovered_node_id };
    } else if (is_child_of_selected) {
      // Child of selected node(s) → defer reset to that child
      return { type: "deferred", operation: "reset", node_id: hovered_node_id };
    } else {
      // Unselected node → apply immediately
      // Per docs: Shift + unselected node → add to selection (not toggle).
      const mode = shiftKey ? "add" : "reset";
      return { type: "immediate", mode, node_id: hovered_node_id };
    }
  } else {
    // No hovered node (empty space)
    if (shiftKey) {
      // do nothing (when shift key is pressed on empty space)
      return { type: "none" };
    } else {
      // Empty space
      if (is_empty_space_within_overlay === true) {
        // Empty space within selection overlay → defer clear selection
        return {
          type: "deferred",
          operation: "reset",
          node_id: "__clear_selection__",
        };
      } else {
        // Empty space outside selection overlay → clear immediately
        return { type: "immediate", mode: "clear" };
      }
    }
  }
}

/**
 * Determines what selection operation should be performed on click.
 *
 * Applies deferred operations that were stored on pointerdown.
 *
 * @param context - Click context
 * @returns Decision: operation to apply, or none
 */
export function decideClickSelection(
  context: ClickContext
): SelectionOperation {
  const { clicked_node_id, deferred_selection } = context;

  if (!deferred_selection) {
    return { type: "none" };
  }

  // Handle deferred clear selection
  if (deferred_selection.node_id === "__clear_selection__") {
    return { type: "immediate", mode: "clear" };
  }

  // Only apply if clicked node matches deferred node
  if (clicked_node_id === deferred_selection.node_id) {
    const mode = deferred_selection.operation === "toggle" ? "toggle" : "reset";
    return { type: "immediate", mode, node_id: clicked_node_id };
  }

  return { type: "none" };
}

/**
 * Determines what drag action should be performed on dragstart.
 *
 * Implements drag vs marquee decision logic from docs/wg/feat-editor/ux-surface/selection.md:
 *
 * Drag (translate selection):
 * - Has hovered node (selected or unselected) → drag
 * - Has selection AND empty space within overlay → drag (even with Shift)
 * - Has selection AND empty space outside overlay (no Shift) → drag
 *
 * Marquee (area selection):
 * - No selection AND empty space → marquee
 * - Has selection AND empty space outside overlay (with Shift) → marquee
 * - Empty space within overlay (with Shift) when no selection → marquee
 *
 * @param context - Drag start context
 * @returns Decision: "drag" to translate selection, or "marquee" to start area selection
 */
export function decideDragStartAction(
  context: DragStartContext
): DragStartAction {
  const {
    hovered_node_id,
    shiftKey,
    current_selection,
    is_empty_space_within_overlay,
  } = context;

  // If there's a hovered node, always drag (can drag selected or unselected nodes)
  if (hovered_node_id) {
    return "drag";
  }

  // No hovered node (empty space)
  if (current_selection.length === 0) {
    // No selection → marquee
    return "marquee";
  }

  // Has selection and empty space
  if (is_empty_space_within_overlay === true) {
    // Empty space within overlay → drag (even with Shift, per docs)
    // Shift key enables axis lock for dragging, not marquee
    return "drag";
  }

  // Empty space outside overlay
  if (shiftKey) {
    // Shift + empty space outside overlay → marquee (additive selection)
    return "marquee";
  } else {
    // No Shift + empty space outside overlay → drag (to move selection)
    return "drag";
  }
}
