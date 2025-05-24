import type { Draft } from "immer";
import type grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import { mv } from "@grida/tree";
import assert from "assert";

export function self_moveNode<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  source_id: string,
  target_id: "<root>" | string,
  order?: number
): boolean {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.scenes[draft.scene_id];
  const source_parent_id = editor.dq.getParentId(draft.document_ctx, source_id);
  const source_is_root =
    scene.children.includes(source_id) || source_parent_id === null;

  // do not allow move of the root node with constraints
  if (scene.constraints.children === "single" && source_is_root) {
    return false;
  }

  // make a virtual tree, including the root, treating as a node.
  const itree: Record<string, grida.program.nodes.i.IChildrenReference> = {
    "<root>": scene,
    ...draft.document.nodes,
  };

  // validate target is a container
  const target = itree[target_id];
  if (!("children" in target)) {
    return false;
  }

  // validate target is not a descendant of the node (otherwise it will create a cycle)
  if (
    editor.dq.getAncestors(draft.document_ctx, target_id).includes(source_id)
  ) {
    return false;
  }

  mv(itree, source_id, target_id, order);
  const context = editor.dq.Context.from(draft.document);
  draft.document_ctx = context.snapshot();

  return true;
}
