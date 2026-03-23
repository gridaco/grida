/**
 * Tests for Figma REST API JSON documents fetched WITHOUT `geometry=paths`.
 *
 * In this mode Figma omits `size` and `relativeTransform` from every node.
 * Only `absoluteBoundingBox` (and `absoluteRenderBounds`) is present.
 *
 * Regression test for: https://github.com/gridaco/grida/issues/585
 * "Node: panic 'Failed to create raster surface'" — caused because
 * `positioning_trait` fell back to width=0/height=0 when `size` was absent,
 * resulting in `Backend::new_from_raster(0, 0)` panicking in Rust.
 */

import { iofigma } from "../lib";
import type * as figrest from "@figma/rest-api-spec";
import type grida from "@grida/schema";

const context: iofigma.restful.factory.FactoryContext = {
  gradient_id_generator: () => "grad-1",
  prefer_path_for_geometry: true,
};

/**
 * Build a minimal Figma REST FRAME node that omits `size` and
 * `relativeTransform` — exactly what the Figma REST API returns when the
 * request does NOT include `geometry=paths`.
 */
function makeFrameNodeWithoutGeometry(
  overrides: Partial<figrest.FrameNode> = {}
): figrest.FrameNode {
  const base: figrest.FrameNode = {
    id: "1:1",
    name: "Frame",
    type: "FRAME",
    scrollBehavior: "SCROLLS",
    blendMode: "PASS_THROUGH",
    clipsContent: true,
    absoluteBoundingBox: { x: 10, y: 20, width: 400, height: 300 },
    absoluteRenderBounds: { x: 10, y: 20, width: 400, height: 300 },
    constraints: { vertical: "TOP", horizontal: "LEFT" },
    fills: [],
    strokes: [],
    strokeWeight: 1,
    strokeAlign: "INSIDE",
    effects: [],
    exportSettings: [],
    interactions: [],
    background: [],
    backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
    children: [],
    // Intentionally omit: size, relativeTransform
  } as figrest.FrameNode;
  return { ...base, ...overrides };
}

