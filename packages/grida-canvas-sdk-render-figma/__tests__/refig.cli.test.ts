import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

const TEST_OUTPUT_DIR = join(process.cwd(), "__tests__", ".tmp", "cli");
const BIN = join(process.cwd(), "cli.ts");

/** Minimal Figma REST API document JSON (one frame with a solid fill). */
const MINIMAL_REST_FIXTURE = {
  document: {
    id: "0:0",
    type: "DOCUMENT",
    name: "CLI Test Doc",
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
            children: [],
          },
        ],
      },
    ],
  },
};

/** REST fixture with exportSettings for --export-all CLI test. */
const EXPORT_SETTINGS_FIXTURE = {
  document: {
    id: "0:0",
    type: "DOCUMENT",
    name: "Export CLI Doc",
    children: [
      {
        id: "0:1",
        type: "CANVAS",
        name: "Page 1",
        children: [
          {
            id: "41:64",
            type: "FRAME",
            name: "Export Frame",
            absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
            absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 50 },
            exportSettings: [
              {
                suffix: "@2x",
                format: "PNG",
                constraint: { type: "SCALE", value: 2 },
              },
              {
                suffix: "",
                format: "SVG",
                constraint: { type: "WIDTH", value: 200 },
              },
            ],
            relativeTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
            size: { x: 100, y: 50 },
            clipsContent: false,
            fills: [{ type: "SOLID", color: { r: 0, g: 0.5, b: 0.5, a: 1 } }],
            strokes: [],
            strokeWeight: 0,
            effects: [],
            children: [],
          },
        ],
      },
    ],
  },
};

function resetOutputDir() {
  rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
}

function writeFixture(content: object = MINIMAL_REST_FIXTURE) {
  const fixturePath = join(TEST_OUTPUT_DIR, "fixture.json");
  writeFileSync(fixturePath, JSON.stringify(content));
  return fixturePath;
}

/** Extract REST archive zip to a directory. Returns path to dir with document.json. */
function extractArchiveFixture(zipPath: string): string {
  const zipBytes = readFileSync(zipPath);
  const unzipped = unzipSync(new Uint8Array(zipBytes));
  const extractDir = join(TEST_OUTPUT_DIR, "archive-fixture");
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });

  for (const [entryPath, data] of Object.entries(unzipped)) {
    if (entryPath.startsWith("__MACOSX/") || entryPath.endsWith("/")) continue;
    const fullPath = join(extractDir, entryPath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, data);
  }

  const innerDir = Object.keys(unzipped)
    .find((k) => k.endsWith("/document.json"))
    ?.replace("/document.json", "");
  if (!innerDir) throw new Error("No document.json in archive");
  return join(extractDir, innerDir);
}

