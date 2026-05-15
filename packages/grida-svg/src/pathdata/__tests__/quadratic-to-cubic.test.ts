import { describe, test, expect } from "vitest";
import { SVGPathData } from "../index.js";

function testQtToC(input: string) {
  const data = new SVGPathData(input).qtToC();
  return data.round().encode();
}

describe("Quadratic to cubic bezier conversion", () => {
  test("absolute Q and T commands should be converted", () => {
    expect(testQtToC("M0 0 Q0,9 9,9 T9,18")).toEqual(
      "M0 0C0 6 3 9 9 9C15 9 15 12 9 18"
    );
  });

  test("relative Q and T commands should be converted", () => {
    expect(testQtToC("M9 18 q0,9 9,9 t9,18")).toEqual(
      "M9 18c0 6 3 9 9 9c6 0 9 6 9 18"
    );
  });

  test("multiple consecutive T commands should calculate correct control points", () => {
    expect(testQtToC("M10 10 Q20,10 30,20 T50,30 T70,20 T90,30")).toEqual(
      "M10 10C16.6666666666667 10 23.3333333333333 13.3333333333333 30 20C36.6666666666667 26.6666666666667 43.3333333333333 30 50 30C56.6666666666667 30 63.3333333333333 26.6666666666667 70 20C76.6666666666667 13.3333333333333 83.3333333333333 16.6666666666667 90 30"
    );
  });

  test("mixed absolute and relative Q/T commands", () => {
    expect(testQtToC("M10 10 Q20,20 30,30 t10,10 T50,60 q10,-10 20,0")).toEqual(
      "M10 10C16.6666666666667 16.6666666666667 23.3333333333333 23.3333333333333 30 30c6.6666666666667 6.6666666666667 10 10 10 10C40 40 43.3333333333333 46.6666666666667 50 60c6.6666666666667 -6.6666666666667 13.3333333333333 -6.6666666666667 20 0"
    );
  });

  test("Q/T commands after other path commands", () => {
    expect(testQtToC("M10 10 L20,20 H30 V40 Q40,20 50,40 T70,40")).toEqual(
      "M10 10L20 20H30V40C36.6666666666667 26.6666666666667 43.3333333333333 26.6666666666667 50 40C56.6666666666667 53.3333333333333 63.3333333333333 53.3333333333333 70 40"
    );
  });

  test("edge cases with zero-length or small paths", () => {
    // Q command with coincident points
    expect(testQtToC("M10 10 Q10,10 10,10")).toEqual(
      "M10 10C10 10 10 10 10 10"
    );

    // Q command with very small distances
    expect(testQtToC("M10 10 Q10.1,10.1 10.2,10.2")).toEqual(
      "M10 10C10.0666666666667 10.0666666666667 10.1333333333333 10.1333333333333 10.2 10.2"
    );
  });

  test("extreme coordinate values", () => {
    expect(testQtToC("M0 0 Q1000,1000 2000,0")).toEqual(
      "M0 0C666.6666666666666 666.6666666666666 1333.3333333333333 666.6666666666666 2000 0"
    );
  });

  test("Q/T combined with closepath", () => {
    expect(testQtToC("M10 10 Q20,0 30,10 T50,10 Z")).toEqual(
      "M10 10C16.6666666666667 3.3333333333333 23.3333333333333 3.3333333333333 30 10C36.6666666666667 16.6666666666667 43.3333333333333 16.6666666666667 50 10z"
    );
  });

  test("should handle paths with a mix of various commands", () => {
    expect(
      testQtToC(
        "M5 5 L10,10 Q15,20 20,10 C25,5 30,0 35,5 T45,15 H55 V25 Q60,30 65,25 Z"
      )
    ).toEqual(
      "M5 5L10 10C13.3333333333333 16.6666666666667 16.6666666666667 16.6666666666667 20 10C25 5 30 0 35 5C35 5 38.3333333333333 8.3333333333333 45 15H55V25C58.3333333333333 28.3333333333333 61.6666666666667 28.3333333333333 65 25z"
    );
  });
});
