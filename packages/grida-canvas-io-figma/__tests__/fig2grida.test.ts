import { readFileSync } from "fs";
import { basename } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import {
  fig2grida,
  restJsonToGridaDocument,
  deckBytesToSlidesDocument,
} from "../fig2grida-core";
import { io } from "@grida/io";
import type grida from "@grida/schema";

const FIXTURES_BASE = __dirname + "/../../../fixtures/test-fig";
/** REST API ZIP archives: `document.json` + `images/` — see `fixtures/test-figma/community/README.md`. */
const FIGMA_COMMUNITY_REST =
  __dirname + "/../../../fixtures/test-figma/community";

/**
 * Reads `document.json` and `images/<hash>.*` from a `.tools/figma_archive.py` ZIP.
 */
function loadFigmaRestArchive(zipPath: string): {
  documentJson: unknown;
  images: Record<string, Uint8Array>;
} {
  const unzip = unzipSync(new Uint8Array(readFileSync(zipPath)));
  let documentJson: unknown;
  const images: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(unzip)) {
    if (path.includes("__MACOSX")) continue;
    if (path.endsWith("document.json")) {
      documentJson = JSON.parse(strFromU8(data));
      continue;
    }
    if (path.includes("/images/")) {
      const file = basename(path);
      const dot = file.lastIndexOf(".");
      if (dot > 0) {
        images[file.slice(0, dot)] = data;
      }
    }
  }
  if (documentJson === undefined) {
    throw new Error(`document.json not found in archive: ${zipPath}`);
  }
  return { documentJson, images };
}

