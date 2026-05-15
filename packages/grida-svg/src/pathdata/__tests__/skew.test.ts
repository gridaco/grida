import { describe, test, expect } from "vitest";
import { SVGPathData } from "../index.js";

function degToRad(deg: number): number {
  return deg * (Math.PI / 180);
}

describe("X axis skew", () => {
  test("should fail with bad args", () => {
    expect(() =>
      new SVGPathData("m20,30l10,10z")
        .skewX(undefined as unknown as number)
        .encode()
    ).toThrow(
      new Error(
        "assertNumbers arguments[0] is not a number. undefined == typeof undefined"
      )
    );
  });

  test("should work with relative path | 90deg", () => {
    expect(
      new SVGPathData("m100 75l-50 -45l0 90z").skewX(degToRad(90)).encode()
    ).toEqual(
      "m1224842951489652700 75l-734905770893791600 -45l1469811541787583200 90z"
    );
  });

  test("should work with absolute path | 90deg", () => {
    expect(
      new SVGPathData("M 100,75 50,30 50,120 z").skewX(degToRad(90)).encode()
    ).toEqual(
      "M1224842951489652700 75L489937180595861200 30L1959748722383444500 120z"
    );
  });

  test("should work with relative path | 30deg", () => {
    expect(
      new SVGPathData("m100 75l-50 -45l0 90z").skewX(degToRad(30)).encode()
    ).toEqual(
      "m143.30127018922192 75l-75.98076211353316 -45l51.96152422706631 90z"
    );
  });
  test("should work with absolute path | 30deg", () => {
    expect(
      new SVGPathData("M 100,75 50,30 50,120 z").skewX(degToRad(30)).encode()
    ).toEqual(
      "M143.30127018922192 75L67.32050807568876 30L119.28203230275508 120z"
    );
  });
});

describe("Y axis skew", () => {
  test("should fail with bad args", () => {
    expect(() =>
      new SVGPathData("m20,30l10,10z")
        .skewY(undefined as unknown as number)
        .encode()
    ).toThrow(
      new Error(
        "assertNumbers arguments[0] is not a number. undefined == typeof undefined"
      )
    );
  });

  test("should work with relative path | 90deg", () => {
    expect(
      new SVGPathData("m100 75l-50 -45l0 90z").skewY(degToRad(90)).encode()
    ).toEqual("m100 1633123935319537000l-50 -816561967659768400l0 90z");
  });

  test("should work with absolute path | 90deg", () => {
    expect(
      new SVGPathData("M 100,75 50,30 50,120 z").skewY(degToRad(90)).encode()
    ).toEqual(
      "M100 1633123935319537000L50 816561967659768400L50 816561967659768600z"
    );
  });

  test("should work with relative path | 30deg", () => {
    expect(
      new SVGPathData("m100 75l-50 -45l0 90z").skewY(degToRad(30)).encode()
    ).toEqual("m100 132.73502691896257l-50 -73.86751345948129l0 90z");
  });

  test("should work with absolute path | 30deg", () => {
    expect(
      new SVGPathData("M 100,75 50,30 50,120 z").skewY(degToRad(30)).encode()
    ).toEqual(
      "M100 132.73502691896257L50 58.86751345948129L50 148.8675134594813z"
    );
  });
});
