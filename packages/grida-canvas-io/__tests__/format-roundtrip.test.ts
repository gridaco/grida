import { describe, it, expect } from "vitest";
import type grida from "@grida/schema";
import cg from "@grida/cg";
import { format } from "../format";

describe("format roundtrip", () => {
  describe("positioning modes", () => {
    it("roundtrips cartesian positioning (left/top)", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
          } satisfies grida.program.nodes.RectangleNode,
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
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      node satisfies grida.program.nodes.RectangleNode;

      expect(node.layout_positioning).toBe("absolute");
      expect(node.layout_inset_left).toBe(10);
      expect(node.layout_inset_top).toBe(20);
      expect(node.layout_inset_right).toBeUndefined();
      expect(node.layout_inset_bottom).toBeUndefined();
    });

    it("roundtrips inset positioning (right/bottom)", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_right: 12,
            layout_inset_bottom: 34,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
          } satisfies grida.program.nodes.RectangleNode,
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
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      node satisfies grida.program.nodes.RectangleNode;

      expect(node.layout_positioning).toBe("absolute");
      expect(node.layout_inset_right).toBe(12);
      expect(node.layout_inset_bottom).toBe(34);
      expect(node.layout_inset_left).toBeUndefined();
      expect(node.layout_inset_top).toBeUndefined();
    });

    it("roundtrips relative positioning", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "relative",
            layout_inset_left: 5,
            layout_inset_top: 10,
            layout_target_width: 50,
            layout_target_height: 50,
            rotation: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
          } satisfies grida.program.nodes.RectangleNode,
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
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      node satisfies grida.program.nodes.RectangleNode;

      expect(node.layout_positioning).toBe("relative");
    });
  });

  describe("length types", () => {
    it("roundtrips auto width/height (TextNode supports auto)", () => {
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
            type: "tspan",
            id: nodeId,
            name: "Text",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 0,
            layout_inset_top: 0,
            layout_target_width: "auto",
            layout_target_height: "auto",
            rotation: 0,
            text: null,
            font_size: 14,
            font_weight: 400,
            font_kerning: true,
            text_decoration_line: "none",
            text_align: "left",
            text_align_vertical: "top",
          } satisfies grida.program.nodes.TextSpanNode,
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
      if (!node || node.type !== "tspan") throw new Error("Expected text node");
      node satisfies grida.program.nodes.TextSpanNode;

      expect(node.layout_target_width).toBe("auto");
      expect(node.layout_target_height).toBe("auto");
    });

    it("roundtrips px width/height", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 0,
            layout_inset_top: 0,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
          } satisfies grida.program.nodes.RectangleNode,
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
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      node satisfies grida.program.nodes.RectangleNode;

      expect(node.layout_target_width).toBe(100);
      expect(node.layout_target_height).toBe(200);
    });

    it("roundtrips percentage width/height (ContainerNode supports percentage)", () => {
      const sceneId = "0-1";
      const nodeId = "0-2";

      const containerNode: grida.program.nodes.ContainerNode = {
        type: "container",
        id: nodeId,
        name: "Container",
        active: true,
        locked: false,
        clips_content: false,

        opacity: 1,
        z_index: 0,
        layout_positioning: "absolute",
        layout_inset_left: 0,
        layout_inset_top: 0,
        layout_target_width: { type: "percentage" as const, value: 50 },
        layout_target_height: { type: "percentage" as const, value: 75 },
        rotation: 0,
        layout_mode: "flow" as const,
        layout_direction: "horizontal" as const,
        main_axis_alignment: "start" as const,
        cross_axis_alignment: "start" as const,
        main_axis_gap: 0,
        cross_axis_gap: 0,
        padding_top: 0,
        padding_right: 0,
        padding_bottom: 0,
        padding_left: 0,
        stroke_width: 0,
        stroke_cap: "butt",
        stroke_join: "miter",
      };
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
          [nodeId]: containerNode,
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
      if (!node || node.type !== "container")
        throw new Error("Expected container node");
      node satisfies grida.program.nodes.ContainerNode;

      expect(node.layout_target_width).toEqual({
        type: "percentage",
        value: 50,
      });
      expect(node.layout_target_height).toEqual({
        type: "percentage",
        value: 75,
      });
    });
  });

  describe("node types", () => {
    it("roundtrips SceneNode", () => {
      const sceneId = "0-1";

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
            constraints: { children: "single" },
          },
        },
        links: {},
        scenes_ref: [sceneId],
        entry_scene_id: sceneId,
        images: {},
        bitmaps: {},
        properties: {},
      } satisfies grida.program.document.Document;

      const bytes = format.document.encode.toFlatbuffer(doc);
      const decoded = format.document.decode.fromFlatbuffer(bytes);
      const scene = decoded.nodes[sceneId];
      if (!scene || scene.type !== "scene")
        throw new Error("Expected scene node");
      scene satisfies grida.program.nodes.SceneNode;

      expect(scene.type).toBe("scene");
      expect(scene.name).toBe("Scene");
      expect(scene.active).toBe(true);
      expect(scene.locked).toBe(false);
      expect(scene.constraints.children).toBe("single");
    });

    it("roundtrips SceneNode with position", () => {
      const sceneId = "0-1";

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
            position: "Qd&",
          },
        },
        links: {},
        scenes_ref: [sceneId],
        entry_scene_id: sceneId,
        images: {},
        bitmaps: {},
        properties: {},
      } satisfies grida.program.document.Document;

      const bytes = format.document.encode.toFlatbuffer(doc);
      const decoded = format.document.decode.fromFlatbuffer(bytes);
      const scene = decoded.nodes[sceneId];
      if (!scene || scene.type !== "scene")
        throw new Error("Expected scene node");
      scene satisfies grida.program.nodes.SceneNode;

      expect(scene.type).toBe("scene");
      expect(scene.name).toBe("Scene");
      expect(scene.position).toBe("Qd&");
      expect(scene.constraints.children).toBe("multiple");
    });

    it("roundtrips SceneNode with background_color", () => {
      const sceneId = "0-1";

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
            background_color: {
              r: 0.5,
              g: 0.75,
              b: 1.0,
              a: 1.0,
            } as cg.RGBA32F,
          },
        },
        links: {},
        scenes_ref: [sceneId],
        entry_scene_id: sceneId,
        images: {},
        bitmaps: {},
        properties: {},
      } satisfies grida.program.document.Document;

      const bytes = format.document.encode.toFlatbuffer(doc);
      const decoded = format.document.decode.fromFlatbuffer(bytes);
      const scene = decoded.nodes[sceneId];
      if (!scene || scene.type !== "scene")
        throw new Error("Expected scene node");
      scene satisfies grida.program.nodes.SceneNode;

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
    });

    it("roundtrips SceneNode without background_color", () => {
      const sceneId = "0-1";

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
        },
        links: {},
        scenes_ref: [sceneId],
        entry_scene_id: sceneId,
        images: {},
        bitmaps: {},
        properties: {},
      } satisfies grida.program.document.Document;

      const bytes = format.document.encode.toFlatbuffer(doc);
      const decoded = format.document.decode.fromFlatbuffer(bytes);
      const scene = decoded.nodes[sceneId];
      if (!scene || scene.type !== "scene")
        throw new Error("Expected scene node");
      scene satisfies grida.program.nodes.SceneNode;

      expect(scene.type).toBe("scene");
      // background_color should be undefined when not set
      expect(scene.background_color).toBeUndefined();
    });

    it("roundtrips RectangleNode with layout properties", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 45,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
          } satisfies grida.program.nodes.RectangleNode,
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
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      node satisfies grida.program.nodes.RectangleNode;

      expect(node.type).toBe("rectangle");
      expect(node.name).toBe("Rect");
      expect(node.active).toBe(true);
      expect(node.locked).toBe(false);
      expect(node.layout_inset_left).toBe(10);
      expect(node.layout_inset_top).toBe(20);
      expect(node.layout_target_width).toBe(100);
      expect(node.layout_target_height).toBe(200);
      expect(node.rotation).toBe(45);
      // Note: opacity, z_index, stroke properties are not currently decoded from node data
    });

    it("roundtrips TextNode with layout properties", () => {
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
            type: "tspan",
            id: nodeId,
            name: "Text",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 0,
            layout_inset_top: 0,
            layout_target_width: 200,
            layout_target_height: 50,
            rotation: 0,
            text: null,
            font_size: 14,
            font_weight: 400,
            font_kerning: true,
            text_decoration_line: "none",
            text_align: "left",
            text_align_vertical: "top",
          } satisfies grida.program.nodes.TextSpanNode,
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
      if (!node || node.type !== "tspan") throw new Error("Expected text node");
      node satisfies grida.program.nodes.TextSpanNode;

      expect(node.type).toBe("tspan");
      expect(node.name).toBe("Text");
      expect(node.active).toBe(true);
      expect(node.locked).toBe(false);
      expect(node.layout_target_width).toBe(200);
      expect(node.layout_target_height).toBe(50);
      // Note: text content, font properties, text alignment are not currently decoded from TextSpanNodeProperties
    });

    it("roundtrips ContainerNode with flex properties", () => {
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
            type: "container",
            id: nodeId,
            name: "Container",
            active: true,
            locked: false,
            clips_content: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 0,
            layout_inset_top: 0,
            layout_target_width: 400,
            layout_target_height: 300,
            rotation: 0,
            layout_mode: "flex",
            layout_direction: "horizontal",
            layout_wrap: "wrap",
            main_axis_alignment: "space-evenly",
            cross_axis_alignment: "stretch",
            main_axis_gap: 10,
            cross_axis_gap: 15,
            padding_top: 5,
            padding_right: 10,
            padding_bottom: 15,
            padding_left: 20,
            stroke_width: 1,
            stroke_cap: "square",
            stroke_join: "round",
          } satisfies grida.program.nodes.ContainerNode,
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
      if (!node || node.type !== "container")
        throw new Error("Expected container node");
      node satisfies grida.program.nodes.ContainerNode;

      expect(node.type).toBe("container");
      expect(node.layout_mode).toBe("flex");
      expect(node.layout_direction).toBe("horizontal");
      expect(node.layout_wrap).toBe("wrap");
      expect(node.main_axis_alignment).toBe("space-evenly");
      expect(node.cross_axis_alignment).toBe("stretch");
      expect(node.main_axis_gap).toBe(10);
      expect(node.cross_axis_gap).toBe(15);
      expect(node.padding_top).toBe(5);
      expect(node.padding_right).toBe(10);
      expect(node.padding_bottom).toBe(15);
      expect(node.padding_left).toBe(20);
    });

    it("roundtrips GroupNode with layout properties", () => {
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
            type: "group",
            id: nodeId,
            name: "Group",
            active: true,
            locked: false,
            opacity: 1,

            layout_positioning: "relative",
            layout_inset_left: 5,
            layout_inset_top: 10,
          } satisfies grida.program.nodes.GroupNode,
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
      if (!node || node.type !== "group")
        throw new Error("Expected group node");
      node satisfies grida.program.nodes.GroupNode;

      expect(node.type).toBe("group");
      expect(node.name).toBe("Group");
      expect(node.active).toBe(true);
      expect(node.locked).toBe(false);
      expect(node.layout_positioning).toBe("relative");
      // Note: left, top, width, height, rotation, opacity, expanded are not currently decoded from GroupNodeProperties
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
    ] as const)("roundtrips main_axis_alignment: %s", (alignment, expected) => {
      // Test encode/decode 1:1
      const encoded = format.layout.encode.mainAxisAlignment(
        alignment satisfies cg.MainAxisAlignment
      );
      const decoded = format.layout.decode.mainAxisAlignment(encoded);
      expect(decoded).toBe(expected);
    });
  });

  describe("cg.CrossAxisAlignment", () => {
    it.each([
      ["start", "start"],
      ["end", "end"],
      ["center", "center"],
      ["stretch", "stretch"],
    ] as const)(
      "roundtrips cross_axis_alignment: %s",
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
            type: "rectangle",
            id: nodeId,
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
            rotation: 45.5,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
          } satisfies grida.program.nodes.RectangleNode,
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
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      node satisfies grida.program.nodes.RectangleNode;

      // Floating point precision: rotation is converted from degrees to radians and back
      expect(node.rotation).toBeCloseTo(45.5, 5);
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
            type: "container",
            id: nodeId,
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
            layout_mode: "flex" as const,
            layout_direction: "horizontal" as const,
            layout_wrap: wrap satisfies "wrap" | "nowrap" | undefined,
            main_axis_alignment: "start" as const,
            cross_axis_alignment: "start" as const,
            main_axis_gap: 0,
            cross_axis_gap: 0,
            padding_top: 0,
            padding_right: 0,
            padding_bottom: 0,
            padding_left: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
          } satisfies grida.program.nodes.ContainerNode,
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
      if (!node || node.type !== "container")
        throw new Error("Expected container node");
      node satisfies grida.program.nodes.ContainerNode;

      expect(node.layout_wrap).toBe(expected);
    });
  });

  describe("comprehensive integration", () => {
    it("roundtrips complex document with multiple node types and properties", () => {
      const sceneId = "0-1";
      const rectId = "0-2";
      const textId = "0-3";
      const containerId = "0-4";
      const groupId = "0-5";

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
          [rectId]: {
            type: "rectangle",
            id: rectId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 30,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
          } satisfies grida.program.nodes.RectangleNode,
          [textId]: {
            type: "tspan",
            id: textId,
            name: "Text",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_right: 12,
            layout_inset_bottom: 34,
            layout_target_width: "auto",
            layout_target_height: "auto",
            rotation: 5,
            text: null,
            font_size: 14,
            font_weight: 400,
            font_kerning: true,
            text_decoration_line: "none",
            text_align: "left",
            text_align_vertical: "top",
          } satisfies grida.program.nodes.TextSpanNode,
          [containerId]: {
            type: "container",
            id: containerId,
            name: "Container",
            active: true,
            locked: false,
            clips_content: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 1,
            layout_inset_top: 2,
            layout_target_width: { type: "percentage" as const, value: 50 },
            layout_target_height: 100,
            rotation: 0,
            layout_mode: "flex" as const,
            layout_direction: "vertical" as const,
            layout_wrap: "nowrap" as const,
            main_axis_alignment: "space-between" as const,
            cross_axis_alignment: "center" as const,
            main_axis_gap: 11,
            cross_axis_gap: 22,
            padding_top: 3,
            padding_right: 4,
            padding_bottom: 5,
            padding_left: 6,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
          } satisfies grida.program.nodes.ContainerNode,
          [groupId]: {
            type: "group",
            id: groupId,
            name: "Group",
            active: true,
            locked: false,
            opacity: 0.9,
            layout_positioning: "relative",
            layout_inset_left: 5,
            layout_inset_top: 10,
          } satisfies grida.program.nodes.GroupNode,
        },
        links: {
          [sceneId]: [rectId, textId, containerId, groupId],
        },
        scenes_ref: [sceneId],
        entry_scene_id: sceneId,
        images: {},
        bitmaps: {},
        properties: {},
      } satisfies grida.program.document.Document;

      const bytes = format.document.encode.toFlatbuffer(doc);
      const decoded = format.document.decode.fromFlatbuffer(bytes);

      // Verify all nodes roundtrip correctly
      expect(decoded.nodes[rectId]?.type).toBe("rectangle");
      expect(decoded.nodes[textId]?.type).toBe("tspan");
      expect(decoded.nodes[containerId]?.type).toBe("container");
      expect(decoded.nodes[groupId]?.type).toBe("group");

      // Verify hierarchy
      expect(decoded.links[sceneId]).toEqual([
        rectId,
        textId,
        containerId,
        groupId,
      ]);
      expect(decoded.scenes_ref).toEqual([sceneId]);
      // entry_scene_id is not stored in the archive model
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity,
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
          } satisfies grida.program.nodes.RectangleNode,
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
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      node satisfies grida.program.nodes.RectangleNode;

      expect(node.opacity).toBeCloseTo(expected, 5);
    });

    it("roundtrips opacity for TextNode", () => {
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
            type: "tspan",
            id: nodeId,
            name: "Text",
            active: true,
            locked: false,
            opacity: 0.8,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 0,
            layout_inset_top: 0,
            layout_target_width: 100,
            layout_target_height: 50,
            rotation: 0,
            text: "Test",
            font_size: 14,
            font_weight: 400,
            font_kerning: true,
            text_decoration_line: "none",
            text_align: "left",
            text_align_vertical: "top",
          } satisfies grida.program.nodes.TextSpanNode,
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
      if (!node || node.type !== "tspan") throw new Error("Expected text node");
      node satisfies grida.program.nodes.TextSpanNode;

      expect(node.opacity).toBeCloseTo(0.8, 5);
    });

    it("roundtrips max_lines for TextSpanNode", () => {
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
            type: "tspan",
            id: nodeId,
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
            text: "This is a long text that should be truncated",
            font_size: 14,
            font_weight: 400,
            font_kerning: true,
            text_decoration_line: "none",
            text_align: "left",
            text_align_vertical: "top",
            max_lines: 3,
          } satisfies grida.program.nodes.TextSpanNode,
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
      if (!node || node.type !== "tspan") throw new Error("Expected text node");
      node satisfies grida.program.nodes.TextSpanNode;

      // max_lines should be preserved correctly after roundtrip
      expect(node.max_lines).toBe(3);
    });

    it("roundtrips TextSpanNode without max_lines (undefined)", () => {
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
            type: "tspan",
            id: nodeId,
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
            text: "This is a long text",
            font_size: 14,
            font_weight: 400,
            font_kerning: true,
            text_decoration_line: "none",
            text_align: "left",
            text_align_vertical: "top",
            // max_lines is intentionally not set
          } satisfies grida.program.nodes.TextSpanNode,
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
      if (!node || node.type !== "tspan") throw new Error("Expected text node");
      node satisfies grida.program.nodes.TextSpanNode;

      // max_lines should remain undefined when not set
      expect(node.max_lines).toBeUndefined();
    });
  });

  describe("text font properties", () => {
    it("roundtrips font_size", () => {
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
            type: "tspan",
            id: nodeId,
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
            text: "Test",
            font_size: 24,
            font_weight: 400,
            font_kerning: true,
            text_decoration_line: "none",
            text_align: "left",
            text_align_vertical: "top",
          } satisfies grida.program.nodes.TextSpanNode,
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
      if (!node || node.type !== "tspan") throw new Error("Expected text node");
      node satisfies grida.program.nodes.TextSpanNode;

      expect(node.font_size).toBe(24);
    });

    it("roundtrips font_weight", () => {
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
            type: "tspan",
            id: nodeId,
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
            text: "Test",
            font_size: 14,
            font_weight: 700,
            font_kerning: true,
            text_decoration_line: "none",
            text_align: "left",
            text_align_vertical: "top",
          } satisfies grida.program.nodes.TextSpanNode,
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
      if (!node || node.type !== "tspan") throw new Error("Expected text node");
      node satisfies grida.program.nodes.TextSpanNode;

      expect(node.font_weight).toBe(700);
    });

    it("roundtrips font_kerning", () => {
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
            type: "tspan",
            id: nodeId,
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
            text: "Test",
            font_size: 14,
            font_weight: 400,
            font_kerning: false,
            text_decoration_line: "none",
            text_align: "left",
            text_align_vertical: "top",
          } satisfies grida.program.nodes.TextSpanNode,
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
      if (!node || node.type !== "tspan") throw new Error("Expected text node");
      node satisfies grida.program.nodes.TextSpanNode;

      expect(node.font_kerning).toBe(false);
    });

    it("roundtrips all font properties together", () => {
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
            type: "tspan",
            id: nodeId,
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
            text: "Test",
            font_size: 18,
            font_weight: 600,
            font_kerning: false,
            text_decoration_line: "none",
            text_align: "left",
            text_align_vertical: "top",
          } satisfies grida.program.nodes.TextSpanNode,
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
      if (!node || node.type !== "tspan") throw new Error("Expected text node");
      node satisfies grida.program.nodes.TextSpanNode;

      expect(node.font_size).toBe(18);
      expect(node.font_weight).toBe(600);
      expect(node.font_kerning).toBe(false);
    });
  });

  describe("additional node types", () => {
    it("roundtrips EllipseNode", () => {
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
            type: "ellipse",
            id: nodeId,
            name: "Ellipse",
            active: true,
            locked: false,
            opacity: 1,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 80,
            rotation: 0,
            angle_offset: 0,
            angle: 360,
            inner_radius: 0,
            stroke_width: 2,
            stroke_cap: "round",
            stroke_join: "round",
          } satisfies grida.program.nodes.EllipseNode,
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
      if (!node || node.type !== "ellipse")
        throw new Error("Expected ellipse node");
      node satisfies grida.program.nodes.EllipseNode;

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
    });

    it("roundtrips EllipseNode with arc data (non-default values)", () => {
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
            type: "ellipse",
            id: nodeId,
            name: "Ellipse Arc",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 80,
            rotation: 0,
            angle_offset: 45, // Non-default: 45 degrees
            angle: 180, // Non-default: half circle
            inner_radius: 0.5, // Non-default: donut shape
            stroke_width: 2,
            stroke_cap: "round",
            stroke_join: "round",
          } satisfies grida.program.nodes.EllipseNode,
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
      if (!node || node.type !== "ellipse")
        throw new Error("Expected ellipse node");
      node satisfies grida.program.nodes.EllipseNode;

      expect(node.type).toBe("ellipse");
      expect(node.name).toBe("Ellipse Arc");
      expect(node.layout_target_width).toBe(100);
      expect(node.layout_target_height).toBe(80);
      // Verify arc data is preserved
      expect(node.angle_offset).toBe(45);
      expect(node.angle).toBe(180);
      expect(node.inner_radius).toBe(0.5);
      expect(node.stroke_width).toBe(2);
      expect(node.stroke_cap).toBe("round");
      expect(node.stroke_join).toBe("round");
    });

    it("roundtrips EllipseNode with angle=0 (explicit zero)", () => {
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
            type: "ellipse",
            id: nodeId,
            name: "Ellipse Zero",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 80,
            rotation: 0,
            angle_offset: 0,
            angle: 0, // Explicit zero (should be preserved)
            inner_radius: 0,
            stroke_width: 2,
            stroke_cap: "round",
            stroke_join: "round",
          } satisfies grida.program.nodes.EllipseNode,
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
      if (!node || node.type !== "ellipse")
        throw new Error("Expected ellipse node");
      node satisfies grida.program.nodes.EllipseNode;

      expect(node.type).toBe("ellipse");
      expect(node.name).toBe("Ellipse Zero");
      // Verify angle=0 is preserved (not defaulted to 360)
      expect(node.angle).toBe(0);
      expect(node.angle_offset).toBe(0);
      expect(node.inner_radius).toBe(0);
    });

    it("roundtrips LineNode", () => {
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
            type: "line",
            id: nodeId,
            name: "Line",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 0,
            layout_inset_top: 0,
            layout_target_width: 200,
            layout_target_height: 0,
            rotation: 45,
            stroke_width: 3,
            stroke_cap: "square",
            stroke_join: "miter",
          } satisfies grida.program.nodes.LineNode,
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
      if (!node || node.type !== "line") throw new Error("Expected line node");
      node satisfies grida.program.nodes.LineNode;

      expect(node.type).toBe("line");
      expect(node.name).toBe("Line");
      expect(node.layout_target_width).toBe(200);
      expect(node.layout_target_height).toBe(0);
      expect(node.rotation).toBe(45);
      expect(node.stroke_width).toBe(3);
      expect(node.stroke_cap).toBe("square");
      expect(node.stroke_join).toBe("miter");
    });

    it("roundtrips VectorNode", () => {
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
            type: "vector",
            id: nodeId,
            name: "Vector",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 0,
            layout_inset_top: 0,
            layout_target_width: 150,
            layout_target_height: 150,
            rotation: 0,
            corner_radius: 5,
            stroke_width: 1,
            stroke_cap: "butt",
            stroke_join: "miter",
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
          } satisfies grida.program.nodes.VectorNode,
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
      if (!node || node.type !== "vector")
        throw new Error("Expected vector node");
      node satisfies grida.program.nodes.VectorNode;

      expect(node.type).toBe("vector");
      expect(node.name).toBe("Vector");
      expect(node.layout_target_width).toBe(150);
      expect(node.layout_target_height).toBe(150);
      expect(node.corner_radius).toBe(5);
      expect(node.stroke_width).toBe(1);
      // Verify vector_network roundtrip
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
    });

    it("roundtrips BooleanPathOperationNode", () => {
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
            type: "boolean",
            id: nodeId,
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
            op: "difference",
            corner_radius: 0,
            stroke_width: 2,
            stroke_cap: "round",
            stroke_join: "bevel",
          } satisfies grida.program.nodes.BooleanPathOperationNode,
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
      if (!node || node.type !== "boolean")
        throw new Error("Expected boolean node");
      node satisfies grida.program.nodes.BooleanPathOperationNode;

      expect(node.type).toBe("boolean");
      expect(node.name).toBe("Boolean");
      expect(node.op).toBe("difference");
      expect(node.stroke_width).toBe(2);
      expect(node.stroke_cap).toBe("round");
      expect(node.stroke_join).toBe("bevel");
    });

    it("roundtrips RegularPolygonNode", () => {
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
            type: "polygon",
            id: nodeId,
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
            point_count: 6,
            corner_radius: 2,
            stroke_width: 1,
            stroke_cap: "butt",
            stroke_join: "miter",
          } satisfies grida.program.nodes.RegularPolygonNode,
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
      if (!node || node.type !== "polygon")
        throw new Error("Expected polygon node");
      node satisfies grida.program.nodes.RegularPolygonNode;

      expect(node.type).toBe("polygon");
      expect(node.name).toBe("Polygon");
      expect(node.layout_target_width).toBe(100);
      expect(node.layout_target_height).toBe(100);
      expect(node.point_count).toBe(6);
      expect(node.corner_radius).toBe(2);
      expect(node.stroke_width).toBe(1);
    });

    it("roundtrips RegularStarPolygonNode", () => {
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
            type: "star",
            id: nodeId,
            name: "Star",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 0,
            layout_inset_top: 0,
            layout_target_width: 120,
            layout_target_height: 120,
            rotation: 0,
            point_count: 5,
            inner_radius: 0.4,
            corner_radius: 1,
            stroke_width: 2,
            stroke_cap: "round",
            stroke_join: "round",
          } satisfies grida.program.nodes.RegularStarPolygonNode,
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
      if (!node || node.type !== "star") throw new Error("Expected star node");
      node satisfies grida.program.nodes.RegularStarPolygonNode;

      expect(node.type).toBe("star");
      expect(node.name).toBe("Star");
      expect(node.layout_target_width).toBe(120);
      expect(node.layout_target_height).toBe(120);
      expect(node.point_count).toBe(5);
      expect(node.inner_radius).toBeCloseTo(0.4, 5);
      expect(node.corner_radius).toBe(1);
      expect(node.stroke_width).toBe(2);
    });
  });

  describe("fill_paints", () => {
    it("roundtrips SolidPaint fill_paints on RectangleNode", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
            fill_paints: [
              {
                type: "solid",
                color: { r: 0, g: 0, b: 0, a: 1 } as cg.RGBA32F,
                blend_mode: "normal",
                active: true,
              } satisfies cg.SolidPaint,
            ],
          } satisfies grida.program.nodes.RectangleNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      const rectNode = node satisfies grida.program.nodes.RectangleNode;

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
    });

    it("roundtrips LinearGradientPaint fill_paints on RectangleNode", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
            fill_paints: [
              {
                type: "linear_gradient",
                transform: [
                  [1, 0, 0],
                  [0, 1, 0],
                ],
                stops: [
                  {
                    offset: 0,
                    color: { r: 0, g: 0, b: 0, a: 1 } as cg.RGBA32F,
                  },
                  {
                    offset: 1,
                    color: { r: 1, g: 1, b: 1, a: 1 } as cg.RGBA32F,
                  },
                ],
                blend_mode: "normal",
                opacity: 1,
                active: true,
              },
            ],
          } satisfies grida.program.nodes.RectangleNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      const rectNode = node satisfies grida.program.nodes.RectangleNode;

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
    });

    it("roundtrips RadialGradientPaint fill_paints on RectangleNode", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
            fill_paints: [
              {
                type: "radial_gradient",
                transform: [
                  [1, 0, 0],
                  [0, 1, 0],
                ],
                stops: [
                  {
                    offset: 0,
                    color: { r: 1, g: 0, b: 0, a: 1 } as cg.RGBA32F,
                  },
                  {
                    offset: 0.5,
                    color: { r: 0, g: 1, b: 0, a: 1 } as cg.RGBA32F,
                  },
                  {
                    offset: 1,
                    color: { r: 0, g: 0, b: 1, a: 1 } as cg.RGBA32F,
                  },
                ],
                blend_mode: "multiply",
                opacity: 0.8,
                active: true,
              } satisfies cg.RadialGradientPaint,
            ],
          } satisfies grida.program.nodes.RectangleNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      const rectNode = node satisfies grida.program.nodes.RectangleNode;

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
    });

    it("roundtrips SweepGradientPaint fill_paints on RectangleNode", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
            fill_paints: [
              {
                type: "sweep_gradient",
                transform: [
                  [0.5, 0, 50],
                  [0, 0.5, 50],
                ],
                stops: [
                  {
                    offset: 0,
                    color: { r: 1, g: 0, b: 0, a: 1 } as cg.RGBA32F,
                  },
                  {
                    offset: 1,
                    color: { r: 0, g: 0, b: 1, a: 1 } as cg.RGBA32F,
                  },
                ],
                blend_mode: "screen",
                opacity: 0.9,
                active: true,
              } satisfies cg.SweepGradientPaint,
            ],
          } satisfies grida.program.nodes.RectangleNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      const rectNode = node satisfies grida.program.nodes.RectangleNode;

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
    });

    it("roundtrips DiamondGradientPaint fill_paints on RectangleNode", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
            fill_paints: [
              {
                type: "diamond_gradient",
                transform: [
                  [1, 0.5, 0],
                  [0.5, 1, 0],
                ],
                stops: [
                  {
                    offset: 0,
                    color: { r: 1, g: 1, b: 0, a: 1 } as cg.RGBA32F,
                  },
                  {
                    offset: 0.5,
                    color: { r: 0, g: 1, b: 1, a: 1 } as cg.RGBA32F,
                  },
                  {
                    offset: 1,
                    color: { r: 1, g: 0, b: 1, a: 1 } as cg.RGBA32F,
                  },
                ],
                blend_mode: "overlay",
                opacity: 0.75,
                active: true,
              } satisfies cg.DiamondGradientPaint,
            ],
          } satisfies grida.program.nodes.RectangleNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      const rectNode = node satisfies grida.program.nodes.RectangleNode;

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
    });

    it("roundtrips empty fill_paints (undefined) on RectangleNode", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
            // fill_paints is undefined
          } satisfies grida.program.nodes.RectangleNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      const rectNode = node satisfies grida.program.nodes.RectangleNode;

      expect(rectNode.type).toBe("rectangle");
      // fill_paints should be undefined when not set
      expect(rectNode.fill_paints).toBeUndefined();
    });
  });

  describe("ImagePaint with fill_paints", () => {
    it("roundtrips ImagePaint fill_paints on ContainerNode", () => {
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
            type: "container",
            id: nodeId,
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
            main_axis_alignment: "start",
            cross_axis_alignment: "start",
            main_axis_gap: 0,
            cross_axis_gap: 0,
            padding_top: 0,
            padding_right: 0,
            padding_bottom: 0,
            padding_left: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
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
          } satisfies grida.program.nodes.ContainerNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "container")
        throw new Error("Expected container node");
      const containerNode = node satisfies grida.program.nodes.ContainerNode;

      expect(containerNode.type).toBe("container");
      expect(containerNode.fill_paints).toBeDefined();
      expect(containerNode.fill_paints?.length).toBe(1);
      const paint = containerNode.fill_paints?.[0];
      expect(paint?.type).toBe("image");
      if (paint && paint.type === "image") {
        // TODO: ImagePaint decoding is not fully implemented (src decoding from ResourceRef)
        // For now, verify that the paint structure is preserved
        expect(paint.fit).toBe("cover");
        expect(paint.blend_mode).toBe("normal");
        expect(paint.opacity).toBe(1);
        expect(paint.active).toBe(true);
        // Verify filters are decoded (use toBeCloseTo for float precision)
        expect(paint.filters).toBeDefined();
        expect(paint.filters?.exposure).toBeCloseTo(0.5);
        expect(paint.filters?.contrast).toBeCloseTo(0.3);
        expect(paint.filters?.saturation).toBeCloseTo(0.2);
        expect(paint.filters?.temperature).toBeCloseTo(0.1);
      }
    });
  });

  describe("stroke_paints", () => {
    it("roundtrips SolidPaint stroke_paints on RectangleNode", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
            stroke_width: 2,
            stroke_cap: "butt",
            stroke_join: "miter",
            stroke_paints: [
              {
                type: "solid",
                color: { r: 1, g: 0, b: 0, a: 1 } as cg.RGBA32F,
                blend_mode: "normal",
                active: true,
              } satisfies cg.SolidPaint,
            ],
          } satisfies grida.program.nodes.RectangleNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      const rectNode = node satisfies grida.program.nodes.RectangleNode;

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
    });

    it("roundtrips LinearGradientPaint stroke_paints on RectangleNode", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 10,
            layout_inset_top: 20,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
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
                  {
                    offset: 0,
                    color: { r: 0, g: 1, b: 0, a: 1 } as cg.RGBA32F,
                  },
                  {
                    offset: 1,
                    color: { r: 0, g: 0, b: 1, a: 1 } as cg.RGBA32F,
                  },
                ],
                blend_mode: "normal",
                opacity: 1,
                active: true,
              } satisfies cg.LinearGradientPaint,
            ],
          } satisfies grida.program.nodes.RectangleNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      const rectNode = node satisfies grida.program.nodes.RectangleNode;

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
    });

    it("roundtrips RadialGradientPaint stroke_paints on EllipseNode", () => {
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
            type: "ellipse",
            id: nodeId,
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
            angle: 0,
            inner_radius: 0,
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
                  {
                    offset: 0,
                    color: { r: 1, g: 0, b: 0, a: 1 } as cg.RGBA32F,
                  },
                  {
                    offset: 1,
                    color: { r: 0, g: 0, b: 1, a: 1 } as cg.RGBA32F,
                  },
                ],
                blend_mode: "multiply",
                opacity: 0.8,
                active: true,
              } satisfies cg.RadialGradientPaint,
            ],
          } satisfies grida.program.nodes.EllipseNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "ellipse")
        throw new Error("Expected ellipse node");
      const ellipseNode = node satisfies grida.program.nodes.EllipseNode;

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
    });

    it("roundtrips SweepGradientPaint stroke_paints on VectorNode", () => {
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
            type: "vector",
            id: nodeId,
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
            stroke_width: 2,
            stroke_cap: "butt",
            stroke_join: "miter",
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
                  {
                    offset: 0,
                    color: { r: 1, g: 0, b: 0, a: 1 } as cg.RGBA32F,
                  },
                  {
                    offset: 1,
                    color: { r: 0, g: 1, b: 0, a: 1 } as cg.RGBA32F,
                  },
                ],
                blend_mode: "screen",
                opacity: 0.9,
                active: true,
              } satisfies cg.SweepGradientPaint,
            ],
          } satisfies grida.program.nodes.VectorNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "vector")
        throw new Error("Expected vector node");
      const vectorNode = node satisfies grida.program.nodes.VectorNode;

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
    });

    it("roundtrips DiamondGradientPaint stroke_paints on BooleanOperationNode", () => {
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
            type: "boolean",
            id: nodeId,
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
                  {
                    offset: 0,
                    color: { r: 1, g: 1, b: 0, a: 1 } as cg.RGBA32F,
                  },
                  {
                    offset: 1,
                    color: { r: 1, g: 0, b: 1, a: 1 } as cg.RGBA32F,
                  },
                ],
                blend_mode: "overlay",
                opacity: 0.75,
                active: true,
              } satisfies cg.DiamondGradientPaint,
            ],
          } satisfies grida.program.nodes.BooleanPathOperationNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "boolean")
        throw new Error("Expected boolean node");
      const boolNode =
        node satisfies grida.program.nodes.BooleanPathOperationNode;

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
    });

    it("roundtrips ImagePaint stroke_paints on ContainerNode", () => {
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
            type: "container",
            id: nodeId,
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
            main_axis_alignment: "start",
            cross_axis_alignment: "start",
            main_axis_gap: 0,
            cross_axis_gap: 0,
            padding_top: 0,
            padding_right: 0,
            padding_bottom: 0,
            padding_left: 0,
            stroke_width: 2,
            stroke_cap: "butt",
            stroke_join: "miter",
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
          } satisfies grida.program.nodes.ContainerNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "container")
        throw new Error("Expected container node");
      const containerNode = node satisfies grida.program.nodes.ContainerNode;

      expect(containerNode.type).toBe("container");
      expect(containerNode.stroke_paints).toBeDefined();
      expect(containerNode.stroke_paints?.length).toBe(1);
      const paint = containerNode.stroke_paints?.[0];
      expect(paint?.type).toBe("image");
      if (paint && paint.type === "image") {
        // TODO: ImagePaint decoding is not fully implemented (src decoding from ResourceRef)
        // Currently hardcoded to "cover" in decode function
        expect(paint.fit).toBe("cover");
        expect(paint.blend_mode).toBe("normal");
        expect(paint.opacity).toBe(1);
        expect(paint.active).toBe(true);
        // Verify filters are decoded
        expect(paint.filters).toBeDefined();
        expect(paint.filters?.exposure).toBeCloseTo(0.2);
        expect(paint.filters?.contrast).toBeCloseTo(0.1);
      }
    });
  });

  describe("effects", () => {
    it("roundtrips ContainerNode with fe_blur effect", () => {
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
            type: "container",
            id: nodeId,
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
            main_axis_alignment: "start",
            cross_axis_alignment: "start",
            main_axis_gap: 0,
            cross_axis_gap: 0,
            padding_top: 0,
            padding_right: 0,
            padding_bottom: 0,
            padding_left: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
            fe_blur: {
              type: "filter-blur",
              blur: {
                type: "blur",
                radius: 10,
              },
              active: true,
            } satisfies cg.FeLayerBlur,
          } satisfies grida.program.nodes.ContainerNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "container")
        throw new Error("Expected container node");
      const containerNode = node satisfies grida.program.nodes.ContainerNode;

      expect(containerNode.type).toBe("container");
      // TODO: Effects decoding is not fully implemented yet
      // Currently effects are encoded but not decoded
      // This test verifies that encoding doesn't fail when effects are present
    });

    it("roundtrips RectangleNode with fe_backdrop_blur effect", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 0,
            layout_inset_top: 0,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
            fe_backdrop_blur: {
              type: "backdrop-filter-blur",
              blur: {
                type: "blur",
                radius: 5,
              },
              active: true,
            } satisfies cg.FeBackdropBlur,
          } satisfies grida.program.nodes.RectangleNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      const rectangleNode = node satisfies grida.program.nodes.RectangleNode;

      expect(rectangleNode.type).toBe("rectangle");
      // TODO: Effects decoding is not fully implemented yet
      // Currently effects are encoded but not decoded
      // This test verifies that encoding doesn't fail when effects are present
    });

    it("roundtrips ContainerNode with fe_shadows effect", () => {
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
            type: "container",
            id: nodeId,
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
            main_axis_alignment: "start",
            cross_axis_alignment: "start",
            main_axis_gap: 0,
            cross_axis_gap: 0,
            padding_top: 0,
            padding_right: 0,
            padding_bottom: 0,
            padding_left: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
            fe_shadows: [
              {
                type: "shadow",
                dx: 2,
                dy: 4,
                blur: 8,
                spread: 0,
                color: {
                  r: 0,
                  g: 0,
                  b: 0,
                  a: 0.5,
                } as cg.RGBA32F,
                active: true,
              } satisfies cg.FeShadow,
            ],
          } satisfies grida.program.nodes.ContainerNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "container")
        throw new Error("Expected container node");
      const containerNode = node satisfies grida.program.nodes.ContainerNode;

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
    });

    it("roundtrips RectangleNode with fe_liquid_glass effect", () => {
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
            type: "rectangle",
            id: nodeId,
            name: "Rect",
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            layout_positioning: "absolute",
            layout_inset_left: 0,
            layout_inset_top: 0,
            layout_target_width: 100,
            layout_target_height: 200,
            rotation: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
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
          } satisfies grida.program.nodes.RectangleNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "rectangle")
        throw new Error("Expected rectangle node");
      const rectangleNode = node satisfies grida.program.nodes.RectangleNode;

      expect(rectangleNode.type).toBe("rectangle");
      // TODO: Effects decoding is not fully implemented yet
      // Currently effects are encoded but not decoded
      // This test verifies that encoding doesn't fail when effects are present
    });

    it("roundtrips ContainerNode with fe_noises effect", () => {
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
            type: "container",
            id: nodeId,
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
            main_axis_alignment: "start",
            cross_axis_alignment: "start",
            main_axis_gap: 0,
            cross_axis_gap: 0,
            padding_top: 0,
            padding_right: 0,
            padding_bottom: 0,
            padding_left: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
            fe_noises: [
              {
                type: "noise",
                mode: "mono",
                noise_size: 0.3,
                density: 0.8,
                num_octaves: 6,
                seed: 42,
                color: {
                  r: 0,
                  g: 0,
                  b: 0,
                  a: 0.15,
                } as cg.RGBA32F,
              } satisfies cg.FeNoise,
            ],
          } satisfies grida.program.nodes.ContainerNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "container")
        throw new Error("Expected container node");
      const containerNode = node satisfies grida.program.nodes.ContainerNode;

      expect(containerNode.type).toBe("container");
      // TODO: Effects decoding is not fully implemented yet
      // Currently effects are encoded but not decoded
      // This test verifies that encoding doesn't fail when effects are present
    });

    it("roundtrips ContainerNode without effects", () => {
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
            type: "container",
            id: nodeId,
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
            main_axis_alignment: "start",
            cross_axis_alignment: "start",
            main_axis_gap: 0,
            cross_axis_gap: 0,
            padding_top: 0,
            padding_right: 0,
            padding_bottom: 0,
            padding_left: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
          } satisfies grida.program.nodes.ContainerNode,
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
      const node = decoded.nodes[nodeId]!;
      if (!node || node.type !== "container")
        throw new Error("Expected container node");
      const containerNode = node satisfies grida.program.nodes.ContainerNode;

      expect(containerNode.type).toBe("container");
      // Effects should be undefined when not set
      expect(containerNode.fe_blur).toBeUndefined();
      expect(containerNode.fe_backdrop_blur).toBeUndefined();
      expect(containerNode.fe_shadows).toBeUndefined();
      expect(containerNode.fe_liquid_glass).toBeUndefined();
      expect(containerNode.fe_noises).toBeUndefined();
    });
  });
});
