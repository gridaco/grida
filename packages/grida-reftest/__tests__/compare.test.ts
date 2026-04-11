import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { compareFiles } from "../src/compare.js";
import { makeGridPng, makeSolidPng, writeFixture } from "./fixtures.js";

let tmp: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grida-reftest-compare-"));
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("compareFiles", () => {
  it("identical images → similarity 1.0, 0 diff pixels", async () => {
    const red = makeSolidPng(16, 16, [255, 0, 0, 255]);
    const a = writeFixture(tmp, "red-a.png", red);
    const b = writeFixture(tmp, "red-b.png", red);
    const r = await compareFiles(a, b);
    expect(r.similarity).toBe(1);
    expect(r.diffPixels).toBe(0);
    expect(r.diffPercentage).toBe(0);
    expect(r.error).toBeNull();
  });

  it("completely different solid colors → similarity 0", async () => {
    const red = makeSolidPng(8, 8, [255, 0, 0, 255]);
    const blue = makeSolidPng(8, 8, [0, 0, 255, 255]);
    const a = writeFixture(tmp, "all-red.png", red);
    const b = writeFixture(tmp, "all-blue.png", blue);
    const r = await compareFiles(a, b);
    // Every pixel differs.
    expect(r.diffPixels).toBe(64);
    expect(r.similarity).toBe(0);
    expect(r.diffPercentage).toBe(100);
  });

  it("dimension mismatch returns error and score 0", async () => {
    const a = writeFixture(tmp, "8x8.png", makeSolidPng(8, 8, [0, 0, 0, 255]));
    const b = writeFixture(
      tmp,
      "16x16.png",
      makeSolidPng(16, 16, [0, 0, 0, 255])
    );
    const r = await compareFiles(a, b);
    expect(r.error).toMatch(/Dimension mismatch/);
    expect(r.similarity).toBe(0);
    expect(r.diffPercentage).toBe(100);
  });

  it("alpha mask: fully-transparent oracle → perfect match if actual also transparent", async () => {
    const transparent = makeSolidPng(8, 8, [0, 0, 0, 0]);
    const a = writeFixture(tmp, "t-a.png", transparent);
    const b = writeFixture(tmp, "t-b.png", transparent);
    const r = await compareFiles(a, b, { mask: "alpha" });
    expect(r.similarity).toBe(1);
    expect(r.totalPixels).toBe(0);
  });

  it("alpha mask: scoring denominator is visible pixels only", async () => {
    // Half visible, half transparent. Introduce one diff pixel in the
    // visible half.
    const w = 8;
    const h = 8;
    const half = Math.floor(w / 2); // columns 0..3 visible, 4..7 transparent
    const bufA = makeGridPng(w, h, (x, _y) =>
      x < half ? [0, 0, 0, 255] : [0, 0, 0, 0]
    );
    const bufB = makeGridPng(w, h, (x, y) => {
      if (x >= half) return [0, 0, 0, 0];
      // One differing pixel at (0, 0).
      if (x === 0 && y === 0) return [255, 255, 255, 255];
      return [0, 0, 0, 255];
    });
    const a = writeFixture(tmp, "half-a.png", bufA);
    const b = writeFixture(tmp, "half-b.png", bufB);
    const r = await compareFiles(a, b, { mask: "alpha", threshold: 0.0 });
    // Visible pixels: 4 columns * 8 rows = 32 in each, same mask → 32.
    expect(r.totalPixels).toBe(32);
    expect(r.diffPixels).toBeGreaterThanOrEqual(1);
    // similarity = 1 - diff/32, strictly < 1 and strictly > 0
    expect(r.similarity).toBeLessThan(1);
    expect(r.similarity).toBeGreaterThan(0);
  });

  it("mask=none uses full w*h as denominator", async () => {
    const w = 4;
    const h = 4;
    const bufA = makeSolidPng(w, h, [0, 0, 0, 0]);
    const bufB = makeGridPng(w, h, (x, y) =>
      x === 0 && y === 0 ? [255, 255, 255, 255] : [0, 0, 0, 0]
    );
    const a = writeFixture(tmp, "mask-none-a.png", bufA);
    const b = writeFixture(tmp, "mask-none-b.png", bufB);
    const r = await compareFiles(a, b, { mask: "none", threshold: 0 });
    expect(r.totalPixels).toBe(16);
  });

  it("writes a diff PNG when diffOutputPath is provided", async () => {
    const a = writeFixture(
      tmp,
      "diffout-a.png",
      makeSolidPng(8, 8, [0, 0, 0, 255])
    );
    const b = writeFixture(
      tmp,
      "diffout-b.png",
      makeSolidPng(8, 8, [255, 255, 255, 255])
    );
    const diffPath = path.join(tmp, "diffout.png");
    const r = await compareFiles(a, b, { diffOutputPath: diffPath });
    expect(fs.existsSync(diffPath)).toBe(true);
    expect(r.diffPixels).toBeGreaterThan(0);
  });
});
