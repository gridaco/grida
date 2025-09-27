jest.mock("@grida/vn", () => ({}), { virtual: true });
jest.mock("svg-pathdata", () => ({}), { virtual: true });

import reducer, { type ReducerContext } from "../index";
import { editor } from "@/grida-canvas";

const geometryStub: editor.api.IDocumentGeometryQuery = {
  getNodeIdsFromPoint: () => [],
  getNodeIdsFromPointerEvent: () => [],
  getNodeIdsFromEnvelope: () => [],
  getNodeAbsoluteBoundingRect: () => ({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  }),
  getNodeAbsoluteRotation: () => 0,
};

function createContext(): ReducerContext {
  return {
    geometry: geometryStub,
    vector: undefined,
    viewport: { width: 1000, height: 1000 },
    backend: "dom",
    paint_constraints: { fill: "fill", stroke: "stroke" },
  };
}

function createDocument() {
  return {
    nodes: {
      rect1: {
        id: "rect1",
        type: "rectangle",
        name: "Rect 1",
        left: 0,
        top: 0,
        width: 120,
        height: 80,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        children: [],
        fills: [],
        strokes: [],
      },
      rect2: {
        id: "rect2",
        type: "rectangle",
        name: "Rect 2",
        left: 200,
        top: 100,
        width: 90,
        height: 60,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        children: [],
        fills: [],
        strokes: [],
      },
    },
    scenes: {
      scene: {
        id: "scene",
        name: "Scene",
        constraints: { children: "many" },
        children: ["rect1", "rect2"],
      },
    },
    entry_scene_id: "scene",
  } as const;
}

function createState() {
  return editor.state.init({
    editable: true,
    debug: false,
    document: createDocument() as any,
    templates: {},
  });
}

describe("history merge bug fix", () => {
  const context = createContext();

  test("rapid selection changes should merge into single history entry", () => {
    const initialState = createState();
    const nowSpy = jest.spyOn(Date, "now");

    // First action - select rect1
    nowSpy.mockReturnValueOnce(1000);
    const afterFirstSelect = reducer(
      initialState,
      { type: "select", selection: ["rect1"] } as any,
      context
    );

    expect(afterFirstSelect.selection).toEqual(["rect1"]);
    expect(afterFirstSelect.history.past).toHaveLength(1);

    // Second action within merge timeout - select rect2 (should merge)
    nowSpy.mockReturnValueOnce(1100); // Within 300ms timeout
    const afterSecondSelect = reducer(
      afterFirstSelect,
      { type: "select", selection: ["rect2"] } as any,
      context
    );

    // After the fix, this should be 1 (merged)
    // Before the fix, this will be 2 (not merged)
    expect(afterSecondSelect.history.past).toHaveLength(1);
    expect(afterSecondSelect.selection).toEqual(["rect2"]);

    // Test that the merged entry has combined patches
    const mergedEntry = afterSecondSelect.history.past[0];
    // When patches are merged, they are concatenated, so we should have 2 patches
    expect(mergedEntry.patches).toHaveLength(2); // Should have concatenated patches
    expect(mergedEntry.inversePatches).toHaveLength(2); // Should have concatenated inverse patches

    // Test undo/redo works correctly with merged patches
    const undone = reducer(afterSecondSelect, { type: "undo" } as any, context);
    expect(undone.selection).toEqual([]);
    expect(undone.history.future).toHaveLength(1);

    const redone = reducer(undone, { type: "redo" } as any, context);
    expect(redone.selection).toEqual(["rect2"]);
    expect(redone.history.past).toHaveLength(1);
    expect(redone.history.future).toHaveLength(0);

    nowSpy.mockRestore();
  });

  test("actions outside merge timeout should not merge", () => {
    const initialState = createState();
    const nowSpy = jest.spyOn(Date, "now");

    // First action - select rect1
    nowSpy.mockReturnValueOnce(1000);
    const afterFirstSelect = reducer(
      initialState,
      { type: "select", selection: ["rect1"] } as any,
      context
    );

    // Second action outside merge timeout - select rect2 (should NOT merge)
    nowSpy.mockReturnValueOnce(1500); // 500ms > 300ms timeout
    const afterSecondSelect = reducer(
      afterFirstSelect,
      { type: "select", selection: ["rect2"] } as any,
      context
    );

    // Should create separate history entries
    expect(afterSecondSelect.history.past).toHaveLength(2);
    expect(afterSecondSelect.selection).toEqual(["rect2"]);

    nowSpy.mockRestore();
  });
});