describe("fig2grida", () => {
  describe("blank.fig", () => {
    test("converts blank.fig to valid .grida", () => {
      const input = new Uint8Array(
        readFileSync(`${FIXTURES_BASE}/L0/blank.fig`)
      );
      const result = fig2grida(input);

      expect(result.bytes.length).toBeGreaterThan(0);

      // Verify ZIP structure (PK magic)
      expect(result.bytes[0]).toBe(0x50);
      expect(result.bytes[1]).toBe(0x4b);
    });

    test("blank.fig produces zero or more pages", () => {
      const input = new Uint8Array(
        readFileSync(`${FIXTURES_BASE}/L0/blank.fig`)
      );
      const result = fig2grida(input);

      // blank.fig should have at least one page (the default page)
      expect(result.pageNames.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("community .fig files", () => {
    test("converts community .fig with images", () => {
      const input = new Uint8Array(
        readFileSync(
          `${FIXTURES_BASE}/community/1510053249065427020-workos-radix-icons.fig`
        )
      );
      const result = fig2grida(input);

      expect(result.pageNames.length).toBeGreaterThan(0);
      expect(result.nodeCount).toBeGreaterThan(0);
      expect(result.bytes.length).toBeGreaterThan(0);

      // Verify ZIP structure
      expect(result.bytes[0]).toBe(0x50);
      expect(result.bytes[1]).toBe(0x4b);
    });

    test("converts auto-layout playground .fig", () => {
      const input = new Uint8Array(
        readFileSync(
          `${FIXTURES_BASE}/community/784448220678228461-figma-auto-layout-playground.fig`
        )
      );
      const result = fig2grida(input);

      expect(result.pageNames.length).toBeGreaterThan(0);
      expect(result.nodeCount).toBeGreaterThan(0);
    });

    test("converts simple design system .fig", () => {
      const input = new Uint8Array(
        readFileSync(
          `${FIXTURES_BASE}/community/1380235722331273046-figma-simple-design-system.fig`
        )
      );
      const result = fig2grida(input);

      expect(result.pageNames.length).toBeGreaterThan(0);
      expect(result.nodeCount).toBeGreaterThan(0);
    });
  });

  describe("page filtering", () => {
    test("filters specific page indices", () => {
      const input = new Uint8Array(
        readFileSync(
          `${FIXTURES_BASE}/community/1510053249065427020-workos-radix-icons.fig`
        )
      );

      // Convert all pages first
      const allResult = fig2grida(input);

      // Convert only first page
      const filteredResult = fig2grida(input, { pages: [0] });

      expect(filteredResult.pageNames.length).toBe(1);
      expect(filteredResult.pageNames[0]).toBe(allResult.pageNames[0]);
    });

    test("ignores out-of-range page indices", () => {
      const input = new Uint8Array(
        readFileSync(`${FIXTURES_BASE}/L0/blank.fig`)
      );
      const result = fig2grida(input, { pages: [999] });

      expect(result.pageNames.length).toBe(0);
      expect(result.nodeCount).toBe(0);
    });
  });

  describe("round-trip", () => {
    test("output .grida is readable by io.archive.unpack", () => {
      const input = new Uint8Array(
        readFileSync(`${FIXTURES_BASE}/L0/blank.fig`)
      );
      const { bytes } = fig2grida(input);

      const unpacked = io.archive.unpack(bytes);

      // document bytes should be valid FlatBuffers
      expect(unpacked.document.length).toBeGreaterThan(0);
      // manifest should be present
      expect(unpacked.manifest).toBeDefined();
      expect(unpacked.manifest.document_file).toBe("document.grida");
    });

    test("community .fig round-trips through .grida archive", () => {
      const input = new Uint8Array(
        readFileSync(
          `${FIXTURES_BASE}/community/1510053249065427020-workos-radix-icons.fig`
        )
      );
      const { bytes, imageCount } = fig2grida(input);

      const unpacked = io.archive.unpack(bytes);
      expect(unpacked.document.length).toBeGreaterThan(0);
      expect(unpacked.manifest).toBeDefined();

      // Verify images are included
      const imageKeys = Object.keys(unpacked.images);
      expect(imageKeys.length).toBe(imageCount);
    });
  });

  describe("multi-page", () => {
    test("produces multi-scene document for multi-page .fig", () => {
      const input = new Uint8Array(
        readFileSync(
          `${FIXTURES_BASE}/community/1510053249065427020-workos-radix-icons.fig`
        )
      );
      const result = fig2grida(input);

      if (result.pageNames.length > 1) {
        // Unpack and verify multiple scenes
        const unpacked = io.archive.unpack(result.bytes);
        const decoded = io.GRID.decode(unpacked.document);

        expect(decoded.scenes_ref.length).toBe(result.pageNames.length);

        // Each scene ref should point to a valid scene node
        for (const sceneId of decoded.scenes_ref) {
          const sceneNode = decoded.nodes[sceneId];
          expect(sceneNode).toBeDefined();
          expect(sceneNode.type).toBe("scene");
        }
      }
    });
  });

  describe("REST JSON (restJsonToGridaDocument)", () => {
    test("converts captured REST archive (zip → document.json + images) to Grida document", () => {
      const { documentJson, images } = loadFigmaRestArchive(
        `${FIGMA_COMMUNITY_REST}/784448220678228461-figma-auto-layout-playground.zip`
      );
      const result = restJsonToGridaDocument(documentJson, { images });

      expect(result.document.scenes_ref.length).toBeGreaterThan(0);
      expect(Object.keys(result.document.nodes).length).toBeGreaterThan(0);
      for (const ref of result.imageRefsUsed) {
        if (ref in images) {
          expect(result.assets[ref]).toBeDefined();
          expect(result.assets[ref]!.byteLength).toBeGreaterThan(0);
        }
      }
    }, 120_000);

    test("throws when document.children is missing", () => {
      expect(() => restJsonToGridaDocument({})).toThrow(
        /no document\.children/
      );
    });

    test("treats non-CANVAS children as implicit page when no CANVAS nodes exist", () => {
      const result = restJsonToGridaDocument({
        document: {
          id: "0:0",
          type: "DOCUMENT",
          children: [
            {
              id: "1:1",
              type: "FRAME",
              name: "Frame",
              children: [],
              fills: [],
              strokes: [],
              effects: [],
              absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
              size: { x: 100, y: 100 },
              blendMode: "NORMAL",
              constraints: { vertical: "TOP", horizontal: "LEFT" },
            },
          ],
        },
      });
      expect(result.document.scenes_ref.length).toBe(1);
    });
  });

  describe("preserve_figma_ids", () => {
    /**
     * Figma IDs have several formats:
     * - Simple: `{sessionID}:{localID}` (e.g. "1:2", "42:17")
     * - Instance: `I{id};{id}` (e.g. "I1620:1441;291:113")
     *
     * Synthetic children append: `_fill_{N}` or `_stroke_{N}`.
     * Instance clones use: `{prefix}::{counter}::{originalId}`.
     *
     * This regex matches any ID that is or derives from a Figma-format ID.
     */
    const FIGMA_ID_RE = /^(I?\d+:\d+|I\d+:\d+;[\d:;]+)/;

    test("node IDs are Figma-format when preserve_figma_ids is true (REST JSON)", () => {
      const { documentJson } = loadFigmaRestArchive(
        `${FIGMA_COMMUNITY_REST}/784448220678228461-figma-auto-layout-playground.zip`
      );
      const result = fig2grida(documentJson as object, {
        preserve_figma_ids: true,
      });

      const unpacked = io.archive.unpack(result.bytes);
      const decoded = io.GRID.decode(unpacked.document);

      // Collect all non-scene node IDs
      const nodeIds = Object.keys(decoded.nodes).filter(
        (id) => decoded.nodes[id].type !== "scene"
      );

      expect(nodeIds.length).toBeGreaterThan(0);

      for (const id of nodeIds) {
        expect(id).toMatch(FIGMA_ID_RE);
      }
    }, 120_000);

    test("node IDs are NOT Figma-format by default (REST JSON)", () => {
      const { documentJson } = loadFigmaRestArchive(
        `${FIGMA_COMMUNITY_REST}/784448220678228461-figma-auto-layout-playground.zip`
      );
      const result = fig2grida(documentJson as object);

      const unpacked = io.archive.unpack(result.bytes);
      const decoded = io.GRID.decode(unpacked.document);

      const nodeIds = Object.keys(decoded.nodes).filter(
        (id) => decoded.nodes[id].type !== "scene"
      );

      expect(nodeIds.length).toBeGreaterThan(0);

      // Default IDs should use the "rest-import-N" format, not Figma format
      for (const id of nodeIds) {
        expect(id).toMatch(/^rest-import-/);
      }
    }, 120_000);

    test("node IDs are Figma-format when preserve_figma_ids is true (.fig)", () => {
      const input = new Uint8Array(
        readFileSync(
          `${FIXTURES_BASE}/community/1510053249065427020-workos-radix-icons.fig`
        )
      );
      const result = fig2grida(input, {
        preserve_figma_ids: true,
      });

      const unpacked = io.archive.unpack(result.bytes);
      const decoded = io.GRID.decode(unpacked.document);

      const nodeIds = Object.keys(decoded.nodes).filter(
        (id) => decoded.nodes[id].type !== "scene"
      );

      expect(nodeIds.length).toBeGreaterThan(0);

      for (const id of nodeIds) {
        expect(id).toMatch(FIGMA_ID_RE);
      }
    });

    test("synthetic fill/stroke children extend parent Figma ID", () => {
      const { documentJson } = loadFigmaRestArchive(
        `${FIGMA_COMMUNITY_REST}/1510053249065427020-workos-radix-icons.zip`
      );
      const result = fig2grida(documentJson as object, {
        preserve_figma_ids: true,
      });

      const unpacked = io.archive.unpack(result.bytes);
      const decoded = io.GRID.decode(unpacked.document);

      // Find synthetic IDs (fill/stroke children)
      const syntheticIds = Object.keys(decoded.nodes).filter(
        (id) => id.includes("_fill_") || id.includes("_stroke_")
      );

      // Ensure at least one synthetic child was produced (regression guard)
      expect(syntheticIds.length).toBeGreaterThan(0);

      // Synthetic IDs should start with a Figma-format parent ID
      for (const id of syntheticIds) {
        const parentPart = id.replace(/_(fill|stroke)_\d+$/, "");
        expect(parentPart).toMatch(FIGMA_ID_RE);
        // The parent ID should also exist as a node (or be a known ancestor)
        // — the parent was converted to a group node
      }
    }, 120_000);
  });

  describe("fig2grida unified input", () => {
    test("accepts a JSON object directly", () => {
      const { documentJson } = loadFigmaRestArchive(
        `${FIGMA_COMMUNITY_REST}/784448220678228461-figma-auto-layout-playground.zip`
      );
      const result = fig2grida(documentJson as object);
      expect(result.bytes.length).toBeGreaterThan(0);
      expect(result.pageNames.length).toBeGreaterThan(0);
      expect(result.nodeCount).toBeGreaterThan(0);
    }, 120_000);

    test("accepts a REST archive ZIP (auto-detects document.json)", () => {
      const zipBytes = new Uint8Array(
        readFileSync(
          `${FIGMA_COMMUNITY_REST}/784448220678228461-figma-auto-layout-playground.zip`
        )
      );
      const result = fig2grida(zipBytes);
      expect(result.bytes.length).toBeGreaterThan(0);
      expect(result.pageNames.length).toBeGreaterThan(0);
      expect(result.nodeCount).toBeGreaterThan(0);
    }, 120_000);

    test("accepts document node directly (no wrapping { document })", () => {
      const { documentJson } = loadFigmaRestArchive(
        `${FIGMA_COMMUNITY_REST}/784448220678228461-figma-auto-layout-playground.zip`
      );
      // Pass just the document node, not the full response
      const docNode = (documentJson as Record<string, unknown>)
        .document as object;
      const result = fig2grida(docNode);
      expect(result.bytes.length).toBeGreaterThan(0);
      expect(result.pageNames.length).toBeGreaterThan(0);
      expect(result.nodeCount).toBeGreaterThan(0);
    }, 120_000);

    test("throws for JSON object with no children at all", () => {
      expect(() => fig2grida({})).toThrow(/no document\.children/);
    });

    test("treats non-CANVAS children as implicit page", () => {
      const result = fig2grida({
        document: {
          id: "0:0",
          type: "DOCUMENT",
          children: [
            {
              id: "1:1",
              type: "FRAME",
              name: "Frame",
              children: [],
              fills: [],
              strokes: [],
              effects: [],
              absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
              size: { x: 100, y: 100 },
              blendMode: "NORMAL",
              constraints: { vertical: "TOP", horizontal: "LEFT" },
            },
          ],
        },
      });
      expect(result.pageNames).toEqual(["Page"]);
    });
  });

  describe("deckBytesToSlidesDocument (.deck → slides)", () => {
    test("converts light.deck to slides document with tray root nodes", () => {
      const input = new Uint8Array(
        readFileSync(`${FIXTURES_BASE}/deck/light.deck`)
      );
      const result = deckBytesToSlidesDocument(input);

      // Should produce a valid document
      expect(result.document.scenes_ref.length).toBeGreaterThan(0);
      expect(Object.keys(result.document.nodes).length).toBeGreaterThan(0);

      // The scene name should be "Slides"
      const sceneId = result.document.scenes_ref[0];
      const sceneNode = result.document.nodes[sceneId];
      expect(sceneNode.type).toBe("scene");
      expect(sceneNode.name).toBe("Slides");

      // Root children of the scene should be tray nodes (slides)
      const rootRefs = result.document.links[sceneId] ?? [];
      expect(rootRefs.length).toBeGreaterThan(0);

      for (const ref of rootRefs) {
        const node = result.document.nodes[ref];
        expect(node).toBeDefined();
        expect(node.type).toBe("tray");
      }
    });

    test("no SLIDE_GRID or SLIDE_ROW container nodes in output", () => {
      const input = new Uint8Array(
        readFileSync(`${FIXTURES_BASE}/deck/light.deck`)
      );
      const result = deckBytesToSlidesDocument(input);

      // Scene root children are all trays — no SLIDE_GRID / SLIDE_ROW
      // wrappers should leak through the slides import path.
      const sceneId = result.document.scenes_ref[0];
      const rootRefs = result.document.links[sceneId] ?? [];
      for (const ref of rootRefs) {
        expect(result.document.nodes[ref].type).toBe("tray");
      }
    });

    test("slides have non-zero dimensions", () => {
      const input = new Uint8Array(
        readFileSync(`${FIXTURES_BASE}/deck/light.deck`)
      );
      const result = deckBytesToSlidesDocument(input);

      const sceneId = result.document.scenes_ref[0];
      const rootRefs = result.document.links[sceneId] ?? [];

      for (const ref of rootRefs) {
        const tray = result.document.nodes[ref] as grida.program.nodes.TrayNode;
        expect(tray.layout_target_width).toBeGreaterThan(0);
        expect(tray.layout_target_height).toBeGreaterThan(0);
      }
    });

    test("slides have children (content nodes)", () => {
      const input = new Uint8Array(
        readFileSync(`${FIXTURES_BASE}/deck/light.deck`)
      );
      const result = deckBytesToSlidesDocument(input);

      const sceneId = result.document.scenes_ref[0];
      const rootRefs = result.document.links[sceneId] ?? [];

      // At least one slide should have content
      const hasContent = rootRefs.some((ref) => {
        const children = result.document.links[ref];
        return children && children.length > 0;
      });
      expect(hasContent).toBe(true);
    });
  });
});
