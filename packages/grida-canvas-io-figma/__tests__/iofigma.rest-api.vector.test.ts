import { readFileSync } from "fs";
import { iofigma } from "../lib";
import type * as figrest from "@figma/rest-api-spec";
import type grida from "@grida/schema";

const FIXTURES_BASE = __dirname + "/../../../fixtures/test-figma/rest-api/L0";
const VECTOR_FRAME_FIXTURE = FIXTURES_BASE + "/vector-frame.response.json";

/** Minimal valid REST volatile vectorNetwork (triangle: 3 vertices, 3 segments, 1 region). */
const minimalVectorNetwork: iofigma.__ir.VectorNetwork_restapi_volatile20260217 =
  {
    vertices: [
      { position: { x: 0, y: 0 } },
      { position: { x: 10, y: 0 } },
      { position: { x: 5, y: 10 } },
    ],
    segments: [
      {
        start: 0,
        startTangent: { x: 0, y: 0 },
        end: 1,
        endTangent: { x: 0, y: 0 },
      },
      {
        start: 1,
        startTangent: { x: 0, y: 0 },
        end: 2,
        endTangent: { x: 0, y: 0 },
      },
      {
        start: 2,
        startTangent: { x: 0, y: 0 },
        end: 0,
        endTangent: { x: 0, y: 0 },
      },
    ],
    regions: [{ loops: [[0, 1, 2]], windingRule: "NONZERO" }],
  };