describe("iofigma.restful.factory – REST API without geometry=paths", () => {
  describe("positioning_trait fallback to absoluteBoundingBox", () => {
    it("root FRAME node gets correct non-zero dimensions from absoluteBoundingBox", () => {
      const frameNode = makeFrameNodeWithoutGeometry();

      const { document: doc } = iofigma.restful.factory.document(
        frameNode,
        {},
        context
      );

      const frameGrida = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.ContainerNode =>
          n.type === "container" && n.name === "Frame"
      );
      expect(frameGrida).toBeDefined();
      // Must use absoluteBoundingBox dimensions — NOT fall back to 0
      expect(frameGrida!.layout_target_width).toBe(400);
      expect(frameGrida!.layout_target_height).toBe(300);
    });

    it("root node insets are 0 when no parent (absolute coords become scene origin)", () => {
      const frameNode = makeFrameNodeWithoutGeometry();

      const { document: doc } = iofigma.restful.factory.document(
        frameNode,
        {},
        context
      );

      const frameGrida = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.ContainerNode => n.type === "container"
      );
      expect(frameGrida).toBeDefined();
      // Root node: inset = absBox.x - absBox.x = 0
      expect(frameGrida!.layout_inset_left).toBe(0);
      expect(frameGrida!.layout_inset_top).toBe(0);
    });

    it("child RECTANGLE gets correct dimensions and relative insets from absoluteBoundingBox", () => {
      const childRect: figrest.RectangleNode = {
        id: "1:2",
        name: "Child Rect",
        type: "RECTANGLE",
        scrollBehavior: "SCROLLS",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 30, y: 50, width: 100, height: 80 },
        absoluteRenderBounds: { x: 30, y: 50, width: 100, height: 80 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        fills: [],
        strokes: [],
        strokeWeight: 1,
        strokeAlign: "INSIDE",
        effects: [],
        cornerRadius: 0,
        exportSettings: [],
        interactions: [],
        // Intentionally omit: size, relativeTransform
      } as figrest.RectangleNode;

      const frameNode = makeFrameNodeWithoutGeometry({
        children: [childRect as unknown as figrest.SubcanvasNode],
      });

      const { document: doc } = iofigma.restful.factory.document(
        frameNode,
        {},
        context
      );

      const rectGrida = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.RectangleNode =>
          n.type === "rectangle" && n.name === "Child Rect"
      );
      expect(rectGrida).toBeDefined();

      // Dimensions from absoluteBoundingBox
      expect(rectGrida!.layout_target_width).toBe(100);
      expect(rectGrida!.layout_target_height).toBe(80);

      // Relative insets: child(30,50) - parent(10,20) = (20, 30)
      expect(rectGrida!.layout_inset_left).toBe(20);
      expect(rectGrida!.layout_inset_top).toBe(30);
    });

    it("child ELLIPSE gets correct dimensions and relative insets", () => {
      const childEllipse: figrest.EllipseNode = {
        id: "1:3",
        name: "Circle",
        type: "ELLIPSE",
        scrollBehavior: "SCROLLS",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 60, y: 70, width: 50, height: 50 },
        absoluteRenderBounds: { x: 60, y: 70, width: 50, height: 50 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        fills: [],
        strokes: [],
        strokeWeight: 1,
        strokeAlign: "INSIDE",
        effects: [],
        exportSettings: [],
        interactions: [],
        arcData: { startingAngle: 0, endingAngle: 6.28, innerRadius: 0 },
        // Intentionally omit: size, relativeTransform
      } as figrest.EllipseNode;

      const frameNode = makeFrameNodeWithoutGeometry({
        children: [childEllipse as unknown as figrest.SubcanvasNode],
      });

      const { document: doc } = iofigma.restful.factory.document(
        frameNode,
        {},
        context
      );

      const ellipseGrida = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.EllipseNode =>
          n.type === "ellipse" && n.name === "Circle"
      );
      expect(ellipseGrida).toBeDefined();
      expect(ellipseGrida!.layout_target_width).toBe(50);
      expect(ellipseGrida!.layout_target_height).toBe(50);
      // Relative insets: child(60,70) - parent(10,20) = (50, 50)
      expect(ellipseGrida!.layout_inset_left).toBe(50);
      expect(ellipseGrida!.layout_inset_top).toBe(50);
    });

    it("nested child FRAME gets dimensions and relative insets computed from absolute positions", () => {
      const grandchildRect: figrest.RectangleNode = {
        id: "1:4",
        name: "GrandchildRect",
        type: "RECTANGLE",
        scrollBehavior: "SCROLLS",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 50, y: 60, width: 80, height: 60 },
        absoluteRenderBounds: { x: 50, y: 60, width: 80, height: 60 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        fills: [],
        strokes: [],
        strokeWeight: 1,
        strokeAlign: "INSIDE",
        effects: [],
        cornerRadius: 0,
        exportSettings: [],
        interactions: [],
      } as figrest.RectangleNode;

      const childFrame: figrest.FrameNode = {
        id: "1:5",
        name: "ChildFrame",
        type: "FRAME",
        scrollBehavior: "SCROLLS",
        blendMode: "PASS_THROUGH",
        clipsContent: true,
        absoluteBoundingBox: { x: 40, y: 50, width: 200, height: 150 },
        absoluteRenderBounds: { x: 40, y: 50, width: 200, height: 150 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        fills: [],
        strokes: [],
        strokeWeight: 1,
        strokeAlign: "INSIDE",
        effects: [],
        exportSettings: [],
        interactions: [],
        background: [],
        backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
        children: [grandchildRect as unknown as figrest.SubcanvasNode],
      } as figrest.FrameNode;

      const rootFrame = makeFrameNodeWithoutGeometry({
        children: [childFrame as unknown as figrest.SubcanvasNode],
      });

      const { document: doc } = iofigma.restful.factory.document(
        rootFrame,
        {},
        context
      );

      const childGrida = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.ContainerNode =>
          n.type === "container" && n.name === "ChildFrame"
      );
      expect(childGrida).toBeDefined();
      // ChildFrame: size from absoluteBoundingBox
      expect(childGrida!.layout_target_width).toBe(200);
      expect(childGrida!.layout_target_height).toBe(150);
      // Relative to root(10,20): (40-10, 50-20) = (30, 30)
      expect(childGrida!.layout_inset_left).toBe(30);
      expect(childGrida!.layout_inset_top).toBe(30);

      const grandchildGrida = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.RectangleNode =>
          n.type === "rectangle" && n.name === "GrandchildRect"
      );
      expect(grandchildGrida).toBeDefined();
      expect(grandchildGrida!.layout_target_width).toBe(80);
      expect(grandchildGrida!.layout_target_height).toBe(60);
      // Relative to childFrame(40,50): (50-40, 60-50) = (10, 10)
      expect(grandchildGrida!.layout_inset_left).toBe(10);
      expect(grandchildGrida!.layout_inset_top).toBe(10);
    });
  });

  describe("TEXT node without geometry=paths", () => {
    it("TEXT node uses absoluteBoundingBox for dimensions when size is absent", () => {
      const textNode: figrest.TextNode = {
        id: "4:1",
        name: "Label",
        type: "TEXT",
        scrollBehavior: "SCROLLS",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 20, y: 30, width: 128, height: 16 },
        absoluteRenderBounds: { x: 20, y: 30, width: 120, height: 12 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        fills: [
          {
            type: "SOLID",
            color: { r: 0, g: 0, b: 0, a: 1 },
            blendMode: "NORMAL",
            visible: true,
          },
        ],
        strokes: [],
        strokeWeight: 1,
        strokeAlign: "INSIDE",
        effects: [],
        exportSettings: [],
        interactions: [],
        characters: "Hello World",
        style: {
          fontFamily: "Inter",
          fontPostScriptName: "Inter-Regular",
          fontWeight: 400,
          fontSize: 14,
          textAlignHorizontal: "LEFT",
          textAlignVertical: "TOP",
          letterSpacing: 0,
          lineHeightPx: 16,
          lineHeightPercent: 100,
          lineHeightPercentFontSize: 114,
          lineHeightUnit: "PIXELS",
          italic: false,
          textDecoration: "NONE",
          textAutoResize: "HEIGHT",
          paragraphIndent: 0,
          paragraphSpacing: 0,
          hangingList: false,
          hangingPunctuation: false,
          listSpacing: 0,
          fontVariations: [],
          fills: [],
          opentypeFlags: {},
        },
        // Intentionally omit: size, relativeTransform
      } as figrest.TextNode;

      const frameNode = makeFrameNodeWithoutGeometry({
        children: [textNode as unknown as figrest.SubcanvasNode],
      });

      // Should NOT throw when size / relativeTransform are absent
      expect(() => {
        iofigma.restful.factory.document(frameNode, {}, context);
      }).not.toThrow();

      const { document: doc } = iofigma.restful.factory.document(
        frameNode,
        {},
        context
      );

      const textGrida = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.TextSpanNode =>
          n.type === "tspan" && n.name === "Label"
      );
      expect(textGrida).toBeDefined();
      // Width from absoluteBoundingBox: 128; height depends on textAutoResize=HEIGHT → "auto"
      expect(textGrida!.layout_target_width).toBe(128);
      expect(textGrida!.layout_target_height).toBe("auto");
    });
  });

  describe("issue-585: full REST API JSON document (no geometry=paths)", () => {
    it("converts the reported figma-file.json structure without zero-sized nodes", () => {
      // Reproduces the exact node structure from the uploaded figma-file.json
      const rootFrame: figrest.FrameNode = {
        id: "1:97",
        name: "ws-intense-next-advertising-agency/",
        type: "FRAME",
        scrollBehavior: "SCROLLS",
        blendMode: "PASS_THROUGH",
        clipsContent: true,
        absoluteBoundingBox: { x: 38, y: -245, width: 420, height: 490 },
        absoluteRenderBounds: { x: 38, y: -245, width: 420, height: 490 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        fills: [],
        strokes: [],
        strokeWeight: 1,
        strokeAlign: "INSIDE",
        effects: [],
        exportSettings: [],
        interactions: [],
        background: [],
        backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
        children: [
          {
            id: "1:113",
            name: "border",
            type: "RECTANGLE",
            scrollBehavior: "SCROLLS",
            blendMode: "PASS_THROUGH",
            absoluteBoundingBox: { x: 58, y: -217, width: 380, height: 462 },
            // absoluteRenderBounds is null for node 1:113 in the reported file
            absoluteRenderBounds: null,
            constraints: { vertical: "TOP", horizontal: "LEFT" },
            fills: [],
            strokes: [],
            strokeWeight: 1,
            strokeAlign: "INSIDE",
            effects: [],
            cornerRadius: 0,
            exportSettings: [],
            interactions: [],
          } as unknown as figrest.SubcanvasNode,
        ],
        // Intentionally omit: size, relativeTransform
      } as figrest.FrameNode;

      const { document: doc } = iofigma.restful.factory.document(
        rootFrame,
        {},
        context
      );

      // Root frame must have positive dimensions (not 0x0 which would panic in Rust)
      const rootGrida = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.ContainerNode =>
          n.type === "container" &&
          n.name === "ws-intense-next-advertising-agency/"
      );
      expect(rootGrida).toBeDefined();
      expect(rootGrida!.layout_target_width).toBeGreaterThan(0);
      expect(rootGrida!.layout_target_height).toBeGreaterThan(0);

      // Child with null absoluteRenderBounds but valid absoluteBoundingBox
      const childGrida = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.RectangleNode =>
          n.type === "rectangle" && n.name === "border"
      );
      expect(childGrida).toBeDefined();
      expect(childGrida!.layout_target_width).toBeGreaterThan(0);
      expect(childGrida!.layout_target_height).toBeGreaterThan(0);
    });
  });

  describe("individualStrokeWeights (per-side stroke widths)", () => {
    it("FRAME with individualStrokeWeights maps to rectangular_stroke_width_*", () => {
      const frameNode = makeFrameNodeWithoutGeometry({
        individualStrokeWeights: { top: 2, right: 0, bottom: 4, left: 0 },
      } as Partial<figrest.FrameNode>);

      const { document: doc } = iofigma.restful.factory.document(
        frameNode,
        {},
        context
      );

      const containerGrida = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.ContainerNode => n.type === "container"
      );
      expect(containerGrida).toBeDefined();
      expect(containerGrida!.rectangular_stroke_width_top).toBe(2);
      expect(containerGrida!.rectangular_stroke_width_right).toBe(0);
      expect(containerGrida!.rectangular_stroke_width_bottom).toBe(4);
      expect(containerGrida!.rectangular_stroke_width_left).toBe(0);
    });

    it("RECTANGLE with individualStrokeWeights maps to rectangular_stroke_width_*", () => {
      const rectNode: figrest.RectangleNode = {
        id: "1:2",
        name: "Rect",
        type: "RECTANGLE",
        scrollBehavior: "SCROLLS",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 100 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        fills: [],
        strokes: [],
        strokeWeight: 1,
        strokeAlign: "INSIDE",
        effects: [],
        cornerRadius: 0,
        exportSettings: [],
        interactions: [],
        individualStrokeWeights: { top: 0, right: 3, bottom: 0, left: 5 },
      } as figrest.RectangleNode;

      const frameNode = makeFrameNodeWithoutGeometry({
        children: [rectNode as unknown as figrest.SubcanvasNode],
      });

      const { document: doc } = iofigma.restful.factory.document(
        frameNode,
        {},
        context
      );

      const rectGrida = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.RectangleNode =>
          n.type === "rectangle" && n.name === "Rect"
      );
      expect(rectGrida).toBeDefined();
      expect(rectGrida!.rectangular_stroke_width_top).toBe(0);
      expect(rectGrida!.rectangular_stroke_width_right).toBe(3);
      expect(rectGrida!.rectangular_stroke_width_bottom).toBe(0);
      expect(rectGrida!.rectangular_stroke_width_left).toBe(5);
    });

    it("FRAME without individualStrokeWeights does not set rectangular_stroke_width_*", () => {
      const frameNode = makeFrameNodeWithoutGeometry();

      const { document: doc } = iofigma.restful.factory.document(
        frameNode,
        {},
        context
      );

      const containerGrida = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.ContainerNode => n.type === "container"
      );
      expect(containerGrida).toBeDefined();
      expect(containerGrida!.rectangular_stroke_width_top).toBeUndefined();
      expect(containerGrida!.rectangular_stroke_width_right).toBeUndefined();
      expect(containerGrida!.rectangular_stroke_width_bottom).toBeUndefined();
      expect(containerGrida!.rectangular_stroke_width_left).toBeUndefined();
    });
  });
});
