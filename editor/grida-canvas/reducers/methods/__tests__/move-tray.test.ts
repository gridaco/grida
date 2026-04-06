/**
 * @vitest-environment node
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import { sceneNode, rectNode } from "@/grida-canvas/__tests__/utils/factories";
import color from "@grida/color";
import type grida from "@grida/schema";

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

/**
 * Creates a document with:
 *   scene
 *   +-- tray1
 *   |   +-- container1
 *   |   +-- rect1
 *   +-- tray2
 *   +-- container2
 */
function createTrayDocument(): grida.program.document.Document {
  return {
    scenes_ref: ["scene"],
    links: {
      scene: ["tray1", "tray2", "container2"],
      tray1: ["container1", "rect1"],
      tray2: [],
    },
    nodes: {
      scene: sceneNode("scene", "Scene"),
      tray1: trayNode("tray1", "Tray 1"),
      tray2: trayNode("tray2", "Tray 2"),
      container1: containerNode("container1", "Container 1"),
      container2: containerNode("container2", "Container 2"),
      rect1: rectNode("rect1", { name: "Rectangle 1" }),
    },
    entry_scene_id: "scene",
    bitmaps: {},
    images: {},
    properties: {},
  };
}

describe("Tray Move Constraints", () => {
  let ed: Editor;

  beforeEach(() => {
    ed = createHeadlessEditor({ document: createTrayDocument() });
  });

  afterEach(() => {
    ed.dispose();
  });

  describe("Tray parent constraint: Tray can only be child of Scene or Tray", () => {
    test("move tray into container — rejected", () => {
      ed.doc.mv(["tray1"], "container2");
      // tray1 should still be a child of scene
      expect(ed.state.document.links["scene"]).toContain("tray1");
      expect(ed.state.document.links["container2"] ?? []).not.toContain(
        "tray1"
      );
    });

    test("move tray into another tray — accepted", () => {
      ed.doc.mv(["tray2"], "tray1");
      // tray2 should now be a child of tray1
      expect(ed.state.document.links["tray1"]).toContain("tray2");
      expect(ed.state.document.links["scene"]).not.toContain("tray2");
    });

    test("move tray to scene root — accepted", () => {
      // First move tray2 into tray1
      ed.doc.mv(["tray2"], "tray1");
      expect(ed.state.document.links["tray1"]).toContain("tray2");

      // Then move it back to scene root
      ed.doc.mv(["tray2"], "scene");
      expect(ed.state.document.links["scene"]).toContain("tray2");
      expect(ed.state.document.links["tray1"]).not.toContain("tray2");
    });
  });

  describe("Tray as parent: accepts any child node type", () => {
    test("move container into tray — accepted", () => {
      ed.doc.mv(["container2"], "tray1");
      expect(ed.state.document.links["tray1"]).toContain("container2");
      expect(ed.state.document.links["scene"]).not.toContain("container2");
    });

    test("move rectangle into tray — accepted", () => {
      // rect1 is already in tray1, move it to tray2
      ed.doc.mv(["rect1"], "tray2");
      expect(ed.state.document.links["tray2"]).toContain("rect1");
      expect(ed.state.document.links["tray1"]).not.toContain("rect1");
    });
  });

  describe("Moving nodes out of tray", () => {
    test("move container out of tray to scene root — accepted", () => {
      // container1 is in tray1, move it to scene root
      ed.doc.mv(["container1"], "scene");
      expect(ed.state.document.links["scene"]).toContain("container1");
      expect(ed.state.document.links["tray1"]).not.toContain("container1");
    });

    test("move container from tray to another container — accepted", () => {
      // container1 is in tray1, move it into container2
      ed.doc.mv(["container1"], "container2");
      expect(ed.state.document.links["container2"]).toContain("container1");
      expect(ed.state.document.links["tray1"]).not.toContain("container1");
    });
  });

  describe("Cycle prevention with trays", () => {
    test("move tray into its own child — rejected (cycle)", () => {
      // First nest tray2 inside tray1
      ed.doc.mv(["tray2"], "tray1");
      expect(ed.state.document.links["tray1"]).toContain("tray2");

      // Now try to move tray1 into tray2 — would create a cycle
      ed.doc.mv(["tray1"], "tray2");
      // tray1 should still be at scene root
      expect(ed.state.document.links["scene"]).toContain("tray1");
    });
  });
});
