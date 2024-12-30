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
  ...__node_ids: string[]
) {
  for (const node_id of __node_ids) {
    assert(node_id, "Node ID must be provided");
    assert(
      document.__getNodeById(draft, node_id),
      `Node not found with id: "${node_id}"`
    );
  }

  switch (mode) {
    case "add": {
      const set = new Set([...draft.selection, ...__node_ids]);
      const pruned = document.pruneNestedNodes(
        draft.document_ctx,
        Array.from(set)
      );
      draft.selection = pruned;
      break;
    }
    case "toggle": {
      const set = new Set(draft.selection);
      for (const node_id of __node_ids) {
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
      const pruned = document.pruneNestedNodes(draft.document_ctx, __node_ids);
      draft.selection = pruned;
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
