import type { Draft } from "immer";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import tree from "@grida/tree";
import assert from "assert";
import { EDITOR_GRAPH_POLICY } from "@/grida-canvas/policy";

export function self_insertSubDocument<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  parent_id: string | null,
  sub: grida.program.document.IPackedSceneDocument
) {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.nodes[
    draft.scene_id
  ] as grida.program.nodes.SceneNode;

  const sub_state = new dq.DocumentStateQuery(sub);
  const sub_fonts = sub_state.fonts();

  const target = parent_id ?? draft.scene_id;

  // Validate constraints for scene-level insertion
  if (!parent_id) {
    assert(
      scene.constraints.children !== "single",
      "This scene cannot have multiple children"
    );
  }

  // Use Graph.import() - mutates draft.document directly (scene is now a node!)
  const graphInstance = new tree.graph.Graph(
    draft.document,
    EDITOR_GRAPH_POLICY
  );

  // Import sub-document (handles nodes, links, and attachment atomically)
  graphInstance.import(
    {
      nodes: sub.nodes,
      links: sub.links,
    },
    sub.scene.children_refs,
    target
  );

  // Update font registry
  draft.fontfaces = Array.from(
    new Set([...draft.fontfaces.map((g) => g.family), ...sub_fonts])
  ).map((family) => ({
    family,
    // FIXME: support italic flag
    italic: false,
  }));

  // Update context from graph's cached LUT
  draft.document_ctx = graphInstance.lut;

  return sub.scene.children_refs;
}

export function self_try_insert_node<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  parent_id: string | null,
  node: grida.program.nodes.Node // TODO: NodePrototype
): string {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.nodes[
    draft.scene_id
  ] as grida.program.nodes.SceneNode;

  const node_id = node.id;
  const target = parent_id ?? draft.scene_id;

  // Validate constraints for scene-level insertion
  if (!parent_id) {
    assert(
      scene.constraints.children !== "single",
      "This scene cannot have multiple children"
    );
  }

  // Use Graph.import() - mutates draft.document directly (scene is now a node!)
  const graphInstance = new tree.graph.Graph(
    draft.document,
    EDITOR_GRAPH_POLICY
  );

  // Import single node (mutates draft.document directly)
  graphInstance.import(
    {
      nodes: { [node_id]: node },
      links: { [node_id]: undefined },
    },
    [node_id],
    target
  );

  // Update the document's font registry
  const s = new dq.DocumentStateQuery(draft.document);
  draft.fontfaces = s.fonts().map((family) => ({
    family,
    // FIXME: support italic flag
    italic: false,
  }));

  // Update context from graph's cached LUT
  draft.document_ctx = graphInstance.lut;

  return node_id;
}
