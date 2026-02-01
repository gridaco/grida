import { describe, expect, it } from "vitest";
import { hexToHsl } from "./color";

describe("theme/palettes/utils/color", () => {
  it("parses #rrggbb hex to HSL", () => {
    const hsl = hexToHsl("#ff0000");
    expect(hsl).not.toBeNull();
    expect(hsl!.h).toBeCloseTo(0, 3);
    expect(hsl!.s).toBeCloseTo(100, 3);
    expect(hsl!.l).toBeCloseTo(50, 3);
  });

  it("supports #rgb shorthand", () => {
    const a = hexToHsl("#0ea");
    const b = hexToHsl("#00eeaa");
    expect(a).toEqual(b);
  });

  it("returns null for invalid hex", () => {
    expect(hexToHsl("nope")).toBeNull();
    expect(hexToHsl("#12")).toBeNull();
    expect(hexToHsl("#zzzzzz")).toBeNull();
  });
});
