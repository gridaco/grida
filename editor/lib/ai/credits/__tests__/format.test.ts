/**
 * Unit tests for the pure format helpers in `../format.ts`.
 *
 * Covers branch coverage of each formatter — `null` cents, exact
 * boundary values, trailing-zero trimming.
 */
import { describe, expect, it } from "vitest";

import * as format from "../format";

describe("format.chip", () => {
  it("returns null for null cents", () => {
    expect(format.chip(null)).toBeNull();
  });
  it("formats whole-dollar amounts with one decimal place", () => {
    // 2599c = $25.99 → "$25.99" (no trailing zero to trim)
    expect(format.chip(2599)).toBe("$25.99");
  });
  it("trims trailing zero from cents ending in 0", () => {
    // 2590c = $25.90 → "$25.9"
    expect(format.chip(2590)).toBe("$25.9");
  });
  it("formats zero as $0.0", () => {
    expect(format.chip(0)).toBe("$0.0");
  });
  it("rounds sub-cent values up via .toFixed", () => {
    // 1c = "$0.01" → no trailing zero
    expect(format.chip(1)).toBe("$0.01");
  });
});

describe("format.exact", () => {
  it("returns null for null cents", () => {
    expect(format.exact(null)).toBeNull();
  });
  it("formats with 4 decimal places", () => {
    // 2599.6835c → 25.996835 → toFixed(4) → "25.9968"
    expect(format.exact(2599.6835)).toBe("$25.9968");
  });
  it("preserves trailing zeros (no trim)", () => {
    expect(format.exact(2500)).toBe("$25.0000");
  });
});

describe("format.usd", () => {
  it("returns $0 for exact zero", () => {
    expect(format.usd(0)).toBe("$0");
  });
  it("returns sub-precision sentinel for tiny positive values", () => {
    expect(format.usd(0.0000001)).toBe("<$0.000001");
  });
  it("trims trailing zeros from 6-decimal representation", () => {
    // 0.000075 → "0.000075" → no trailing zeros → "$0.000075"
    expect(format.usd(0.000075)).toBe("$0.000075");
  });
  it("trims trailing decimal point when value is whole", () => {
    expect(format.usd(1)).toBe("$1");
  });
  it("preserves significant decimals", () => {
    expect(format.usd(1.5)).toBe("$1.5");
  });
});
