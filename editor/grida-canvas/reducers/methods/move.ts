import type { Draft } from "immer";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import tree from "@grida/tree";
import { dq } from "@/grida-canvas/query";
import assert from "assert";

export function self_moveNode<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  source_id: string,
  target_id: "<root>" | string,
  order?: number
): boolean {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.scenes[draft.scene_id];
  const source_parent_id = dq.getParentId(draft.document_ctx, source_id);
  const source_is_root =
    scene.children_refs.includes(source_id) || source_parent_id === null;

  // do not allow move of the root node with constraints
  if (scene.constraints.children === "single" && source_is_root) {
    return false;
  }

  // validate target is not a descendant of the node (otherwise it will create a cycle)
  if (
    target_id !== "<root>" &&
    dq.getAncestors(draft.document_ctx, target_id).includes(source_id)
  ) {
    return false;
  }

  // Temporarily inject virtual root into draft
  draft.document.nodes["<root>"] = scene as any;
  draft.document.links["<root>"] = scene.children_refs;

  // Use Graph.mv() - mutates draft.document directly
  const graph = new tree.graph.Graph(draft.document);

  // Move using graph API (mutates draft.document directly)
  graph.mv(source_id, target_id, order);

  // Extract scene children before cleanup
  scene.children_refs = draft.document.links["<root>"] || [];

  // Clean up virtual root
  delete draft.document.nodes["<root>"];
  delete draft.document.links["<root>"];

  // Refresh context
  const context = dq.Context.from(draft.document);
  draft.document_ctx = context.snapshot();

  return true;
}
