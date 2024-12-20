import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import { document } from "../../document-query";
import { grida } from "@/grida";
import assert from "assert";

export function self_insertNode<S extends IDocumentEditorState>(
  draft: Draft<S>,
  parent_id: string,
  node: grida.program.nodes.Node // TODO: NodePrototype
): string {
  const node_id = node.id;

  // Ensure the parent exists in the document
  const parent_node = draft.document.nodes[parent_id];
  assert(parent_node, `Parent node not found with id: "${parent_id}"`);

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
