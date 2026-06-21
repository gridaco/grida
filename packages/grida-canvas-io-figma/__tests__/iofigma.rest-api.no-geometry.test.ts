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
import type cg from "@grida/cg";

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

  describe("per-fill opacity (SOLID)", () => {
    function rectWithFill(fill: figrest.Paint): figrest.RectangleNode {
      return {
        id: "1:2",
        name: "Rect",
        type: "RECTANGLE",
        scrollBehavior: "SCROLLS",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 100 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        fills: [fill],
        strokes: [],
        strokeWeight: 1,
        strokeAlign: "INSIDE",
        effects: [],
        cornerRadius: 0,
        exportSettings: [],
        interactions: [],
      } as unknown as figrest.RectangleNode;
    }

    function solidFillOf(node: figrest.RectangleNode) {
      const { document: doc } = iofigma.restful.factory.document(
        node,
        {},
        context
      );
      const rect = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.RectangleNode => n.type === "rectangle"
      )!;
      const paints = (rect as unknown as { fill_paints?: unknown[] })
        .fill_paints;
      const paint = (paints?.[0] ??
        (rect as unknown as { fill?: unknown }).fill) as cg.SolidPaint;
      return paint;
    }

    // The renderer has no separate opacity channel for SOLID paints, so the
    // per-fill `opacity` must be baked into the color's alpha. Otherwise it is
    // silently dropped (the symptom reported against refig 0.0.5).
    it("bakes per-fill opacity into the SOLID color alpha", () => {
      const paint = solidFillOf(
        rectWithFill({
          type: "SOLID",
          opacity: 0.1,
          color: { r: 1, g: 1, b: 1, a: 1 },
          blendMode: "NORMAL",
          visible: true,
        } as figrest.Paint)
      );
      expect(paint.type).toBe("solid");
      expect(paint.color.a).toBeCloseTo(0.1, 5);
    });

    it("multiplies per-fill opacity with the color's own alpha", () => {
      const paint = solidFillOf(
        rectWithFill({
          type: "SOLID",
          opacity: 0.5,
          color: { r: 1, g: 1, b: 1, a: 0.4 },
          blendMode: "NORMAL",
          visible: true,
        } as figrest.Paint)
      );
      expect(paint.color.a).toBeCloseTo(0.2, 5);
    });

    it("defaults to the color alpha when opacity is absent", () => {
      const paint = solidFillOf(
        rectWithFill({
          type: "SOLID",
          color: { r: 1, g: 1, b: 1, a: 1 },
          blendMode: "NORMAL",
          visible: true,
        } as figrest.Paint)
      );
      expect(paint.color.a).toBeCloseTo(1, 5);
    });
  });

  describe("IMAGE scaleMode CROP (STRETCH) imageTransform", () => {
    function rectWithFill(fill: figrest.Paint): figrest.RectangleNode {
      return {
        id: "1:2",
        name: "Rect",
        type: "RECTANGLE",
        scrollBehavior: "SCROLLS",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 100 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        fills: [fill],
        strokes: [],
        strokeWeight: 1,
        strokeAlign: "INSIDE",
        effects: [],
        cornerRadius: 0,
        exportSettings: [],
        interactions: [],
      } as unknown as figrest.RectangleNode;
    }

    function imageFillOf(node: figrest.RectangleNode) {
      const { document: doc } = iofigma.restful.factory.document(
        node,
        {},
        context
      );
      const rect = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.RectangleNode => n.type === "rectangle"
      )!;
      const paints = (rect as unknown as { fill_paints?: unknown[] })
        .fill_paints;
      return (paints?.[0] ??
        (rect as unknown as { fill?: unknown }).fill) as cg.ImagePaint;
    }

    // Figma's `imageTransform` (only present for scaleMode STRETCH = editor
    // CROP) maps container -> image (the sampled crop). Grida's only fit that
    // honors a transform is "transform", and it expects image -> container, so
    // the matrix must be inverted. Otherwise the crop is dropped and the whole
    // image is stretched to fill (the refig 0.0.5 symptom).
    it("routes STRETCH+imageTransform to fit:transform with the inverse matrix", () => {
      const paint = imageFillOf(
        rectWithFill({
          type: "IMAGE",
          scaleMode: "STRETCH",
          imageRef: "ref-1",
          // pure vertical scale 0.5 + y-translate 0.1
          imageTransform: [
            [1, 0, 0],
            [0, 0.5, 0.1],
          ],
          blendMode: "NORMAL",
          visible: true,
        } as unknown as figrest.Paint)
      );
      expect(paint.type).toBe("image");
      expect(paint.fit).toBe("transform");
      // inverse of [[1,0,0],[0,0.5,0.1]] = [[1,0,0],[0,2,-0.2]]
      expect(paint.transform![0][0]).toBeCloseTo(1, 6);
      expect(paint.transform![0][1]).toBeCloseTo(0, 6);
      expect(paint.transform![0][2]).toBeCloseTo(0, 6);
      expect(paint.transform![1][0]).toBeCloseTo(0, 6);
      expect(paint.transform![1][1]).toBeCloseTo(2, 6);
      expect(paint.transform![1][2]).toBeCloseTo(-0.2, 6);
    });

    it("keeps fit:cover for FILL (no crop routing)", () => {
      const paint = imageFillOf(
        rectWithFill({
          type: "IMAGE",
          scaleMode: "FILL",
          imageRef: "ref-1",
          blendMode: "NORMAL",
          visible: true,
        } as unknown as figrest.Paint)
      );
      expect(paint.fit).toBe("cover");
    });

    it("falls back to fit:fill for STRETCH without an imageTransform", () => {
      const paint = imageFillOf(
        rectWithFill({
          type: "IMAGE",
          scaleMode: "STRETCH",
          imageRef: "ref-1",
          blendMode: "NORMAL",
          visible: true,
        } as unknown as figrest.Paint)
      );
      expect(paint.fit).toBe("fill");
    });
  });

  describe("flipped node bakes transform into gradient fill", () => {
    // A vertically-flipped rectangle (relativeTransform scaleY = -1, the way
    // Figma encodes a flipped scrim) with a vertical linear gradient. The flip
    // is baked into the path geometry; the gradient must be flipped with it,
    // otherwise it renders upside-down (the refig 0.0.5 symptom on the photo
    // darkening band). Requires geometry (fillGeometry) → prefer_path_for_geometry.
    function flippedGradientRect(): figrest.RectangleNode {
      return {
        id: "1:2",
        name: "Scrim",
        type: "RECTANGLE",
        scrollBehavior: "SCROLLS",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        size: { x: 100, y: 100 },
        // vertical flip: scaleY = -1, ty = 100
        relativeTransform: [
          [1, 0, 0],
          [0, -1, 100],
        ],
        fillGeometry: [
          { path: "M0 0L100 0L100 100L0 100Z", windingRule: "NONZERO" },
        ],
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        fills: [
          {
            type: "GRADIENT_LINEAR",
            blendMode: "NORMAL",
            // start top, end bottom (local space)
            gradientHandlePositions: [
              { x: 0.5, y: 0 },
              { x: 0.5, y: 1 },
              { x: 0, y: 0 },
            ],
            gradientStops: [
              { color: { r: 0, g: 0, b: 0, a: 0 }, position: 0 },
              { color: { r: 0, g: 0, b: 0, a: 0.5 }, position: 1 },
            ],
          } as figrest.Paint,
        ],
        strokes: [],
        strokeWeight: 1,
        strokeAlign: "INSIDE",
      } as unknown as figrest.RectangleNode;
    }

    it("composes the flip into the gradient transform", () => {
      const { document: doc } = iofigma.restful.factory.document(
        flippedGradientRect(),
        {},
        { ...context, gradient_id_generator: () => "g1" }
      );
      // geometry path node carrying the fill
      const path = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.PathNode =>
          n.type === "path" &&
          Array.isArray((n as { fill_paints?: unknown[] }).fill_paints)
      )!;
      const grad = (path as unknown as { fill_paints: cg.Paint[] })
        .fill_paints[0] as cg.LinearGradientPaint;
      expect(grad.type).toBe("linear_gradient");
      // Base transform for A=(.5,0)->B=(.5,1) is [[0,-1,1],[1,0,0]]. The
      // vertical flip N=[[1,0,0],[0,-1,1]] composes to [[0,-1,1],[-1,0,1]],
      // which moves the dark stop to the top — matching Figma's render.
      const t = grad.transform!;
      expect(t[0][0]).toBeCloseTo(0, 5);
      expect(t[0][1]).toBeCloseTo(-1, 5);
      expect(t[0][2]).toBeCloseTo(1, 5);
      expect(t[1][0]).toBeCloseTo(-1, 5);
      expect(t[1][1]).toBeCloseTo(0, 5);
      expect(t[1][2]).toBeCloseTo(1, 5);
    });
  });

  describe("auto-layout → flex (prefer_auto_layout)", () => {
    // A HORIZONTAL HUG auto-layout frame with one HUG text child.
    function autoLayoutFrame(): figrest.FrameNode {
      const text = {
        id: "1:2",
        name: "Label",
        type: "TEXT",
        scrollBehavior: "SCROLLS",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 30, y: 16, width: 80, height: 40 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        fills: [],
        strokes: [],
        characters: "Hi",
        style: {
          fontFamily: "Inter",
          fontSize: 40,
          textAlignHorizontal: "CENTER",
          textAutoResize: "WIDTH_AND_HEIGHT",
        },
        layoutSizingHorizontal: "HUG",
        layoutSizingVertical: "HUG",
      } as unknown as figrest.SubcanvasNode;
      return makeFrameNodeWithoutGeometry({
        id: "1:1",
        name: "Pill",
        layoutMode: "HORIZONTAL",
        layoutSizingHorizontal: "HUG",
        layoutSizingVertical: "HUG",
        primaryAxisAlignItems: "CENTER",
        counterAxisAlignItems: "CENTER",
        paddingLeft: 30,
        paddingRight: 30,
        paddingTop: 16,
        paddingBottom: 16,
        itemSpacing: 8,
        children: [text],
      } as Partial<figrest.FrameNode>);
    }

    function convert(preferAutoLayout: boolean) {
      const { document: doc } = iofigma.restful.factory.document(
        autoLayoutFrame(),
        {},
        { ...context, prefer_auto_layout: preferAutoLayout }
      );
      const frame = Object.values(doc.nodes).find(
        (n): n is grida.program.nodes.ContainerNode =>
          n.type === "container" && n.name === "Pill"
      )!;
      const text = Object.values(doc.nodes).find(
        (n) => n.name === "Label"
      ) as unknown as grida.program.nodes.i.ILayoutChildTrait &
        grida.program.nodes.i.ICSSDimension;
      return { frame, text };
    }

    it("maps a HORIZONTAL HUG frame to a flex container", () => {
      const { frame } = convert(true);
      expect(frame.layout_mode).toBe("flex");
      expect(frame.layout_direction).toBe("horizontal");
      expect(frame.layout_main_axis_alignment).toBe("center");
      expect(frame.layout_cross_axis_alignment).toBe("center");
      expect(frame.layout_main_axis_gap).toBe(8);
      // HUG axes size to content.
      expect(frame.layout_target_width).toBe("auto");
      expect(frame.layout_target_height).toBe("auto");
      // Padding is emitted as the per-side fields the encoder reads.
      expect(frame.layout_padding_left).toBe(30);
      expect(frame.layout_padding_top).toBe(16);
    });

    it("flows in-flow children as relative + auto-sized", () => {
      const { text } = convert(true);
      expect(text.layout_positioning).toBe("relative");
      expect(text.layout_target_width).toBe("auto");
      expect(text.layout_target_height).toBe("auto");
    });

    it("stays a flow container with absolute children when disabled", () => {
      const { frame, text } = convert(false);
      expect(frame.layout_mode).toBe("flow");
      expect(typeof frame.layout_target_width).toBe("number");
      expect(text.layout_positioning).toBe("absolute");
    });
  });
});
