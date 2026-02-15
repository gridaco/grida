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

function writeFixture(content = MINIMAL_REST_FIXTURE) {
  const fixturePath = join(TEST_OUTPUT_DIR, "fixture.json");
  writeFileSync(fixturePath, JSON.stringify(content));
  return fixturePath;
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

    const pngBytes = readFileSync(join(outDir, pngFile));
    expect(pngBytes[0]).toBe(0x89);
    expect(pngBytes[1]).toBe(0x50);
    expect(pngBytes[2]).toBe(0x4e);
    expect(pngBytes[3]).toBe(0x47);

    const svgContent = readFileSync(join(outDir, svgFile), "utf8");
    expect(svgContent).toContain("<svg");
  }, 90_000);
});
