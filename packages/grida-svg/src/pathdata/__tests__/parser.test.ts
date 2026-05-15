import { describe, test, expect } from "vitest";
import { SVGPathData } from "../index.js";

describe("SVGPathDataParser", () => {
  test("should fail when a bad command is given", () => {
    expect(() => SVGPathData.parse("b80,20")).toThrow(
      new SyntaxError('Unexpected character "b" at index 0.')
    );
  });
});
