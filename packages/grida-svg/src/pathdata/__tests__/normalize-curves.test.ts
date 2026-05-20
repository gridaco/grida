import { describe, test, expect } from "vitest";
import { SVGPathData } from "../index.js";

function testNormalizeST(path: string) {
  const pathData = new SVGPathData(path).normalizeST();
  return pathData.encode();
}

describe("normalization of curves", () => {
  test("should ignore everything which isn't S s T t", () => {
    expect(
      testNormalizeST(
        "m20,30c0 0 10 20 15 30q10 20 15 30h10v10a10 10 5 1 0 10 10z"
      )
    ).toEqual("m20 30c0 0 10 20 15 30q10 20 15 30h10v10a10 10 5 1 0 10 10z");
  });

  test("should take the previous point as the curve parameter if the previous curve isn't of the same type", () => {
    expect(testNormalizeST("M 10 10 h 100 s 10 20 15 30 t 20 15")).toEqual(
      "M10 10h100c0 0 10 20 15 30q0 0 20 15"
    );
  });

  test("should mirror the previous control point", () => {
    expect(testNormalizeST("M 10 10 s 10 20 15 30 S 90 80 100 100")).toEqual(
      "M10 10c0 0 10 20 15 30C30 50 90 80 100 100"
    );
  });

  test("should handle multiple consecutive smooth cubic curves", () => {
    expect(
      testNormalizeST(
        "M 10 10 C 20 20 30 30 40 40 S 60 60 70 70 S 90 90 100 100"
      )
    ).toEqual("M10 10C20 20 30 30 40 40C50 50 60 60 70 70C80 80 90 90 100 100");
  });

  test("should handle multiple consecutive smooth quadratic curves", () => {
    expect(testNormalizeST("M 10 10 Q 20 30 30 40 T 50 60 T 70 80")).toEqual(
      "M10 10Q20 30 30 40Q40 50 50 60Q60 70 70 80"
    );
  });

  test("should handle mixed absolute and relative smooth curves", () => {
    expect(
      testNormalizeST("M 10 10 C 20 30 30 40 40 50 s 30 40 40 50")
    ).toEqual("M10 10C20 30 30 40 40 50c10 10 30 40 40 50");

    expect(testNormalizeST("M 10 10 Q 20 30 30 40 t 40 50")).toEqual(
      "M10 10Q20 30 30 40q10 10 40 50"
    );
  });

  test("should correctly reflect control points at inflection points", () => {
    expect(
      testNormalizeST("M 10 10 C 40 10 60 40 60 60 S 10 90 10 60")
    ).toEqual("M10 10C40 10 60 40 60 60C60 80 10 90 10 60");
  });

  test("should handle relative coordinates with large values", () => {
    expect(
      testNormalizeST("m 10 10 c 50 0 100 50 100 100 s -50 100 -100 100")
    ).toEqual("m10 10c50 0 100 50 100 100c0 50 -50 100 -100 100");
  });

  test("should correctly handle reflection in complex paths", () => {
    expect(
      testNormalizeST(
        "M 20 20 C 40 40 60 40 80 20 S 120 0 140 20 C 160 40 160 60 140 80 s -40 0 -60 -20"
      )
    ).toEqual(
      "M20 20C40 40 60 40 80 20C100 0 120 0 140 20C160 40 160 60 140 80c-20 20 -40 0 -60 -20"
    );
  });

  test("should handle smooth curves after non-curve commands", () => {
    expect(testNormalizeST("M 10 10 L 50 50 S 70 80 90 90")).toEqual(
      "M10 10L50 50C50 50 70 80 90 90"
    );

    expect(testNormalizeST("M 10 10 H 50 T 90 50")).toEqual(
      "M10 10H50Q50 10 90 50"
    );
  });
});
