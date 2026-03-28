import reducer, { type ReducerContext } from "../../index";
import { editor } from "@/grida-canvas";
import grida from "@grida/schema";
import color from "@grida/color";
import type { Action } from "../../../action";

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

function trayNode(
  id: string,
  name: string
): grida.program.nodes.TrayNode {
  return {
    id,
    type: "tray",
    name,
    active: true,
    locked: false,
    layout_positioning: "absolute",
    layout_inset_left: 0,
    layout_inset_top: 0,
    layout_target_width: 500,
    layout_target_height: 500,
    rotation: 0,
    opacity: 1,
    corner_radius: 2,
    stroke_width: 0,
    stroke_cap: "butt",
    stroke_join: "miter",
    stroke_align: "inside",
  };
}

function containerNode(
  id: string,
  name: string
): grida.program.nodes.ContainerNode {
  return {
    id,
    type: "container",
    name,
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
    layout_mode: "flow",
    layout_direction: "horizontal",
    layout_main_axis_alignment: "start",
    layout_cross_axis_alignment: "start",
    layout_main_axis_gap: 0,
    layout_cross_axis_gap: 0,
    stroke_width: 0,
    stroke_cap: "butt",
    stroke_join: "miter",
    stroke_align: "inside",
    clips_content: true,
    fill: {
      type: "solid",
      color: color.colorformats.RGBA32F.WHITE,
      active: true,
    },
  };
}

function rectNode(
  id: string,
  name: string
): grida.program.nodes.RectangleNode {
  return {
    id,
    type: "rectangle",
    name,
    active: true,
    locked: false,
    layout_positioning: "absolute",
    layout_inset_left: 0,
    layout_inset_top: 0,
    layout_target_width: 50,
    layout_target_height: 50,
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
  };
}

function sceneNode(): grida.program.nodes.SceneNode {
  return {
    type: "scene",
    id: "scene",
    name: "Scene",
    active: true,
    locked: false,
    constraints: { children: "multiple" },
    guides: [],
    edges: [],
    background_color: null,
  };
}

/**
 * Creates a document with:
 *   scene
 *   +-- tray1
 *   |   +-- container1
 *   |   +-- rect1
 *   +-- tray2
 *   +-- container2
 */
function createDocument(): grida.program.document.Document {
  return {
    scenes_ref: ["scene"],
    links: {
      scene: ["tray1", "tray2", "container2"],
      tray1: ["container1", "rect1"],
      tray2: [],
    },
    nodes: {
      scene: sceneNode(),
      tray1: trayNode("tray1", "Tray 1"),
      tray2: trayNode("tray2", "Tray 2"),
      container1: containerNode("container1", "Container 1"),
      container2: containerNode("container2", "Container 2"),
      rect1: rectNode("rect1", "Rectangle 1"),
    },
    entry_scene_id: "scene",
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

function dispatch(
  state: editor.state.IEditorState,
  action: Action,
  context: ReducerContext
) {
  const [next] = reducer(state, action, context);
  return next;
}

describe("Tray Move Constraints", () => {
  const context = createContext();

  describe("Tray parent constraint: Tray can only be child of Scene or Tray", () => {
    test("move tray into container — rejected", () => {
      let state = createState();
      state = dispatch(
        state,
        { type: "mv", source: ["tray1"], target: "container2" },
        context
      );
      // tray1 should still be a child of scene
      expect(state.document.links["scene"]).toContain("tray1");
      expect(state.document.links["container2"] ?? []).not.toContain("tray1");
    });

    test("move tray into another tray — accepted", () => {
      let state = createState();
      state = dispatch(
        state,
        { type: "mv", source: ["tray2"], target: "tray1" },
        context
      );
      // tray2 should now be a child of tray1
      expect(state.document.links["tray1"]).toContain("tray2");
      expect(state.document.links["scene"]).not.toContain("tray2");
    });

    test("move tray to scene root — accepted", () => {
      let state = createState();
      // First move tray2 into tray1
      state = dispatch(
        state,
        { type: "mv", source: ["tray2"], target: "tray1" },
        context
      );
      expect(state.document.links["tray1"]).toContain("tray2");

      // Then move it back to scene root
      state = dispatch(
        state,
        { type: "mv", source: ["tray2"], target: "scene" },
        context
      );
      expect(state.document.links["scene"]).toContain("tray2");
      expect(state.document.links["tray1"]).not.toContain("tray2");
    });
  });

  describe("Tray as parent: accepts any child node type", () => {
    test("move container into tray — accepted", () => {
      let state = createState();
      state = dispatch(
        state,
        { type: "mv", source: ["container2"], target: "tray1" },
        context
      );
      expect(state.document.links["tray1"]).toContain("container2");
      expect(state.document.links["scene"]).not.toContain("container2");
    });

    test("move rectangle into tray — accepted", () => {
      let state = createState();
      // rect1 is already in tray1, move it to tray2
      state = dispatch(
        state,
        { type: "mv", source: ["rect1"], target: "tray2" },
        context
      );
      expect(state.document.links["tray2"]).toContain("rect1");
      expect(state.document.links["tray1"]).not.toContain("rect1");
    });
  });

  describe("Moving nodes out of tray", () => {
    test("move container out of tray to scene root — accepted", () => {
      let state = createState();
      // container1 is in tray1, move it to scene root
      state = dispatch(
        state,
        { type: "mv", source: ["container1"], target: "scene" },
        context
      );
      expect(state.document.links["scene"]).toContain("container1");
      expect(state.document.links["tray1"]).not.toContain("container1");
    });

    test("move container from tray to another container — accepted", () => {
      let state = createState();
      // container1 is in tray1, move it into container2
      state = dispatch(
        state,
        { type: "mv", source: ["container1"], target: "container2" },
        context
      );
      expect(state.document.links["container2"]).toContain("container1");
      expect(state.document.links["tray1"]).not.toContain("container1");
    });
  });

  describe("Cycle prevention with trays", () => {
    test("move tray into its own child — rejected (cycle)", () => {
      let state = createState();
      // First nest tray2 inside tray1
      state = dispatch(
        state,
        { type: "mv", source: ["tray2"], target: "tray1" },
        context
      );
      expect(state.document.links["tray1"]).toContain("tray2");

      // Now try to move tray1 into tray2 — would create a cycle
      state = dispatch(
        state,
        { type: "mv", source: ["tray1"], target: "tray2" },
        context
      );
      // tray1 should still be at scene root
      expect(state.document.links["scene"]).toContain("tray1");
    });
  });
});
