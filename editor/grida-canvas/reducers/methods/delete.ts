import type { Draft } from "immer";
import type grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import { self_select_cursor_tool } from "./tool";
import tree from "@grida/tree";
import assert from "assert";
import { EDITOR_GRAPH_POLICY } from "@/grida-canvas/policy";

/**
 * @returns if the node is handled (removed or deactivated)
 */
export function self_try_remove_node<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  node_id: string
): boolean {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.nodes[
    draft.scene_id
  ] as grida.program.nodes.SceneNode;
  // check if the node is removable
  // do not allow deletion of the scene's only child
  const parent_id = dq.getParentId(draft.document_ctx, node_id);
  const is_single_child_constraint_scene_child =
    scene.constraints.children === "single" && parent_id === draft.scene_id;
  const node = draft.document.nodes[node_id];
  const is_removable_from_scene = node.removable !== false;
  if (is_single_child_constraint_scene_child || !is_removable_from_scene) {
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

  // Use tree.graph.Graph - mutates draft.document directly (scene is now a node!)
  const graphInstance = new tree.graph.Graph(
    draft.document,
    EDITOR_GRAPH_POLICY
  );

  // Remove node and its subtree (mutates draft.document directly)
  const ids = graphInstance.rm(node_id);

  // Update context from graph's cached LUT
  draft.document_ctx = graphInstance.lut;

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
