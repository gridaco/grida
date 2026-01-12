import surfaceReducer from "../surface.reducer";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";

describe("surface reducer - vector self remove", () => {
  test("removes vector node when exiting edit mode with empty network", () => {
    const node_id = "vector1";
    const doc: grida.program.document.Document = {
      scenes_ref: ["scene"],
      links: { scene: [node_id] },
      nodes: {
        scene: {
          type: "scene",
          id: "scene",
          name: "Scene",
          active: true,
          locked: false,
          constraints: { children: "multiple" },
          guides: [],
          edges: [],
          background_color: null,
        },
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
      entry_scene_id: "scene",
      bitmaps: {},
      images: {},
      properties: {},
    };

    const base = editor.state.init({
      editable: true,
      debug: false,
      document: doc,
      templates: {},
    });

    const state = {
      ...base,
      when_not_removable: "deactivate",
      tool: { type: "cursor" },
      gesture: { type: "idle" },
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
