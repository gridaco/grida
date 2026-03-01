// @vitest-environment node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { unzipSync } from "fflate";
import { join } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import {
  FigmaDocument,
  FigmaRenderer,
  collectExportsFromDocument,
  exportSettingToRenderOptions,
} from "../index";
import { figBytesToRestLikeDocument } from "../lib";

// ---------------------------------------------------------------------------
// Binary signatures for output validation
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function expectPng(data: Uint8Array) {
  expect(Array.from(data.slice(0, 8))).toEqual(PNG_SIGNATURE);
  expect(data.byteLength).toBeGreaterThan(100);
}

function expectSvg(data: Uint8Array) {
  const text = new TextDecoder().decode(data);
  expect(text).toContain("<svg");
}

function expectPdf(data: Uint8Array) {
  const text = new TextDecoder().decode(data.slice(0, 5));
  expect(text).toBe("%PDF-");
}

function expectJpegOrFallbackImage(data: Uint8Array) {
  // JPEG starts with FF D8 FF.
  // Some WASM Skia builds may fall back to PNG when JPEG encoding is
  // unavailable. Accept either as valid raster output.
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isPng =
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47;
  expect(isJpeg || isPng).toBe(true);
  expect(data.byteLength).toBeGreaterThan(100);
}

// ---------------------------------------------------------------------------
// Output directory
// ---------------------------------------------------------------------------

const TEST_OUTPUT_DIR = join(process.cwd(), "__tests__", ".tmp", "lib");

// ---------------------------------------------------------------------------
// Minimal Figma REST-like fixture
//
// Single fixture for all tests. One page, one FRAME with solid fill and a
// TEXT child. Used for rendering, listFontFamilies, and collectExports (when
// exportSettings are added programmatically).
// ---------------------------------------------------------------------------

