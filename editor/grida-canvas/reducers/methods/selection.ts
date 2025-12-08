import type { Draft } from "immer";
import { editor } from "@/grida-canvas";
import assert from "assert";
import { dq } from "@/grida-canvas/query";

/**
 * Selects nodes within the current scene (scene content).
 *
 * **IMPORTANT**: This function is STRICTLY for selecting scene content nodes only.
 * Scene nodes themselves are NEVER selectable and will be automatically filtered out.
 *
 * Scene nodes are organizational containers and should not be part of the selection
 * state, which is used for:
 * - Transform operations (move, resize, rotate)
 * - Copy/paste operations
 * - Delete operations
 * - Content editing (text, vector, bitmap editing)
 *
 * All of these operations are intended for nodes WITHIN a scene, not the scene container itself.
 *
 * @param draft - The editor state draft
 * @param mode - Selection mode: "reset" (replace), "add" (additive), or "toggle"
 * @param node_ids - Node IDs to select. Scene node IDs will be automatically filtered out.
 *
 * @remarks
 * - Scene nodes are identified by checking if they exist in `draft.document.scenes_ref`
 * - If all provided node_ids are scene nodes, the selection will remain unchanged (for "add"/"toggle") or be cleared (for "reset")
 * - This filtering ensures scenes cannot be accidentally selected via accessibility shortcuts (e.g., CMD+A)
 *
 * @todo
 * - validate the selection by config (which does not exists yet), to only select subset of children or a container, but not both. - when both container and children are selected, when transform, it will transform both, resulting in a weird behavior.
 */
export function self_selectNode<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  mode: "reset" | "add" | "toggle",
  ...node_ids: string[]
) {
  // Filter out scene nodes - scenes should never be selectable
  // Scenes are organizational containers, not selectable content
  const scenes_ref_set = new Set(draft.document.scenes_ref);
  const filtered_node_ids = node_ids.filter(
    (node_id) => !scenes_ref_set.has(node_id)
  );

  for (const node_id of filtered_node_ids) {
    assert(node_id, "Node ID must be provided");
    assert(
      dq.__getNodeById(draft, node_id),
      `Node not found with id: "${node_id}"`
    );
  }

  switch (mode) {
    case "add": {
      const set = new Set([...draft.selection, ...filtered_node_ids]);
      const pruned = dq.pruneNestedNodes(draft.document_ctx, Array.from(set));
      draft.selection = pruned;
      break;
    }
    case "toggle": {
      const set = new Set(draft.selection);
      for (const node_id of filtered_node_ids) {
        if (set.has(node_id)) {
          set.delete(node_id);
        } else {
          set.add(node_id);
        }
      }
      const pruned = dq.pruneNestedNodes(draft.document_ctx, Array.from(set));
      draft.selection = pruned;
      break;
    }
    case "reset": {
      // only apply if actually changed
      if (
        JSON.stringify(filtered_node_ids) !== JSON.stringify(draft.selection)
      ) {
        const pruned = dq.pruneNestedNodes(
          draft.document_ctx,
          filtered_node_ids
        );
        draft.selection = pruned;

        // reset the active duplication as selection changed. see ActiveDuplication's note
        draft.active_duplication = null;
      }
      break;
    }
  }
  return draft;
}

export function self_clearSelection<S extends editor.state.IEditorState>(
  draft: Draft<S>
) {
  if (draft.content_edit_mode) {
    switch (draft.content_edit_mode.type) {
      case "vector": {
        draft.content_edit_mode.selection = {
          selected_vertices: [],
          selected_segments: [],
          selected_tangents: [],
        };
        draft.content_edit_mode.selection_neighbouring_vertices = [];
        draft.content_edit_mode.a_point = null;
        draft.content_edit_mode.next_ta = null;
        break;
      }
    }
  } else {
    draft.selection = [];
  }

  return draft;
}

export type VectorContentSelectionAction =
  | { type: "vertex"; index: number; additive?: boolean }
  | { type: "segment"; index: number; additive?: boolean }
  | { type: "tangent"; index: [number, 0 | 1]; additive?: boolean };

/**
 * Reduces vector content selection state based on selection actions.
 *
 * Handles mixed selection of vertices and segments in VectorContentEditMode.
 * When not additive (normal select), clears existing selection and selects only the target.
 * When additive (shift key), toggles the selection state of the target.
 *
 * @param state - Current selection state with selected_vertices and selected_segments
 * @param action - Selection action specifying type (vertex/segment), index, and additive flag
 * @returns Updated selection state with modified selected_vertices and selected_segments
 */
export function reduceVectorContentSelection(
  state: editor.state.VectorContentEditModeGeometryControlsSelection,
  action: VectorContentSelectionAction
): editor.state.VectorContentEditModeGeometryControlsSelection {
  let { selected_vertices, selected_segments, selected_tangents } = state;
  const additive = action.additive ?? false;

  if (!additive) {
    if (action.type === "vertex") {
      selected_vertices = [action.index];
      selected_segments = [];
      selected_tangents = [];
    } else {
      if (action.type === "segment") {
        selected_vertices = [];
        selected_segments = [action.index];
        selected_tangents = [];
      } else {
        selected_vertices = [];
        selected_segments = [];
        selected_tangents = [action.index];
      }
    }
  } else {
    if (action.type === "vertex") {
      const set = new Set(selected_vertices);
      if (set.has(action.index)) {
        set.delete(action.index);
      } else {
        set.add(action.index);
      }
      selected_vertices = Array.from(set);
    } else if (action.type === "segment") {
      const set = new Set(selected_segments);
      if (set.has(action.index)) {
        set.delete(action.index);
      } else {
        set.add(action.index);
      }
      selected_segments = Array.from(set);
    } else {
      const key = (t: [number, 0 | 1]) => `${t[0]}:${t[1]}`;
      const set = new Set(selected_tangents.map(key));
      const k = key(action.index);
      if (set.has(k)) {
        set.delete(k);
      } else {
        set.add(k);
      }
      selected_tangents = Array.from(set).map((s) => {
        const [v, t] = s.split(":");
        return [parseInt(v), Number(t) as 0 | 1];
      });
    }
  }

  return { selected_vertices, selected_segments, selected_tangents };
}

export function getVectorSelectionStartPoint(
  selection: Omit<
    editor.state.VectorContentEditModeGeometryControlsSelection,
    "selected_segments"
  >
): number | null {
  if (selection.selected_vertices.length === 1) {
    return selection.selected_vertices[0];
  }
  if (selection.selected_tangents.length === 1) {
    return selection.selected_tangents[0][0];
  }
  return null;
}
