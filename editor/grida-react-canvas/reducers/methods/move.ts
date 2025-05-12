import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import type grida from "@grida/schema";
import { document } from "@/grida-react-canvas/document-query";
import assert from "assert";

export function self_moveNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  node_id: string,
  target_id: string,
  order?: number
): boolean {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.scenes[draft.scene_id];
  const parent_id = document.getParentId(draft.document_ctx, node_id);

  // do not allow move on the root node
  if (scene.children.includes(node_id) || parent_id === null) {
    return false;
  }

  // validate target is a container
  const target = draft.document.nodes[target_id];
  if (!("children" in target)) {
    return false;
  }

  // validate the current parent is not the target

  if (parent_id === target_id) {
    return false;
  }

  // validate target is not a descendant of the node
  if (document.getAncestors(draft.document_ctx, target_id).includes(node_id)) {
    return false;
  }

  // how move works.
  // 1. unlink the node from the parent
  // 2. link the node to the target
  // 3. reset the document hierarchy context

  // [1]
  const parent = draft.document.nodes[
    parent_id
  ] as grida.program.nodes.i.IChildrenReference;
  parent.children.splice(parent.children.indexOf(node_id), 1);

  // [2]
  const target_node = draft.document.nodes[
    target_id
  ] as grida.program.nodes.i.IChildrenReference;
  const index = order === undefined ? target_node.children.length : order;
  target_node.children.splice(index, 0, node_id);

  // [3]
  const context = document.Context.from(draft.document);
  draft.document_ctx = context.snapshot();

  return true;
}
