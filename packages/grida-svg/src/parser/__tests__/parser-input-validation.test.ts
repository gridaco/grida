// Boundary type-check on the `src` argument. The `parse_svg(src: string)`
// signature is the entire contract — but callers from JS lose the
// compile-time annotation, and `undefined` leaking through (hot-reload
// races, stale state) used to crash at the internal `src.length` access
// with a stack frame that read as a parser defect. The guard exists so
// the error names the API and the actual type received.

import { describe, expect, it } from "vitest";
import { parse_svg } from "../parser.js";

describe("parse_svg input validation", () => {
  it("throws a TypeError naming the API when src is undefined", () => {
    expect(() => parse_svg(undefined as unknown as string)).toThrow(TypeError);
    expect(() => parse_svg(undefined as unknown as string)).toThrow(
      /parse_svg requires a string source, got undefined/
    );
  });

  it("throws a TypeError when src is null", () => {
    expect(() => parse_svg(null as unknown as string)).toThrow(
      /parse_svg requires a string source, got null/
    );
  });

  it("throws a TypeError when src is a number", () => {
    expect(() => parse_svg(42 as unknown as string)).toThrow(
      /parse_svg requires a string source, got number/
    );
  });

  it("still throws the existing 'no root element' for an empty string", () => {
    // Empty string is a valid string — the guard must NOT catch it; the
    // downstream "no root element" branch is the right error.
    expect(() => parse_svg("")).toThrow(/no root element/);
  });
});
