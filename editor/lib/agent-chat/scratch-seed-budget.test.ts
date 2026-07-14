import { describe, expect, it } from "vitest";
import { ScratchSeedBudget } from "./scratch-seed-budget";

describe("ScratchSeedBudget.reserve", () => {
  it("accounts decoded binary bytes, UTF-8 text bytes, count, and paths", () => {
    expect(
      ScratchSeedBudget.reserve([
        { path: "template.canvas", text: "안" },
        { path: "asset.bin", base64: "AQID" },
      ])
    ).toEqual({
      fileCount: 2,
      totalBytes: 6,
      paths: ["template.canvas", "asset.bin"],
    });
  });

  it("returns the stable empty reservation when no seeds exist", () => {
    expect(ScratchSeedBudget.reserve(undefined)).toBe(ScratchSeedBudget.NONE);
    expect(ScratchSeedBudget.reserve([])).toBe(ScratchSeedBudget.NONE);
  });
});
