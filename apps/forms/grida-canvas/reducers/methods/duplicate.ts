import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import { document } from "../../document-query";
import { self_insertNode } from "./insert";
import { self_selectNode } from "./selection";
import assert from "assert";
import nid from "../tools/id";

export function self_duplicateNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  ...node_ids: string[]
) {
  const new_ids = [];
  for (const node_id of node_ids) {
    if (node_id === draft.document.root_id) continue;

    const node = document.__getNodeById(draft, node_id);

    // serialize the node
    const serialized = JSON.stringify(node);
    const deserialized = JSON.parse(serialized);

    // update the id
    const new_id = nid();
    deserialized.id = new_id;

    const parent_id = document.getParentId(draft.document_ctx, node_id);
    assert(parent_id, `Parent node not found`);

    // insert the node
    self_insertNode(draft, parent_id, deserialized);

    new_ids.push(new_id);
  }

  // after
  self_selectNode(draft, "reset", ...new_ids);
}
