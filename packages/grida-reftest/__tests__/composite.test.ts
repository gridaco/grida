import { describe, expect, it } from "vitest";
import { compositeRgbaOverBg } from "../src/composite.js";

describe("compositeRgbaOverBg", () => {
  it("opaque pixel is unchanged", () => {
    const src = Buffer.from([120, 60, 30, 255]);
    const out = compositeRgbaOverBg(src, 1, 1, "white");
    expect(Array.from(out)).toEqual([120, 60, 30, 255]);
  });

  it("fully transparent pixel becomes bg color", () => {
    const src = Buffer.from([200, 200, 200, 0]);
    const whiteOut = compositeRgbaOverBg(src, 1, 1, "white");
    expect(Array.from(whiteOut)).toEqual([255, 255, 255, 255]);
    const blackOut = compositeRgbaOverBg(src, 1, 1, "black");
    expect(Array.from(blackOut)).toEqual([0, 0, 0, 255]);
  });

  it("half-alpha pixel blends to midway over white", () => {
    // red pixel over white at 50% alpha → (255 + 255)/2 ≈ 255 for R,
    // (0 + 255)/2 = 128 for G and B (round-half-away-from-zero).
    const src = Buffer.from([255, 0, 0, 128]);
    const out = compositeRgbaOverBg(src, 1, 1, "white");
    // a = 128/255 ≈ 0.5019607843...
    // r = 255 * a + 255 * (1-a) = 255
    // g = 0 * a + 255 * (1-a) ≈ 127 (round)
    expect(out[0]).toBe(255);
    expect(Math.abs(out[1]! - 127)).toBeLessThanOrEqual(1);
    expect(Math.abs(out[2]! - 127)).toBeLessThanOrEqual(1);
    expect(out[3]).toBe(255);
  });

  it("half-alpha pixel blends to midway over black", () => {
    const src = Buffer.from([255, 0, 0, 128]);
    const out = compositeRgbaOverBg(src, 1, 1, "black");
    // r = 255 * 0.5 + 0 ≈ 128, g = 0, b = 0
    expect(Math.abs(out[0]! - 128)).toBeLessThanOrEqual(1);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(255);
  });

  it("output length is 4 * width * height", () => {
    const src = Buffer.alloc(4 * 4 * 4); // 4x4 image
    const out = compositeRgbaOverBg(src, 4, 4, "white");
    expect(out.length).toBe(64);
  });
});
