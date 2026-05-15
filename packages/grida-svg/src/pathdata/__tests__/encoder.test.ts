import { describe, test, expect } from "vitest";
import { encodeSVGPath } from "../index.js";
import { type SVGCommand } from "../types.js";

describe("SVGPathDataEncoder", () => {
  test("should not work when the command is forgotten", () => {
    expect(() => encodeSVGPath(undefined as unknown as SVGCommand)).toThrow(
      new TypeError("Cannot read properties of undefined (reading 'type')")
    );
  });

  test("should fail when a bad command is given", () => {
    expect(() =>
      encodeSVGPath({
        type: "plop",
        x: 0,
        y: 0,
      } as unknown as SVGCommand)
    ).toThrow(new Error('Unexpected command type "plop" at index 0.'));
  });
});
