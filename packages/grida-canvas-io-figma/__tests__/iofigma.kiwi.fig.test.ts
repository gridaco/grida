import { readFileSync } from "fs";
import { iofigma } from "../lib";
import { readFigFile, type NodeChange } from "../fig-kiwi";

const FigImporter = iofigma.kiwi.FigImporter;

type AnyFigmaNode = iofigma.kiwi.AnyFigmaNode;

function countNodes(node: AnyFigmaNode): number {
  if (!node) return 0;
  let count = 1;
  if ("children" in node && Array.isArray(node.children)) {
    node.children.forEach((child: AnyFigmaNode) => {
      count += countNodes(child);
    });
  }
  return count;
}

function getDepth(node: AnyFigmaNode, depth = 0): number {
  if (!node) return depth;
  let max = depth + 1;
  if ("children" in node && Array.isArray(node.children)) {
    node.children.forEach((child: AnyFigmaNode) => {
      max = Math.max(max, getDepth(child, depth + 1));
    });
  }
  return max;
}

function countKiwiDescendants(
  canvasGuid: string,
  allNodes: NodeChange[]
): number {
  const visited = new Set<string>([canvasGuid]);
  const queue = [canvasGuid];

  while (queue.length > 0) {
    const parentGuid = queue.shift()!;
    allNodes
      .filter((nc) => {
        if (!nc.parentIndex?.guid) return false;
        return iofigma.kiwi.guid(nc.parentIndex.guid) === parentGuid;
      })
      .forEach((child) => {
        if (child.guid) {
          const childGuid = iofigma.kiwi.guid(child.guid);
          if (!visited.has(childGuid)) {
            visited.add(childGuid);
            queue.push(childGuid);
          }
        }
      });
  }

  return visited.size - 1; // Exclude CANVAS itself
}

function getKiwiDepth(canvasGuid: string, allNodes: NodeChange[]): number {
  const guidToChildren = new Map<string, NodeChange[]>();

  allNodes.forEach((nc) => {
    if (nc.parentIndex?.guid && nc.guid) {
      const parentGuid = iofigma.kiwi.guid(nc.parentIndex.guid);
      if (!guidToChildren.has(parentGuid)) guidToChildren.set(parentGuid, []);
      guidToChildren.get(parentGuid)!.push(nc);
    }
  });

  let maxDepth = 0;
  const queue = [{ guid: canvasGuid, depth: 0 }];

  while (queue.length > 0) {
    const { guid, depth } = queue.shift()!;
    maxDepth = Math.max(maxDepth, depth);
    (guidToChildren.get(guid) || []).forEach((child) => {
      if (child.guid) {
        queue.push({ guid: iofigma.kiwi.guid(child.guid), depth: depth + 1 });
      }
    });
  }

  return maxDepth;
}