const MINIMAL_REST_FIXTURE = {
  document: {
    id: "0:0",
    type: "DOCUMENT",
    name: "Test Doc",
    children: [
      {
        id: "0:1",
        type: "CANVAS",
        name: "Page 1",
        children: [
          {
            id: "1:1",
            type: "FRAME",
            name: "Frame 1",
            absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
            absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 100 },
            relativeTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
            size: { x: 100, y: 100 },
            clipsContent: false,
            fills: [{ type: "SOLID", color: { r: 0.8, g: 0.2, b: 0.2, a: 1 } }],
            strokes: [],
            strokeWeight: 0,
            effects: [],
            children: [
              {
                id: "1:2",
                type: "TEXT",
                name: "Label",
                characters: "Hello",
                style: {
                  fontFamily: "Inter",
                  fontSize: 16,
                  fontWeight: 400,
                  textAlignHorizontal: "LEFT",
                  textAlignVertical: "TOP",
                  textDecoration: "NONE",
                  lineHeightPercentFontSize: 100,
                },
                absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 20 },
                absoluteRenderBounds: { x: 0, y: 0, width: 40, height: 20 },
                relativeTransform: [
                  [1, 0, 0],
                  [0, 1, 0],
                ],
                size: { x: 40, y: 20 },
                fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
                strokes: [],
                strokeWeight: 0,
                effects: [],
              },
            ],
          },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("collectExportsFromDocument", () => {
  it("returns empty array when document has no pages", () => {
    const items = collectExportsFromDocument({
      document: { children: [] },
    } as any);
    expect(items).toEqual([]);
  });

  it("returns empty array when no node has exportSettings", () => {
    const items = collectExportsFromDocument(MINIMAL_REST_FIXTURE as any);
    expect(items).toEqual([]);
  });

  it("returns one item per (node, setting) for nodes with exportSettings", () => {
    const doc = JSON.parse(JSON.stringify(MINIMAL_REST_FIXTURE)) as any;
    doc.document.children[0].children[0].exportSettings = [
      { suffix: "@2x", format: "PNG", constraint: { type: "SCALE", value: 2 } },
      { suffix: "", format: "SVG", constraint: { type: "WIDTH", value: 200 } },
    ];
    const items = collectExportsFromDocument(doc);
    expect(items).toHaveLength(2);
    expect(items[0].nodeId).toBe("1:1");
    expect(items[0].setting.format).toBe("PNG");
    expect(items[0].setting.constraint.type).toBe("SCALE");
    expect(items[0].setting.suffix).toBe("@2x");
    expect(items[1].nodeId).toBe("1:1");
    expect(items[1].setting.format).toBe("SVG");
    expect(items[1].setting.constraint.type).toBe("WIDTH");
    expect(items[1].setting.constraint.value).toBe(200);
  });

  it("collects exportSettings from REST doc built from .fig via figBytesToRestLikeDocument", () => {
    const figPath = join(
      process.cwd(),
      "../../fixtures/test-fig/community/1510053249065427020-workos-radix-icons.fig"
    );
    if (!existsSync(figPath)) {
      console.warn(`Skipping: fixture not found at ${figPath}`);
      return;
    }
    const bytes = new Uint8Array(readFileSync(figPath));
    const restDoc = figBytesToRestLikeDocument(bytes);
    const items = collectExportsFromDocument(restDoc as any);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveProperty("nodeId");
    expect(items[0]).toHaveProperty("setting");
    expect(items[0].setting).toHaveProperty("format");
    expect(items[0].setting).toHaveProperty("constraint");
  });
});

describe("exportSettingToRenderOptions", () => {
  it("maps SCALE constraint to scale and format", () => {
    const node = { absoluteBoundingBox: { width: 100, height: 50 } };
    const setting = {
      suffix: "@2x",
      format: "PNG" as const,
      constraint: { type: "SCALE" as const, value: 2 },
    };
    const opts = exportSettingToRenderOptions(node as any, setting);
    expect(opts.format).toBe("png");
    expect(opts.scale).toBe(2);
  });

  it("maps WIDTH constraint to width and height from node bounds", () => {
    const node = { absoluteBoundingBox: { width: 100, height: 50 } };
    const setting = {
      suffix: "",
      format: "SVG" as const,
      constraint: { type: "WIDTH" as const, value: 200 },
    };
    const opts = exportSettingToRenderOptions(node as any, setting);
    expect(opts.format).toBe("svg");
    expect(opts.width).toBe(200);
    expect(opts.height).toBe(100); // 200 * (50/100)
  });

  it("maps HEIGHT constraint to height and width from node bounds", () => {
    const node = { absoluteBoundingBox: { width: 100, height: 50 } };
    const setting = {
      suffix: "",
      format: "PDF" as const,
      constraint: { type: "HEIGHT" as const, value: 100 },
    };
    const opts = exportSettingToRenderOptions(node as any, setting);
    expect(opts.format).toBe("pdf");
    expect(opts.height).toBe(100);
    expect(opts.width).toBe(200); // 100 * (100/50)
  });
});

describe("@grida/refig (real render)", () => {
  beforeAll(() => {
    rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  it("creates a FigmaDocument from REST API JSON", () => {
    const doc = new FigmaDocument(MINIMAL_REST_FIXTURE);
    expect(doc.sourceType).toBe("rest-api-json");
  });

  it("listFontFamilies returns unique font families from REST document", () => {
    const doc = new FigmaDocument(MINIMAL_REST_FIXTURE);
    const families = doc.listFontFamilies();
    expect(families).toContain("Inter");
    expect(families.length).toBe(1);
  });

  it("listFontFamilies returns empty when no text nodes", () => {
    const docNoText = JSON.parse(JSON.stringify(MINIMAL_REST_FIXTURE)) as any;
    docNoText.document.children[0].children[0].children = [];
    const doc = new FigmaDocument(docNoText);
    const families = doc.listFontFamilies();
    expect(families).toEqual([]);
  });

  it("listFontFamilies traverses all pages when rootNodeId is omitted", () => {
    const multiPage = JSON.parse(JSON.stringify(MINIMAL_REST_FIXTURE)) as any;
    multiPage.document.children.push({
      id: "0:2",
      type: "CANVAS",
      name: "Page 2",
      children: [
        {
          id: "2:1",
          type: "FRAME",
          name: "Frame 2",
          absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 50 },
          absoluteRenderBounds: { x: 0, y: 0, width: 50, height: 50 },
          relativeTransform: [
            [1, 0, 0],
            [0, 1, 0],
          ],
          size: { x: 50, y: 50 },
          clipsContent: false,
          fills: [],
          strokes: [],
          strokeWeight: 0,
          effects: [],
          children: [
            {
              id: "2:2",
              type: "TEXT",
              name: "Page2 Label",
              characters: "Caveat",
              style: {
                fontFamily: "Caveat",
                fontSize: 14,
                fontWeight: 400,
                textAlignHorizontal: "LEFT",
                textAlignVertical: "TOP",
                textDecoration: "NONE",
                lineHeightPercentFontSize: 100,
              },
              absoluteBoundingBox: { x: 0, y: 0, width: 30, height: 16 },
              absoluteRenderBounds: { x: 0, y: 0, width: 30, height: 16 },
              relativeTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              size: { x: 30, y: 16 },
              fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
              strokes: [],
              strokeWeight: 0,
              effects: [],
            },
          ],
        },
      ],
    });
    const doc = new FigmaDocument(multiPage);
    const families = doc.listFontFamilies();
    expect(families).toContain("Inter");
    expect(families).toContain("Caveat");
    expect(families.length).toBe(2);
  });

  it("FigmaDocument.fromFile reads a JSON file from disk", () => {
    const fixturePath = join(TEST_OUTPUT_DIR, "fromfile-fixture.json");
    writeFileSync(fixturePath, JSON.stringify(MINIMAL_REST_FIXTURE));

    const doc = FigmaDocument.fromFile(fixturePath);
    expect(doc.sourceType).toBe("rest-api-json");
  });

  it("renders a REST JSON document as PNG with valid signature", async () => {
    const renderer = new FigmaRenderer(MINIMAL_REST_FIXTURE, {
      loadFigmaDefaultFonts: false,
    });

    try {
      const result = await renderer.render("1:1", {
        format: "png",
        width: 256,
        height: 256,
      });

      expect(result.mimeType).toBe("image/png");
      expect(result.width).toBe(256);
      expect(result.height).toBe(256);
      expectPng(result.data);

      const outPath = join(TEST_OUTPUT_DIR, "rest-frame.png");
      writeFileSync(outPath, Buffer.from(result.data));
    } finally {
      renderer.dispose();
    }
  }, 30_000);

  it("renders a REST JSON document as SVG", async () => {
    const renderer = new FigmaRenderer(MINIMAL_REST_FIXTURE, {
      loadFigmaDefaultFonts: false,
    });

    try {
      const result = await renderer.render("1:1", {
        format: "svg",
        width: 256,
        height: 256,
      });

      expect(result.mimeType).toBe("image/svg+xml");
      expectSvg(result.data);

      const outPath = join(TEST_OUTPUT_DIR, "rest-frame.svg");
      writeFileSync(outPath, Buffer.from(result.data));
    } finally {
      renderer.dispose();
    }
  }, 30_000);

  it("renders a REST JSON document as PDF", async () => {
    const renderer = new FigmaRenderer(MINIMAL_REST_FIXTURE, {
      loadFigmaDefaultFonts: false,
    });

    try {
      const result = await renderer.render("1:1", {
        format: "pdf",
        width: 256,
        height: 256,
      });

      expect(result.mimeType).toBe("application/pdf");
      expectPdf(result.data);

      const outPath = join(TEST_OUTPUT_DIR, "rest-frame.pdf");
      writeFileSync(outPath, Buffer.from(result.data));
    } finally {
      renderer.dispose();
    }
  }, 30_000);

  it("renders a REST JSON document as JPEG", async () => {
    const renderer = new FigmaRenderer(MINIMAL_REST_FIXTURE, {
      loadFigmaDefaultFonts: false,
    });

    try {
      const result = await renderer.render("1:1", {
        format: "jpeg",
        width: 256,
        height: 256,
      });

      expect(result.mimeType).toBe("image/jpeg");
      expectJpegOrFallbackImage(result.data);

      const outPath = join(TEST_OUTPUT_DIR, "rest-frame.jpeg");
      writeFileSync(outPath, Buffer.from(result.data));
    } finally {
      renderer.dispose();
    }
  }, 30_000);

  it("renders with scale option", async () => {
    const renderer = new FigmaRenderer(MINIMAL_REST_FIXTURE, {
      loadFigmaDefaultFonts: false,
    });

    try {
      const result = await renderer.render("1:1", {
        format: "png",
        width: 256,
        height: 256,
        scale: 2,
      });

      expectPng(result.data);

      const outPath = join(TEST_OUTPUT_DIR, "scaled-2x.png");
      writeFileSync(outPath, Buffer.from(result.data));
    } finally {
      renderer.dispose();
    }
  }, 30_000);

  it("renders with custom fonts option", async () => {
    const caveatPath = join(
      __dirname,
      "../../../fixtures/fonts/Caveat/Caveat-VariableFont_wght.ttf"
    );
    if (!existsSync(caveatPath)) {
      console.warn(`Skipping: Caveat font not found at ${caveatPath}`);
      return;
    }

    const docWithCaveat = JSON.parse(
      JSON.stringify(MINIMAL_REST_FIXTURE)
    ) as typeof MINIMAL_REST_FIXTURE;
    const textNode = docWithCaveat.document.children[0].children[0]
      .children[0] as { style?: { fontFamily?: string } };
    if (textNode?.style) textNode.style.fontFamily = "Caveat";

    const fonts = {
      Caveat: new Uint8Array(readFileSync(caveatPath)),
    };

    const renderer = new FigmaRenderer(docWithCaveat, {
      fonts,
      loadFigmaDefaultFonts: false,
    });

    try {
      const result = await renderer.render("1:1", {
        format: "png",
        width: 256,
        height: 256,
      });

      expectPng(result.data);

      const outPath = join(TEST_OUTPUT_DIR, "rest-custom-font.png");
      writeFileSync(outPath, Buffer.from(result.data));
    } finally {
      renderer.dispose();
    }
  }, 30_000);

  it("renders REST document with custom IMAGE fill from fixture archive", async () => {
    const zipPath = join(
      __dirname,
      "../../../fixtures/test-figma/community/1510053249065427020-workos-radix-icons.zip"
    );
    const zipBytes = readFileSync(zipPath);
    const unzipped = unzipSync(new Uint8Array(zipBytes));

    const docEntry = Object.keys(unzipped).find((k) =>
      k.endsWith("/document.json")
    );
    if (!docEntry) throw new Error("No document.json in archive");
    const document = JSON.parse(
      new TextDecoder().decode(unzipped[docEntry])
    ) as Record<string, unknown>;

    const images: Record<string, Uint8Array> = {};
    for (const path of Object.keys(unzipped)) {
      const match = path.match(/\/images\/([^/]+)$/);
      if (!match) continue;
      const filename = match[1];
      const ref = filename.replace(/\.[^.]+$/, "");
      if (!ref) continue;
      images[ref] = unzipped[path];
    }

    const items = collectExportsFromDocument(document);
    const nodeId = items.length > 0 ? items[0].nodeId : null;
    if (!nodeId) throw new Error("Fixture has no nodes with exportSettings");

    const renderer = new FigmaRenderer(document, {
      images,
      loadFigmaDefaultFonts: false,
    });

    try {
      const result = await renderer.render(nodeId, {
        format: "png",
        width: 512,
        height: 512,
      });

      expectPng(result.data);
      expect(result.width).toBe(512);
      expect(result.height).toBe(512);

      const outPath = join(TEST_OUTPUT_DIR, "rest-image-fill-from-archive.png");
      writeFileSync(outPath, Buffer.from(result.data));
    } finally {
      renderer.dispose();
    }
  }, 60_000);
});
