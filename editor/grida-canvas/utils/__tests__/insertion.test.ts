import {
  getViewportAwareDelta,
  getPackedSubtreeBoundingRect,
} from "@/grida-canvas/utils/insertion";
import { hitTestNestedInsertionTarget } from "@/grida-canvas/utils/insertion-targeting";
import cmath from "@grida/cmath";

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

describe("hitTestNestedInsertionTarget", () => {
  const rects: Record<string, cmath.Rectangle> = {
    containerA: { x: 0, y: 0, width: 300, height: 300 },
    containerB: { x: 50, y: 50, width: 200, height: 200 },
  };
  const geometry = {
    getNodeIdsFromPoint: () => ["leaf", "containerB", "containerA"],
    getNodeAbsoluteBoundingRect: (id: string) => rects[id] || null,
  };
  const isContainer = (id: string) => id.startsWith("container");

  it("returns deepest container containing rect", () => {
    const rect = { x: 60, y: 60, width: 10, height: 10 };
    const parent = hitTestNestedInsertionTarget(rect, geometry, isContainer);
    expect(parent).toBe("containerB");
  });

  it("respects maxDepth", () => {
    const rect = { x: 60, y: 60, width: 10, height: 10 };
    const parent = hitTestNestedInsertionTarget(rect, geometry, isContainer, 1);
    expect(parent).toBeNull();
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
        order: 0,
      },
      nodes: {
        a: {
          id: "a",
          type: "rectangle",
          left: 10,
          top: 10,
          width: 20,
          height: 20,
          position: "absolute",
        },
        b: {
          id: "b",
          type: "rectangle",
          left: 40,
          top: 40,
          width: 20,
          height: 20,
          position: "absolute",
        },
      },
    } as any;
    const box = getPackedSubtreeBoundingRect(sub);
    expect(box).toEqual({ x: 10, y: 10, width: 50, height: 50 });
  });
});
