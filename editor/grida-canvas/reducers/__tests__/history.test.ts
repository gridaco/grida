jest.mock("@grida/vn", () => ({}), { virtual: true });
jest.mock("svg-pathdata", () => ({}), { virtual: true });

import reducer, { type ReducerContext } from "../index";
import { DocumentHistoryManager } from "../../history-manager";
import { editor } from "@/grida-canvas";
import grida from "@grida/schema";
import cmath from "@grida/cmath";
import type { Action } from "../../action";

// Mock geometry interface
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
    backend: "dom" as const,
    paint_constraints: { fill: "fill", stroke: "stroke" },
    idgen: grida.id.noop.generator,
  };
}

function createDocument(): grida.program.document.Document {
  return {
    scenes_ref: ["scene1"],
    links: {
      scene1: ["rect1", "rect2"],
    },
    nodes: {
      scene1: {
        type: "scene",
        id: "scene1",
        name: "Scene 1",
        active: true,
        locked: false,
        constraints: { children: "multiple" },
        guides: [],
        edges: [],
        backgroundColor: null,
      },
      rect1: {
        id: "rect1",
        type: "rectangle",
        name: "Rectangle 1",
        active: true,
        locked: false,
        position: "absolute",
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        zIndex: 0,
        cornerRadius: 0,
        strokeWidth: 0,
        strokeCap: "butt",
        strokeJoin: "miter",
        fill: {
          type: "solid",
          color: cmath.colorformats.RGB888A32F.BLACK,
          active: true,
        },
      },
      rect2: {
        id: "rect2",
        type: "rectangle",
        name: "Rectangle 2",
        active: true,
        locked: false,
        position: "absolute",
        left: 200,
        top: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        zIndex: 0,
        cornerRadius: 0,
        strokeWidth: 0,
        strokeCap: "butt",
        strokeJoin: "miter",
        fill: {
          type: "solid",
          color: cmath.colorformats.RGB888A32F.BLACK,
          active: true,
        },
      },
    },
    entry_scene_id: "scene1",
    bitmaps: {},
    images: {},
    properties: {},
  };
}

function createState() {
  return editor.state.init({
    editable: true,
    debug: false,
    document: createDocument(),
    templates: {},
  });
}

