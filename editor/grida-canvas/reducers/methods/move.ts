import type { Draft } from "immer";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import tree from "@grida/tree";
import { dq } from "@/grida-canvas/query";
import assert from "assert";
import { EDITOR_GRAPH_POLICY } from "@/grida-canvas/policy";

export function self_moveNode<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  source_id: string,
  target_id: string,
  order?: number
): boolean {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.nodes[
    draft.scene_id
  ] as grida.program.nodes.SceneNode;
  const source_parent_id = dq.getParentId(draft.document_ctx, source_id);
  const source_is_scene_child = source_parent_id === draft.scene_id;

  // do not allow move of the scene's only child with constraints
  if (scene.constraints.children === "single" && source_is_scene_child) {
    return false;
  }

  // validate target is not a descendant of the node (otherwise it will create a cycle)
  if (
    target_id !== draft.scene_id &&
    dq.getAncestors(draft.document_ctx, target_id).includes(source_id)
  ) {
    return false;
  }

  // Use Graph.mv() - mutates draft.document directly (scene is now a node!)
  const graph = new tree.graph.Graph(draft.document, EDITOR_GRAPH_POLICY);
  graph.mv(source_id, target_id, order);

  // Update context from graph's cached LUT
  draft.document_ctx = graph.lut;

  return true;
}
