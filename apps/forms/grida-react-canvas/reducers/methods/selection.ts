import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import { document } from "../../document-query";
import assert from "assert";

/**
 * TODO:
 * - validate the selection by config (which does not exists yet), to only select subset of children or a container, but not both. - when both container and children are selected, when transform, it will transform both, resulting in a weird behavior.
 */
export function self_selectNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  mode: "reset" | "add" | "toggle",
  ...node_ids: string[]
) {
  for (const node_id of node_ids) {
    assert(node_id, "Node ID must be provided");
    assert(
      document.__getNodeById(draft, node_id),
      `Node not found with id: "${node_id}"`
    );
  }

  switch (mode) {
    case "add": {
      const set = new Set([...draft.selection, ...node_ids]);
      const pruned = document.pruneNestedNodes(
        draft.document_ctx,
        Array.from(set)
      );
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
      const pruned = document.pruneNestedNodes(
        draft.document_ctx,
        Array.from(set)
      );
      draft.selection = pruned;
      break;
    }
    case "reset": {
      // only apply if actually changed
      if (JSON.stringify(node_ids) !== JSON.stringify(draft.selection)) {
        const pruned = document.pruneNestedNodes(draft.document_ctx, node_ids);
        draft.selection = pruned;

        // reset the active duplication as selection changed. see ActiveDuplication's note
        draft.active_duplication = null;
      }
      break;
    }
  }
  return draft;
}

export function self_clearSelection<S extends IDocumentEditorState>(
  draft: Draft<S>
) {
  draft.selection = [];
  return draft;
}
