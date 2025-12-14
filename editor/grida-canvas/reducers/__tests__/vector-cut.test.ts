import documentReducer from "../document.reducer";

jest.mock("../surface.reducer", () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe("document reducer - vector cut", () => {
  test("cuts selected vector network", () => {
    const node_id = "vector1";
    const vectorNode = {
      id: node_id,
      type: "vector",
      name: "Vector",
      active: true,
      locked: false,
      position: "absolute",
      left: 0,
      top: 0,
      width: 10,
      height: 0,
      opacity: 1,
      rotation: 0,
      z_index: 0,
      vector_network: {
        vertices: [
          [0, 0],
          [10, 0],
        ],
        segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
      },
    } as any;

    const doc = {
      nodes: { [node_id]: vectorNode },
      scenes: {
        scene: {
          id: "scene",
          name: "Scene",
          constraints: { children: "many" },
          children: [node_id],
        },
      },
      entry_scene_id: "scene",
    } as any;

    const state = {
      editable: true,
      document: doc,
      document_ctx: {},
      scene_id: "scene",
      selection: [node_id],
      hovered_node_id: null,
      gesture: { type: "idle" },
      tool: { type: "cursor" },
      content_edit_mode: {
        type: "vector",
        node_id,
        selection: {
          selected_vertices: [0, 1],
          selected_segments: [0],
          selected_tangents: [],
        },
      },
    } as any;

    const next = documentReducer(
      state,
      { type: "cut", target: "selection" } as any,
      {} as any
    );

    const mode = next.content_edit_mode as any;
    expect(mode.clipboard).toEqual({
      vertices: [
        [0, 0],
        [10, 0],
      ],
      segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
    });
    expect(next.document.nodes[node_id].vector_network).toEqual({
      vertices: [],
      segments: [],
    });
    expect(mode.selection).toEqual({
      selected_vertices: [],
      selected_segments: [],
      selected_tangents: [],
    });
  });
});
