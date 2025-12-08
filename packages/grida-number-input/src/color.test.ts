import {
  rgbToHex,
  hexToRgb,
  extractHexDigits,
  expandHexDigits,
  parseFuzzyHex,
  type RGB,
  type FuzzyHexResult,
} from "./color";

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

describe("extractHexDigits", () => {
  test("extracts only hex digits from input", () => {
    expect(extractHexDigits("1+1")).toBe("1"); // First sequence only
    expect(extractHexDigits("abc123")).toBe("ABC123");
    expect(extractHexDigits("xyz")).toBe("");
    expect(extractHexDigits("FF8040")).toBe("FF8040");
    expect(extractHexDigits("#FF8040")).toBe("FF8040"); // # is non-hex, so starts after
    expect(extractHexDigits("FF-80-40")).toBe("FF"); // First sequence stops at '-'
    expect(extractHexDigits("ff80 40")).toBe("FF80"); // First sequence stops at space
  });

  test("handles empty string", () => {
    expect(extractHexDigits("")).toBe("");
  });

  test("converts to uppercase", () => {
    expect(extractHexDigits("abc")).toBe("ABC");
    expect(extractHexDigits("AbC123")).toBe("ABC123");
  });
});

describe("expandHexDigits", () => {
  test("single digit (U): repeats 6 times", () => {
    expect(expandHexDigits("1")).toEqual({ RRGGBB: "111111" });
    expect(expandHexDigits("a")).toEqual({ RRGGBB: "AAAAAA" });
    expect(expandHexDigits("F")).toEqual({ RRGGBB: "FFFFFF" });
  });

  test("two digits (U): repeats 3 times", () => {
    expect(expandHexDigits("23")).toEqual({ RRGGBB: "232323" });
    expect(expandHexDigits("AB")).toEqual({ RRGGBB: "ABABAB" });
    expect(expandHexDigits("ff")).toEqual({ RRGGBB: "FFFFFF" });
  });

  test("three digits (RGB): duplicates each", () => {
    expect(expandHexDigits("123")).toEqual({ RRGGBB: "112233" });
    expect(expandHexDigits("abc")).toEqual({ RRGGBB: "AABBCC" });
    expect(expandHexDigits("F0A")).toEqual({ RRGGBB: "FF00AA" });
  });

  test("four digits (RGBA): duplicates RGB, extracts alpha", () => {
    expect(expandHexDigits("fff0")).toEqual({
      RRGGBB: "FFFFFF",
      alpha: parseInt("00", 16) / 255, // "0" => "00" => 0/255
    });
    expect(expandHexDigits("fffF")).toEqual({
      RRGGBB: "FFFFFF",
      alpha: parseInt("FF", 16) / 255, // "F" => "FF" => 255/255 = 1.0
    });
    expect(expandHexDigits("1238")).toEqual({
      RRGGBB: "112233",
      alpha: parseInt("88", 16) / 255, // "8" => "88" => 136/255
    });
  });

  test("five digits: uses first 3 for RGB, ignores rest", () => {
    expect(expandHexDigits("12345")).toEqual({ RRGGBB: "112233" });
    expect(expandHexDigits("ABCDE")).toEqual({ RRGGBB: "AABBCC" });
  });

  test("six digits (RRGGBB): uses as-is", () => {
    expect(expandHexDigits("123456")).toEqual({ RRGGBB: "123456" });
    expect(expandHexDigits("ABCDEF")).toEqual({ RRGGBB: "ABCDEF" });
  });

  test("seven digits: uses first 6 for RGB", () => {
    expect(expandHexDigits("1234567")).toEqual({ RRGGBB: "123456" });
  });

  test("eight digits (RRGGBBAA): uses first 6 for RGB, extracts alpha", () => {
    expect(expandHexDigits("ff8040ff")).toEqual({
      RRGGBB: "FF8040",
      alpha: parseInt("FF", 16) / 255, // 255/255 = 1.0
    });
    expect(expandHexDigits("ff804000")).toEqual({
      RRGGBB: "FF8040",
      alpha: parseInt("00", 16) / 255, // 0/255 = 0.0
    });
    expect(expandHexDigits("ABCDEF80")).toEqual({
      RRGGBB: "ABCDEF",
      alpha: parseInt("80", 16) / 255, // 128/255 ≈ 0.502
    });
  });

  test("more than eight digits: uses first 8 (6 for RGB, 2 for alpha)", () => {
    expect(expandHexDigits("123456789ABC")).toEqual({
      RRGGBB: "123456",
      alpha: parseInt("78", 16) / 255,
    });
  });

  test("returns null for empty string", () => {
    expect(expandHexDigits("")).toBeNull();
  });

  test("converts to uppercase", () => {
    expect(expandHexDigits("abc")).toEqual({ RRGGBB: "AABBCC" });
    expect(expandHexDigits("ff8040")).toEqual({ RRGGBB: "FF8040" });
  });
});

