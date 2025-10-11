import type { Draft } from "immer";
import type grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import { self_select_cursor_tool } from "./tool";
import tree from "@grida/tree";
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
    scene.constraints.children === "single" &&
    scene.children_refs.includes(node_id);
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

  // Temporarily inject virtual root into draft
  draft.document.nodes["<root>"] = scene as any;
  draft.document.links["<root>"] = scene.children_refs;

  // Use tree.graph.Graph - mutates draft.document directly
  const graphInstance = new tree.graph.Graph(draft.document);

  // Remove node and its subtree (mutates draft.document directly)
  const ids = graphInstance.rm(node_id);

  // Extract scene children before cleanup
  scene.children_refs = draft.document.links["<root>"] || [];

  // Clean up virtual root
  delete draft.document.nodes["<root>"];
  delete draft.document.links["<root>"];

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
