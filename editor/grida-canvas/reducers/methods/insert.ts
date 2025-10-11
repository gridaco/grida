import type { Draft } from "immer";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import tree from "@grida/tree";
import assert from "assert";

export function self_insertSubDocument<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  parent_id: string | null,
  sub: grida.program.document.IPackedSceneDocument
) {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.scenes[draft.scene_id];

  const sub_state = new dq.DocumentStateQuery(sub);
  const sub_fonts = sub_state.fonts();

  const target = parent_id || "<root>";

  // Validate constraints for root insertion
  if (!parent_id) {
    assert(
      scene.constraints.children !== "single",
      "This scene cannot have multiple children"
    );
  }

  // Temporarily inject virtual root into draft
  draft.document.nodes["<root>"] = scene as any;
  draft.document.links["<root>"] = scene.children_refs;

  // Use Graph.import() - mutates draft.document directly
  const graphInstance = new tree.graph.Graph(draft.document);

  // Import sub-document (handles nodes, links, and attachment atomically)
  graphInstance.import(
    {
      nodes: sub.nodes,
      links: sub.links,
    },
    sub.scene.children_refs,
    target
  );

  // Extract scene children before cleanup
  scene.children_refs = draft.document.links["<root>"] || [];

  // Clean up virtual root
  delete draft.document.nodes["<root>"];
  delete draft.document.links["<root>"];

  // Update font registry
  draft.fontfaces = Array.from(
    new Set([...draft.fontfaces.map((g) => g.family), ...sub_fonts])
  ).map((family) => ({
    family,
    // FIXME: support italic flag
    italic: false,
  }));

  // Rebuild context (single rebuild, no manual merging needed)
  draft.document_ctx = dq.Context.from(draft.document).snapshot();

  return sub.scene.children_refs;
}

export function self_try_insert_node<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  parent_id: string | null,
  node: grida.program.nodes.Node // TODO: NodePrototype
): string {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.scenes[draft.scene_id];

  const node_id = node.id;
  const target = parent_id || "<root>";

  // Validate constraints for root insertion
  if (!parent_id) {
    assert(
      scene.constraints.children !== "single",
      "This scene cannot have multiple children"
    );
  }

  // Temporarily inject virtual root into draft
  draft.document.nodes["<root>"] = scene as any;
  draft.document.links["<root>"] = scene.children_refs;

  // Use Graph.import() - mutates draft.document directly
  const graphInstance = new tree.graph.Graph(draft.document);

  // Import single node (mutates draft.document directly)
  graphInstance.import(
    {
      nodes: { [node_id]: node },
      links: { [node_id]: undefined },
    },
    [node_id],
    target
  );

  // Extract scene children before cleanup
  scene.children_refs = draft.document.links["<root>"] || [];

  // Clean up virtual root
  delete draft.document.nodes["<root>"];
  delete draft.document.links["<root>"];

  // Update the document's font registry
  const s = new dq.DocumentStateQuery(draft.document);
  draft.fontfaces = s.fonts().map((family) => ({
    family,
    // FIXME: support italic flag
    italic: false,
  }));

  // Rebuild context (single rebuild)
  draft.document_ctx = dq.Context.from(draft.document).snapshot();

  return node_id;
}
