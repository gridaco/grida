import surfaceReducer from "../surface.reducer";
import type grida from "@grida/schema";

jest.mock("../methods", () => ({
  self_optimizeVectorNetwork: jest.fn(),
  self_try_remove_node: jest.fn((draft: any, id: string) => {
    delete draft.document.nodes[id];
  }),
  self_revert_tool: jest.fn(),
}));

describe("surface reducer - vector self remove", () => {
  test("removes vector node when exiting edit mode with empty network", () => {
    const node_id = "vector1";
    const doc = {
      nodes: {
        [node_id]: {
          id: node_id,
          type: "vector",
          name: "Vector",
          active: true,
          locked: false,
          layout_positioning: "absolute",
          layout_inset_left: 0,
          layout_inset_top: 0,
          layout_target_width: 0,
          layout_target_height: 0,
          opacity: 1,
          rotation: 0,
          z_index: 0,
          vector_network: { vertices: [], segments: [] },
        } satisfies Partial<grida.program.nodes.VectorNode> as any,
      },
      scenes: {
        scene: {
          id: "scene",
          name: "Scene",
          constraints: { children: "many" },
          children: [node_id],
        },
      },
      entry_scene_id: "scene",
    } as any as grida.program.document.Document;

    const state = {
      document: doc,
      document_ctx: {} as any,
      scene_id: "scene",
      selection: [],
      hovered_node_id: null,
      when_not_removable: "deactivate",
      gesture: { type: "idle" },
      tool: { type: "cursor" },
      content_edit_mode: {
        type: "vector",
        node_id,
        initial_vector_network: { vertices: [], segments: [] },
      },
    } as any;

    const next = surfaceReducer(
      state,
      { type: "surface/content-edit-mode/try-exit" } as any,
      {} as any
    );

    expect(next.document.nodes[node_id]).toBeUndefined();
  });
});