describe("parseFuzzyHex", () => {
  test("parses single digit input (U)", () => {
    expect(parseFuzzyHex("1")).toEqual({ RRGGBB: "111111" });
    expect(parseFuzzyHex("a")).toEqual({ RRGGBB: "AAAAAA" });
  });

  test("parses two digit input (U)", () => {
    expect(parseFuzzyHex("23")).toEqual({ RRGGBB: "232323" });
    expect(parseFuzzyHex("AB")).toEqual({ RRGGBB: "ABABAB" });
  });

  test("parses three digit input (RGB)", () => {
    expect(parseFuzzyHex("123")).toEqual({ RRGGBB: "112233" });
    expect(parseFuzzyHex("abc")).toEqual({ RRGGBB: "AABBCC" });
  });

  test("parses four digit input (RGBA)", () => {
    expect(parseFuzzyHex("fff0")).toEqual({
      RRGGBB: "FFFFFF",
      alpha: parseInt("00", 16) / 255,
    });
    expect(parseFuzzyHex("fffF")).toEqual({
      RRGGBB: "FFFFFF",
      alpha: 1.0,
    });
  });

  test("parses eight digit input (RRGGBBAA)", () => {
    expect(parseFuzzyHex("ff8040ff")).toEqual({
      RRGGBB: "FF8040",
      alpha: 1.0,
    });
    expect(parseFuzzyHex("ff804000")).toEqual({
      RRGGBB: "FF8040",
      alpha: 0.0,
    });
  });

  test("handles dirty strings with non-hex characters", () => {
    expect(parseFuzzyHex("1+1")).toEqual({ RRGGBB: "111111" }); // First sequence "1" -> "111111"
    expect(parseFuzzyHex("abc123!@#")).toEqual({ RRGGBB: "ABC123" }); // First sequence "ABC123" -> valid 6-digit
    expect(parseFuzzyHex("FF-80-40")).toEqual({ RRGGBB: "FFFFFF" }); // First sequence "FF" -> "FFFFFF"
    expect(parseFuzzyHex("ff80 40")).toEqual({
      RRGGBB: "FFFF88",
      alpha: 0,
    }); // First sequence "FF80" -> RGBA format: RGB "FF8" -> "FFFF88", alpha "0" -> 0
    expect(parseFuzzyHex("#FF8040")).toEqual({ RRGGBB: "FF8040" }); // After #, full sequence "FF8040"
    expect(parseFuzzyHex("#fff0")).toEqual({
      RRGGBB: "FFFFFF",
      alpha: 0.0,
    }); // After #, RGBA format
  });

  test("handles long inputs", () => {
    expect(parseFuzzyHex("123456789")).toEqual({
      RRGGBB: "123456",
      alpha: parseInt("78", 16) / 255,
    }); // Uses first 8 digits (6 RGB + 2 alpha)
    expect(parseFuzzyHex("ABCDEF123")).toEqual({
      RRGGBB: "ABCDEF",
      alpha: parseInt("12", 16) / 255,
    }); // Uses first 8 digits (6 RGB + 2 alpha)
  });

  test("handles four and five digit inputs", () => {
    expect(parseFuzzyHex("1234")).toEqual({
      RRGGBB: "112233",
      alpha: parseInt("44", 16) / 255,
    });
    expect(parseFuzzyHex("12345")).toEqual({ RRGGBB: "112233" });
    expect(parseFuzzyHex("1234+5")).toEqual({
      RRGGBB: "112233",
      alpha: parseInt("44", 16) / 255,
    }); // extracts "1234", RGBA format
  });

  test("returns null for strings with no valid hex digits", () => {
    expect(parseFuzzyHex("xyz")).toBeNull();
    expect(parseFuzzyHex("!@#$%")).toBeNull();
    expect(parseFuzzyHex("")).toBeNull();
  });

  test("handles mixed case", () => {
    expect(parseFuzzyHex("AbC")).toEqual({ RRGGBB: "AABBCC" });
    expect(parseFuzzyHex("ff8040")).toEqual({ RRGGBB: "FF8040" });
  });
});
