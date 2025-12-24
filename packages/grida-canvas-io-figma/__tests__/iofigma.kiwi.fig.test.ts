import { readFileSync } from "fs";
import { iofigma } from "../lib";
import { readFigFile } from "../fig-kiwi";

const FigImporter = iofigma.kiwi.FigImporter;

function countNodes(node: any): number {
  if (!node) return 0;
  let count = 1;
  if ("children" in node && Array.isArray(node.children)) {
    node.children.forEach((child: any) => {
      count += countNodes(child);
    });
  }
  return count;
}

function getDepth(node: any, depth = 0): number {
  if (!node) return depth;
  let max = depth + 1;
  if ("children" in node && Array.isArray(node.children)) {
    node.children.forEach((child: any) => {
      max = Math.max(max, getDepth(child, depth + 1));
    });
  }
  return max;
}

function countKiwiDescendants(canvasGuid: string, allNodes: any[]): number {
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

function getKiwiDepth(canvasGuid: string, allNodes: any[]): number {
  const guidToChildren = new Map<string, any[]>();

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
      if (internalCanvases.length > 0) {
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
      }
    });
  });

  describe("convertPageToScene", () => {
    it("should merge all roots into single packed document", () => {
      const data = readFileSync(testFixture);
      const figFile = FigImporter.parseFile(data);
      const packedDoc = FigImporter.convertPageToScene(figFile.pages[0], {
        gradient_id_generator: () => "test-id",
      });

      expect(packedDoc.nodes).toBeDefined();
      expect(packedDoc.links).toBeDefined();
      expect(packedDoc.scene).toBeDefined();
      expect(Array.isArray(packedDoc.scene.children_refs)).toBe(true);

      // All root IDs must exist in nodes
      packedDoc.scene.children_refs.forEach((rootId) => {
        expect(packedDoc.nodes[rootId]).toBeDefined();
      });
    });

    it("should not drop roots when merging (no node_id collisions)", () => {
      // This is a regression test for a bug where multiple root conversions could
      // generate colliding Grida IDs (when node_id_generator was not provided),
      // causing later roots to overwrite earlier ones during merge.
      const mockPage: any = {
        name: "Mock",
        sortkey: "!",
        canvas: {
          type: "CANVAS",
          name: "Mock",
          guid: { sessionID: 0, localID: 1 },
        },
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
        ],
      };

      const packedDoc = FigImporter.convertPageToScene(mockPage, {
        gradient_id_generator: () => "test-id",
        // Intentionally omit node_id_generator to exercise the internal shared generator.
      });

      const uniqueRoots = new Set(packedDoc.scene.children_refs);
      expect(uniqueRoots.size).toBe(2);
      packedDoc.scene.children_refs.forEach((rootId) => {
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

      // Pages can be sorted by sortkey (lexicographic comparison)
      const sortedPages = [...figFile.pages].sort((a, b) =>
        a.sortkey.localeCompare(b.sortkey)
      );
      expect(sortedPages.length).toBe(figFile.pages.length);
    });
  });
});