describe("refig CLI", () => {
  it("writes a valid PNG output file", () => {
    resetOutputDir();
    const fixturePath = writeFixture();
    const out = join(TEST_OUTPUT_DIR, "cli-out.png");

    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        BIN,
        fixturePath,
        "--node",
        "1:1",
        "--out",
        out,
        "--format",
        "png",
      ],
      { stdio: "pipe", timeout: 60_000 }
    );

    expect(existsSync(out)).toBe(true);
    const bytes = readFileSync(out);
    // PNG magic bytes
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
    expect(bytes.byteLength).toBeGreaterThan(100);
  }, 60_000);

  it("infers SVG format from output extension", () => {
    resetOutputDir();
    const fixturePath = writeFixture();
    const out = join(TEST_OUTPUT_DIR, "cli-inferred.svg");

    execFileSync(
      process.execPath,
      ["--import", "tsx", BIN, fixturePath, "--node", "1:1", "--out", out],
      { stdio: "pipe", timeout: 60_000 }
    );

    expect(existsSync(out)).toBe(true);
    const content = readFileSync(out, "utf8");
    expect(content).toContain("<svg");
  }, 60_000);

  it("--export-all exports one file per node exportSetting", () => {
    resetOutputDir();
    const fixturePath = writeFixture(EXPORT_SETTINGS_FIXTURE);
    const outDir = join(TEST_OUTPUT_DIR, "export-all-out");

    execFileSync(
      process.execPath,
      ["--import", "tsx", BIN, fixturePath, "--export-all", "--out", outDir],
      { stdio: "pipe", timeout: 90_000 }
    );

    expect(existsSync(outDir)).toBe(true);
    const files = readdirSync(outDir);
    expect(files.length).toBe(2);

    const pngFile = files.find((f) => f.endsWith(".png"));
    const svgFile = files.find((f) => f.endsWith(".svg"));
    expect(pngFile).toBeTruthy();
    expect(svgFile).toBeTruthy();

    const pngBytes = readFileSync(join(outDir, pngFile!));
    expect(pngBytes[0]).toBe(0x89);
    expect(pngBytes[1]).toBe(0x50);
    expect(pngBytes[2]).toBe(0x4e);
    expect(pngBytes[3]).toBe(0x47);

    const svgContent = readFileSync(join(outDir, svgFile!), "utf8");
    expect(svgContent).toContain("<svg");
  }, 90_000);

  it("--export-all on fixture archive exports all nodes with exportSettings", () => {
    resetOutputDir();
    const zipPath = join(
      process.cwd(),
      "../../fixtures/test-figma/community/1510053249065427020-workos-radix-icons.zip"
    );
    if (!existsSync(zipPath)) {
      console.warn(`Skipping: fixture not found at ${zipPath}`);
      return;
    }
    const archiveDir = extractArchiveFixture(zipPath);
    const outDir = join(TEST_OUTPUT_DIR, "export-all-archive-out");

    execFileSync(
      process.execPath,
      ["--import", "tsx", BIN, archiveDir, "--export-all", "--out", outDir],
      { stdio: "pipe", timeout: 120_000 }
    );

    expect(existsSync(outDir)).toBe(true);
    const files = readdirSync(outDir);
    expect(files.length).toBeGreaterThan(1);

    const pngFiles = files.filter((f) => f.endsWith(".png"));
    expect(pngFiles.length).toBeGreaterThan(0);
    const samplePng = join(outDir, pngFiles[0]!);
    const pngBytes = readFileSync(samplePng);
    expect(pngBytes[0]).toBe(0x89);
    expect(pngBytes[1]).toBe(0x50);
    expect(pngBytes[2]).toBe(0x4e);
    expect(pngBytes[3]).toBe(0x47);
  }, 120_000);

  it("--export-all on .fig file exports all nodes with exportSettings", () => {
    resetOutputDir();
    const figPath = join(
      process.cwd(),
      "../../fixtures/test-fig/community/1510053249065427020-workos-radix-icons.fig"
    );
    if (!existsSync(figPath)) {
      console.warn(`Skipping: fixture not found at ${figPath}`);
      return;
    }
    const outDir = join(TEST_OUTPUT_DIR, "export-all-fig-out");

    execFileSync(
      process.execPath,
      ["--import", "tsx", BIN, figPath, "--export-all", "--out", outDir],
      { stdio: "pipe", timeout: 300_000 }
    );

    expect(existsSync(outDir)).toBe(true);
    const files = readdirSync(outDir);
    expect(files.length).toBeGreaterThan(1);

    const pngFiles = files.filter((f) => f.endsWith(".png"));
    expect(pngFiles.length).toBeGreaterThan(0);
    const samplePng = join(outDir, pngFiles[0]!);
    const pngBytes = readFileSync(samplePng);
    expect(pngBytes[0]).toBe(0x89);
    expect(pngBytes[1]).toBe(0x50);
    expect(pngBytes[2]).toBe(0x4e);
    expect(pngBytes[3]).toBe(0x47);
  }, 300_000);
});
