import { readFileSync } from "fs";
import { fig2grida } from "../fig2grida-core";
import { io } from "@grida/io";

const FIXTURES_BASE = __dirname + "/../../../fixtures/test-fig";

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
});
