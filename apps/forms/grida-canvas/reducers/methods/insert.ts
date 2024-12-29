import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import { document } from "../../document-query";
import { grida } from "@/grida";
import assert from "assert";

export function self_insertSubDocument<S extends IDocumentEditorState>(
  draft: Draft<S>,
  parent_id: string,
  sub: grida.program.document.IDocumentDefinition
) {
  // Ensure the parent exists in the document
  const parent_node = draft.document.nodes[parent_id];
  assert(parent_node, `Parent node not found with id: "${parent_id}"`);
  assert("children" in parent_node, "Parent must be a container node");

  const sub_state = new document.DocumentState(sub);
  const sub_ctx = document.Context.from(sub);
  const sub_fonts = sub_state.fonts();

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
    new Set([...draft.googlefonts, ...sub_fonts.map((family) => ({ family }))])
  );

  // Update the runtime context with parent-child relationships
  const context = new document.Context(draft.document_ctx);
  context.blindlymove(sub.root_id, parent_id);
  draft.document_ctx = context.snapshot();

  // Add the child to the parent's children array (if not already added)
  if (!parent_node.children!.includes(sub.root_id)) {
    parent_node.children!.push(sub.root_id);
  }

  return sub.root_id;
}

export function self_insertNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  parent_id: string,
  node: grida.program.nodes.Node // TODO: NodePrototype
): string {
  const node_id = node.id;

  // Ensure the parent exists in the document
  const parent_node = draft.document.nodes[parent_id];
  assert(parent_node, `Parent node not found with id: "${parent_id}"`);

  // TODO: this part shall be removed and ensured with data strictness
  // Initialize the parent's children array if it doesn't exist
  if (!("children" in parent_node) || !parent_node.children) {
    assert(parent_node.type === "container", "Parent must be a container node");
    parent_node.children = [];
  }

  // Add the node to the document
  draft.document.nodes[node_id] = node;

  // Update the document's font registry
  const s = new document.DocumentState(draft.document);
  draft.googlefonts = s.fonts().map((family) => ({ family }));

  // Update the runtime context with parent-child relationships
  const context = new document.Context(draft.document_ctx);
  context.insert(node_id, parent_id);
  draft.document_ctx = context.snapshot();

  // Add the child to the parent's children array (if not already added)
  if (!parent_node.children.includes(node_id)) {
    parent_node.children.push(node_id);
  }

  return node_id;
}
