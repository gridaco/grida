jest.mock("@grida/vn", () => ({}), { virtual: true });
jest.mock("svg-pathdata", () => ({}), { virtual: true });

import reducer, { type ReducerContext } from "../index";
import { editor } from "@/grida-canvas";
import grida from "@grida/schema";

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
    idgen: grida.id.noop.generator,
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

describe("history reducer integration", () => {
  const context = createContext();

  test("undo/redo replays document patches", () => {
    const initialState = createState();

    const afterSelect = reducer(
      initialState,
      { type: "select", selection: ["rect2"] } as any,
      context
    );

    expect(afterSelect.selection).toEqual(["rect2"]);
    expect(afterSelect.history.past).toHaveLength(1);
    expect(afterSelect.history.past[0]).toHaveProperty("patches");
    expect(afterSelect.history.past[0] as any).not.toHaveProperty("state");

    const afterDelete = reducer(
      afterSelect,
      { type: "delete", target: "selection" } as any,
      context
    );

    expect(afterDelete.document.nodes.rect2).toBeUndefined();
    expect(afterDelete.history.past).toHaveLength(1);

    const undone = reducer(afterDelete, { type: "undo" } as any, context);
    expect(undone.document.nodes.rect2).toBeDefined();
    expect(undone.selection).toEqual([]);
    expect(undone.history.future).toHaveLength(1);

    const redone = reducer(undone, { type: "redo" } as any, context);
    expect(redone.document.nodes.rect2).toBeUndefined();
    expect(redone.selection).toEqual([]);
    expect(redone.history.past).toHaveLength(1);
    expect(redone.history.future).toHaveLength(0);
  });

  test("merges rapid selection updates", () => {
    const initialState = createState();
    const nowSpy = jest.spyOn(Date, "now");

    nowSpy.mockReturnValueOnce(1000);
    const afterFirstSelect = reducer(
      initialState,
      { type: "select", selection: ["rect1"] } as any,
      context
    );
    expect(afterFirstSelect.selection).toEqual(["rect1"]);
    expect(afterFirstSelect.history.past).toHaveLength(1);

    nowSpy.mockReturnValueOnce(1100);
    nowSpy.mockReturnValueOnce(1100);
    const afterSecondSelect = reducer(
      afterFirstSelect,
      { type: "select", selection: ["rect2"] } as any,
      context
    );

    expect(afterSecondSelect.history.past).toHaveLength(1);
    expect(afterSecondSelect.selection).toEqual(["rect2"]);

    const undone = reducer(afterSecondSelect, { type: "undo" } as any, context);
    expect(undone.selection).toEqual([]);

    const redone = reducer(undone, { type: "redo" } as any, context);
    expect(redone.selection).toEqual(["rect2"]);

    nowSpy.mockRestore();
  });
});
