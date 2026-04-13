/**
 * Tests that the mutable bypass (`skipPatches: true`) correctly clones all
 * state sub-objects that drag gestures mutate.
 *
 * These tests reproduce the class of bugs where the bypass path creates a
 * shallow mutable wrapper around frozen Immer state and a reducer writes into
 * a nested frozen object, throwing:
 *
 *   "Cannot assign to read only property '…' of object '#<Object>'"
 *
 * Each test sets up a frozen state (via `produce`) that mirrors what Immer
 * returns after a prior dispatch, then calls the main reducer with
 * `{ skipPatches: true }` and an `event-target/event/on-drag` action.
 * If the bypass cloning is incomplete the frozen-property write will throw.
 */
import { produce } from "immer";
import reducer from "../index";
import { editor } from "@/grida-canvas";
import { createReducerContext } from "@/grida-canvas/__tests__/utils/stubs";
import { sceneNode, rectNode } from "@/grida-canvas/__tests__/utils/factories";
import type grida from "@grida/schema";
import type { EditorEventTarget_Drag } from "@/grida-canvas/action";
import type vn from "@grida/vn";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A triangle vector network with 3 vertices and 3 segments. */
function triangleVectorNetwork(): vn.VectorNetwork {
  return {
    vertices: [
      [0, 0],
      [50, 0],
      [25, 50],
    ],
    segments: [
      { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
      { a: 1, b: 2, ta: [0, 0], tb: [0, 0] },
      { a: 2, b: 0, ta: [0, 0], tb: [0, 0] },
    ],
  };
}

function vectorNode(id: string): grida.program.nodes.VectorNode {
  return {
    id,
    type: "vector",
    name: "Vector",
    active: true,
    locked: false,
    layout_positioning: "absolute",
    layout_inset_left: 10,
    layout_inset_top: 10,
    layout_target_width: 50,
    layout_target_height: 50,
    opacity: 1,
    rotation: 0,
    z_index: 0,
    vector_network: triangleVectorNetwork(),
  } satisfies Partial<grida.program.nodes.VectorNode> as grida.program.nodes.VectorNode;
}

const VECTOR_NODE_ID = "vec-1";

function createDocument(): grida.program.document.Document {
  return {
    scenes_ref: ["scene"],
    links: { scene: [VECTOR_NODE_ID] },
    nodes: {
      scene: sceneNode("scene"),
      [VECTOR_NODE_ID]: vectorNode(VECTOR_NODE_ID),
    },
    entry_scene_id: "scene",
    images: {},
    bitmaps: {},
    properties: {},
  };
}

function vectorContentEditMode(): editor.state.VectorContentEditMode {
  return {
    type: "vector",
    node_id: VECTOR_NODE_ID,
    selection: {
      selected_vertices: [0],
      selected_segments: [],
      selected_tangents: [],
    },
    selection_neighbouring_vertices: [1, 2],
    a_point: 0,
    next_ta: null,
    initial_vector_network: triangleVectorNetwork(),
    original: null,
    clipboard: null,
    clipboard_node_position: null,
    cursor: [0, 0],
    snapped_vertex_idx: null,
    snapped_segment_p: null,
    hovered_control: null,
  };
}

/** Freeze a state object the same way Immer does after `produce`. */
function frozenState(
  overrides: Partial<editor.state.IEditorState>
): editor.state.IEditorState {
  const base = editor.state.init({
    editable: true,
    debug: false,
    document: createDocument(),
    templates: {},
  });
  return produce(base, (draft) => {
    Object.assign(draft, overrides);
  });
}

function frozenStateWith(
  doc: grida.program.document.Document,
  overrides: Partial<editor.state.IEditorState>
): editor.state.IEditorState {
  const base = editor.state.init({
    editable: true,
    debug: false,
    document: doc,
    templates: {},
  });
  return produce(base, (draft) => {
    Object.assign(draft, overrides);
  });
}

const onDragAction: EditorEventTarget_Drag = {
  type: "event-target/event/on-drag",
  event: {
    delta: [5, 5],
    distance: [5, 5],
    movement: [5, 5],
  },
};

const context = createReducerContext();

// ---------------------------------------------------------------------------
// Vector editing
// ---------------------------------------------------------------------------

describe("mutable bypass (skipPatches) – vector editing", () => {
  describe("lasso selection in vector edit mode", () => {
    it("does not throw on frozen content_edit_mode.selection", () => {
      const state = frozenState({
        content_edit_mode: vectorContentEditMode(),
        lasso: {
          points: [
            [0, 0],
            [10, 0],
            [10, 10],
          ],
          additive: false,
        },
        gesture: { type: "idle" },
      });

      expect(Object.isFrozen(state.content_edit_mode)).toBe(true);

      const [next] = reducer(state, onDragAction, context, {
        skipPatches: true,
      });

      const cem = next.content_edit_mode as editor.state.VectorContentEditMode;
      expect(cem.selection).toBeDefined();
      expect(Array.isArray(cem.selection.selected_vertices)).toBe(true);
    });
  });

  describe("marquee selection in vector edit mode", () => {
    it("does not throw on frozen content_edit_mode.selection", () => {
      const state = frozenState({
        content_edit_mode: vectorContentEditMode(),
        marquee: {
          a: [0, 0],
          b: [20, 20],
          additive: false,
        },
        gesture: { type: "idle" },
      });

      expect(Object.isFrozen(state.content_edit_mode)).toBe(true);

      const [next] = reducer(state, onDragAction, context, {
        skipPatches: true,
      });

      const cem = next.content_edit_mode as editor.state.VectorContentEditMode;
      expect(cem.selection).toBeDefined();
      expect(Array.isArray(cem.selection.selected_vertices)).toBe(true);
    });
  });

  describe("translate-vector-controls gesture", () => {
    it("does not throw on frozen vector node properties", () => {
      const state = frozenState({
        content_edit_mode: vectorContentEditMode(),
        gesture: {
          type: "translate-vector-controls",
          node_id: VECTOR_NODE_ID,
          vertices: [0],
          tangents: [],
          initial_verticies: triangleVectorNetwork().vertices,
          initial_segments: triangleVectorNetwork().segments,
          initial_position: [10, 10],
          initial_absolute_position: [10, 10],
          movement: [0, 0],
          first: [0, 0],
          last: [0, 0],
        } satisfies editor.state.GestureTranslateVectorControls,
      });

      expect(Object.isFrozen(state.document.nodes[VECTOR_NODE_ID])).toBe(true);

      const [next] = reducer(state, onDragAction, context, {
        skipPatches: true,
      });

      const node = next.document.nodes[
        VECTOR_NODE_ID
      ] as grida.program.nodes.VectorNode;
      expect(node).toBeDefined();
      expect(node.vector_network).toBeDefined();
      expect(node.vector_network.vertices).toHaveLength(3);
    });
  });

  describe("curve (bend) gesture", () => {
    it("does not throw on frozen vector_network segments", () => {
      const state = frozenState({
        content_edit_mode: vectorContentEditMode(),
        gesture: {
          type: "curve",
          node_id: VECTOR_NODE_ID,
          segment: 0,
          control: "tb",
          initial: [0, 0],
          invert: false,
          movement: [0, 0],
          first: [0, 0],
          last: [0, 0],
        } satisfies editor.state.GestureCurve,
      });

      expect(Object.isFrozen(state.document.nodes[VECTOR_NODE_ID])).toBe(true);
      const network = (
        state.document.nodes[VECTOR_NODE_ID] as grida.program.nodes.VectorNode
      ).vector_network;
      expect(Object.isFrozen(network.segments[0])).toBe(true);

      const [next] = reducer(state, onDragAction, context, {
        skipPatches: true,
      });

      const node = next.document.nodes[
        VECTOR_NODE_ID
      ] as grida.program.nodes.VectorNode;
      expect(node).toBeDefined();
      expect(node.vector_network.segments).toHaveLength(3);
      expect(node.vector_network.segments[0].tb).toBeDefined();
    });
  });

  describe("original state is not corrupted", () => {
    it("does not mutate the input state during bypass", () => {
      const state = frozenState({
        content_edit_mode: vectorContentEditMode(),
        gesture: {
          type: "translate-vector-controls",
          node_id: VECTOR_NODE_ID,
          vertices: [0],
          tangents: [],
          initial_verticies: triangleVectorNetwork().vertices,
          initial_segments: triangleVectorNetwork().segments,
          initial_position: [10, 10],
          initial_absolute_position: [10, 10],
          movement: [0, 0],
          first: [0, 0],
          last: [0, 0],
        } satisfies editor.state.GestureTranslateVectorControls,
      });

      const origNode = state.document.nodes[
        VECTOR_NODE_ID
      ] as grida.program.nodes.VectorNode;
      const origVerts = origNode.vector_network.vertices.map((v) => [...v]);
      const origSegs = origNode.vector_network.segments.map((s) => ({ ...s }));
      const origLeft = origNode.layout_inset_left;

      reducer(state, onDragAction, context, { skipPatches: true });

      const afterNode = state.document.nodes[
        VECTOR_NODE_ID
      ] as grida.program.nodes.VectorNode;
      expect(afterNode.layout_inset_left).toBe(origLeft);
      expect(afterNode.vector_network.vertices).toEqual(origVerts);
      expect(afterNode.vector_network.segments).toEqual(origSegs);
    });
  });
});

// ---------------------------------------------------------------------------
// Variable-width editing
// ---------------------------------------------------------------------------

describe("mutable bypass (skipPatches) – variable-width editing", () => {
  const VARWIDTH_NODE_ID = "varwidth-1";

  function varwidthDocument(): grida.program.document.Document {
    return {
      scenes_ref: ["scene"],
      links: { scene: [VARWIDTH_NODE_ID] },
      nodes: {
        scene: sceneNode("scene"),
        [VARWIDTH_NODE_ID]: {
          ...vectorNode(VARWIDTH_NODE_ID),
          stroke_width_profile: {
            stops: [
              { u: 0, r: 5 },
              { u: 1, r: 5 },
            ],
          },
        },
      },
      entry_scene_id: "scene",
      images: {},
      bitmaps: {},
      properties: {},
    };
  }

  const widthProfile = {
    stops: [
      { u: 0, r: 5 },
      { u: 1, r: 5 },
    ],
  };

  it("translate-variable-width-stop: does not throw on frozen variable_width_profile.stops", () => {
    const state = frozenStateWith(varwidthDocument(), {
      content_edit_mode: {
        type: "width",
        node_id: VARWIDTH_NODE_ID,
        snapped_p: { segment: 0, t: 0.5, point: [25, 25] },
        initial_vector_network: triangleVectorNetwork(),
        variable_width_selected_stop: 0,
        initial_variable_width_profile: { ...widthProfile },
        variable_width_profile: { ...widthProfile },
      } satisfies editor.state.VariableWidthContentEditMode,
      gesture: {
        type: "translate-variable-width-stop",
        node_id: VARWIDTH_NODE_ID,
        stop: 0,
        initial_stop: { u: 0, r: 5 },
        initial_position: [10, 10],
        initial_absolute_position: [10, 10],
        movement: [0, 0],
        first: [0, 0],
        last: [0, 0],
      } satisfies editor.state.GestureTranslateVariableWidthStop,
    });

    expect(Object.isFrozen(state.content_edit_mode)).toBe(true);

    const [next] = reducer(state, onDragAction, context, {
      skipPatches: true,
    });

    const cem =
      next.content_edit_mode as editor.state.VariableWidthContentEditMode;
    expect(cem.variable_width_profile.stops).toBeDefined();
    expect(cem.variable_width_profile.stops).toHaveLength(2);
  });

  it("resize-variable-width-stop: does not throw on frozen variable_width_profile.stops", () => {
    const state = frozenStateWith(varwidthDocument(), {
      content_edit_mode: {
        type: "width",
        node_id: VARWIDTH_NODE_ID,
        snapped_p: null,
        initial_vector_network: triangleVectorNetwork(),
        variable_width_selected_stop: 0,
        initial_variable_width_profile: { ...widthProfile },
        variable_width_profile: { ...widthProfile },
      } satisfies editor.state.VariableWidthContentEditMode,
      gesture: {
        type: "resize-variable-width-stop",
        node_id: VARWIDTH_NODE_ID,
        stop: 0,
        side: "right",
        initial_stop: { u: 0, r: 5 },
        initial_position: [10, 10],
        initial_absolute_position: [10, 10],
        initial_angle: 0,
        initial_curve_position: [25, 25],
        movement: [0, 0],
        first: [0, 0],
        last: [0, 0],
      } satisfies editor.state.GestureResizeVariableWidthStop,
    });

    expect(Object.isFrozen(state.content_edit_mode)).toBe(true);

    const [next] = reducer(state, onDragAction, context, {
      skipPatches: true,
    });

    const cem =
      next.content_edit_mode as editor.state.VariableWidthContentEditMode;
    expect(cem.variable_width_profile.stops).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Sort gesture
// ---------------------------------------------------------------------------

describe("mutable bypass (skipPatches) – sort gesture", () => {
  const RECT_A = "rect-a";
  const RECT_B = "rect-b";

  function sortDocument(): grida.program.document.Document {
    return {
      scenes_ref: ["scene"],
      links: { scene: [RECT_A, RECT_B] },
      nodes: {
        scene: sceneNode("scene"),
        [RECT_A]: rectNode(RECT_A, { x: 0, y: 0, width: 50, height: 50 }),
        [RECT_B]: rectNode(RECT_B, { x: 60, y: 0, width: 50, height: 50 }),
      },
      entry_scene_id: "scene",
      images: {},
      bitmaps: {},
      properties: {},
    };
  }

  it("does not throw on frozen gesture.layout.objects or sibling nodes", () => {
    const state = frozenStateWith(sortDocument(), {
      gesture: {
        type: "sort",
        node_id: RECT_A,
        node_initial_rect: { x: 0, y: 0, width: 50, height: 50 },
        layout: {
          type: "group",
          group: null,
          objects: [
            { id: RECT_A, x: 0, y: 0, width: 50, height: 50 },
            { id: RECT_B, x: 60, y: 0, width: 50, height: 50 },
          ],
        },
        placement: {
          index: 0,
          rect: { x: 0, y: 0, width: 50, height: 50 },
        },
        movement: [0, 0],
        first: [0, 0],
        last: [0, 0],
      } satisfies editor.state.GestureSort,
    });

    const sortGesture = state.gesture as editor.state.GestureSort;
    expect(Object.isFrozen(sortGesture.layout)).toBe(true);
    expect(Object.isFrozen(state.document.nodes[RECT_B])).toBe(true);

    const [next] = reducer(state, onDragAction, context, {
      skipPatches: true,
    });

    expect(next.gesture.type).toBe("sort");
    expect(next.document.nodes[RECT_B]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Gap gesture
// ---------------------------------------------------------------------------

describe("mutable bypass (skipPatches) – gap gesture", () => {
  const RECT_A = "rect-a";
  const RECT_B = "rect-b";

  function gapDocument(): grida.program.document.Document {
    return {
      scenes_ref: ["scene"],
      links: { scene: [RECT_A, RECT_B] },
      nodes: {
        scene: sceneNode("scene"),
        [RECT_A]: rectNode(RECT_A, { x: 0, y: 0, width: 50, height: 50 }),
        [RECT_B]: rectNode(RECT_B, { x: 60, y: 0, width: 50, height: 50 }),
      },
      entry_scene_id: "scene",
      images: {},
      bitmaps: {},
      properties: {},
    };
  }

  it("does not throw on frozen gesture.layout.objects or frozen nodes", () => {
    const state = frozenStateWith(gapDocument(), {
      gesture: {
        type: "gap",
        axis: "x",
        min_gap: 0,
        initial_gap: 10,
        gap: 10,
        layout: {
          type: "group",
          group: null,
          objects: [
            { id: RECT_A, x: 0, y: 0, width: 50, height: 50 },
            { id: RECT_B, x: 60, y: 0, width: 50, height: 50 },
          ],
        },
        movement: [0, 0],
        first: [0, 0],
        last: [0, 0],
      } satisfies editor.state.GestureGap,
    });

    const gapGesture = state.gesture as editor.state.GestureGap;
    expect(Object.isFrozen(gapGesture.layout)).toBe(true);
    expect(Object.isFrozen(state.document.nodes[RECT_A])).toBe(true);

    const [next] = reducer(state, onDragAction, context, {
      skipPatches: true,
    });

    expect(next.gesture).toBeDefined();
    expect(next.document.nodes[RECT_A]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Draw gesture
// ---------------------------------------------------------------------------

describe("mutable bypass (skipPatches) – draw gesture", () => {
  const DRAW_NODE_ID = "draw-1";

  function drawDocument(): grida.program.document.Document {
    return {
      scenes_ref: ["scene"],
      links: { scene: [DRAW_NODE_ID] },
      nodes: {
        scene: sceneNode("scene"),
        [DRAW_NODE_ID]: vectorNode(DRAW_NODE_ID),
      },
      entry_scene_id: "scene",
      images: {},
      bitmaps: {},
      properties: {},
    };
  }

  it("does not throw on frozen draw node properties", () => {
    const state = frozenStateWith(drawDocument(), {
      content_edit_mode: {
        ...vectorContentEditMode(),
        node_id: DRAW_NODE_ID,
        a_point: 1,
        selection: {
          selected_vertices: [],
          selected_segments: [],
          selected_tangents: [],
        },
        selection_neighbouring_vertices: [],
      } satisfies editor.state.VectorContentEditMode,
      tool: { type: "draw", tool: "line" },
      gesture: {
        type: "draw",
        mode: "line",
        origin: [50, 50],
        points: [
          [0, 0],
          [10, 0],
        ],
        node_id: DRAW_NODE_ID,
        movement: [0, 0],
        first: [0, 0],
        last: [0, 0],
      } satisfies editor.state.GestureDraw,
    });

    expect(Object.isFrozen(state.document.nodes[DRAW_NODE_ID])).toBe(true);

    const [next] = reducer(state, onDragAction, context, {
      skipPatches: true,
    });

    const node = next.document.nodes[
      DRAW_NODE_ID
    ] as grida.program.nodes.VectorNode;
    expect(node).toBeDefined();
    expect(node.vector_network).toBeDefined();
  });
});
