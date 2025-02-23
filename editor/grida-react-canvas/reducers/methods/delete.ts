import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import type { grida } from "@/grida";
import { document } from "@/grida-react-canvas/document-query";

export function self_deleteNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  node_id: string
): boolean {
  // // do not allow deletion of the root node
  // if (node_id === draft.document.children) {
  //   return false;
  // }

  // how delete works.
  // 1. retrieve the hierarchy of the node recursively
  // 2. delete (unregister) all ids from the nodes repository
  // 3. remove the top node from the parent's children reference
  // 4. reset the document hierarchy context

  // [1]
  const list = document.hierarchy(node_id, draft.document_ctx);
  const ids = list.map((entry) => entry.id);

  // [2]
  for (const entry of list) {
    // delete from nodes registry
    delete draft.document.nodes[entry.id];

    // delete from top children reference (only applies when it's a top node)
    const i = draft.document.children.indexOf(entry.id);
    if (i >= 0) {
      draft.document.children.splice(i, 1);
    }
  }

  // [3]
  const parent_id = document.getParentId(draft.document_ctx, node_id);
  if (parent_id) {
    const parent = draft.document.nodes[
      parent_id
    ] as grida.program.nodes.i.IChildrenReference;
    parent.children.splice(parent.children.indexOf(node_id), 1);
  }

  // [4]
  const context = document.Context.from(draft.document);
  draft.document_ctx = context.snapshot();

  //
  draft.selection = draft.selection.filter((id) => !ids.includes(id));
  draft.hovered_node_id = draft.hovered_node_id
    ? ids.includes(draft.hovered_node_id)
      ? null
      : draft.hovered_node_id
    : null;

  // clear state (not all state needs to be cleared. this can be safely removed or optimzied after testing)
  draft.hovered_vertex_idx = null;
  draft.content_edit_mode = undefined;
  draft.tool = { type: "cursor" };

  return true;
}
