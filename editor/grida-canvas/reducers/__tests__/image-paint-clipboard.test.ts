import documentReducer from "../document.reducer";

jest.mock("@grida/vn", () => {
  class VectorNetworkEditor {
    constructor(_net: any) {}
  }
  return {
    __esModule: true,
    default: { VectorNetworkEditor },
    VectorNetworkEditor,
  };
});

jest.mock("../surface.reducer", () => ({
  __esModule: true,
  default: jest.fn(),
}));

function createImagePaint(overrides: Record<string, any> = {}) {
  return {
    type: "image",
    visible: true,
    opacity: 1,
    scaleMode: "fill",
    transform: [1, 0, 0, 1, 0, 0],
    imageRef: { type: "project_asset", id: "asset-1" },
    ...overrides,
  };
}

function createDocument(nodes: Record<string, any>) {
  return {
    nodes,
    scenes: {
      scene: {
        id: "scene",
        name: "Scene",
        constraints: { children: "many" },
        children: Object.keys(nodes),
      },
    },
    entry_scene_id: "scene",
  };
}

describe("document reducer - image paint clipboard", () => {
  test("copying in paint mode captures paint payload", () => {
    const paint = createImagePaint({ transform: [0.5, 0, 0, 0.5, 10, 20] });
    const nodeId = "rect1";
    const state = {
      editable: true,
      document_key: "doc-1",
      document: createDocument({
        [nodeId]: {
          id: nodeId,
          type: "rectangle",
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          fills: [paint],
          fill: paint,
        },
      }),
      document_ctx: {},
      scene_id: "scene",
      selection: [nodeId],
      hovered_node_id: null,
      gesture: { type: "idle" },
      tool: { type: "cursor" },
      content_edit_mode: {
        type: "paint/image",
        node_id: nodeId,
        paint_target: "fill",
        paint_index: 0,
      },
    } as any;

    const next = documentReducer(
      state,
      { type: "copy", target: "selection" } as any,
      {} as any
    );

    expect(next.user_clipboard).toBeDefined();
    expect(next.user_clipboard).toMatchObject({
      type: "property/fill-image-paint",
      document_key: "doc-1",
      node_id: nodeId,
      paint_target: "fill",
      paint_index: 0,
    });
    expect(next.user_clipboard!.type).toBe("property/fill-image-paint");
    if (next.user_clipboard?.type === "property/fill-image-paint") {
      expect(next.user_clipboard.paint).toEqual(paint);
      expect(next.user_clipboard.paint).not.toBe(paint);
    }
  });

  test("pasting applies paint to selected nodes", () => {
    const clipboardPaint = createImagePaint({ transform: [1, 0, 0, 1, 5, 5] });
    const nodeWithPaint = "with-paint";
    const nodeWithoutPaint = "without-paint";

    const state = {
      editable: true,
      document_key: "doc-1",
      user_clipboard: {
        type: "property/fill-image-paint",
        document_key: "doc-1",
        node_id: nodeWithPaint,
        paint_target: "fill",
        paint_index: 0,
        paint: clipboardPaint,
        payload_id: "paint",
      },
      document: createDocument({
        [nodeWithPaint]: {
          id: nodeWithPaint,
          type: "rectangle",
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          fills: [createImagePaint({ transform: [2, 0, 0, 2, 0, 0] })],
          fill: createImagePaint({ transform: [2, 0, 0, 2, 0, 0] }),
        },
        [nodeWithoutPaint]: {
          id: nodeWithoutPaint,
          type: "rectangle",
          left: 120,
          top: 0,
          width: 80,
          height: 80,
          fills: [],
        },
      }),
      document_ctx: {},
      scene_id: "scene",
      selection: [nodeWithPaint, nodeWithoutPaint],
      hovered_node_id: null,
      gesture: { type: "idle" },
      tool: { type: "cursor" },
      content_edit_mode: {
        type: "paint/image",
        node_id: nodeWithPaint,
        paint_target: "fill",
        paint_index: 0,
      },
    } as any;

    const next = documentReducer(state, { type: "paste" } as any, {} as any);

    expect(next.user_clipboard).toEqual(state.user_clipboard);

    const first = next.document.nodes[nodeWithPaint];
    // With the new implementation, we push to the end, so there should be 2 paints
    expect(first.fills).toHaveLength(2);
    expect(first.fills[0]).toEqual(
      createImagePaint({ transform: [2, 0, 0, 2, 0, 0] })
    ); // Original paint
    expect(first.fills[1]).toEqual(clipboardPaint); // New pasted paint
    expect(first.fills[1]).not.toBe(clipboardPaint);
    expect(first.fill).toEqual(first.fills[0]); // fill should still point to the first paint

    const second = next.document.nodes[nodeWithoutPaint];
    expect(Array.isArray(second.fills)).toBe(true);
    expect(second.fills).toHaveLength(1);
    expect(second.fills[0]).toEqual(clipboardPaint);
    expect(second.fills[0]).not.toBe(clipboardPaint);
    expect(second.fill).toEqual(second.fills[0]);
  });

  test("pasting ignores clipboard from another document", () => {
    const nodeId = "rect1";
    const originalPaint = createImagePaint();
    const state = {
      editable: true,
      document_key: "doc-2",
      user_clipboard: {
        type: "property/fill-image-paint",
        document_key: "doc-1",
        node_id: nodeId,
        paint_target: "fill",
        paint_index: 0,
        paint: createImagePaint({ transform: [1, 0, 0, 1, 9, 9] }),
        payload_id: "paint",
      },
      document: createDocument({
        [nodeId]: {
          id: nodeId,
          type: "rectangle",
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          fills: [originalPaint],
          fill: originalPaint,
        },
      }),
      document_ctx: {},
      scene_id: "scene",
      selection: [nodeId],
      hovered_node_id: null,
      gesture: { type: "idle" },
      tool: { type: "cursor" },
      content_edit_mode: {
        type: "paint/image",
        node_id: nodeId,
        paint_target: "fill",
        paint_index: 0,
      },
    } as any;

    const next = documentReducer(state, { type: "paste" } as any, {} as any);

    expect(next.document.nodes[nodeId].fills[0]).toBe(originalPaint);
    expect(next.user_clipboard).toEqual(state.user_clipboard);
  });
});
