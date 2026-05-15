import { describe, test, expect } from "vitest";
import { SVGPathData } from "../index.js";

export function testReversePath(input: string, preserveSubpathOrder?: boolean) {
  return new SVGPathData(input).reverse(preserveSubpathOrder).encode();
}

describe("Reverse paths", () => {
  describe("Valid", () => {
    test("empty path", () => {
      const input = "";
      const expected = "";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("single point path", () => {
      const input = "M10,10";
      // A single point path results in just a move command
      const expected = "M10 10";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("simple line path", () => {
      const input = "M10,10 L20,20 L30,10";
      const expected = "M30 10L20 20L10 10";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("horizontal and vertical lines", () => {
      const input = "M10,10 H30 V30 H10";
      const expected = "M10 30H30V10H10";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("closed path (with Z command)", () => {
      const input = "M10,10 L20,20 L30,10 Z";
      // The Z command is preserved in the reversed path
      const expected = "M30 10L20 20L10 10z";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("path with cubic bezier curves", () => {
      const input = "M10,10 C20,20 40,20 50,10";
      // Reversed path with flipped control points
      const expected = "M50 10C40 20 20 20 10 10";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("path with cubic bezier curve as second command", () => {
      const input = "M10,10 C20,20 30,30 40,10";
      const expected = "M40 10C30 30 20 20 10 10";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("path closed both explicitly and implicitly", () => {
      const input = "M10,10 L20,20 L30,10 L10,10 Z"; // Note: Last point (10,10) matches first point + Z
      // Should still reverse correctly and maintain Z
      const expected = "M10 10L30 10L20 20L10 10z";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("path closed only implicitly (without Z command)", () => {
      const input = "M10,10 L20,20 L30,10 L10,10"; // Note: Last point matches first point, but no Z
      // Should still reverse correctly and maintain implicit closure
      const expected = "M10 10L30 10L20 20L10 10";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("complex mixed path with multiple command types", () => {
      const input = "M10,10 H30 V30 L40,40 C50,50 60,40 70,30 H80 V20 Z";
      const expected = "M80 20V30H70C60 40 50 50 40 40L30 30V10H10z";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("bezier curve with high precision coordinates (C)", () => {
      const input =
        "M10.123456789,10.987654321 C20.111222333,20.444555666 40.777888999,20.111222333 50.555666777,10.333222111";
      const expected =
        "M50.555666777 10.333222111C40.777888999 20.111222333 20.111222333 20.444555666 10.123456789 10.987654321";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("path with multiple subpaths (multiple M and Z commands)", () => {
      const input = "M10,10 L20,20 Z M30,30 L40,40 Z";
      const expected = "M20 20L10 10zM40 40L30 30z";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("path with multiple open subpaths (multiple M commands without Z)", () => {
      const input = "M10,10 L20,20 M30,30 L40,40";
      const expected = "M20 20L10 10M40 40L30 30";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("path with multiple subpaths and reversed subpath order", () => {
      const input = "M10,10 L20,20 Z M30,30 L40,40 Z";
      const expected = "M40 40L30 30zM20 20L10 10z";
      expect(testReversePath(input, false)).toEqual(expected);
    });

    test("path with multiple open subpaths and reversed subpath order", () => {
      const input = "M10,10 L20,20 M30,30 L40,40 M50,50 L60,60";
      const expected = "M60 60L50 50M40 40L30 30M20 20L10 10";
      expect(testReversePath(input, false)).toEqual(expected);
    });

    // New tests for combined HVL commands
    test("mixed H, V, and L commands", () => {
      const input = "M10,10 H20 V20 L30,30";
      const expected = "M30 30L20 20V10H10";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("alternating H and V commands", () => {
      const input = "M10,10 H20 V20 H10 V30 H30";
      const expected = "M30 30H10V20H20V10H10";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("H, V, and L commands with varying coordinates", () => {
      const input = "M10,10 H40 V30 L20,40 H10 V10";
      const expected = "M10 10V40H20L40 30V10H10";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("H and L commands in sequence", () => {
      const input = "M10,10 H30 L40,20 H50";
      const expected = "M50 20H40L30 10H10";
      expect(testReversePath(input)).toEqual(expected);
    });

    test("V and L commands in sequence", () => {
      const input = "M10,10 V30 L20,40 V50";
      const expected = "M20 50V40L10 30V10";
      expect(testReversePath(input)).toEqual(expected);
    });
  });

  describe("Invalid", () => {
    test("throw on relative commands", () => {
      const input = "m10,10 l10,10 l10,-10";
      expect(() => testReversePath(input)).toThrow(
        "Relative command are not supported convert first with `toAbs()`"
      );
    });

    test("throw on quadratic bezier curve (Q)", () => {
      const input = "M10,10 Q25,25 40,10";
      expect(() => testReversePath(input)).toThrow(
        "Unsupported command: Q (quadratic bezier)"
      );
    });

    test("throw on smooth cubic bezier curve (S)", () => {
      const input = "M10,10 S25,25 40,10";
      expect(() => testReversePath(input)).toThrow(
        "Unsupported command: S (smooth cubic bezier)"
      );
    });

    test("throw on smooth quadratic bezier curve (T)", () => {
      const input = "M10,10 T40,10";
      expect(() => testReversePath(input)).toThrow(
        "Unsupported command: T (smooth quadratic bezier)"
      );
    });

    test("throw on arc commands (A)", () => {
      const input = "M10,10 A5,5 0 0 1 20,20";
      expect(() => testReversePath(input)).toThrow(
        "Unsupported command: A (arc)"
      );
    });
  });
});
