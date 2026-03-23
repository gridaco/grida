import reducer, { type ReducerContext } from "../index";
import { editor } from "@/grida-canvas";
import grida from "@grida/schema";
import color from "@grida/color";
import type { Action } from "../../action";

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
    backend: "canvas" as const,
    paint_constraints: { fill: "fill", stroke: "stroke" },
    idgen: grida.id.noop.generator,
  };
}

function createDocument(): grida.program.document.Document {
  return {
    scenes_ref: ["scene1"],
    links: {
      scene1: ["node-1", "node-2"],
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
        background_color: null,
      },
      "node-1": {
        id: "node-1",
        type: "rectangle",
        name: "Node 1",
        active: true,
        locked: false,
        layout_positioning: "absolute",
        layout_inset_left: 0,
        layout_inset_top: 0,
        layout_target_width: 100,
        layout_target_height: 100,
        rotation: 0,
        opacity: 1,
        z_index: 0,
        corner_radius: 0,
        stroke_width: 0,
        stroke_cap: "butt",
        stroke_join: "miter",
        fill: {
          type: "solid",
          color: color.colorformats.RGBA32F.BLACK,
          active: true,
        },
      },
      "node-2": {
        id: "node-2",
        type: "rectangle",
        name: "Node 2",
        active: true,
        locked: false,
        layout_positioning: "absolute",
        layout_inset_left: 200,
        layout_inset_top: 0,
        layout_target_width: 100,
        layout_target_height: 100,
        rotation: 0,
        opacity: 1,
        z_index: 0,
        corner_radius: 0,
        stroke_width: 0,
        stroke_cap: "butt",
        stroke_join: "miter",
        fill: {
          type: "solid",
          color: color.colorformats.RGBA32F.BLACK,
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

function createState(editable: boolean) {
  return editor.state.init({
    editable,
    debug: false,
    document: createDocument(),
    templates: {},
  });
}

function dispatch(
  state: editor.state.IEditorState,
  action: Action,
  context: ReducerContext
): editor.state.IEditorState {
  const [nextState] = reducer(state, action, context);
  return nextState;
}

describe("selection in readonly mode (editable: false)", () => {
  const context = createContext();

  test("select single node", () => {
    let state = createState(false);
    expect(state.selection).toEqual([]);

    state = dispatch(
      state,
      { type: "select", selection: ["node-1"] },
      context
    );

    expect(state.selection).toEqual(["node-1"]);
  });

  test("select multiple nodes", () => {
    let state = createState(false);

    state = dispatch(
      state,
      { type: "select", selection: ["node-1", "node-2"] },
      context
    );

    expect(state.selection).toEqual(["node-1", "node-2"]);
  });

  test("clear selection via blur", () => {
    let state = createState(false);

    state = dispatch(
      state,
      { type: "select", selection: ["node-1"] },
      context
    );
    expect(state.selection).toEqual(["node-1"]);

    state = dispatch(state, { type: "blur" }, context);
    expect(state.selection).toEqual([]);
  });

  test("replace existing selection", () => {
    let state = createState(false);

    state = dispatch(
      state,
      { type: "select", selection: ["node-1"] },
      context
    );
    state = dispatch(
      state,
      { type: "select", selection: ["node-2"] },
      context
    );

    expect(state.selection).toEqual(["node-2"]);
  });

  test("does not mutate document nodes", () => {
    let state = createState(false);
    const originalNodes = state.document.nodes;

    state = dispatch(
      state,
      { type: "select", selection: ["node-1"] },
      context
    );

    expect(state.document.nodes).toBe(originalNodes);
  });

  test("no-op when selection is unchanged", () => {
    let state = createState(false);

    state = dispatch(
      state,
      { type: "select", selection: ["node-1"] },
      context
    );
    const stateAfterFirst = state;

    state = dispatch(
      state,
      { type: "select", selection: ["node-1"] },
      context
    );

    expect(state).toBe(stateAfterFirst);
  });

  test("document-mutating actions are still blocked", () => {
    let state = createState(false);
    const originalDoc = state.document;

    state = dispatch(
      state,
      {
        type: "node/change/*",
        node_id: "node-1",
        name: "Modified",
      },
      context
    );

    expect(state.document).toBe(originalDoc);
  });
});
