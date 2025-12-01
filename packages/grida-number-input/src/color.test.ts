import { rgbToHex, hexToRgb, type RGB } from "./color";

describe("hex conversion", () => {
  test("rgb to hex without alpha", () => {
    const rgb: RGB = { r: 255, g: 165, b: 0 };
    expect(rgbToHex(rgb)).toBe("FFA500");
  });

  test("rgb to hex using f32 unit", () => {
    const rgb: RGB = { r: 1, g: 0.5, b: 0.25 };
    expect(rgbToHex(rgb, "f32")).toBe("FF8040");
  });

  test("hex to rgb without alpha", () => {
    const rgb = hexToRgb("FFA500");
    expect(rgb).toEqual({ r: 255, g: 165, b: 0 });
  });

  test("hex to rgb without alpha using f32 unit", () => {
    const rgb = hexToRgb("FFA500", "f32");
    expect(rgb).not.toBeNull();
    if (!rgb) return;
    expect(rgb.r).toBeCloseTo(1);
    expect(rgb.g).toBeCloseTo(165 / 255, 3);
    expect(rgb.b).toBeCloseTo(0);
  });

  test("invalid hex returns null", () => {
    expect(hexToRgb("ZZZZZZ")).toBeNull();
  });
});
