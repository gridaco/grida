import { describe, it, expect } from "vitest";
import type grida from "@grida/schema";
import cg from "@grida/cg";
import { format } from "../format";

// Base objects for common node types
const baseScene = (id: string): grida.program.nodes.SceneNode => ({
  type: "scene",
  id,
  name: "Scene",
  active: true,
  locked: false,
  guides: [],
  edges: [],
  constraints: { children: "multiple" },
});

const baseRectangle = (id: string): grida.program.nodes.RectangleNode => ({
  type: "rectangle",
  id,
  name: "Rect",
  active: true,
  locked: false,
  opacity: 1,
  z_index: 0,
  layout_positioning: "absolute",
  layout_inset_left: 0,
  layout_inset_top: 0,
  layout_target_width: 100,
  layout_target_height: 100,
  rotation: 0,
  stroke_width: 0,
  stroke_cap: "butt",
  stroke_join: "miter",
});

const baseTextSpan = (id: string): grida.program.nodes.TextSpanNode => ({
  type: "tspan",
  id,
  name: "Text",
  active: true,
  locked: false,
  opacity: 1,
  z_index: 0,
  layout_positioning: "absolute",
  layout_inset_left: 0,
  layout_inset_top: 0,
  layout_target_width: 100,
  layout_target_height: 50,
  rotation: 0,
  text: null,
  font_size: 14,
  font_weight: 400,
  font_kerning: true,
  text_decoration_line: "none",
  text_align: "left",
  text_align_vertical: "top",
});

const baseContainer = (id: string): grida.program.nodes.ContainerNode => ({
  type: "container",
  id,
  name: "Container",
  active: true,
  locked: false,
  clips_content: false,
  opacity: 1,
  z_index: 0,
  layout_positioning: "absolute",
  layout_inset_left: 0,
  layout_inset_top: 0,
  layout_target_width: 100,
  layout_target_height: 100,
  rotation: 0,
  layout_mode: "flow",
  layout_direction: "horizontal",
  layout_main_axis_alignment: "start",
  layout_cross_axis_alignment: "start",
  layout_main_axis_gap: 0,
  layout_cross_axis_gap: 0,
  layout_padding_top: 0,
  layout_padding_right: 0,
  layout_padding_bottom: 0,
  layout_padding_left: 0,
  stroke_width: 0,
  stroke_cap: "butt",
  stroke_join: "miter",
});

const baseEllipse = (id: string): grida.program.nodes.EllipseNode => ({
  type: "ellipse",
  id,
  name: "Ellipse",
  active: true,
  locked: false,
  opacity: 1,
  z_index: 0,
  layout_positioning: "absolute",
  layout_inset_left: 0,
  layout_inset_top: 0,
  layout_target_width: 100,
  layout_target_height: 100,
  rotation: 0,
  angle_offset: 0,
  angle: 360,
  inner_radius: 0,
  stroke_width: 0,
  stroke_cap: "butt",
  stroke_join: "miter",
});

const baseGroup = (id: string): grida.program.nodes.GroupNode => ({
  type: "group",
  id,
  name: "Group",
  active: true,
  locked: false,
  opacity: 1,
  layout_positioning: "absolute",
  layout_inset_left: 0,
  layout_inset_top: 0,
});

const baseLine = (id: string): grida.program.nodes.LineNode => ({
  type: "line",
  id,
  name: "Line",
  active: true,
  locked: false,
  opacity: 1,
  z_index: 0,
  layout_positioning: "absolute",
  layout_inset_left: 0,
  layout_inset_top: 0,
  layout_target_width: 100,
  layout_target_height: 0,
  rotation: 0,
  stroke_width: 0,
  stroke_cap: "butt",
  stroke_join: "miter",
});

const baseVector = (id: string): grida.program.nodes.VectorNode => ({
  type: "vector",
  id,
  name: "Vector",
  active: true,
  locked: false,
  opacity: 1,
  z_index: 0,
  layout_positioning: "absolute",
  layout_inset_left: 0,
  layout_inset_top: 0,
  layout_target_width: 100,
  layout_target_height: 100,
  rotation: 0,
  corner_radius: 0,
  stroke_width: 0,
  stroke_cap: "butt",
  stroke_join: "miter",
  vector_network: {
    vertices: [],
    segments: [],
  },
});

const baseBoolean = (
  id: string
): grida.program.nodes.BooleanPathOperationNode => ({
  type: "boolean",
  id,
  name: "Boolean",
  active: true,
  locked: false,
  opacity: 1,
  layout_positioning: "absolute",
  layout_inset_left: 0,
  layout_inset_top: 0,
  layout_target_width: 100,
  layout_target_height: 100,
  rotation: 0,
  op: "union",
  corner_radius: 0,
  stroke_width: 0,
  stroke_cap: "butt",
  stroke_join: "miter",
});

const basePolygon = (id: string): grida.program.nodes.RegularPolygonNode => ({
  type: "polygon",
  id,
  name: "Polygon",
  active: true,
  locked: false,
  opacity: 1,
  z_index: 0,
  layout_positioning: "absolute",
  layout_inset_left: 0,
  layout_inset_top: 0,
  layout_target_width: 100,
  layout_target_height: 100,
  rotation: 0,
  point_count: 3,
  corner_radius: 0,
  stroke_width: 0,
  stroke_cap: "butt",
  stroke_join: "miter",
});

const baseStar = (id: string): grida.program.nodes.RegularStarPolygonNode => ({
  type: "star",
  id,
  name: "Star",
  active: true,
  locked: false,
  opacity: 1,
  z_index: 0,
  layout_positioning: "absolute",
  layout_inset_left: 0,
  layout_inset_top: 0,
  layout_target_width: 100,
  layout_target_height: 100,
  rotation: 0,
  point_count: 5,
  inner_radius: 0.5,
  corner_radius: 0,
  stroke_width: 0,
  stroke_cap: "butt",
  stroke_join: "miter",
});

// Helper function to create a document from nodes
function createDocument(
  sceneId: string,
  nodes: Record<string, grida.program.nodes.Node>,
  entrySceneId: string = sceneId
): grida.program.document.Document {
  return {
    nodes: {
      [sceneId]: baseScene(sceneId),
      ...nodes,
    },
    links: { [sceneId]: Object.keys(nodes) },
    scenes_ref: [sceneId],
    entry_scene_id: entrySceneId,
    images: {},
    bitmaps: {},
    properties: {},
  } satisfies grida.program.document.Document;
}

// Helper for SceneNode-only documents
function createSceneDocument(
  sceneId: string,
  scene: grida.program.nodes.SceneNode,
  entrySceneId: string = sceneId
): grida.program.document.Document {
  return {
    nodes: { [sceneId]: scene },
    links: {},
    scenes_ref: [sceneId],
    entry_scene_id: entrySceneId,
    images: {},
    bitmaps: {},
    properties: {},
  } satisfies grida.program.document.Document;
}

// Helper function to run roundtrip test
function roundtripTest<T extends grida.program.nodes.Node>(
  doc: grida.program.document.Document,
  nodeId: string,
  type: T["type"],
  assertions: (node: T) => void
) {
  const bytes = format.document.encode.toFlatbuffer(doc);
  const decoded = format.document.decode.fromFlatbuffer(bytes);
  const node = decoded.nodes[nodeId];
  if (!node || node.type !== type) throw new Error(`Expected ${type} node`);
  assertions(node as T);
}

