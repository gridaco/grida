import {
  getViewportAwareDelta,
  getPackedSubtreeBoundingRect,
} from "@/grida-canvas/utils/insertion";

import type grida from "@grida/schema";

describe("getViewportAwareDelta", () => {
  it("returns null when rect intersects viewport", () => {
    const viewport = { x: 0, y: 0, width: 100, height: 100 };
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(getViewportAwareDelta(viewport, rect)).toBeNull();
  });

  it("returns center aligning delta when rect is outside viewport", () => {
    const viewport = { x: 0, y: 0, width: 100, height: 100 };
    const rect = { x: 200, y: 200, width: 20, height: 20 };
    const delta = getViewportAwareDelta(viewport, rect);
    expect(delta).toEqual([-160, -160]);
  });
});

describe("getPackedSubtreeBoundingRect", () => {
  it("computes bounding box of packed scene document", () => {
    const sub: grida.program.document.IPackedSceneDocument = {
      scene: {
        type: "scene",
        id: "s",
        name: "s",
        children_refs: ["a", "b"],
      } as grida.program.document.Scene,
      nodes: {
        a: {
          id: "a",
          type: "rectangle",
          left: 10,
          top: 10,
          layout_target_width: 20,
          layout_target_height: 20,
          position: "absolute",
        } as grida.program.nodes.RectangleNode,
        b: {
          id: "b",
          type: "rectangle",
          left: 40,
          top: 40,
          layout_target_width: 20,
          layout_target_height: 20,
          position: "absolute",
        } as grida.program.nodes.RectangleNode,
      },
      images: {},
      links: {},
      bitmaps: {},
      properties: {},
    };
    const box = getPackedSubtreeBoundingRect(sub);
    expect(box).toEqual({ x: 10, y: 10, width: 50, height: 50 });
  });
});
