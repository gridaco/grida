import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import type grida from "@grida/schema";
import { document } from "@/grida-react-canvas/document-query";
import assert from "assert";

/**
 * @returns if the node is handled (removed or deactivated)
 */
export function self_try_remove_node<S extends IDocumentEditorState>(
  draft: Draft<S>,
  node_id: string
): boolean {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.scenes[draft.scene_id];
  // check if the node is removable
  // do not allow deletion of the root node
  const is_single_child_constraint_root_node =
    scene.constraints.children === "single" && scene.children.includes(node_id);
  const node = draft.document.nodes[node_id];
  const is_removable_from_scene = node.removable !== false;
  if (is_single_child_constraint_root_node || !is_removable_from_scene) {
    switch (draft.when_not_removable) {
      case "deactivate":
        node.active = false;
        return true;
      case "ignore":
        return false;
      case "throw":
        throw new Error("Node is not removable");
      case "force":
        break;
    }
  }

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
    const i = scene.children.indexOf(entry.id);
    if (i >= 0) {
      scene.children.splice(i, 1);
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