describe("format roundtrip", () => {
  describe("positioning modes", () => {
    it("roundtrips cartesian positioning (left/top)", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 200,
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (node) => {
          expect(node.layout_positioning).toBe("absolute");
          expect(node.layout_inset_left).toBe(10);
          expect(node.layout_inset_top).toBe(20);
          expect(node.layout_inset_right).toBeUndefined();
          expect(node.layout_inset_bottom).toBeUndefined();
        }
      );
    });

    it("roundtrips inset positioning (right/bottom)", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_inset_left: undefined,
          layout_inset_top: undefined,
          layout_inset_right: 12,
          layout_inset_bottom: 34,
          layout_target_width: 100,
          layout_target_height: 200,
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (node) => {
          expect(node.layout_positioning).toBe("absolute");
          expect(node.layout_inset_right).toBe(12);
          expect(node.layout_inset_bottom).toBe(34);
          expect(node.layout_inset_left).toBeUndefined();
          expect(node.layout_inset_top).toBeUndefined();
        }
      );
    });

    it("roundtrips relative positioning", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_positioning: "relative",
          layout_inset_left: 5,
          layout_inset_top: 10,
          layout_target_width: 50,
          layout_target_height: 50,
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (node) => {
          expect(node.layout_positioning).toBe("relative");
        }
      );
    });
  });

  describe("length types", () => {
    it("roundtrips auto width/height (TextNode supports auto)", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseTextSpan(nodeId),
          layout_target_width: "auto",
          layout_target_height: "auto",
        },
      });
      roundtripTest<grida.program.nodes.TextSpanNode>(
        doc,
        nodeId,
        "tspan",
        (node) => {
          expect(node.layout_target_width).toBe("auto");
          expect(node.layout_target_height).toBe("auto");
        }
      );
    });

    it("roundtrips px width/height", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_target_width: 100,
          layout_target_height: 200,
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (node) => {
          expect(node.layout_target_width).toBe(100);
          expect(node.layout_target_height).toBe(200);
        }
      );
    });

    it("roundtrips percentage width/height (ContainerNode supports percentage)", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseContainer(nodeId),
          layout_target_width: { type: "percentage" as const, value: 50 },
          layout_target_height: { type: "percentage" as const, value: 75 },
        },
      });
      roundtripTest<grida.program.nodes.ContainerNode>(
        doc,
        nodeId,
        "container",
        (node) => {
          expect(node.layout_target_width).toEqual({
            type: "percentage",
            value: 50,
          });
          expect(node.layout_target_height).toEqual({
            type: "percentage",
            value: 75,
          });
        }
      );
    });

    it("explicitly verifies null/unset values remain unset after roundtrip", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseTextSpan(nodeId),
          // All positioning values explicitly undefined (should encode as null)
          layout_inset_left: undefined,
          layout_inset_top: undefined,
          layout_inset_right: undefined,
          layout_inset_bottom: undefined,
          // Dimensions explicitly auto (should encode as null)
          layout_target_width: "auto",
          layout_target_height: "auto",
        },
      });

      // Encode to FlatBuffers
      const bytes = format.document.encode.toFlatbuffer(doc);
      const decoded = format.document.decode.fromFlatbuffer(bytes);

      const node = decoded.nodes[nodeId] as grida.program.nodes.TextSpanNode;
      expect(node).toBeDefined();
      expect(node.type).toBe("tspan");

      // Verify all positioning values remain undefined (null in FlatBuffers -> undefined in TS)
      expect(node.layout_inset_left).toBeUndefined();
      expect(node.layout_inset_top).toBeUndefined();
      expect(node.layout_inset_right).toBeUndefined();
      expect(node.layout_inset_bottom).toBeUndefined();

      // Verify dimensions remain auto (null in FlatBuffers -> "auto" in TS)
      expect(node.layout_target_width).toBe("auto");
      expect(node.layout_target_height).toBe("auto");
    });

    it("explicitly verifies mixed set/unset positioning values", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          // Mix of set and unset values
          layout_inset_left: 10,
          layout_inset_top: undefined,
          layout_inset_right: undefined,
          layout_inset_bottom: 20,
        },
      });

      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (node) => {
          // Set values should remain set
          expect(node.layout_inset_left).toBe(10);
          expect(node.layout_inset_bottom).toBe(20);
          // Unset values should remain undefined
          expect(node.layout_inset_top).toBeUndefined();
          expect(node.layout_inset_right).toBeUndefined();
        }
      );
    });
  });

  describe("node types", () => {
    it("roundtrips SceneNode", () => {
      const sceneId = "0-1";
      const doc = createSceneDocument(sceneId, {
        ...baseScene(sceneId),
        constraints: { children: "single" },
      });
      roundtripTest<grida.program.nodes.SceneNode>(
        doc,
        sceneId,
        "scene",
        (scene) => {
          expect(scene.type).toBe("scene");
          expect(scene.name).toBe("Scene");
          expect(scene.active).toBe(true);
          expect(scene.locked).toBe(false);
          expect(scene.constraints.children).toBe("single");
        }
      );
    });

    it("roundtrips SceneNode with position", () => {
      const sceneId = "0-1";
      const doc = createSceneDocument(sceneId, {
        ...baseScene(sceneId),
        position: "Qd&",
      });
      roundtripTest<grida.program.nodes.SceneNode>(
        doc,
        sceneId,
        "scene",
        (scene) => {
          expect(scene.type).toBe("scene");
          expect(scene.name).toBe("Scene");
          expect(scene.position).toBe("Qd&");
          expect(scene.constraints.children).toBe("multiple");
        }
      );
    });

    it("roundtrips SceneNode with background_color", () => {
      const sceneId = "0-1";
      const doc = createSceneDocument(sceneId, {
        ...baseScene(sceneId),
        background_color: {
          r: 0.5,
          g: 0.75,
          b: 1.0,
          a: 1.0,
        } as cg.RGBA32F,
      });
      roundtripTest<grida.program.nodes.SceneNode>(
        doc,
        sceneId,
        "scene",
        (scene) => {
          expect(scene.type).toBe("scene");
          expect(scene.background_color).toBeDefined();
          if (
            scene.background_color &&
            typeof scene.background_color === "object" &&
            "r" in scene.background_color
          ) {
            expect(scene.background_color.r).toBeCloseTo(0.5);
            expect(scene.background_color.g).toBeCloseTo(0.75);
            expect(scene.background_color.b).toBeCloseTo(1.0);
            expect(scene.background_color.a).toBeCloseTo(1.0);
          } else {
            throw new Error("Expected background_color to be RGBA32F object");
          }
        }
      );
    });

    it("roundtrips SceneNode without background_color", () => {
      const sceneId = "0-1";
      const doc = createSceneDocument(sceneId, baseScene(sceneId));
      roundtripTest<grida.program.nodes.SceneNode>(
        doc,
        sceneId,
        "scene",
        (scene) => {
          expect(scene.type).toBe("scene");
          expect(scene.background_color).toBeUndefined();
        }
      );
    });

    it("roundtrips RectangleNode with layout properties", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 200,
          rotation: 45,
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (node) => {
          expect(node.type).toBe("rectangle");
          expect(node.name).toBe("Rect");
          expect(node.active).toBe(true);
          expect(node.locked).toBe(false);
          expect(node.layout_inset_left).toBe(10);
          expect(node.layout_inset_top).toBe(20);
          expect(node.layout_target_width).toBe(100);
          expect(node.layout_target_height).toBe(200);
          expect(node.rotation).toBe(45);
        }
      );
    });

    it("roundtrips TextNode with layout properties", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseTextSpan(nodeId),
          layout_target_width: 200,
          layout_target_height: 50,
        },
      });
      roundtripTest<grida.program.nodes.TextSpanNode>(
        doc,
        nodeId,
        "tspan",
        (node) => {
          expect(node.type).toBe("tspan");
          expect(node.name).toBe("Text");
          expect(node.active).toBe(true);
          expect(node.locked).toBe(false);
          expect(node.layout_target_width).toBe(200);
          expect(node.layout_target_height).toBe(50);
        }
      );
    });

    it("roundtrips TextNode with letter_spacing, word_spacing, and line_height", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseTextSpan(nodeId),
          text: "Test text",
          layout_target_width: 200,
          layout_target_height: 50,
          letter_spacing: 0.1,
          word_spacing: 0.2,
          line_height: 1.5,
        },
      });
      roundtripTest<grida.program.nodes.TextSpanNode>(
        doc,
        nodeId,
        "tspan",
        (node) => {
          expect(node.type).toBe("tspan");
          expect(node.letter_spacing).toBeCloseTo(0.1, 5);
          expect(node.word_spacing).toBeCloseTo(0.2, 5);
          expect(node.line_height).toBeCloseTo(1.5, 5);
        }
      );
    });

    it("roundtrips TextNode with undefined letter_spacing, word_spacing, and line_height", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseTextSpan(nodeId),
          text: "Test text",
          layout_target_width: 200,
          layout_target_height: 50,
        },
      });
      roundtripTest<grida.program.nodes.TextSpanNode>(
        doc,
        nodeId,
        "tspan",
        (node) => {
          expect(node.type).toBe("tspan");
          expect(node.letter_spacing).toBeUndefined();
          expect(node.word_spacing).toBeUndefined();
          expect(node.line_height).toBeUndefined();
        }
      );
    });

    it("roundtrips ContainerNode with flex properties", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseContainer(nodeId),
          layout_target_width: 400,
          layout_target_height: 300,
          layout_mode: "flex",
          layout_wrap: "wrap",
          layout_main_axis_alignment: "space-evenly",
          layout_cross_axis_alignment: "stretch",
          layout_main_axis_gap: 10,
          layout_cross_axis_gap: 15,
          layout_padding_top: 5,
          layout_padding_right: 10,
          layout_padding_bottom: 15,
          layout_padding_left: 20,
          stroke_width: 1,
          stroke_cap: "square",
          stroke_join: "round",
        },
      });
      roundtripTest<grida.program.nodes.ContainerNode>(
        doc,
        nodeId,
        "container",
        (node) => {
          expect(node.type).toBe("container");
          expect(node.layout_mode).toBe("flex");
          expect(node.layout_direction).toBe("horizontal");
          expect(node.layout_wrap).toBe("wrap");
          expect(node.layout_main_axis_alignment).toBe("space-evenly");
          expect(node.layout_cross_axis_alignment).toBe("stretch");
          expect(node.layout_main_axis_gap).toBe(10);
          expect(node.layout_cross_axis_gap).toBe(15);
          expect(node.layout_padding_top).toBe(5);
          expect(node.layout_padding_right).toBe(10);
          expect(node.layout_padding_bottom).toBe(15);
          expect(node.layout_padding_left).toBe(20);
        }
      );
    });

    it("roundtrips GroupNode with layout properties", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseGroup(nodeId),
          layout_positioning: "relative",
          layout_inset_left: 5,
          layout_inset_top: 10,
        },
      });
      roundtripTest<grida.program.nodes.GroupNode>(
        doc,
        nodeId,
        "group",
        (node) => {
          expect(node.type).toBe("group");
          expect(node.name).toBe("Group");
          expect(node.active).toBe(true);
          expect(node.locked).toBe(false);
          expect(node.layout_positioning).toBe("relative");
        }
      );
    });
  });

  describe("cg.Axis", () => {
    it.each([
      ["horizontal", "horizontal"],
      ["vertical", "vertical"],
    ] as const)("roundtrips direction: %s", (direction, expected) => {
      // Test encode/decode 1:1
      const encoded = format.layout.encode.axis(direction satisfies cg.Axis);
      const decoded = format.layout.decode.axis(encoded);
      expect(decoded).toBe(expected);
    });
  });

  describe("cg.MainAxisAlignment", () => {
    it.each([
      ["start", "start"],
      ["end", "end"],
      ["center", "center"],
      ["space-between", "space-between"],
      ["space-around", "space-around"],
      ["space-evenly", "space-evenly"],
      ["stretch", "stretch"],
    ] as const)(
      "roundtrips layout_main_axis_alignment: %s",
      (alignment, expected) => {
        // Test encode/decode 1:1
        const encoded = format.layout.encode.mainAxisAlignment(
          alignment satisfies cg.MainAxisAlignment
        );
        const decoded = format.layout.decode.mainAxisAlignment(encoded);
        expect(decoded).toBe(expected);
      }
    );
  });

  describe("cg.CrossAxisAlignment", () => {
    it.each([
      ["start", "start"],
      ["end", "end"],
      ["center", "center"],
      ["stretch", "stretch"],
    ] as const)(
      "roundtrips layout_cross_axis_alignment: %s",
      (alignment, expected) => {
        // Test encode/decode 1:1
        const encoded = format.layout.encode.crossAxisAlignment(
          alignment satisfies cg.CrossAxisAlignment
        );
        const decoded = format.layout.decode.crossAxisAlignment(encoded);
        expect(decoded).toBe(expected);
      }
    );
  });

  describe("cg.StrokeCap", () => {
    it.each([
      ["butt", "butt"],
      ["round", "round"],
      ["square", "square"],
    ] as const)("roundtrips stroke_cap: %s", (cap, expected) => {
      // Test encode/decode 1:1
      const encoded = format.styling.encode.strokeCap(
        cap satisfies cg.StrokeCap
      );
      const decoded = format.styling.decode.strokeCap(encoded);
      expect(decoded).toBe(expected);
    });
  });

  describe("cg.StrokeJoin", () => {
    it.each([
      ["miter", "miter"],
      ["round", "round"],
      ["bevel", "bevel"],
    ] as const)("roundtrips stroke_join: %s", (join, expected) => {
      // Test encode/decode 1:1
      const encoded = format.styling.encode.strokeJoin(
        join satisfies cg.StrokeJoin
      );
      const decoded = format.styling.decode.strokeJoin(encoded);
      expect(decoded).toBe(expected);
    });
  });

  describe("cg.BoxFit", () => {
    // TODO: Enable when ImageNodeProperties decoding is implemented
    // Currently fit is hardcoded to "cover" in decode
    it.skip.each([
      ["contain", "contain"],
      ["cover", "cover"],
      ["fill", "fill"],
      ["none", "none"],
    ] as const)("roundtrips fit: %s", (fit, expected) => {
      const sceneId = "0-1";
      const nodeId = "0-2";

      const doc = {
        nodes: {
          [sceneId]: {
            type: "scene",
            id: sceneId,
            name: "Scene",
            active: true,
            locked: false,
            guides: [],
            edges: [],
            constraints: { children: "multiple" },
          },
          [nodeId]: {
            type: "image",
            id: nodeId,
            name: "Image",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 0,
            layout_inset_top: 0,
            layout_target_width: 100,
            layout_target_height: 100,
            rotation: 0,
            fit,
          } satisfies grida.program.nodes.ImageNode,
        },
        links: { [sceneId]: [nodeId] },
        scenes_ref: [sceneId],
        entry_scene_id: sceneId,
        images: {},
        bitmaps: {},
        properties: {},
      } satisfies grida.program.document.Document;

      const bytes = format.document.encode.toFlatbuffer(doc);
      const decoded = format.document.decode.fromFlatbuffer(bytes);
      const node = decoded.nodes[nodeId];
      if (!node || node.type !== "image")
        throw new Error("Expected image node");
      node satisfies grida.program.nodes.ImageNode;

      expect(node.fit).toBe(expected);
    });
  });

  describe("cg.TextAlign", () => {
    it.each([
      ["left", "left"],
      ["right", "right"],
      ["center", "center"],
      ["justify", "justify"],
    ] as const)("roundtrips text_align: %s", (align, expected) => {
      // Test encode/decode 1:1
      const encoded = format.styling.encode.textAlign(
        align satisfies cg.TextAlign
      );
      const decoded = format.styling.decode.textAlign(encoded);
      expect(decoded).toBe(expected);
    });
  });

  describe("cg.TextAlignVertical", () => {
    it.each([
      ["top", "top"],
      ["center", "center"],
      ["bottom", "bottom"],
    ] as const)("roundtrips text_align_vertical: %s", (align, expected) => {
      // Test encode/decode 1:1
      const encoded = format.styling.encode.textAlignVertical(
        align satisfies cg.TextAlignVertical
      );
      const decoded = format.styling.decode.textAlignVertical(encoded);
      expect(decoded).toBe(expected);
    });
  });

  describe("cg.TextDecorationLine", () => {
    it.each([
      ["none", "none"],
      ["underline", "underline"],
      ["overline", "overline"],
      ["line-through", "line-through"],
    ] as const)(
      "roundtrips text_decoration_line: %s",
      (decoration, expected) => {
        // Test encode/decode 1:1
        const encoded = format.styling.encode.textDecorationLine(
          decoration satisfies cg.TextDecorationLine
        );
        const decoded = format.styling.decode.textDecorationLine(encoded);
        expect(decoded).toBe(expected);
      }
    );
  });

  describe("rotation", () => {
    it("roundtrips rotation values", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          rotation: 45.5,
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (node) => {
          expect(node.rotation).toBeCloseTo(45.5, 5);
        }
      );
    });
  });

  describe("layout wrap", () => {
    it.each([
      ["wrap", "wrap"],
      ["nowrap", "nowrap"],
      [undefined, undefined],
    ] as const)("roundtrips layout_wrap: %s", (wrap, expected) => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseContainer(nodeId),
          layout_mode: "flex",
          layout_wrap: wrap satisfies "wrap" | "nowrap" | undefined,
        },
      });
      roundtripTest<grida.program.nodes.ContainerNode>(
        doc,
        nodeId,
        "container",
        (node) => {
          expect(node.layout_wrap).toBe(expected);
        }
      );
    });
  });

  describe("comprehensive integration", () => {
    it("roundtrips complex document with multiple node types and properties", () => {
      const sceneId = "0-1";
      const rectId = "0-2";
      const textId = "0-3";
      const containerId = "0-4";
      const groupId = "0-5";

      const doc = createDocument(sceneId, {
        [rectId]: {
          ...baseRectangle(rectId),
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 200,
          rotation: 30,
        },
        [textId]: {
          ...baseTextSpan(textId),
          layout_positioning: "absolute",
          layout_inset_right: 12,
          layout_inset_bottom: 34,
          layout_target_width: "auto",
          layout_target_height: "auto",
          rotation: 5,
          text: null,
        },
        [containerId]: {
          ...baseContainer(containerId),
          layout_inset_left: 1,
          layout_inset_top: 2,
          layout_target_width: { type: "percentage" as const, value: 50 },
          layout_target_height: 100,
          layout_mode: "flex",
          layout_direction: "vertical",
          layout_wrap: "nowrap",
          layout_main_axis_alignment: "space-between",
          layout_cross_axis_alignment: "center",
          layout_main_axis_gap: 11,
          layout_cross_axis_gap: 22,
          layout_padding_top: 3,
          layout_padding_right: 4,
          layout_padding_bottom: 5,
          layout_padding_left: 6,
        },
        [groupId]: {
          ...baseGroup(groupId),
          opacity: 0.9,
          layout_positioning: "relative",
          layout_inset_left: 5,
          layout_inset_top: 10,
        },
      });

      const bytes = format.document.encode.toFlatbuffer(doc);
      const decoded = format.document.decode.fromFlatbuffer(bytes);

      expect(decoded.nodes[rectId]?.type).toBe("rectangle");
      expect(decoded.nodes[textId]?.type).toBe("tspan");
      expect(decoded.nodes[containerId]?.type).toBe("container");
      expect(decoded.nodes[groupId]?.type).toBe("group");
      expect(decoded.links[sceneId]).toEqual([
        rectId,
        textId,
        containerId,
        groupId,
      ]);
      expect(decoded.scenes_ref).toEqual([sceneId]);
      expect(decoded.entry_scene_id).toBeUndefined();
    });
  });

  describe("opacity", () => {
    it.each([
      [0.0, 0.0],
      [0.5, 0.5],
      [1.0, 1.0],
      [0.75, 0.75],
    ] as const)("roundtrips opacity: %s", (opacity, expected) => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          opacity,
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (node) => {
          expect(node.opacity).toBeCloseTo(expected, 5);
        }
      );
    });

    it("roundtrips opacity for TextNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseTextSpan(nodeId),
          opacity: 0.8,
          text: "Test",
        },
      });
      roundtripTest<grida.program.nodes.TextSpanNode>(
        doc,
        nodeId,
        "tspan",
        (node) => {
          expect(node.opacity).toBeCloseTo(0.8, 5);
        }
      );
    });

    it("roundtrips max_lines for TextSpanNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseTextSpan(nodeId),
          text: "This is a long text that should be truncated",
          max_lines: 3,
        },
      });
      roundtripTest<grida.program.nodes.TextSpanNode>(
        doc,
        nodeId,
        "tspan",
        (node) => {
          expect(node.max_lines).toBe(3);
        }
      );
    });

    it("roundtrips TextSpanNode without max_lines (undefined)", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseTextSpan(nodeId),
          text: "This is a long text",
        },
      });
      roundtripTest<grida.program.nodes.TextSpanNode>(
        doc,
        nodeId,
        "tspan",
        (node) => {
          expect(node.max_lines).toBeUndefined();
        }
      );
    });
  });

  describe("text font properties", () => {
    it("roundtrips font_size", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseTextSpan(nodeId),
          text: "Test",
          font_size: 24,
        },
      });
      roundtripTest<grida.program.nodes.TextSpanNode>(
        doc,
        nodeId,
        "tspan",
        (node) => {
          expect(node.font_size).toBe(24);
        }
      );
    });

    it("roundtrips font_weight", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseTextSpan(nodeId),
          text: "Test",
          font_weight: 700,
        },
      });
      roundtripTest<grida.program.nodes.TextSpanNode>(
        doc,
        nodeId,
        "tspan",
        (node) => {
          expect(node.font_weight).toBe(700);
        }
      );
    });

    it("roundtrips font_kerning", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseTextSpan(nodeId),
          text: "Test",
          font_kerning: false,
        },
      });
      roundtripTest<grida.program.nodes.TextSpanNode>(
        doc,
        nodeId,
        "tspan",
        (node) => {
          expect(node.font_kerning).toBe(false);
        }
      );
    });

    it("roundtrips all font properties together", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseTextSpan(nodeId),
          text: "Test",
          font_size: 18,
          font_weight: 600,
          font_kerning: false,
        },
      });
      roundtripTest<grida.program.nodes.TextSpanNode>(
        doc,
        nodeId,
        "tspan",
        (node) => {
          expect(node.font_size).toBe(18);
          expect(node.font_weight).toBe(600);
          expect(node.font_kerning).toBe(false);
        }
      );
    });
  });

  describe("additional node types", () => {
    it("roundtrips EllipseNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseEllipse(nodeId),
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 80,
          stroke_width: 2,
          stroke_cap: "round",
          stroke_join: "round",
        },
      });
      roundtripTest<grida.program.nodes.EllipseNode>(
        doc,
        nodeId,
        "ellipse",
        (node) => {
          expect(node.type).toBe("ellipse");
          expect(node.name).toBe("Ellipse");
          expect(node.layout_target_width).toBe(100);
          expect(node.layout_target_height).toBe(80);
          expect(node.angle_offset).toBe(0);
          expect(node.angle).toBe(360);
          expect(node.inner_radius).toBe(0);
          expect(node.stroke_width).toBe(2);
          expect(node.stroke_cap).toBe("round");
          expect(node.stroke_join).toBe("round");
        }
      );
    });

    it("roundtrips EllipseNode with arc data (non-default values)", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseEllipse(nodeId),
          name: "Ellipse Arc",
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 80,
          angle_offset: 45,
          angle: 180,
          inner_radius: 0.5,
          stroke_width: 2,
          stroke_cap: "round",
          stroke_join: "round",
        },
      });
      roundtripTest<grida.program.nodes.EllipseNode>(
        doc,
        nodeId,
        "ellipse",
        (node) => {
          expect(node.type).toBe("ellipse");
          expect(node.name).toBe("Ellipse Arc");
          expect(node.layout_target_width).toBe(100);
          expect(node.layout_target_height).toBe(80);
          expect(node.angle_offset).toBe(45);
          expect(node.angle).toBe(180);
          expect(node.inner_radius).toBe(0.5);
          expect(node.stroke_width).toBe(2);
          expect(node.stroke_cap).toBe("round");
          expect(node.stroke_join).toBe("round");
        }
      );
    });

    it("roundtrips EllipseNode with angle=0 (explicit zero)", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseEllipse(nodeId),
          name: "Ellipse Zero",
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 80,
          angle: 0,
          stroke_width: 2,
          stroke_cap: "round",
          stroke_join: "round",
        },
      });
      roundtripTest<grida.program.nodes.EllipseNode>(
        doc,
        nodeId,
        "ellipse",
        (node) => {
          expect(node.type).toBe("ellipse");
          expect(node.name).toBe("Ellipse Zero");
          expect(node.angle).toBe(0);
          expect(node.angle_offset).toBe(0);
          expect(node.inner_radius).toBe(0);
        }
      );
    });

    it("roundtrips LineNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseLine(nodeId),
          layout_target_width: 200,
          rotation: 45,
          stroke_width: 3,
          stroke_cap: "square",
          stroke_join: "miter",
        },
      });
      roundtripTest<grida.program.nodes.LineNode>(
        doc,
        nodeId,
        "line",
        (node) => {
          expect(node.type).toBe("line");
          expect(node.name).toBe("Line");
          expect(node.layout_target_width).toBe(200);
          expect(node.layout_target_height).toBe(0);
          expect(node.rotation).toBe(45);
          expect(node.stroke_width).toBe(3);
          expect(node.stroke_cap).toBe("square");
          expect(node.stroke_join).toBe("miter");
        }
      );
    });

    it("roundtrips VectorNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseVector(nodeId),
          layout_target_width: 150,
          layout_target_height: 150,
          corner_radius: 5,
          stroke_width: 1,
          vector_network: {
            vertices: [
              [0, 0],
              [100, 0],
              [100, 100],
              [0, 100],
            ],
            segments: [
              { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
              { a: 1, b: 2, ta: [0, 0], tb: [0, 0] },
              { a: 2, b: 3, ta: [0, 0], tb: [0, 0] },
              { a: 3, b: 0, ta: [0, 0], tb: [0, 0] },
            ],
          },
        },
      });
      roundtripTest<grida.program.nodes.VectorNode>(
        doc,
        nodeId,
        "vector",
        (node) => {
          expect(node.type).toBe("vector");
          expect(node.name).toBe("Vector");
          expect(node.layout_target_width).toBe(150);
          expect(node.layout_target_height).toBe(150);
          expect(node.corner_radius).toBe(5);
          expect(node.stroke_width).toBe(1);
          expect(node.vector_network.vertices).toHaveLength(4);
          expect(node.vector_network.vertices[0]).toEqual([0, 0]);
          expect(node.vector_network.vertices[1]).toEqual([100, 0]);
          expect(node.vector_network.vertices[2]).toEqual([100, 100]);
          expect(node.vector_network.vertices[3]).toEqual([0, 100]);
          expect(node.vector_network.segments).toHaveLength(4);
          expect(node.vector_network.segments[0]).toEqual({
            a: 0,
            b: 1,
            ta: [0, 0],
            tb: [0, 0],
          });
          expect(node.vector_network.segments[1]).toEqual({
            a: 1,
            b: 2,
            ta: [0, 0],
            tb: [0, 0],
          });
        }
      );
    });

    it("roundtrips BooleanPathOperationNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseBoolean(nodeId),
          op: "difference",
          stroke_width: 2,
          stroke_cap: "round",
          stroke_join: "bevel",
        },
      });
      roundtripTest<grida.program.nodes.BooleanPathOperationNode>(
        doc,
        nodeId,
        "boolean",
        (node) => {
          expect(node.type).toBe("boolean");
          expect(node.name).toBe("Boolean");
          expect(node.op).toBe("difference");
          expect(node.stroke_width).toBe(2);
          expect(node.stroke_cap).toBe("round");
          expect(node.stroke_join).toBe("bevel");
        }
      );
    });

    it("roundtrips RegularPolygonNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...basePolygon(nodeId),
          point_count: 6,
          corner_radius: 2,
          stroke_width: 1,
        },
      });
      roundtripTest<grida.program.nodes.RegularPolygonNode>(
        doc,
        nodeId,
        "polygon",
        (node) => {
          expect(node.type).toBe("polygon");
          expect(node.name).toBe("Polygon");
          expect(node.layout_target_width).toBe(100);
          expect(node.layout_target_height).toBe(100);
          expect(node.point_count).toBe(6);
          expect(node.corner_radius).toBe(2);
          expect(node.stroke_width).toBe(1);
        }
      );
    });

    it("roundtrips RegularStarPolygonNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseStar(nodeId),
          layout_target_width: 120,
          layout_target_height: 120,
          inner_radius: 0.4,
          corner_radius: 1,
          stroke_width: 2,
          stroke_cap: "round",
          stroke_join: "round",
        },
      });
      roundtripTest<grida.program.nodes.RegularStarPolygonNode>(
        doc,
        nodeId,
        "star",
        (node) => {
          expect(node.type).toBe("star");
          expect(node.name).toBe("Star");
          expect(node.layout_target_width).toBe(120);
          expect(node.layout_target_height).toBe(120);
          expect(node.point_count).toBe(5);
          expect(node.inner_radius).toBeCloseTo(0.4, 5);
          expect(node.corner_radius).toBe(1);
          expect(node.stroke_width).toBe(2);
        }
      );
    });
  });

  describe("fill_paints", () => {
    it("roundtrips SolidPaint fill_paints on RectangleNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 200,
          fill_paints: [
            {
              type: "solid",
              color: { r: 0, g: 0, b: 0, a: 1 } as cg.RGBA32F,
              blend_mode: "normal",
              active: true,
            } satisfies cg.SolidPaint,
          ],
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (rectNode) => {
          expect(rectNode.type).toBe("rectangle");
          expect(rectNode.fill_paints).toBeDefined();
          expect(rectNode.fill_paints?.length).toBe(1);
          const paint = rectNode.fill_paints?.[0];
          expect(paint?.type).toBe("solid");
          if (paint && paint.type === "solid") {
            expect(paint.color.r).toBe(0);
            expect(paint.color.g).toBe(0);
            expect(paint.color.b).toBe(0);
            expect(paint.color.a).toBe(1);
            expect(paint.blend_mode).toBe("normal");
            expect(paint.active).toBe(true);
          }
        }
      );
    });

    it("roundtrips LinearGradientPaint fill_paints on RectangleNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 200,
          fill_paints: [
            {
              type: "linear_gradient",
              transform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              stops: [
                { offset: 0, color: { r: 0, g: 0, b: 0, a: 1 } as cg.RGBA32F },
                { offset: 1, color: { r: 1, g: 1, b: 1, a: 1 } as cg.RGBA32F },
              ],
              blend_mode: "normal",
              opacity: 1,
              active: true,
            },
          ],
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (rectNode) => {
          expect(rectNode.type).toBe("rectangle");
          expect(rectNode.fill_paints).toBeDefined();
          expect(rectNode.fill_paints?.length).toBe(1);
          const paint = rectNode.fill_paints?.[0];
          expect(paint?.type).toBe("linear_gradient");
          if (paint && paint.type === "linear_gradient") {
            expect(paint.stops.length).toBe(2);
            expect(paint.stops[0]?.offset).toBe(0);
            expect(paint.stops[1]?.offset).toBe(1);
            expect(paint.blend_mode).toBe("normal");
            expect(paint.opacity).toBe(1);
            expect(paint.active).toBe(true);
          }
        }
      );
    });

    it("roundtrips RadialGradientPaint fill_paints on RectangleNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 200,
          fill_paints: [
            {
              type: "radial_gradient",
              transform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              stops: [
                { offset: 0, color: { r: 1, g: 0, b: 0, a: 1 } as cg.RGBA32F },
                {
                  offset: 0.5,
                  color: { r: 0, g: 1, b: 0, a: 1 } as cg.RGBA32F,
                },
                { offset: 1, color: { r: 0, g: 0, b: 1, a: 1 } as cg.RGBA32F },
              ],
              blend_mode: "multiply",
              opacity: 0.8,
              active: true,
            } satisfies cg.RadialGradientPaint,
          ],
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (rectNode) => {
          expect(rectNode.type).toBe("rectangle");
          expect(rectNode.fill_paints).toBeDefined();
          expect(rectNode.fill_paints?.length).toBe(1);
          const paint = rectNode.fill_paints?.[0];
          expect(paint?.type).toBe("radial_gradient");
          if (paint && paint.type === "radial_gradient") {
            expect(paint.stops.length).toBe(3);
            expect(paint.stops[0]?.offset).toBe(0);
            expect(paint.stops[1]?.offset).toBe(0.5);
            expect(paint.stops[2]?.offset).toBe(1);
            expect(paint.stops[0]?.color.r).toBe(1);
            expect(paint.stops[1]?.color.g).toBe(1);
            expect(paint.stops[2]?.color.b).toBe(1);
            expect(paint.blend_mode).toBe("multiply");
            expect(paint.opacity).toBeCloseTo(0.8);
            expect(paint.active).toBe(true);
          }
        }
      );
    });

    it("roundtrips SweepGradientPaint fill_paints on RectangleNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 200,
          fill_paints: [
            {
              type: "sweep_gradient",
              transform: [
                [0.5, 0, 50],
                [0, 0.5, 50],
              ],
              stops: [
                { offset: 0, color: { r: 1, g: 0, b: 0, a: 1 } as cg.RGBA32F },
                { offset: 1, color: { r: 0, g: 0, b: 1, a: 1 } as cg.RGBA32F },
              ],
              blend_mode: "screen",
              opacity: 0.9,
              active: true,
            } satisfies cg.SweepGradientPaint,
          ],
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (rectNode) => {
          expect(rectNode.type).toBe("rectangle");
          expect(rectNode.fill_paints).toBeDefined();
          expect(rectNode.fill_paints?.length).toBe(1);
          const paint = rectNode.fill_paints?.[0];
          expect(paint?.type).toBe("sweep_gradient");
          if (paint && paint.type === "sweep_gradient") {
            expect(paint.stops.length).toBe(2);
            expect(paint.stops[0]?.offset).toBe(0);
            expect(paint.stops[1]?.offset).toBe(1);
            expect(paint.stops[0]?.color.r).toBe(1);
            expect(paint.stops[1]?.color.b).toBe(1);
            expect(paint.blend_mode).toBe("screen");
            expect(paint.opacity).toBeCloseTo(0.9);
            expect(paint.active).toBe(true);
          }
        }
      );
    });

    it("roundtrips DiamondGradientPaint fill_paints on RectangleNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 200,
          fill_paints: [
            {
              type: "diamond_gradient",
              transform: [
                [1, 0.5, 0],
                [0.5, 1, 0],
              ],
              stops: [
                { offset: 0, color: { r: 1, g: 1, b: 0, a: 1 } as cg.RGBA32F },
                {
                  offset: 0.5,
                  color: { r: 0, g: 1, b: 1, a: 1 } as cg.RGBA32F,
                },
                { offset: 1, color: { r: 1, g: 0, b: 1, a: 1 } as cg.RGBA32F },
              ],
              blend_mode: "overlay",
              opacity: 0.75,
              active: true,
            } satisfies cg.DiamondGradientPaint,
          ],
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (rectNode) => {
          expect(rectNode.type).toBe("rectangle");
          expect(rectNode.fill_paints).toBeDefined();
          expect(rectNode.fill_paints?.length).toBe(1);
          const paint = rectNode.fill_paints?.[0];
          expect(paint?.type).toBe("diamond_gradient");
          if (paint && paint.type === "diamond_gradient") {
            expect(paint.stops.length).toBe(3);
            expect(paint.stops[0]?.offset).toBe(0);
            expect(paint.stops[1]?.offset).toBe(0.5);
            expect(paint.stops[2]?.offset).toBe(1);
            expect(paint.stops[0]?.color.r).toBe(1);
            expect(paint.stops[0]?.color.g).toBe(1);
            expect(paint.stops[1]?.color.g).toBe(1);
            expect(paint.stops[1]?.color.b).toBe(1);
            expect(paint.stops[2]?.color.r).toBe(1);
            expect(paint.stops[2]?.color.b).toBe(1);
            expect(paint.blend_mode).toBe("overlay");
            expect(paint.opacity).toBeCloseTo(0.75);
            expect(paint.active).toBe(true);
          }
        }
      );
    });

    it("roundtrips empty fill_paints (undefined) on RectangleNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 200,
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (rectNode) => {
          expect(rectNode.type).toBe("rectangle");
          expect(rectNode.fill_paints).toBeUndefined();
        }
      );
    });
  });

  describe("rectangular stroke width", () => {
    it("roundtrips RectangleNode with rectangular_stroke_width fields", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_target_width: 100,
          layout_target_height: 200,
          stroke_width: 2,
          rectangular_stroke_width_top: 4,
          rectangular_stroke_width_right: 6,
          rectangular_stroke_width_bottom: 8,
          rectangular_stroke_width_left: 10,
          stroke_cap: "round",
          stroke_join: "round",
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (rectNode) => {
          expect(rectNode.type).toBe("rectangle");
          expect(rectNode.rectangular_stroke_width_top).toBe(4);
          expect(rectNode.rectangular_stroke_width_right).toBe(6);
          expect(rectNode.rectangular_stroke_width_bottom).toBe(8);
          expect(rectNode.rectangular_stroke_width_left).toBe(10);
        }
      );
    });

    it("roundtrips RectangleNode with only stroke_width (fallback to rectangular)", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_target_width: 100,
          layout_target_height: 200,
          stroke_width: 5,
          stroke_cap: "round",
          stroke_join: "round",
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (rectNode) => {
          expect(rectNode.type).toBe("rectangle");
          expect(rectNode.rectangular_stroke_width_top).toBe(5);
          expect(rectNode.rectangular_stroke_width_right).toBe(5);
          expect(rectNode.rectangular_stroke_width_bottom).toBe(5);
          expect(rectNode.rectangular_stroke_width_left).toBe(5);
        }
      );
    });

    it("roundtrips ContainerNode with rectangular_stroke_width fields", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseContainer(nodeId),
          layout_target_width: 100,
          layout_target_height: 200,
          stroke_width: 3,
          rectangular_stroke_width_top: 5,
          rectangular_stroke_width_right: 7,
          rectangular_stroke_width_bottom: 9,
          rectangular_stroke_width_left: 11,
          stroke_cap: "round",
          stroke_join: "round",
        },
      });
      roundtripTest<grida.program.nodes.ContainerNode>(
        doc,
        nodeId,
        "container",
        (containerNode) => {
          expect(containerNode.type).toBe("container");
          expect(containerNode.rectangular_stroke_width_top).toBe(5);
          expect(containerNode.rectangular_stroke_width_right).toBe(7);
          expect(containerNode.rectangular_stroke_width_bottom).toBe(9);
          expect(containerNode.rectangular_stroke_width_left).toBe(11);
        }
      );
    });
  });

  describe("ImagePaint with fill_paints", () => {
    it("roundtrips ImagePaint fill_paints on ContainerNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseContainer(nodeId),
          fill_paints: [
            {
              type: "image",
              src: "https://example.com/image.png",
              fit: "cover",
              blend_mode: "normal",
              opacity: 1,
              active: true,
              filters: {
                exposure: 0.5,
                contrast: 0.3,
                saturation: 0.2,
                temperature: 0.1,
                tint: 0.0,
                highlights: 0.0,
                shadows: 0.0,
              },
            } satisfies cg.ImagePaint,
          ],
        },
      });
      roundtripTest<grida.program.nodes.ContainerNode>(
        doc,
        nodeId,
        "container",
        (containerNode) => {
          expect(containerNode.type).toBe("container");
          expect(containerNode.fill_paints).toBeDefined();
          expect(containerNode.fill_paints?.length).toBe(1);
          const paint = containerNode.fill_paints?.[0];
          expect(paint?.type).toBe("image");
          if (paint && paint.type === "image") {
            expect(paint.fit).toBe("cover");
            expect(paint.blend_mode).toBe("normal");
            expect(paint.opacity).toBe(1);
            expect(paint.active).toBe(true);
            expect(paint.filters).toBeDefined();
            expect(paint.filters?.exposure).toBeCloseTo(0.5);
            expect(paint.filters?.contrast).toBeCloseTo(0.3);
            expect(paint.filters?.saturation).toBeCloseTo(0.2);
            expect(paint.filters?.temperature).toBeCloseTo(0.1);
          }
        }
      );
    });
  });

  describe("stroke_paints", () => {
    it("roundtrips SolidPaint stroke_paints on RectangleNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 200,
          stroke_width: 2,
          stroke_paints: [
            {
              type: "solid",
              color: { r: 1, g: 0, b: 0, a: 1 } as cg.RGBA32F,
              blend_mode: "normal",
              active: true,
            } satisfies cg.SolidPaint,
          ],
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (rectNode) => {
          expect(rectNode.type).toBe("rectangle");
          expect(rectNode.stroke_paints).toBeDefined();
          expect(rectNode.stroke_paints?.length).toBe(1);
          const paint = rectNode.stroke_paints?.[0];
          expect(paint?.type).toBe("solid");
          if (paint && paint.type === "solid") {
            expect(paint.color.r).toBe(1);
            expect(paint.color.g).toBe(0);
            expect(paint.color.b).toBe(0);
            expect(paint.color.a).toBe(1);
            expect(paint.blend_mode).toBe("normal");
            expect(paint.active).toBe(true);
          }
        }
      );
    });

    it("roundtrips LinearGradientPaint stroke_paints on RectangleNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_inset_left: 10,
          layout_inset_top: 20,
          layout_target_width: 100,
          layout_target_height: 200,
          stroke_width: 3,
          stroke_cap: "round",
          stroke_join: "round",
          stroke_paints: [
            {
              type: "linear_gradient",
              transform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              stops: [
                { offset: 0, color: { r: 0, g: 1, b: 0, a: 1 } as cg.RGBA32F },
                { offset: 1, color: { r: 0, g: 0, b: 1, a: 1 } as cg.RGBA32F },
              ],
              blend_mode: "normal",
              opacity: 1,
              active: true,
            } satisfies cg.LinearGradientPaint,
          ],
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (rectNode) => {
          expect(rectNode.type).toBe("rectangle");
          expect(rectNode.stroke_paints).toBeDefined();
          expect(rectNode.stroke_paints?.length).toBe(1);
          const paint = rectNode.stroke_paints?.[0];
          expect(paint?.type).toBe("linear_gradient");
          if (paint && paint.type === "linear_gradient") {
            expect(paint.stops.length).toBe(2);
            expect(paint.stops[0]?.offset).toBe(0);
            expect(paint.stops[1]?.offset).toBe(1);
            expect(paint.stops[0]?.color.g).toBe(1);
            expect(paint.stops[1]?.color.b).toBe(1);
            expect(paint.blend_mode).toBe("normal");
            expect(paint.opacity).toBe(1);
            expect(paint.active).toBe(true);
          }
        }
      );
    });

    it("roundtrips RadialGradientPaint stroke_paints on EllipseNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseEllipse(nodeId),
          layout_target_width: 100,
          layout_target_height: 100,
          angle: 0,
          stroke_width: 4,
          stroke_cap: "round",
          stroke_join: "round",
          stroke_paints: [
            {
              type: "radial_gradient",
              transform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              stops: [
                { offset: 0, color: { r: 1, g: 0, b: 0, a: 1 } as cg.RGBA32F },
                { offset: 1, color: { r: 0, g: 0, b: 1, a: 1 } as cg.RGBA32F },
              ],
              blend_mode: "multiply",
              opacity: 0.8,
              active: true,
            } satisfies cg.RadialGradientPaint,
          ],
        },
      });
      roundtripTest<grida.program.nodes.EllipseNode>(
        doc,
        nodeId,
        "ellipse",
        (ellipseNode) => {
          expect(ellipseNode.type).toBe("ellipse");
          expect(ellipseNode.stroke_paints).toBeDefined();
          expect(ellipseNode.stroke_paints?.length).toBe(1);
          const paint = ellipseNode.stroke_paints?.[0];
          expect(paint?.type).toBe("radial_gradient");
          if (paint && paint.type === "radial_gradient") {
            expect(paint.stops.length).toBe(2);
            expect(paint.stops[0]?.offset).toBe(0);
            expect(paint.stops[1]?.offset).toBe(1);
            expect(paint.stops[0]?.color.r).toBe(1);
            expect(paint.stops[1]?.color.b).toBe(1);
            expect(paint.blend_mode).toBe("multiply");
            expect(paint.opacity).toBeCloseTo(0.8);
            expect(paint.active).toBe(true);
          }
        }
      );
    });

    it("roundtrips SweepGradientPaint stroke_paints on VectorNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseVector(nodeId),
          stroke_width: 2,
          vector_network: {
            vertices: [
              [0, 0],
              [100, 0],
              [100, 100],
              [0, 100],
            ],
            segments: [
              { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
              { a: 1, b: 2, ta: [0, 0], tb: [0, 0] },
              { a: 2, b: 3, ta: [0, 0], tb: [0, 0] },
              { a: 3, b: 0, ta: [0, 0], tb: [0, 0] },
            ],
          },
          stroke_paints: [
            {
              type: "sweep_gradient",
              transform: [
                [0.5, 0, 50],
                [0, 0.5, 50],
              ],
              stops: [
                { offset: 0, color: { r: 1, g: 0, b: 0, a: 1 } as cg.RGBA32F },
                { offset: 1, color: { r: 0, g: 1, b: 0, a: 1 } as cg.RGBA32F },
              ],
              blend_mode: "screen",
              opacity: 0.9,
              active: true,
            } satisfies cg.SweepGradientPaint,
          ],
        },
      });
      roundtripTest<grida.program.nodes.VectorNode>(
        doc,
        nodeId,
        "vector",
        (vectorNode) => {
          expect(vectorNode.type).toBe("vector");
          expect(vectorNode.stroke_paints).toBeDefined();
          expect(vectorNode.stroke_paints?.length).toBe(1);
          const paint = vectorNode.stroke_paints?.[0];
          expect(paint?.type).toBe("sweep_gradient");
          if (paint && paint.type === "sweep_gradient") {
            expect(paint.stops.length).toBe(2);
            expect(paint.stops[0]?.offset).toBe(0);
            expect(paint.stops[1]?.offset).toBe(1);
            expect(paint.stops[0]?.color.r).toBe(1);
            expect(paint.stops[1]?.color.g).toBe(1);
            expect(paint.blend_mode).toBe("screen");
            expect(paint.opacity).toBeCloseTo(0.9);
            expect(paint.active).toBe(true);
          }
        }
      );
    });

    it("roundtrips DiamondGradientPaint stroke_paints on BooleanOperationNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseBoolean(nodeId),
          stroke_width: 3,
          stroke_cap: "square",
          stroke_join: "bevel",
          stroke_paints: [
            {
              type: "diamond_gradient",
              transform: [
                [1, 0.5, 0],
                [0.5, 1, 0],
              ],
              stops: [
                { offset: 0, color: { r: 1, g: 1, b: 0, a: 1 } as cg.RGBA32F },
                { offset: 1, color: { r: 1, g: 0, b: 1, a: 1 } as cg.RGBA32F },
              ],
              blend_mode: "overlay",
              opacity: 0.75,
              active: true,
            } satisfies cg.DiamondGradientPaint,
          ],
        },
      });
      roundtripTest<grida.program.nodes.BooleanPathOperationNode>(
        doc,
        nodeId,
        "boolean",
        (boolNode) => {
          expect(boolNode.type).toBe("boolean");
          expect(boolNode.stroke_paints).toBeDefined();
          expect(boolNode.stroke_paints?.length).toBe(1);
          const paint = boolNode.stroke_paints?.[0];
          expect(paint?.type).toBe("diamond_gradient");
          if (paint && paint.type === "diamond_gradient") {
            expect(paint.stops.length).toBe(2);
            expect(paint.stops[0]?.offset).toBe(0);
            expect(paint.stops[1]?.offset).toBe(1);
            expect(paint.stops[0]?.color.r).toBe(1);
            expect(paint.stops[0]?.color.g).toBe(1);
            expect(paint.stops[1]?.color.r).toBe(1);
            expect(paint.stops[1]?.color.b).toBe(1);
            expect(paint.blend_mode).toBe("overlay");
            expect(paint.opacity).toBeCloseTo(0.75);
            expect(paint.active).toBe(true);
          }
        }
      );
    });

    it("roundtrips ImagePaint stroke_paints on ContainerNode", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseContainer(nodeId),
          stroke_width: 2,
          stroke_paints: [
            {
              type: "image",
              src: "https://example.com/stroke.png",
              fit: "fill",
              blend_mode: "normal",
              opacity: 1,
              active: true,
              filters: {
                exposure: 0.2,
                contrast: 0.1,
                saturation: 0.0,
                temperature: 0.0,
                tint: 0.0,
                highlights: 0.0,
                shadows: 0.0,
              },
            } satisfies cg.ImagePaint,
          ],
        },
      });
      roundtripTest<grida.program.nodes.ContainerNode>(
        doc,
        nodeId,
        "container",
        (containerNode) => {
          expect(containerNode.type).toBe("container");
          expect(containerNode.stroke_paints).toBeDefined();
          expect(containerNode.stroke_paints?.length).toBe(1);
          const paint = containerNode.stroke_paints?.[0];
          expect(paint?.type).toBe("image");
          if (paint && paint.type === "image") {
            expect(paint.fit).toBe("cover");
            expect(paint.blend_mode).toBe("normal");
            expect(paint.opacity).toBe(1);
            expect(paint.active).toBe(true);
            expect(paint.filters).toBeDefined();
            expect(paint.filters?.exposure).toBeCloseTo(0.2);
            expect(paint.filters?.contrast).toBeCloseTo(0.1);
          }
        }
      );
    });
  });

  describe("effects", () => {
    it("roundtrips ContainerNode with fe_blur effect", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseContainer(nodeId),
          fe_blur: {
            type: "filter-blur",
            blur: { type: "blur", radius: 10 },
            active: true,
          } satisfies cg.FeLayerBlur,
        },
      });
      roundtripTest<grida.program.nodes.ContainerNode>(
        doc,
        nodeId,
        "container",
        (containerNode) => {
          expect(containerNode.type).toBe("container");
        }
      );
    });

    it("roundtrips RectangleNode with fe_backdrop_blur effect", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_target_width: 100,
          layout_target_height: 200,
          fe_backdrop_blur: {
            type: "backdrop-filter-blur",
            blur: { type: "blur", radius: 5 },
            active: true,
          } satisfies cg.FeBackdropBlur,
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (rectangleNode) => {
          expect(rectangleNode.type).toBe("rectangle");
        }
      );
    });

    it("roundtrips ContainerNode with fe_shadows effect", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseContainer(nodeId),
          fe_shadows: [
            {
              type: "shadow",
              dx: 2,
              dy: 4,
              blur: 8,
              spread: 0,
              color: { r: 0, g: 0, b: 0, a: 0.5 } as cg.RGBA32F,
              active: true,
            } satisfies cg.FeShadow,
          ],
        },
      });
      roundtripTest<grida.program.nodes.ContainerNode>(
        doc,
        nodeId,
        "container",
        (containerNode) => {
          expect(containerNode.type).toBe("container");
          expect(containerNode.fe_shadows).toBeDefined();
          expect(containerNode.fe_shadows?.length).toBe(1);
          const shadow = containerNode.fe_shadows?.[0];
          if (shadow) {
            expect(shadow.type).toBe("shadow");
            expect(shadow.dx).toBeCloseTo(2);
            expect(shadow.dy).toBeCloseTo(4);
            expect(shadow.blur).toBeCloseTo(8);
            expect(shadow.spread).toBeCloseTo(0);
            expect(shadow.color.r).toBeCloseTo(0);
            expect(shadow.color.g).toBeCloseTo(0);
            expect(shadow.color.b).toBeCloseTo(0);
            expect(shadow.color.a).toBeCloseTo(0.5);
            expect(shadow.active).toBe(true);
          }
        }
      );
    });

    it("roundtrips RectangleNode with fe_liquid_glass effect", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseRectangle(nodeId),
          layout_target_width: 100,
          layout_target_height: 200,
          fe_liquid_glass: {
            type: "glass",
            light_intensity: 0.9,
            light_angle: 45,
            refraction: 0.8,
            depth: 20,
            dispersion: 0.5,
            radius: 4,
            active: true,
          } satisfies cg.FeLiquidGlass,
        },
      });
      roundtripTest<grida.program.nodes.RectangleNode>(
        doc,
        nodeId,
        "rectangle",
        (rectangleNode) => {
          expect(rectangleNode.type).toBe("rectangle");
        }
      );
    });

    it("roundtrips ContainerNode with fe_noises effect", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: {
          ...baseContainer(nodeId),
          fe_noises: [
            {
              type: "noise",
              mode: "mono",
              noise_size: 0.3,
              density: 0.8,
              num_octaves: 6,
              seed: 42,
              color: { r: 0, g: 0, b: 0, a: 0.15 } as cg.RGBA32F,
            } satisfies cg.FeNoise,
          ],
        },
      });
      roundtripTest<grida.program.nodes.ContainerNode>(
        doc,
        nodeId,
        "container",
        (containerNode) => {
          expect(containerNode.type).toBe("container");
        }
      );
    });

    it("roundtrips ContainerNode without effects", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";
      const doc = createDocument(sceneId, {
        [nodeId]: baseContainer(nodeId),
      });
      roundtripTest<grida.program.nodes.ContainerNode>(
        doc,
        nodeId,
        "container",
        (containerNode) => {
          expect(containerNode.type).toBe("container");
          expect(containerNode.fe_blur).toBeUndefined();
          expect(containerNode.fe_backdrop_blur).toBeUndefined();
          expect(containerNode.fe_shadows).toBeUndefined();
          expect(containerNode.fe_liquid_glass).toBeUndefined();
          expect(containerNode.fe_noises).toBeUndefined();
        }
      );
    });
  });
});
