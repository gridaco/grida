// @vitest-environment node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createCanvas } from "..";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const OUTPUT_DIR = resolve(process.cwd(), "lib/__test__/out");

function expectPng(data: Uint8Array) {
  expect(Array.from(data.slice(0, 8))).toEqual(PNG_SIGNATURE);
  expect(data.byteLength).toBeGreaterThan(100);
}

function writePng(name: string, data: Uint8Array) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(resolve(OUTPUT_DIR, `${name}.png`), Buffer.from(data));
}

async function renderDocToPng(opts: { docPath: string; nodeId: string }) {
  const canvas = await createCanvas({
    backend: "raster",
    width: 256,
    height: 256,
    useEmbeddedFonts: true,
  });

  const doc = readFileSync(resolve(process.cwd(), opts.docPath), "utf8");
  canvas.loadScene(doc);

  const { data } = canvas.exportNodeAs(opts.nodeId, {
    format: "PNG",
    constraints: { type: "none", value: 1 },
  });

  return { canvas, data };
}

describe("raster export (node)", () => {
  it("createCanvas: creates a raster backend and exports PNG", async () => {
    const { canvas, data } = await renderDocToPng({
      docPath: "example/rectangle.grida1",
      nodeId: "rectangle",
    });

    expect(canvas.backend).toBe("raster");
    expectPng(data);
    writePng("rectangle", data);
  }, 30_000);

  it("renders a minimal document and exports PNG", async () => {
    const { data } = await renderDocToPng({
      docPath: "example/rectangle.grida1",
      nodeId: "rectangle",
    });

    expectPng(data);
    writePng("rectangle-minimal", data);
  }, 30_000);

  it("renders a gradient document and exports PNG", async () => {
    const { data } = await renderDocToPng({
      docPath: "example/gradient.grida1",
      nodeId: "gradient-rect",
    });

    expectPng(data);
    writePng("gradient-rect", data);
  }, 30_000);

  it("registers fixture image with addImageWithId and renders with custom RID", async () => {
    const imagePath = resolve(process.cwd(), "../../fixtures/images/stripes.png");
    const imageBytes = new Uint8Array(readFileSync(imagePath));

    const doc = {
      version: "0.90.0-beta+20260108",
      document: {
        nodes: {
          "image-rect": {
            id: "image-rect",
            name: "image-rect",
            locked: false,
            active: true,
            layout_positioning: "absolute",
            layout_inset_top: 24,
            layout_inset_left: 24,
            opacity: 1,
            z_index: 0,
            rotation: 0,
            layout_target_width: 208,
            layout_target_height: 208,
            type: "rectangle",
            corner_radius: 16,
            effects: [],
            stroke_width: 0,
            stroke_cap: "butt",
            fill_paints: [
              {
                type: "image",
                active: true,
                src: "res://images/test-fixture-stripes",
                fit: "cover",
                opacity: 1,
                blend_mode: "normal",
                filters: {
                  exposure: 0,
                  contrast: 0,
                  saturation: 0,
                  temperature: 0,
                  tint: 0,
                  highlights: 0,
                  shadows: 0,
                },
              },
            ],
          },
          main: {
            type: "scene",
            id: "main",
            name: "main",
            active: true,
            locked: false,
            constraints: { children: "multiple" },
            guides: [],
            edges: [],
            background_color: { r: 0.96, g: 0.96, b: 0.96, a: 1 },
          },
        },
        links: { main: ["image-rect"] },
        scenes_ref: ["main"],
        bitmaps: {},
        images: {},
        properties: {},
      },
    };

    const canvas = await createCanvas({
      backend: "raster",
      width: 256,
      height: 256,
      useEmbeddedFonts: true,
    });

    const result = canvas.addImageWithId(imageBytes, "res://images/test-fixture-stripes");
    expect(result).not.toBe(false);
    expect((result as { width: number; height: number }).width).toBeGreaterThan(0);
    expect((result as { width: number; height: number }).height).toBeGreaterThan(0);

    canvas.loadScene(JSON.stringify(doc));

    const { data } = canvas.exportNodeAs("image-rect", {
      format: "PNG",
      constraints: { type: "none", value: 1 },
    });

    expectPng(data);
    writePng("add-image-with-id-stripes", data);
    canvas.dispose();
  }, 30_000);
});