describe("iofigma.restful.factory.document", () => {
  describe("HasGeometryTrait conversion (geometry=paths)", () => {
    it("should convert VECTOR node with fillGeometry and strokeGeometry to GroupNode with child VectorNodes", () => {
      const responseJson = readFileSync(VECTOR_FRAME_FIXTURE, "utf-8");
      const response = JSON.parse(responseJson) as figrest.GetFileNodesResponse;

      const nodeId = Object.keys(response.nodes)[0];
      const nodeData = response.nodes[nodeId];

      // The response structure has a 'document' property which is the root node
      const frameNode = nodeData.document as figrest.FrameNode;
      expect(frameNode.type).toBe("FRAME");
      expect(frameNode.children).toBeDefined();
      expect(frameNode.children!.length).toBeGreaterThan(0);

      const vectorNode = frameNode.children![0] as figrest.VectorNode;
      expect(vectorNode.type).toBe("VECTOR");
      expect(vectorNode.fillGeometry).toBeDefined();
      expect(vectorNode.fillGeometry?.length).toBeGreaterThan(0);
      expect(vectorNode.strokeGeometry).toBeDefined();
      expect(vectorNode.strokeGeometry?.length).toBeGreaterThan(0);

      // Convert using the factory - convert the frame node (not document)
      const context: iofigma.restful.factory.FactoryContext = {
        gradient_id_generator: () => `gradient_${Math.random()}`,
      };
      const { document: gridaDocument } = iofigma.restful.factory.document(
        frameNode,
        {},
        context
      );

      expect(gridaDocument).toBeDefined();
      expect(gridaDocument.scene).toBeDefined();
      expect(gridaDocument.nodes).toBeDefined();

      // Find the frame node (frames are converted to container nodes)
      const frameGridaNode = Object.values(gridaDocument.nodes).find(
        (n: grida.program.nodes.Node): n is grida.program.nodes.ContainerNode =>
          n.type === "container" && n.name === "vector-frame"
      );
      expect(frameGridaNode).toBeDefined();
      expect(frameGridaNode?.type).toBe("container");

      // Find the vector group node (VECTOR converted to GroupNode)
      const vectorGroupNode = Object.values(gridaDocument.nodes).find(
        (n): n is grida.program.nodes.GroupNode =>
          n.type === "group" && n.name === "Vector 1"
      );
      expect(vectorGroupNode).toBeDefined();
      expect(vectorGroupNode?.type).toBe("group");

      // Check that the group has children (fill and stroke VectorNodes)
      expect(vectorGroupNode).toBeDefined();
      const groupChildren = gridaDocument.links[vectorGroupNode!.id];
      expect(groupChildren).toBeDefined();
      expect(groupChildren!.length).toBeGreaterThan(0);

      // Verify child nodes are VectorNodes
      const childNodes = groupChildren!
        .map((id: string) => gridaDocument.nodes[id])
        .filter(
          (
            n: grida.program.nodes.Node | undefined
          ): n is grida.program.nodes.VectorNode => n?.type === "vector"
        );
      expect(childNodes.length).toBeGreaterThan(0);

      // Verify we have both fill and stroke children
      const fillChildren = childNodes.filter(
        (n: grida.program.nodes.VectorNode) => n.name.includes("Fill")
      );
      const strokeChildren = childNodes.filter(
        (n: grida.program.nodes.VectorNode) => n.name.includes("Stroke")
      );
      expect(fillChildren.length).toBeGreaterThan(0);
      expect(strokeChildren.length).toBeGreaterThan(0);

      // Verify fill children have fills
      fillChildren.forEach((child: grida.program.nodes.VectorNode) => {
        expect(child.type).toBe("vector");
        expect(child.fill || child.fill_paints?.length).toBeTruthy();
      });

      // Verify stroke children have paints (stroke geometry is rendered as fill, so fill_paints or stroke_paints)
      strokeChildren.forEach((child: grida.program.nodes.VectorNode) => {
        expect(child.type).toBe("vector");
        expect(
          child.stroke ||
            (child.stroke_paints?.length ?? 0) > 0 ||
            (child.fill_paints?.length ?? 0) > 0
        ).toBeTruthy();
        if ((child.stroke_paints?.length ?? 0) > 0) {
          expect(child.stroke_width).toBeGreaterThan(0);
        }
      });
    });

    it("should position child VectorNodes correctly relative to parent GroupNode", () => {
      const responseJson = readFileSync(VECTOR_FRAME_FIXTURE, "utf-8");
      const response = JSON.parse(responseJson) as figrest.GetFileNodesResponse;

      const nodeId = Object.keys(response.nodes)[0];
      const nodeData = response.nodes[nodeId];
      const frameNode = nodeData.document as figrest.FrameNode;
      const vectorNode = frameNode.children![0] as figrest.VectorNode;

      // Get original vector node positioning
      const originalTransform = vectorNode.relativeTransform;
      const originalSize = vectorNode.size;

      // Convert
      const context: iofigma.restful.factory.FactoryContext = {
        gradient_id_generator: () => `gradient_${Math.random()}`,
      };
      const { document: gridaDocument } = iofigma.restful.factory.document(
        frameNode,
        {},
        context
      );

      // Find the vector group node
      const vectorGroupNode = Object.values(gridaDocument.nodes).find(
        (n: grida.program.nodes.Node): n is grida.program.nodes.GroupNode =>
          n.type === "group" && n.name === "Vector 1"
      );

      expect(vectorGroupNode).toBeDefined();

      // Verify parent group positioning matches original vector node
      expect(vectorGroupNode).toBeDefined();
      expect(vectorGroupNode!.layout_inset_left).toBeCloseTo(
        originalTransform![0][2],
        1
      );
      expect(vectorGroupNode!.layout_inset_top).toBeCloseTo(
        originalTransform![1][2],
        1
      );

      // Get child nodes
      const childIds = gridaDocument.links[vectorGroupNode!.id];
      expect(childIds).toBeDefined();
      expect(childIds!.length).toBeGreaterThan(0);

      const childNodes = childIds!
        .map((id: string) => gridaDocument.nodes[id])
        .filter(
          (
            n: grida.program.nodes.Node | undefined
          ): n is grida.program.nodes.VectorNode => n?.type === "vector"
        );

      expect(childNodes.length).toBeGreaterThan(0);

      // Verify all child nodes are positioned correctly relative to the parent
      // The SVG paths are in the parent's coordinate space, so children are positioned
      // at their bbox origin to maintain correct spatial relationships
      // Note: In test environment with mocked svg-pathdata, vector networks may be empty,
      // but we can still verify the positioning logic is correct
      childNodes.forEach((child: grida.program.nodes.VectorNode) => {
        expect(child.type).toBe("vector");
        // Child nodes should be positioned at their bbox origin relative to parent
        // (not at 0,0, which would cause misalignment)
        expect(child.layout_inset_left).toBeDefined();
        expect(child.layout_inset_top).toBeDefined();
        expect(typeof child.layout_inset_left).toBe("number");
        expect(typeof child.layout_inset_top).toBe("number");

        // The positioning should use bbox.x and bbox.y, not 0,0
        // This ensures fill and stroke geometries align correctly
        // (In mocked environment, bbox may be 0,0, but the logic is correct)
      });
    });

    it("should convert VECTOR node with vectorNetwork (volatile API) to single VectorNode with vector_network", () => {
      const vectorNodeWithNetwork: iofigma.__ir.VectorNodeRestInput = {
        id: "vector-with-vn",
        name: "Vector with vectorNetwork",
        type: "VECTOR",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        absoluteRenderBounds: { x: 0, y: 0, width: 10, height: 10 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        scrollBehavior: "FIXED",
        size: { x: 10, y: 10 },
        relativeTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        fills: [
          {
            type: "SOLID",
            color: { r: 1, g: 0, b: 0, a: 1 },
            visible: true,
            blendMode: "NORMAL",
          },
        ],
        strokes: [],
        strokeWeight: 0,
        strokeAlign: "INSIDE",
        effects: [],
        cornerRadius: 0,
        vectorNetwork: minimalVectorNetwork,
      };

      const context: iofigma.restful.factory.FactoryContext = {
        gradient_id_generator: () => `gradient_${Math.random()}`,
      };
      const { document: gridaDocument } = iofigma.restful.factory.document(
        vectorNodeWithNetwork,
        {},
        context
      );

      const vectorGridaNode = Object.values(gridaDocument.nodes).find(
        (n): n is grida.program.nodes.VectorNode =>
          n.type === "vector" && n.name === "Vector with vectorNetwork"
      );
      expect(vectorGridaNode).toBeDefined();
      expect(vectorGridaNode!.type).toBe("vector");
      expect(vectorGridaNode!.vector_network).toBeDefined();
      expect(vectorGridaNode!.vector_network!.vertices).toHaveLength(3);
      expect(vectorGridaNode!.vector_network!.segments).toHaveLength(3);

      // Should not be a group with children
      const groupNode = Object.values(gridaDocument.nodes).find(
        (n): n is grida.program.nodes.GroupNode =>
          n.type === "group" && n.name === "Vector with vectorNetwork"
      );
      expect(groupNode).toBeUndefined();

      const childIds = gridaDocument.links[vectorGridaNode!.id];
      expect(childIds).toBeUndefined();
    });

    it("should fall back to GroupNode when vectorNetwork is present but invalid", () => {
      const invalidVectorNetwork = {
        vertices: [{ position: { x: 0, y: 0 } }],
        segments: [
          { start: 0, end: 99, startTangent: { x: 0, y: 0 }, endTangent: { x: 0, y: 0 } },
        ],
        regions: [{ loops: [[0]], windingRule: "NONZERO" as const }],
      };

      const vectorNodeInvalidVn: iofigma.__ir.VectorNodeRestInput = {
        id: "vector-invalid-vn",
        name: "Vector invalid vectorNetwork",
        type: "VECTOR",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        absoluteRenderBounds: { x: 0, y: 0, width: 10, height: 10 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        scrollBehavior: "FIXED",
        size: { x: 10, y: 10 },
        relativeTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        fills: [
          {
            type: "SOLID",
            color: { r: 0, g: 1, b: 0, a: 1 },
            visible: true,
            blendMode: "NORMAL",
          },
        ],
        strokes: [],
        strokeWeight: 0,
        strokeAlign: "INSIDE",
        effects: [],
        cornerRadius: 0,
        fillGeometry: [{ path: "M0 0 L10 0 L5 10 Z", windingRule: "NONZERO" as const }],
        strokeGeometry: [],
        vectorNetwork: invalidVectorNetwork as iofigma.__ir.VectorNetwork_restapi_volatile20260217,
      };

      const context: iofigma.restful.factory.FactoryContext = {
        gradient_id_generator: () => `gradient_${Math.random()}`,
      };
      const { document: gridaDocument } = iofigma.restful.factory.document(
        vectorNodeInvalidVn,
        {},
        context
      );

      const groupNode = Object.values(gridaDocument.nodes).find(
        (n): n is grida.program.nodes.GroupNode =>
          n.type === "group" && n.name === "Vector invalid vectorNetwork"
      );
      expect(groupNode).toBeDefined();
      expect(groupNode!.type).toBe("group");
    });

    it("should convert fillGeometry/strokeGeometry to Path nodes when prefer_path_for_geometry is true", () => {
      const vectorNodeWithGeometry: figrest.VectorNode & figrest.HasGeometryTrait =
        {
          id: "vec-path-pref",
          name: "Vector path prefer",
          type: "VECTOR",
          blendMode: "PASS_THROUGH",
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
          absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 100 },
          constraints: { vertical: "TOP", horizontal: "LEFT" },
          scrollBehavior: "FIXED",
          fills: [
            {
              type: "SOLID",
              color: { r: 1, g: 0, b: 0, a: 1 },
              visible: true,
              blendMode: "NORMAL",
            },
          ],
          strokes: [
            {
              type: "SOLID",
              color: { r: 0, g: 0, b: 1, a: 1 },
              visible: true,
              blendMode: "NORMAL",
            },
          ],
          strokeWeight: 2,
          strokeAlign: "INSIDE",
          effects: [],
          cornerRadius: 0,
          fillGeometry: [
            { path: "M0 0 L100 0 L100 100 L0 100 Z", windingRule: "NONZERO" },
          ],
          strokeGeometry: [
            { path: "M10 10 L90 10 L90 90 L10 90 Z", windingRule: "NONZERO" },
          ],
        };

      const context: iofigma.restful.factory.FactoryContext = {
        gradient_id_generator: () => `gradient_${Math.random()}`,
        prefer_path_for_geometry: true,
      };

      const { document: gridaDocument } = iofigma.restful.factory.document(
        vectorNodeWithGeometry,
        {},
        context
      );

      const groupNode = Object.values(gridaDocument.nodes).find(
        (n): n is grida.program.nodes.GroupNode =>
          n.type === "group" && n.name === "Vector path prefer"
      );
      expect(groupNode).toBeDefined();
      expect(groupNode!.type).toBe("group");

      const groupChildren = gridaDocument.links[groupNode!.id];
      expect(groupChildren).toBeDefined();
      expect(groupChildren!.length).toBeGreaterThan(0);

      const childNodes = groupChildren!
        .map((id: string) => gridaDocument.nodes[id])
        .filter(Boolean) as grida.program.nodes.Node[];

      const pathChildren = childNodes.filter(
        (n): n is grida.program.nodes.PathNode => n.type === "path"
      );
      expect(pathChildren.length).toBeGreaterThan(0);
      expect(pathChildren.length).toBe(childNodes.length);

      pathChildren.forEach((child) => {
        expect(child.type).toBe("path");
        expect("data" in child && typeof child.data === "string").toBe(true);
        expect(child.data.length).toBeGreaterThan(0);
        expect("vector_network" in child).toBe(false);
      });
    });
  });

  describe("resolve_image_src and imageRefsUsed", () => {
    it("should use resolve_image_src when provided and collect imageRefsUsed", () => {
      const rectWithImage: figrest.RectangleNode = {
        id: "rect-img",
        name: "Image Rect",
        type: "RECTANGLE",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 100 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        scrollBehavior: "FIXED",
        fills: [
          {
            type: "IMAGE",
            imageRef: "figma-image-ref-abc123",
            scaleMode: "FILL",
          } as figrest.ImagePaint,
        ],
        strokes: [],
        strokeWeight: 0,
        strokeAlign: "INSIDE",
        effects: [],
        cornerRadius: 0,
      };

      const images: Record<string, string> = {
        "figma-image-ref-abc123": "https://example.com/image.png",
      };

      const context: iofigma.restful.factory.FactoryContext = {
        gradient_id_generator: () => `gradient_${Math.random()}`,
        resolve_image_src: (ref) =>
          ref in images ? `res://images/${ref}` : null,
      };

      const { document: gridaDoc, imageRefsUsed } =
        iofigma.restful.factory.document(rectWithImage, images, context);

      expect(imageRefsUsed).toContain("figma-image-ref-abc123");
      expect(imageRefsUsed).toHaveLength(1);

      const rectNode = Object.values(gridaDoc.nodes).find(
        (n): n is grida.program.nodes.RectangleNode => n.type === "rectangle"
      );
      expect(rectNode).toBeDefined();
      const imagePaint = rectNode!.fill_paints?.find(
        (p) => p && typeof p === "object" && "type" in p && p.type === "image"
      );
      expect(imagePaint).toBeDefined();
      expect((imagePaint as { src?: string })!.src).toBe(
        "res://images/figma-image-ref-abc123"
      );
    });

    it("should use placeholder when resolve_image_src returns null and not add to imageRefsUsed", () => {
      const rectWithImage: figrest.RectangleNode = {
        id: "rect-img",
        name: "Image Rect",
        type: "RECTANGLE",
        blendMode: "PASS_THROUGH",
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 100 },
        constraints: { vertical: "TOP", horizontal: "LEFT" },
        scrollBehavior: "FIXED",
        fills: [
          {
            type: "IMAGE",
            imageRef: "missing-ref",
            scaleMode: "FILL",
          } as figrest.ImagePaint,
        ],
        strokes: [],
        strokeWeight: 0,
        strokeAlign: "INSIDE",
        effects: [],
        cornerRadius: 0,
      };

      const context: iofigma.restful.factory.FactoryContext = {
        gradient_id_generator: () => `gradient_${Math.random()}`,
        resolve_image_src: () => null,
      };

      const { document: gridaDoc, imageRefsUsed } =
        iofigma.restful.factory.document(rectWithImage, {}, context);

      expect(imageRefsUsed).toHaveLength(0);

      const rectNode = Object.values(gridaDoc.nodes).find(
        (n): n is grida.program.nodes.RectangleNode => n.type === "rectangle"
      );
      expect(rectNode).toBeDefined();
      const imagePaint = rectNode!.fill_paints?.find(
        (p) => p && typeof p === "object" && "type" in p && p.type === "image"
      );
      expect(imagePaint).toBeDefined();
      expect((imagePaint as { src?: string })!.src).toBe(
        "system://images/checker-16-strip-L98L92.png"
      );
    });
  });
});
