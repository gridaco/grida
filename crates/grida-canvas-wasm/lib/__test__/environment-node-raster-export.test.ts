// @vitest-environment node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { io } from "../../../../packages/grida-canvas-io/index";
import { createCanvas } from "..";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const OUTPUT_DIR = resolve(process.cwd(), "lib/__test__/out");

const FIXTURES_DIR = resolve(process.cwd(), "../../fixtures/test-grida");

function expectPng(data: Uint8Array) {
  expect(Array.from(data.slice(0, 8))).toEqual(PNG_SIGNATURE);
  expect(data.byteLength).toBeGreaterThan(100);
}

function writePng(name: string, data: Uint8Array) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(resolve(OUTPUT_DIR, `${name}.png`), Buffer.from(data));
}

function createFile(name: string, bytes: Uint8Array): File {
  const blob = new Blob([bytes as BlobPart], {
    type: "application/octet-stream",
  });
  return new File([blob], name, { type: "application/octet-stream" });
}

async function loadGridaFixture(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(FIXTURES_DIR, name)));
  const loaded = await io.load(createFile(name, bytes));
  const sceneId = loaded.document.scenes_ref[0];
  if (!sceneId) throw new Error(`${name}: no scenes_ref entries`);
  const nodeIds = loaded.document.links[sceneId];
  if (!nodeIds || nodeIds.length === 0) {
    throw new Error(`${name}: no nodes linked under scene ${sceneId}`);
  }
  return { bytes, sceneId, nodeId: nodeIds[0]! };
}

async function renderFixtureNodeToPng(fixture: string) {
  const { bytes, sceneId, nodeId } = await loadGridaFixture(fixture);

  const canvas = await createCanvas({
    backend: "raster",
    width: 256,
    height: 256,
    useEmbeddedFonts: true,
  });

  canvas.loadSceneGrida(bytes);
  canvas.switchScene(sceneId);

  const { data } = canvas.exportNodeAs(nodeId, {
    format: "PNG",
    constraints: { type: "none", value: 1 },
  });

  return { canvas, data, sceneId, nodeId };
}

describe("raster export (node)", () => {
  it("createCanvas: creates a raster backend and exports PNG", async () => {
    const { canvas, data } = await renderFixtureNodeToPng("L0.grida");

    expect(canvas.backend).toBe("raster");
    expectPng(data);
    writePng("L0-first-node", data);
  }, 30_000);

  it("renders L0.grida and exports the first node as PNG", async () => {
    const { data } = await renderFixtureNodeToPng("L0.grida");

    expectPng(data);
    writePng("L0-minimal", data);
  }, 30_000);

  it("renders cover.grida and exports the first node as PNG", async () => {
    const { data } = await renderFixtureNodeToPng("cover.grida");

    expectPng(data);
    writePng("cover-first-node", data);
  }, 30_000);

  it("registers fixture image with addImageWithId and renders with custom RID", async () => {
    const imagePath = resolve(
      process.cwd(),
      "../../fixtures/images/stripes.png"
    );
    const imageBytes = new Uint8Array(readFileSync(imagePath));

    const doc = {
      version: "0.91.0-beta+20260311",
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

    const result = canvas.addImageWithId(
      imageBytes,
      "res://images/test-fixture-stripes"
    );
    expect(result).not.toBe(false);
    expect((result as { width: number; height: number }).width).toBeGreaterThan(
      0
    );
    expect(
      (result as { width: number; height: number }).height
    ).toBeGreaterThan(0);

    canvas.loadSceneGrida(
      io.GRID.encode(
        doc.document as unknown as Parameters<typeof io.GRID.encode>[0]
      )
    );
    canvas.switchScene("main");

    const { data } = canvas.exportNodeAs("image-rect", {
      format: "PNG",
      constraints: { type: "none", value: 1 },
    });

    expectPng(data);
    writePng("add-image-with-id-stripes", data);
    canvas.dispose();
  }, 30_000);
});