describe("FigImporter", () => {
  const testFixture =
    __dirname +
    "/../../../fixtures/test-fig/community/1510053249065427020-workos-radix-icons.fig";

  describe("parseFile", () => {
    it("should parse and extract pages with metadata", () => {
      const data = readFileSync(testFixture);
      const figFile = FigImporter.parseFile(data);

      expect(figFile.pages.length).toBeGreaterThan(0);
      expect(figFile.metadata.version).toBeGreaterThan(0);
      expect(figFile.pages.every((p) => typeof p.name === "string")).toBe(true);
    });

    it("should preserve complete node hierarchy (strict count and depth check)", () => {
      const data = readFileSync(testFixture);
      const figData = readFigFile(data);
      const nodeChanges = figData.message.nodeChanges || [];

      const iconsCanvas = nodeChanges.find(
        (nc) => nc.type === "CANVAS" && nc.name?.includes("Icons")
      );

      if (!iconsCanvas?.guid) return; // Skip if fixture doesn't have Icons page

      const canvasGuidStr = iofigma.kiwi.guid(iconsCanvas.guid);
      const rawCount = countKiwiDescendants(canvasGuidStr, nodeChanges);
      const rawDepth = getKiwiDepth(canvasGuidStr, nodeChanges);

      const figFile = FigImporter.parseFile(data);
      const iconsPage = figFile.pages.find((p) => p.name.includes("Icons"))!;

      let processedCount = 0;
      let processedDepth = 0;

      iconsPage.rootNodes.forEach((rootNode) => {
        processedCount += countNodes(rootNode);
        processedDepth = Math.max(processedDepth, getDepth(rootNode));
      });

      // Strict assertions: must preserve ALL nodes and FULL depth
      expect(processedCount).toBe(rawCount);
      expect(processedDepth).toBe(rawDepth);
    });

    it("should handle empty pages without errors", () => {
      const data = readFileSync(
        __dirname + "/../../../fixtures/test-fig/L0/blank.fig"
      );
      const figFile = FigImporter.parseFile(data);

      expect(figFile.pages).toBeDefined();
    });

    it("should skip internal-only canvases (component libraries)", () => {
      const data = readFileSync(testFixture);
      const figData = readFigFile(data);
      const nodeChanges = figData.message.nodeChanges || [];

      // Find all CANVAS nodes
      const allCanvasNodes = nodeChanges.filter((nc) => nc.type === "CANVAS");
      const internalCanvases = allCanvasNodes.filter((nc) => nc.internalOnly);

      // Parse with FigImporter
      const figFile = FigImporter.parseFile(data);

      // Verify internal canvases are excluded
      const parsedPageNames = figFile.pages.map((p) => p.name);
      internalCanvases.forEach((canvas) => {
        expect(parsedPageNames).not.toContain(canvas.name);
      });

      // Verify we have at least one internal canvas in the fixture
      expect(internalCanvases.length).toBeGreaterThan(0);
      const internalCanvas = internalCanvases[0];

      // Count symbols in internal canvas
      const children = nodeChanges.filter((nc) => {
        if (!nc.parentIndex?.guid || !internalCanvas.guid) return false;
        return (
          iofigma.kiwi.guid(nc.parentIndex.guid) ===
          iofigma.kiwi.guid(internalCanvas.guid)
        );
      });
      const symbolChildren = children.filter((nc) => nc.type === "SYMBOL");

      // Internal canvas should contain symbols (component definitions)
      expect(symbolChildren.length).toBeGreaterThan(0);
    });
  });

  describe("convertPageToScene", () => {
    it("should merge all roots into single packed document", () => {
      const data = readFileSync(testFixture);
      const figFile = FigImporter.parseFile(data);
      const { document: packedDoc } = FigImporter.convertPageToScene(
        figFile.pages[0],
        {
          gradient_id_generator: () => "test-id",
        }
      );

      expect(packedDoc.nodes).toBeDefined();
      expect(packedDoc.links).toBeDefined();
      expect(packedDoc.scene).toBeDefined();
      expect(Array.isArray(packedDoc.scene.children_refs)).toBe(true);

      // All root IDs must exist in nodes
      packedDoc.scene.children_refs.forEach((rootId: string) => {
        expect(packedDoc.nodes[rootId]).toBeDefined();
      });
    });

    it("should not drop roots when merging (no node_id collisions)", () => {
      // This is a regression test for a bug where multiple root conversions could
      // generate colliding Grida IDs (when node_id_generator was not provided),
      // causing later roots to overwrite earlier ones during merge.
      const mockPage = {
        name: "Mock",
        sortkey: "!",
        canvas: {
          type: "CANVAS",
          name: "Mock",
          guid: { sessionID: 0, localID: 1 },
        } satisfies NodeChange,
        rootNodes: [
          // Minimal REST-ish nodes; restful.factory.document will generate new Grida IDs anyway.
          {
            id: "0:100",
            type: "FRAME",
            name: "RootA",
            visible: true,
            locked: false,
            rotation: 0,
            opacity: 1,
            blendMode: "PASS_THROUGH",
            size: { x: 10, y: 10 },
            relativeTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
            absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
            absoluteRenderBounds: { x: 0, y: 0, width: 10, height: 10 },
            fills: [],
            strokes: [],
            strokeWeight: 0,
            strokeAlign: "INSIDE",
            strokeCap: "NONE",
            strokeJoin: "MITER",
            strokeMiterAngle: 4,
            cornerRadius: 0,
            clipsContent: false,
            children: [],
            effects: [],
          },
          {
            id: "0:101",
            type: "FRAME",
            name: "RootB",
            visible: true,
            locked: false,
            rotation: 0,
            opacity: 1,
            blendMode: "PASS_THROUGH",
            size: { x: 10, y: 10 },
            relativeTransform: [
              [1, 0, 20],
              [0, 1, 0],
            ],
            absoluteBoundingBox: { x: 20, y: 0, width: 10, height: 10 },
            absoluteRenderBounds: { x: 20, y: 0, width: 10, height: 10 },
            fills: [],
            strokes: [],
            strokeWeight: 0,
            strokeAlign: "INSIDE",
            strokeCap: "NONE",
            strokeJoin: "MITER",
            strokeMiterAngle: 4,
            cornerRadius: 0,
            clipsContent: false,
            children: [],
            effects: [],
          },
        ] as AnyFigmaNode[],
      };

      const { document: packedDoc } = FigImporter.convertPageToScene(mockPage, {
        gradient_id_generator: () => "test-id",
        // Intentionally omit node_id_generator to exercise the internal shared generator.
      });

      const uniqueRoots = new Set(packedDoc.scene.children_refs);
      expect(uniqueRoots.size).toBe(2);
      packedDoc.scene.children_refs.forEach((rootId: string) => {
        expect(packedDoc.nodes[rootId]).toBeDefined();
      });
    });
  });

  describe("page ordering", () => {
    it("should include sortkey property for page ordering", () => {
      const data = readFileSync(testFixture);
      const figFile = FigImporter.parseFile(data);

      // All pages should have sortkey property
      figFile.pages.forEach((page) => {
        expect(page.sortkey).toBeDefined();
        expect(typeof page.sortkey).toBe("string");
      });

      // Pages can be sorted by sortkey (codepoint comparison, NOT localeCompare)
      const sortedPages = [...figFile.pages].sort((a, b) =>
        a.sortkey < b.sortkey ? -1 : a.sortkey > b.sortkey ? 1 : 0
      );
      expect(sortedPages.length).toBe(figFile.pages.length);
    });
  });

  describe("FigDeck (.deck) import", () => {
    const deckFixture =
      __dirname + "/../../../fixtures/test-fig/deck/light.deck";

    it("should parse deck file and produce 42 slides", () => {
      const data = readFileSync(deckFixture);
      const figFile = FigImporter.parseFile(data);

      expect(figFile.pages.length).toBe(1);

      // Count X_SLIDE nodes in the converted tree
      function countByType(node: AnyFigmaNode, type: string): number {
        let count = node.type === type ? 1 : 0;
        if ("children" in node && Array.isArray(node.children)) {
          node.children.forEach((child: AnyFigmaNode) => {
            count += countByType(child, type);
          });
        }
        return count;
      }

      const page = figFile.pages[0];
      let slideCount = 0;
      page.rootNodes.forEach((root) => {
        slideCount += countByType(root, "X_SLIDE");
      });

      expect(slideCount).toBe(42);
    });

    it("should preserve complete slide hierarchy (no dropped subtrees)", () => {
      const data = readFileSync(deckFixture);
      const figData = readFigFile(data);
      const nodeChanges = figData.message.nodeChanges || [];

      const canvas = nodeChanges.find(
        (nc) => nc.type === "CANVAS" && !nc.internalOnly
      );
      if (!canvas?.guid) return;

      const canvasGuidStr = iofigma.kiwi.guid(canvas.guid);
      const rawCount = countKiwiDescendants(canvasGuidStr, nodeChanges);

      // Count nodes with types that are intentionally unsupported (e.g. SHAPE_WITH_TEXT)
      const unsupportedTypes = new Set(["SHAPE_WITH_TEXT"]);
      const unsupportedCount = nodeChanges.filter(
        (nc) => nc.type && unsupportedTypes.has(nc.type)
      ).length;

      const figFile = FigImporter.parseFile(data);
      const page = figFile.pages[0];

      let processedCount = 0;
      page.rootNodes.forEach((rootNode) => {
        processedCount += countNodes(rootNode);
      });

      // All supported nodes must be preserved — only unsupported FigJam-crossover types may be absent
      expect(processedCount).toBe(rawCount - unsupportedCount);
    });

    it("should convert deck to Grida document without errors", () => {
      const data = readFileSync(deckFixture);
      const figFile = FigImporter.parseFile(data);
      const { document: packedDoc } = FigImporter.convertPageToScene(
        figFile.pages[0],
        { gradient_id_generator: () => "test-id" }
      );

      expect(packedDoc.nodes).toBeDefined();
      expect(packedDoc.scene).toBeDefined();
      expect(packedDoc.scene.children_refs.length).toBeGreaterThan(0);

      // All root IDs must exist in nodes
      packedDoc.scene.children_refs.forEach((rootId: string) => {
        expect(packedDoc.nodes[rootId]).toBeDefined();
      });
    });
  });
});
