import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import type { grida } from "@/grida";

export function self_deleteNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  node_id: string
) {
  draft.selection = [];
  draft.hovered_node_id = null;
  draft.hovered_point = null;
  const node = draft.document.nodes[node_id];
  const children = "children" in node ? node.children : undefined;
  delete draft.document.nodes[node_id];
  for (const child_id of children || []) {
    delete draft.document.nodes[child_id];
    delete draft.document_ctx.__ctx_nid_to_parent_id[child_id];
    delete draft.document_ctx.__ctx_nid_to_children_ids[child_id];
    const childIndex = draft.document_ctx.__ctx_nids.indexOf(child_id);
    if (childIndex > -1) {
      draft.document_ctx.__ctx_nids.splice(childIndex, 1); // Remove child from nids
    }
  }
  //
  const parent_id = draft.document_ctx.__ctx_nid_to_parent_id[node_id];
  if (parent_id) {
    const index = (
      draft.document.nodes[parent_id] as grida.program.nodes.i.IChildren
    ).children!.indexOf(node_id);
    // only splice array when item is found
    if (index > -1) {
      // remove from parent node's children array
      (
        draft.document.nodes[parent_id] as grida.program.nodes.i.IChildren
      ).children!.splice(index, 1);

      // remove from document context
      const parent_children_ids =
        draft.document_ctx.__ctx_nid_to_children_ids[parent_id];
      parent_children_ids.splice(parent_children_ids.indexOf(node_id), 1);
    }
  }
  delete draft.document_ctx.__ctx_nid_to_parent_id[node_id];
  delete draft.document_ctx.__ctx_nid_to_children_ids[node_id];
  const indexInNids = draft.document_ctx.__ctx_nids.indexOf(node_id);
  if (indexInNids > -1) {
    draft.document_ctx.__ctx_nids.splice(indexInNids, 1); // Remove node_id from nids
  }
}
