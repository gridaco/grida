import { rgbToHex, hexToRgb, type RGB, type RGBA } from "./use-hex-value-input";

describe("hex conversion", () => {
  test("rgb to hex without alpha", () => {
    const rgb: RGB = { r: 255, g: 165, b: 0 };
    expect(rgbToHex(rgb)).toBe("FFA500");
  });

  test("rgb to hex with alpha", () => {
    const rgba: RGBA = { r: 255, g: 165, b: 0, a: 0.5 };
    expect(rgbToHex(rgba)).toBe("FFA50080");
  });

  test("hex to rgb without alpha", () => {
    const rgb = hexToRgb<RGB>("FFA500");
    expect(rgb).toEqual({ r: 255, g: 165, b: 0 });
  });

  test("hex to rgb with alpha", () => {
    const rgba = hexToRgb<RGBA>("FFA50080");
    expect(rgba).toMatchObject({ r: 255, g: 165, b: 0 });
    expect(rgba?.a).toBeCloseTo(0.5);
  });

  test("invalid hex returns null", () => {
    expect(hexToRgb("ZZZZZZ")).toBeNull();
  });
});
