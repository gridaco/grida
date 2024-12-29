import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import { document } from "../../document-query";
import { self_insertNode } from "./insert";
import { self_selectNode } from "./selection";
import assert from "assert";
import nid from "../tools/id";
import { grida } from "@/grida";

// TODO: recursively clone.
export function self_duplicateNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  ...node_ids: string[]
) {
  const new_ids = [];
  for (const node_id of node_ids) {
    if (node_id === draft.document.root_id) continue;

    const node = document.__getNodeById(draft, node_id);

    // serialize the node
    const data: grida.program.nodes.NodePrototype = JSON.parse(
      JSON.stringify(node)
    );

    // assign new id
    const new_id = nid();
    const newnode = grida.program.nodes.factory.createNodeDataFromPrototype(
      new_id,
      data
    );

    const parent_id = document.getParentId(draft.document_ctx, node_id);
    assert(parent_id, `Parent node not found`);

    // insert the node
    self_insertNode(draft, parent_id, newnode);

    new_ids.push(new_id);
  }

  // after
  self_selectNode(draft, "reset", ...new_ids);
}
