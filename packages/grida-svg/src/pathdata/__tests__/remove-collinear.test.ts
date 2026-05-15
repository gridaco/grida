import { describe, test, expect } from "vitest";

import { SVGPathData } from "../svg-path-data.js";

function testRemoveCollinear(path: string): string {
  const pathData = new SVGPathData(path).removeCollinear();
  return pathData.encode();
}

describe("Remove collinear points", () => {
  test("Horizontal line with collinear point", () => {
    expect(testRemoveCollinear("M10,10 L20,10 L30,10")).toEqual("M10 10L30 10");
  });

  test("Diagonal line with collinear point", () => {
    expect(testRemoveCollinear("M10,10 L20,20 L30,30")).toEqual("M10 10L30 30");
  });

  test("Vertical line with collinear point", () => {
    expect(testRemoveCollinear("M10,10 L10,20 L10,30")).toEqual("M10 10L10 30");
  });

  test("Multiple collinear sections", () => {
    expect(
      testRemoveCollinear(
        "M10,10 L20,10 L30,10 L40,20 L50,30 L60,40 L60,50 L60,60"
      )
    ).toEqual("M10 10L30 10L60 40L60 60");
  });

  test("Preserves curves", () => {
    expect(
      testRemoveCollinear("M10,10 C20,20 30,20 40,10 L50,10 L60,10")
    ).toEqual("M10 10C20 20 30 20 40 10L60 10");
  });

  test("Preserves closed paths", () => {
    expect(testRemoveCollinear("M10,10 L20,10 L30,10 L30,20 L10,20 Z")).toEqual(
      "M10 10L30 10L30 20L10 20z"
    );
  });

  test("Handles multiple subpaths", () => {
    expect(
      testRemoveCollinear("M10,10 L20,10 L30,10 M40,40 L50,40 L60,40")
    ).toEqual("M10 10L30 10M40 40L60 40");
  });

  // Tests for relative paths
  test("Relative horizontal line with collinear point", () => {
    expect(testRemoveCollinear("m10,10 l10,0 l10,0")).toEqual("m10 10l20 0");
  });

  test("Relative diagonal line with collinear point", () => {
    expect(testRemoveCollinear("m10,10 l10,10 l10,10")).toEqual("m10 10l20 20");
  });

  test("Relative vertical line with collinear point", () => {
    expect(testRemoveCollinear("m10,10 l0,10 l0,10")).toEqual("m10 10l0 20");
  });

  test("Mixed relative and absolute commands", () => {
    expect(testRemoveCollinear("M10,10 L20,10 l10,0 l10,0")).toEqual(
      "M10 10l30 0"
    );
  });

  test("Relative multiple collinear sections", () => {
    expect(
      testRemoveCollinear("m10,10 l10,0 l10,0 l10,10 l10,10 l10,10 l0,10 l0,10")
    ).toEqual("m10 10l20 0l30 30l0 20");
  });
});