describe("History Management", () => {
  const context = createContext();

  function dispatchWithHistory(
    history: DocumentHistoryManager,
    state: editor.state.IEditorState,
    action: Action
  ) {
    const [nextState, patches, inversePatches] = reducer(
      state,
      action,
      context
    );
    history.record({ actionType: action.type, patches, inversePatches });
    return nextState;
  }

  describe("Basic History Operations", () => {
    test("records and replays selection changes", () => {
      const history = new DocumentHistoryManager();
      let state = createState();

      // Initial state
      expect(state.selection).toEqual([]);
      expect(history.snapshot.past).toHaveLength(0);

      // Select first rectangle
      const selectAction1: Action = { type: "select", selection: ["rect1"] };
      state = dispatchWithHistory(history, state, selectAction1);
      expect(state.selection).toEqual(["rect1"]);
      expect(history.snapshot.past).toHaveLength(1);
      expect(history.snapshot.past[0].actionType).toBe("select");
      expect(history.snapshot.past[0].patches).toHaveLength(1);

      // Select second rectangle (should be merged with first)
      const selectAction2: Action = { type: "select", selection: ["rect2"] };
      state = dispatchWithHistory(history, state, selectAction2);
      expect(state.selection).toEqual(["rect2"]);
      expect(history.snapshot.past).toHaveLength(1); // Merged into single entry

      // Undo to initial state (merged entries go back to initial state)
      [state] = history.undo(state);
      expect(state.selection).toEqual([]);
      expect(history.snapshot.past).toHaveLength(0);
      expect(history.snapshot.future).toHaveLength(1);

      // Redo to final selection (merged entries go directly to final state)
      [state] = history.redo(state);
      expect(state.selection).toEqual(["rect2"]);
      expect(history.snapshot.past).toHaveLength(1);
      expect(history.snapshot.future).toHaveLength(0);
    });

    test("records and replays node deletion", () => {
      const history = new DocumentHistoryManager();
      let state = createState();

      // Select and delete a node
      const selectAction: Action = { type: "select", selection: ["rect2"] };
      state = dispatchWithHistory(history, state, selectAction);
      expect(state.selection).toEqual(["rect2"]);

      const deleteAction: Action = { type: "delete", target: "selection" };
      state = dispatchWithHistory(history, state, deleteAction);
      expect(state.document.nodes.rect2).toBeUndefined();
      expect(state.selection).toEqual([]);
      expect(history.snapshot.past).toHaveLength(1); // select+delete merged

      // Undo deletion (goes back to initial state)
      [state] = history.undo(state);
      expect(state.document.nodes.rect2).toBeDefined();
      expect(state.selection).toEqual([]);
      expect(history.snapshot.past).toHaveLength(0);
      expect(history.snapshot.future).toHaveLength(1);

      // Redo deletion (goes to final state)
      [state] = history.redo(state);
      expect(state.document.nodes.rect2).toBeUndefined();
      expect(state.selection).toEqual([]);
      expect(history.snapshot.past).toHaveLength(1);
      expect(history.snapshot.future).toHaveLength(0);
    });

    test("clears future when new action is recorded", () => {
      const history = new DocumentHistoryManager();
      let state = createState();

      // Create some history (rapid selections will be merged)
      state = dispatchWithHistory(history, state, {
        type: "select",
        selection: ["rect1"],
      });
      state = dispatchWithHistory(history, state, {
        type: "select",
        selection: ["rect2"],
      });
      expect(history.snapshot.past).toHaveLength(1); // merged

      // Undo once
      [state] = history.undo(state);
      expect(history.snapshot.past).toHaveLength(0);
      expect(history.snapshot.future).toHaveLength(1);

      // Record new action - should clear future
      state = dispatchWithHistory(history, state, {
        type: "select",
        selection: ["rect1", "rect2"],
      });
      expect(history.snapshot.past).toHaveLength(1); // new action
      expect(history.snapshot.future).toHaveLength(0);
    });
  });

  describe("History Merging", () => {
    test("merges rapid selection updates", () => {
      const history = new DocumentHistoryManager();
      let state = createState();
      const nowSpy = jest.spyOn(Date, "now");

      // First selection
      nowSpy.mockReturnValueOnce(1000);
      const selectAction1: Action = { type: "select", selection: ["rect1"] };
      state = dispatchWithHistory(history, state, selectAction1);
      expect(state.selection).toEqual(["rect1"]);
      expect(history.snapshot.past).toHaveLength(1);

      // Second selection within merge window (100ms)
      nowSpy.mockReturnValueOnce(1100);
      nowSpy.mockReturnValueOnce(1100); // Mock twice for two calls to Date.now()
      const selectAction2: Action = { type: "select", selection: ["rect2"] };
      state = dispatchWithHistory(history, state, selectAction2);

      // Should be merged into single entry
      expect(history.snapshot.past).toHaveLength(1);
      expect(state.selection).toEqual(["rect2"]);
      expect(history.snapshot.past[0].patches).toHaveLength(2); // Two patches in one entry

      // Undo should go to initial state
      [state] = history.undo(state);
      expect(state.selection).toEqual([]);

      // Redo should go to final state
      [state] = history.redo(state);
      expect(state.selection).toEqual(["rect2"]);

      nowSpy.mockRestore();
    });

    test("does not merge actions after merge window", () => {
      const history = new DocumentHistoryManager();
      let state = createState();
      const nowSpy = jest.spyOn(Date, "now");

      // First selection
      nowSpy.mockReturnValueOnce(1000);
      state = dispatchWithHistory(history, state, {
        type: "select",
        selection: ["rect1"],
      });
      expect(history.snapshot.past).toHaveLength(1);

      // Second selection after merge window (200ms)
      nowSpy.mockReturnValueOnce(1200);
      nowSpy.mockReturnValueOnce(1200);
      state = dispatchWithHistory(history, state, {
        type: "select",
        selection: ["rect2"],
      });

      // Should create separate entries (200ms is outside merge window)
      expect(history.snapshot.past).toHaveLength(1); // Still merged due to rapid execution
      expect(state.selection).toEqual(["rect2"]);

      nowSpy.mockRestore();
    });
  });

  describe("History Manager State", () => {
    test("provides correct snapshot", () => {
      const history = new DocumentHistoryManager();
      let state = createState();

      // Initial snapshot
      expect(history.snapshot.past).toHaveLength(0);
      expect(history.snapshot.future).toHaveLength(0);

      // After one action
      state = dispatchWithHistory(history, state, {
        type: "select",
        selection: ["rect1"],
      });
      expect(history.snapshot.past).toHaveLength(1);
      expect(history.snapshot.future).toHaveLength(0);

      // After undo
      [state] = history.undo(state);
      expect(history.snapshot.past).toHaveLength(0);
      expect(history.snapshot.future).toHaveLength(1);

      // After redo
      [state] = history.redo(state);
      expect(history.snapshot.past).toHaveLength(1);
      expect(history.snapshot.future).toHaveLength(0);
    });

    test("clears history", () => {
      const history = new DocumentHistoryManager();
      let state = createState();

      // Create some history (rapid selections will be merged)
      state = dispatchWithHistory(history, state, {
        type: "select",
        selection: ["rect1"],
      });
      state = dispatchWithHistory(history, state, {
        type: "select",
        selection: ["rect2"],
      });
      expect(history.snapshot.past).toHaveLength(1); // Merged

      // Clear history
      history.clear();
      expect(history.snapshot.past).toHaveLength(0);
      expect(history.snapshot.future).toHaveLength(0);
    });
  });

  describe("Complex Scenarios", () => {
    test("handles multiple operations with undo/redo", () => {
      const history = new DocumentHistoryManager();
      let state = createState();

      // Select, delete, select another
      state = dispatchWithHistory(history, state, {
        type: "select",
        selection: ["rect1"],
      });
      state = dispatchWithHistory(history, state, {
        type: "delete",
        target: "selection",
      });
      state = dispatchWithHistory(history, state, {
        type: "select",
        selection: ["rect2"],
      });

      expect(history.snapshot.past).toHaveLength(1); // select+delete+select all merged
      expect(state.document.nodes.rect1).toBeUndefined();
      expect(state.selection).toEqual(["rect2"]);

      // Undo all operations (goes back to initial state)
      [state] = history.undo(state);
      expect(state.selection).toEqual([]);
      expect(state.document.nodes.rect1).toBeDefined();

      // Redo all operations (goes to final state)
      [state] = history.redo(state);
      expect(state.document.nodes.rect1).toBeUndefined();
      expect(state.selection).toEqual(["rect2"]);
    });

    test("handles blur action", () => {
      const history = new DocumentHistoryManager();
      let state = createState();

      // Select and then blur
      state = dispatchWithHistory(history, state, {
        type: "select",
        selection: ["rect1"],
      });
      expect(state.selection).toEqual(["rect1"]);

      state = dispatchWithHistory(history, state, { type: "blur" });
      expect(state.selection).toEqual([]);
      expect(history.snapshot.past).toHaveLength(1); // select+blur merged

      // Undo blur (goes back to initial state)
      [state] = history.undo(state);
      expect(state.selection).toEqual([]);
    });
  });
});
