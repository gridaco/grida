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
});
