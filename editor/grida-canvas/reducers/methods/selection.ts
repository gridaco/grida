import type { Draft } from "immer";
import { editor } from "@/grida-canvas";
import assert from "assert";
import { dq } from "@/grida-canvas/query";

/**
 * TODO:
 * - validate the selection by config (which does not exists yet), to only select subset of children or a container, but not both. - when both container and children are selected, when transform, it will transform both, resulting in a weird behavior.
 */
export function self_selectNode<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  mode: "reset" | "add" | "toggle",
  ...node_ids: string[]
) {
  for (const node_id of node_ids) {
    assert(node_id, "Node ID must be provided");
    assert(
      dq.__getNodeById(draft, node_id),
      `Node not found with id: "${node_id}"`
    );
  }

  switch (mode) {
    case "add": {
      const set = new Set([...draft.selection, ...node_ids]);
      const pruned = dq.pruneNestedNodes(draft.document_ctx, Array.from(set));
      draft.selection = pruned;
      break;
    }
    case "toggle": {
      const set = new Set(draft.selection);
      for (const node_id of node_ids) {
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
      if (JSON.stringify(node_ids) !== JSON.stringify(draft.selection)) {
        const pruned = dq.pruneNestedNodes(draft.document_ctx, node_ids);
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
  draft.selection = [];
  return draft;
}

export type VectorContentSelectionState = Pick<
  editor.state.VectorContentEditMode,
  "selected_vertices" | "selected_segments" | "selected_tangents"
>;

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
  state: VectorContentSelectionState,
  action: VectorContentSelectionAction
): VectorContentSelectionState {
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
