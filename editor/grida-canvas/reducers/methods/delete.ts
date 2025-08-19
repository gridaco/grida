import type { Draft } from "immer";
import type grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import { rm } from "@grida/tree";
import { dq } from "@/grida-canvas/query";
import { self_select_cursor_tool } from "./tool";
import assert from "assert";

/**
 * @returns if the node is handled (removed or deactivated)
 */
export function self_try_remove_node<S extends editor.state.IEditorState>(
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

  // make a virtual tree, including the root, treating as a node.
  // the rm relies on `delete` the nodes should be passed directly (no spread)
  const nodes = draft.document.nodes as Record<
    string,
    grida.program.nodes.i.IChildrenReference
  >;
  nodes["<root>"] = scene;
  const ids = rm(nodes, node_id);
  delete nodes["<root>"];

  // rebuild context
  const context = dq.Context.from(draft.document);
  draft.document_ctx = context.snapshot();

  //
  draft.selection = draft.selection.filter((id) => !ids.includes(id));
  draft.hovered_node_id = draft.hovered_node_id
    ? ids.includes(draft.hovered_node_id)
      ? null
      : draft.hovered_node_id
    : null;

  // clear state (not all state needs to be cleared. this can be safely removed or optimzied after testing)
  draft.content_edit_mode = undefined;
  self_select_cursor_tool(draft);

  return true;
}
