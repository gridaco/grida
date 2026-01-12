import documentReducer from "../document.reducer";
import grida from "@grida/schema";

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

function createDocument(
  nodes: Record<string, any>
): grida.program.document.Document {
  const scene_children = Object.keys(nodes);
  return {
    scenes_ref: ["scene"],
    links: {
      scene: scene_children,
    },
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
      },
      ...nodes,
    },
    entry_scene_id: "scene",
    bitmaps: {},
    images: {},
    properties: {},
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
          fill_paints: [paint],
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
          fill_paints: [createImagePaint({ transform: [2, 0, 0, 2, 0, 0] })],
          fill: createImagePaint({ transform: [2, 0, 0, 2, 0, 0] }),
        },
        [nodeWithoutPaint]: {
          id: nodeWithoutPaint,
          type: "rectangle",
          left: 120,
          top: 0,
          width: 80,
          height: 80,
          fill_paints: [],
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
    expect(first.fill_paints).toHaveLength(2);
    expect(first.fill_paints[0]).toEqual(
      createImagePaint({ transform: [2, 0, 0, 2, 0, 0] })
    ); // Original paint
    expect(first.fill_paints[1]).toEqual(clipboardPaint); // New pasted paint
    expect(first.fill_paints[1]).not.toBe(clipboardPaint);
    expect(first.fill).toEqual(first.fill_paints[0]); // fill should still point to the first paint

    const second = next.document.nodes[nodeWithoutPaint];
    expect(Array.isArray(second.fill_paints)).toBe(true);
    expect(second.fill_paints).toHaveLength(1);
    expect(second.fill_paints[0]).toEqual(clipboardPaint);
    expect(second.fill_paints[0]).not.toBe(clipboardPaint);
    expect(second.fill).toEqual(second.fill_paints[0]);
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
          fill_paints: [originalPaint],
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

    expect(next.document.nodes[nodeId].fill_paints?.[0]).toBe(originalPaint);
    expect(next.user_clipboard).toEqual(state.user_clipboard);
  });
});
