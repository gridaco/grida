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

  describe("strict input gate: parse stays permissive, resolve does not", () => {
    describe("malformed hex", () => {
      it.each([
        "#zzz", // non-hex digits (parse coerces NaN -> 0 -> black)
        "###", // not digits at all
        "#12345", // 5 digits: parse reads garbage channels
        "#1234567", // 7 digits: parse silently truncates
        "#12", // too short
        "#123456789", // too long
        "#12g", // digit set, short form
        "#ff00gg", // digit set, long form
        "#", // bare hash
      ])("%s resolves to null", (cstr) => {
        expect(kolor.resolve(cstr)).toBeNull();
        expect(kolor.resolveHEX(cstr)).toBeNull();
      });

      it("exact 3/4/6/8 digit counts remain resolvable", () => {
        expect(kolor.resolveHEX("#123")).toBe("#112233");
        expect(kolor.resolveHEX("#1234")).toBe("#11223344");
        expect(kolor.resolveHEX("#123456")).toBe("#123456");
        expect(kolor.resolveHEX("#12345680")).toBe("#12345680");
      });
    });

    describe("bare channel lists are not CSS colors", () => {
      it.each(["1 2 3", "255, 0, 0", "255 0 0 / 0.5", "1,2,3"])(
        "%s resolves to null",
        (cstr) => {
          expect(kolor.resolve(cstr)).toBeNull();
          expect(kolor.resolveHEX(cstr)).toBeNull();
        }
      );
    });

    describe("malformed function syntax", () => {
      it.each([
        "rgb(255,0,0", // unclosed paren
        "hsl(0 100% 50%", // unclosed paren
        "rgb(255,0,0))", // stray extra paren
        "rgb (255, 0, 0)", // whitespace before ( is invalid CSS
        "rgb(255,0,0) ignored", // trailing junk after )
      ])("%s resolves to null", (cstr) => {
        expect(kolor.resolve(cstr)).toBeNull();
        expect(kolor.resolveHEX(cstr)).toBeNull();
      });
    });

    describe("separator discipline: all-comma or all-space, never a mix", () => {
      it.each([
        "rgb(25 5, 0, 0)", // mixed: parser would smuggle the 4th token into alpha 0
        "rgb(255, 0 0)",
        "rgb(255 0, 0)",
        "rgb(255, 0, 0 / 0.5)", // slash alpha is modern-syntax only
        "rgb(255 0 0 0.5)", // modern alpha requires the slash
        "hsl(0, 100% 50%)",
        "hsl(0 100%, 50%)",
        "rgb(255, 0, 0,)", // trailing comma
        "rgb(255,,0,0)", // empty slot
        "rgb(255/0/0)", // slash is not a channel separator
        "rgb(1, 2, 3, 4, 5)", // too many channels for either discipline
      ])("%s resolves to null", (cstr) => {
        expect(kolor.resolve(cstr)).toBeNull();
        expect(kolor.resolveHEX(cstr)).toBeNull();
      });

      it("legacy all-comma stays accepted", () => {
        expect(kolor.resolve("rgb(255,0,0)")).toEqual({
          r: 255,
          g: 0,
          b: 0,
          a: 1,
        });
        expect(kolor.resolve("rgb( 255 , 0 , 0 )")).toEqual({
          r: 255,
          g: 0,
          b: 0,
          a: 1,
        });
        expect(kolor.resolve("hsl(217, 91%, 60%)")).toEqual({
          r: 60,
          g: 131,
          b: 246,
          a: 1,
        });
        expect(kolor.resolve("hsla(0, 100%, 50%, 0.5)")).toEqual({
          r: 255,
          g: 0,
          b: 0,
          a: 0.5,
        });
        expect(kolor.resolve("rgb(100%, 0%, 0%)")).toEqual({
          r: 255,
          g: 0,
          b: 0,
          a: 1,
        });
      });

      it("modern all-space stays accepted, with and without slash alpha", () => {
        expect(kolor.resolve("rgb(255 0 0 / 50%)")).toEqual({
          r: 255,
          g: 0,
          b: 0,
          a: 0.5,
        });
        // whitespace around the slash is optional
        expect(kolor.resolve("rgb(255 0 0/0.5)")).toEqual({
          r: 255,
          g: 0,
          b: 0,
          a: 0.5,
        });
        expect(kolor.resolve("hsl(217 91% 60%)")).toEqual({
          r: 60,
          g: 131,
          b: 246,
          a: 1,
        });
        expect(kolor.resolve("hwb(0 0% 0%)")).toEqual({
          r: 255,
          g: 0,
          b: 0,
          a: 1,
        });
      });

      it("hwb() has no legacy comma form in CSS", () => {
        expect(kolor.resolve("hwb(0, 0%, 0%)")).toBeNull();
        expect(kolor.resolveHEX("hwb(0, 0%, 0%)")).toBeNull();
      });
    });

    describe("hue in hsl/hsla/hwb must be numeric", () => {
      it.each([
        "hsl(red 100% 50%)", // <named-hue> from a dropped draft; table value isn't even a CSS degree
        "hsl(red, 100%, 50%)",
        "hsl(yellow 100% 50%)", // parser table says 120 — CSS yellow is 60
        "hsla(green 100% 50% / 0.5)",
        "hwb(blue 0% 0%)",
        "hsl(120px 100% 50%)", // wrong unit — parseFloat would silently drop it
        "hsl(120. 50% 50%)", // bare trailing dot is not a CSS number
        "hsl(none, 100%, 50%)", // `none` hue is modern-syntax only
      ])("%s resolves to null", (cstr) => {
        expect(kolor.resolve(cstr)).toBeNull();
        expect(kolor.resolveHEX(cstr)).toBeNull();
      });

      it("numeric hues stay accepted: negative, decimal, scientific", () => {
        expect(kolor.resolve("hsl(-120 100% 50%)")).toEqual(
          kolor.resolve("hsl(240 100% 50%)")
        );
        expect(kolor.resolve("hsl(217.22 91.22% 59.8%)")).toEqual({
          r: 59,
          g: 130,
          b: 246,
          a: 1,
        });
        expect(kolor.resolve("hsl(1e2 100% 50%)")).toEqual(
          kolor.resolve("hsl(100 100% 50%)")
        );
      });

      it("angle units the parser converts are accepted: deg, grad, rad, turn", () => {
        const halfTurn = kolor.resolve("hsl(180 100% 50%)");
        expect(halfTurn).toEqual({ r: 0, g: 255, b: 255, a: 1 });
        expect(kolor.resolve("hsl(180deg 100% 50%)")).toEqual(halfTurn);
        expect(kolor.resolve("hsl(0.5turn 100% 50%)")).toEqual(halfTurn);
        expect(kolor.resolve("hsl(200grad 100% 50%)")).toEqual(halfTurn);
        expect(kolor.resolve("hsl(3.141592653589793rad 100% 50%)")).toEqual(
          halfTurn
        );
      });

      it("`none` hue is accepted in modern syntax (missing hue reads as 0)", () => {
        expect(kolor.resolve("hsl(none 100% 50%)")).toEqual({
          r: 255,
          g: 0,
          b: 0,
          a: 1,
        });
      });
    });

    describe("percentage hue in hsl/hwb is invalid CSS", () => {
      it.each([
        "hsl(50% 100% 50%)",
        "hsl(50%, 100%, 50%)",
        "hsla(50% 100% 50% / 0.5)",
        "hwb(50% 0% 0%)",
      ])("%s resolves to null", (cstr) => {
        expect(kolor.resolve(cstr)).toBeNull();
        expect(kolor.resolveHEX(cstr)).toBeNull();
      });

      it("rgb percentage channels are unaffected", () => {
        expect(kolor.resolveHEX("rgb(100%, 0%, 0%)")).toBe("#ff0000");
      });
    });

    describe("channel tokens must be CSS numbers (optional %)", () => {
      it.each([
        "rgb(1px 0 0)", // stray unit — parseFloat would read 1
        "rgb(1px, 0, 0)", // stray unit, legacy comma syntax
        "rgb(1e 0 0)", // 'e' with no exponent digits is not a CSS number
        "rgb(255 0 0 / 1px)", // unit in modern slash alpha
        "rgba(0, 0, 0, 1px)", // unit in legacy 4th-channel alpha
        "rgb(255 0 0 / 1e)", // exponent digits required in alpha too
        "hsl(120 91% 60px)", // unit in a non-hue hsl channel
        "hwb(0 0% 0px)", // unit in a hwb channel
        "rgb(255 0deg 0)", // angle units are hue-only, never rgb
        "rgb(1.. 0 0)", // double dot is not a number
      ])("%s resolves to null", (cstr) => {
        expect(kolor.resolve(cstr)).toBeNull();
        expect(kolor.resolveHEX(cstr)).toBeNull();
      });

      it("percentage / decimal / scientific channels stay accepted", () => {
        expect(kolor.resolve("rgb(50% 0% 0%)")).toEqual({
          r: 128, // 50% -> 127.5 -> rounds to 128
          g: 0,
          b: 0,
          a: 1,
        });
        expect(kolor.resolve("rgb(2.5e2 0 0)")).toEqual({
          r: 250,
          g: 0,
          b: 0,
          a: 1,
        });
        expect(kolor.resolve("rgb(.5 0 0)")).toEqual({
          r: 1, // 0.5 rounds to 1
          g: 0,
          b: 0,
          a: 1,
        });
      });
    });

    describe("`none` channels: modern syntax only (CSS Color 4)", () => {
      it("rgb(none 0 0) resolves — missing channel reads as 0", () => {
        expect(kolor.resolve("rgb(none 0 0)")).toEqual({
          r: 0,
          g: 0,
          b: 0,
          a: 1,
        });
        expect(kolor.resolve("hsl(120 none 50%)")).toEqual(
          kolor.resolve("hsl(120 0% 50%)")
        );
      });

      it("none alpha resolves to 0 in the modern slash position", () => {
        expect(kolor.resolve("rgb(0 0 0 / none)")).toEqual({
          r: 0,
          g: 0,
          b: 0,
          a: 0,
        });
      });

      it.each([
        "rgb(none, 0, 0)", // browsers reject none in legacy comma syntax
        "rgba(0, 0, 0, none)",
        "hsl(0, none, 50%)",
      ])("%s resolves to null", (cstr) => {
        expect(kolor.resolve(cstr)).toBeNull();
        expect(kolor.resolveHEX(cstr)).toBeNull();
      });
    });

    describe("numbers must be integers in [0x000000, 0xFFFFFF]", () => {
      it.each([
        -1, // parse would wrap to white via >>> 16
        0.5, // parse would truncate to black
        0x1ffffff, // parse would silently mask off high bits
        0xffffff + 1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ])("%d resolves to null", (n) => {
        expect(kolor.resolve(n)).toBeNull();
        expect(kolor.resolveHEX(n)).toBeNull();
      });

      it("range boundaries remain resolvable", () => {
        expect(kolor.resolve(0x000000)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        expect(kolor.resolve(0xffffff)).toEqual({
          r: 255,
          g: 255,
          b: 255,
          a: 1,
        });
      });
    });

    describe("keyword lookup uses own properties only", () => {
      // Object.prototype keys are not color names; reaching the vendored
      // parser's `in`-based table lookup with these used to throw.
      it.each(["constructor", "__proto__", "hasownproperty", "valueof"])(
        "%s resolves to null without throwing",
        (cstr) => {
          expect(() => kolor.resolve(cstr)).not.toThrow();
          expect(kolor.resolve(cstr)).toBeNull();
          expect(kolor.resolveHEX(cstr)).toBeNull();
        }
      );
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

  describe("canonical form is unique per quantized color", () => {
    it("emits #rrggbb whenever the quantized alpha byte is 0xff", () => {
      // 0.999 * 255 = 254.745 -> rounds to 0xff: same quantized color as
      // alpha 1, so it must get the same (6-digit) spelling.
      expect(kolor.resolveHEX("rgba(255, 0, 0, 0.999)")).toBe("#ff0000");
      expect(kolor.resolveHEX("rgba(255, 0, 0, 0.999)")).toBe(
        kolor.resolveHEX("rgba(255, 0, 0, 1)")
      );
    });

    it("keeps #rrggbbaa when the quantized alpha byte is below 0xff", () => {
      // 0.997 * 255 = 254.235 -> rounds to 0xfe: genuinely translucent.
      expect(kolor.resolveHEX("rgba(255, 0, 0, 0.997)")).toBe("#ff0000fe");
      expect(kolor.resolveHEX("#ff0000fe")).toBe("#ff0000fe");
    });

    it("resolve itself keeps the unquantized alpha", () => {
      // quantization is a resolveHEX (serialization) concern only
      expect(kolor.resolve("rgba(255, 0, 0, 0.999)")).toEqual({
        r: 255,
        g: 0,
        b: 0,
        a: 0.999,
      });
    });
  });
});
