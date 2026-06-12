import kolor from "./index";

/**
 * Contract tests for `color.resolve` / `color.resolveHEX` — resolving a CSS
 * `<color>` string to canonical sRGB without a DOM.
 *
 * hsl/hwb expectations are derived from the CSS Color 4 §7/§8 sample
 * algorithms (the algorithms browsers implement), cross-checked against the
 * independent CSS Color 3 hue2rgb formulation. Where a value is knife-edge
 * or folklore-rounded, the spec math is the authority.
 */

describe("color.resolve", () => {
  describe("equivalence: one color, many syntaxes", () => {
    const RED = { r: 255, g: 0, b: 0, a: 1 };

    it.each([
      "red",
      "RED",
      "#f00",
      "#F00",
      "#ff0000",
      "#ff0000ff",
      "rgb(255 0 0)",
      "rgb(255, 0, 0)",
      "rgb(100%, 0%, 0%)",
      "rgba(255, 0, 0, 1)",
      "hsl(0 100% 50%)",
      "hsl(0, 100%, 50%)",
      "hwb(0 0% 0%)",
    ])("%s resolves to red", (cstr) => {
      expect(kolor.resolve(cstr)).toEqual(RED);
      expect(kolor.resolveHEX(cstr)).toBe("#ff0000");
    });

    it("numeric input is read as 0xRRGGBB", () => {
      expect(kolor.resolve(0xff0000)).toEqual(RED);
      expect(kolor.resolve(0x0000ff)).toEqual({ r: 0, g: 0, b: 255, a: 1 });
      expect(kolor.resolveHEX(0xff0000)).toBe("#ff0000");
    });
  });

  describe("hsl -> rgb per CSS Color 4 §7", () => {
    it("hsl(217 91% 60%) — spec math rounds to (60, 131, 246)", () => {
      // raw: (60.18, 131.342, 245.82). The folklore value (59, 130, 246)
      // belongs to hsl(217.22 91.22% 59.8%) — the *unrounded* hsl
      // coordinates of #3b82f6 — not to hsl(217 91% 60%).
      expect(kolor.resolve("hsl(217 91% 60%)")).toEqual({
        r: 60,
        g: 131,
        b: 246,
        a: 1,
      });
    });

    it("hsl(217.22 91.22% 59.8%) resolves to (59, 130, 246)", () => {
      expect(kolor.resolve("hsl(217.22 91.22% 59.8%)")).toEqual({
        r: 59,
        g: 130,
        b: 246,
        a: 1,
      });
      expect(kolor.resolveHEX("hsl(217.22 91.22% 59.8%)")).toBe("#3b82f6");
    });

    it("hsl(120 50% 25%) resolves to (32, 96, 32)", () => {
      expect(kolor.resolve("hsl(120 50% 25%)")).toEqual({
        r: 32,
        g: 96,
        b: 32,
        a: 1,
      });
    });

    it("hsl(240 100% 50%) resolves to blue", () => {
      expect(kolor.resolve("hsl(240 100% 50%)")).toEqual({
        r: 0,
        g: 0,
        b: 255,
        a: 1,
      });
    });

    it("legacy comma syntax matches modern syntax", () => {
      expect(kolor.resolve("hsl(217, 91%, 60%)")).toEqual(
        kolor.resolve("hsl(217 91% 60%)")
      );
    });

    it("hue wraps mod 360, including negative hues", () => {
      expect(kolor.resolve("hsl(-120 100% 50%)")).toEqual(
        kolor.resolve("hsl(240 100% 50%)")
      );
      expect(kolor.resolve("hsl(480 100% 50%)")).toEqual(
        kolor.resolve("hsl(120 100% 50%)")
      );
    });

    it("saturation and lightness clamp to [0, 100]", () => {
      // negative saturation clamps to 0% -> achromatic gray
      expect(kolor.resolve("hsl(0 -50% 50%)")).toEqual({
        r: 128,
        g: 128,
        b: 128,
        a: 1,
      });
      // lightness over 100% clamps to white
      expect(kolor.resolve("hsl(0 100% 200%)")).toEqual({
        r: 255,
        g: 255,
        b: 255,
        a: 1,
      });
    });
  });

  describe("hwb -> rgb per CSS Color 4 §8", () => {
    it("hwb(0 20% 40%) resolves to (153, 51, 51)", () => {
      expect(kolor.resolve("hwb(0 20% 40%)")).toEqual({
        r: 153,
        g: 51,
        b: 51,
        a: 1,
      });
    });

    it("whiteness + blackness >= 100% resolves to gray w/(w+b)", () => {
      expect(kolor.resolve("hwb(0 60% 60%)")).toEqual({
        r: 128,
        g: 128,
        b: 128,
        a: 1,
      });
      // hue is irrelevant once fully desaturated
      expect(kolor.resolve("hwb(217 60% 60%)")).toEqual(
        kolor.resolve("hwb(0 60% 60%)")
      );
    });
  });

  describe("alpha", () => {
    it("carries alpha from rgba()", () => {
      expect(kolor.resolve("rgba(255, 0, 0, 0.5)")).toEqual({
        r: 255,
        g: 0,
        b: 0,
        a: 0.5,
      });
    });

    it("carries alpha from hsla() and slash syntax", () => {
      expect(kolor.resolve("hsla(0, 100%, 50%, 0.5)")).toEqual({
        r: 255,
        g: 0,
        b: 0,
        a: 0.5,
      });
      expect(kolor.resolve("rgb(255 0 0 / 25%)")).toEqual({
        r: 255,
        g: 0,
        b: 0,
        a: 0.25,
      });
    });

    it("carries alpha from 4/8-digit hex", () => {
      expect(kolor.resolve("#ff000080")).toEqual({
        r: 255,
        g: 0,
        b: 0,
        a: 128 / 255,
      });
    });

    it("clamps alpha to [0, 1]", () => {
      expect(kolor.resolve("rgba(0, 0, 0, 3)")).toEqual({
        r: 0,
        g: 0,
        b: 0,
        a: 1,
      });
      expect(kolor.resolve("rgba(0, 0, 0, -1)")).toEqual({
        r: 0,
        g: 0,
        b: 0,
        a: 0,
      });
    });
  });

  describe("clamping and rounding", () => {
    it("clamps rgb channels to [0, 255]", () => {
      expect(kolor.resolve("rgb(300, -20, 256)")).toEqual({
        r: 255,
        g: 0,
        b: 255,
        a: 1,
      });
    });

    it("rounds fractional rgb channels to integers", () => {
      // rgb percentages produce fractional channels: 30% -> 76.5 -> 77
      expect(kolor.resolve("rgb(100%, 30%, 90%)")).toEqual({
        r: 255,
        g: 77,
        b: 230,
        a: 1,
      });
    });
  });

  describe("transparent", () => {
    it("resolves to rgba(0, 0, 0, 0) per CSS", () => {
      expect(kolor.resolve("transparent")).toEqual({
        r: 0,
        g: 0,
        b: 0,
        a: 0,
      });
      expect(kolor.resolveHEX("transparent")).toBe("#00000000");
    });
  });

  describe("input normalization", () => {
    it("is case-insensitive", () => {
      expect(kolor.resolve("ReBeCcApUrPlE")).toEqual({
        r: 102,
        g: 51,
        b: 153,
        a: 1,
      });
      expect(kolor.resolve("HSL(0, 100%, 50%)")).toEqual(
        kolor.resolve("hsl(0, 100%, 50%)")
      );
      expect(kolor.resolve("#FF0000")).toEqual(kolor.resolve("#ff0000"));
    });

    it("trims surrounding whitespace", () => {
      expect(kolor.resolve("  red  ")).toEqual(kolor.resolve("red"));
      expect(kolor.resolve("\thsl(0 100% 50%)\n")).toEqual(
        kolor.resolve("hsl(0 100% 50%)")
      );
    });
  });

  describe("sentinel (null), never a guess", () => {
    it.each([
      "currentColor", // context-dependent by spec
      "inherit",
      "oklch(0.7 0.1 200)", // gamut mapping out of scope
      "oklab(0.5 0.1 0.1)",
      "lab(50% 40 59.5)",
      "lch(52.2% 72.2 50)",
      "color(display-p3 1 1 1)",
      "color(srgb-linear 1 1 1)",
      "C100/M80/Y0/K35", // cmyk: not a CSS color
      "definitely-not-a-color",
      "",
      "rgb()",
      "rgb(1, 2)",
      "hsl(foo, 10%, 10%)",
    ])("%s resolves to null", (cstr) => {
      expect(kolor.resolve(cstr)).toBeNull();
      expect(kolor.resolveHEX(cstr)).toBeNull();
    });

    it("never throws on garbage", () => {
      expect(() => kolor.resolve("###")).not.toThrow();
      expect(() => kolor.resolveHEX("hsl(")).not.toThrow();
    });
  });

  describe("interop with colorformats", () => {
    it("returns a branded RGB888A32F usable with struct conversions", () => {
      const c = kolor.resolve("hsl(217 91% 60%)")!;
      expect(kolor.colorformats.RGB888A32F.intoHEX(c)).toBe("#3c83f6ff");
      expect(kolor.colorformats.RGB888A32F.intoRGBA32F(c)).toEqual({
        r: 60 / 255,
        g: 131 / 255,
        b: 246 / 255,
        a: 1,
      });
    });
  });
});

describe("color.resolveHEX", () => {
  it("emits #rrggbb when alpha is exactly 1", () => {
    expect(kolor.resolveHEX("red")).toBe("#ff0000");
    expect(kolor.resolveHEX("hsl(217 91% 60%)")).toBe("#3c83f6");
  });

  it("emits #rrggbbaa when alpha < 1 (8-bit quantized)", () => {
    expect(kolor.resolveHEX("rgba(255, 0, 0, 0.5)")).toBe("#ff000080");
    expect(kolor.resolveHEX("#abc6")).toBe("#aabbcc66");
  });

  it("emits lowercase hex", () => {
    expect(kolor.resolveHEX("#ABCDEF")).toBe("#abcdef");
  });
});
