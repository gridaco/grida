import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import { document } from "../../document-query";
import { self_insertSubDocument } from "./insert";
import { self_selectNode } from "./selection";
import assert from "assert";
import nid from "../tools/id";
import { grida } from "@/grida";

export function self_duplicateNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  ...node_ids: string[]
) {
  const new_top_ids = [];
  for (const node_id of node_ids) {
    if (node_id === draft.document.root_id) continue;

    // serialize the node
    const prototype = grida.program.nodes.factory.createPrototypeFromSnapshot(
      draft.document,
      node_id
    );

    // create sub document with prototype
    const sub =
      grida.program.nodes.factory.createSubDocumentDefinitionFromPrototype(
        prototype,
        nid
      );

    const parent_id = document.getParentId(draft.document_ctx, node_id);
    assert(parent_id, `Parent node not found`);

    // insert the sub document
    self_insertSubDocument(draft, parent_id, sub);

    new_top_ids.push(sub.root_id);
  }

  // after
  self_selectNode(draft, "reset", ...new_top_ids);
}
