import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import { document } from "../../document-query";
import grida from "@grida/schema";
import assert from "assert";

export function self_insertSubDocument<S extends IDocumentEditorState>(
  draft: Draft<S>,
  parent_id: string | null,
  sub: grida.program.document.IPackedSceneDocument
) {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.scenes[draft.scene_id];

  const sub_state = new document.DocumentState(sub);
  const sub_ctx = document.Context.from(sub);
  const sub_fonts = sub_state.fonts();

  if (parent_id) {
    // Ensure the parent exists in the document
    const parent_node = draft.document.nodes[parent_id];
    assert(parent_node, `Parent node not found with id: "${parent_id}"`);
    assert(
      "children" in parent_node,
      `Parent must be a container node: "${parent_id}"`
    );

    // Add the child to the parent's children array (if not already added)
    const __parent_children_set = new Set(parent_node.children);
    // TODO: doing so will loose the children index info
    sub.scene.children.forEach(
      __parent_children_set.add,
      __parent_children_set
    );
    parent_node.children = Array.from(__parent_children_set);
  } else {
    assert(
      scene.constraints.children !== "single",
      "This scene cannot have multiple children"
    );
    scene.children.push(...sub.scene.children);
  }

  draft.document.nodes = {
    ...draft.document.nodes,
    ...sub.nodes,
  };

  draft.document_ctx.__ctx_nids = [
    ...draft.document_ctx.__ctx_nids,
    ...sub_ctx.__ctx_nids,
  ];

  draft.document_ctx.__ctx_nid_to_children_ids = {
    ...draft.document_ctx.__ctx_nid_to_children_ids,
    ...sub_ctx.__ctx_nid_to_children_ids,
  };

  draft.document_ctx.__ctx_nid_to_parent_id = {
    ...draft.document_ctx.__ctx_nid_to_parent_id,
    ...sub_ctx.__ctx_nid_to_parent_id,
  };

  draft.googlefonts = Array.from(
    new Set([...draft.googlefonts.map((g) => g.family), ...sub_fonts])
  ).map((family) => ({ family }));

  // Update the hierarchy with parent-child relationships
  const context = new document.Context(draft.document_ctx);
  sub.scene.children.forEach((c) => {
    context.blindlymove(c, parent_id);
  });

  // Update the runtime context
  draft.document_ctx = context.snapshot();

  return sub.scene.children;
}

export function self_try_insert_node<S extends IDocumentEditorState>(
  draft: Draft<S>,
  parent_id: string | null,
  node: grida.program.nodes.Node // TODO: NodePrototype
): string {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.scenes[draft.scene_id];

  const node_id = node.id;

  if (parent_id) {
    // Ensure the parent exists in the document
    const parent_node = draft.document.nodes[parent_id];
    assert(parent_node, `Parent node not found with id: "${parent_id}"`);

    // TODO: this part shall be removed and ensured with data strictness
    // Initialize the parent's children array if it doesn't exist
    if (!("children" in parent_node) || !parent_node.children) {
      assert(
        parent_node.type === "container",
        "Parent must be a container node"
      );
      parent_node.children = [];
    }

    // Add the child to the parent's children array (if not already added)
    if (!parent_node.children.includes(node_id)) {
      parent_node.children.push(node_id);
    }

    // Add the node to the document
    draft.document.nodes[node_id] = node;
  } else {
    assert(
      scene.constraints.children !== "single",
      "This scene cannot have multiple children"
    );
    // Add the node to the document
    draft.document.nodes[node_id] = node;
    scene.children.push(node.id);
  }

  // Update the document's font registry
  const s = new document.DocumentState(draft.document);
  draft.googlefonts = s.fonts().map((family) => ({ family }));

  // Update the runtime context with parent-child relationships
  const context = new document.Context(draft.document_ctx);
  context.insert(node_id, parent_id);
  draft.document_ctx = context.snapshot();

  return node_id;
}
