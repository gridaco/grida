// Pure svg-string parsing primitives. Headless — no editor, no DOM.

import { describe, expect, it } from "vitest";
import { svg_parse } from "../svg-parse.js";

const {
  parse_number,
  parse_points,
  parse_path_first_move,
  parse_leading_translate,
  points_top_left,
} = svg_parse;

describe("parse_number", () => {
  it("parses positive integers", () => {
    expect(parse_number("42")).toBe(42);
  });

  it("parses negative + fractional + exponent", () => {
    expect(parse_number("-3.14")).toBe(-3.14);
    expect(parse_number("1.5e2")).toBe(150);
    expect(parse_number(".5")).toBe(0.5);
  });

  it("returns fallback for null / empty / non-finite", () => {
    expect(parse_number(null)).toBe(0);
    expect(parse_number("")).toBe(0);
    expect(parse_number("not a number")).toBe(0);
    expect(parse_number("NaN")).toBe(0);
    expect(parse_number("Infinity")).toBe(0);
  });

  it("respects custom fallback", () => {
    expect(parse_number(null, 99)).toBe(99);
    expect(parse_number("bad", -1)).toBe(-1);
  });

  it("tolerates trailing junk via parseFloat semantics", () => {
    // parseFloat stops at the first non-numeric char — same as SVG attr
    // parsing in browsers.
    expect(parse_number("42px")).toBe(42);
  });
});

describe("parse_points", () => {
  it("parses comma-separated pairs", () => {
    expect(parse_points("10,20 30,40")).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it("parses whitespace-separated coords", () => {
    expect(parse_points("10 20 30 40")).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it("tolerates mixed separators (comma + whitespace)", () => {
    expect(parse_points("10, 20  30 ,40")).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it("parses fractional + negative + exponent", () => {
    expect(parse_points("-1.5,2e1 .5,-0.25")).toEqual([
      { x: -1.5, y: 20 },
      { x: 0.5, y: -0.25 },
    ]);
  });

  it("drops a trailing odd number (incomplete pair)", () => {
    expect(parse_points("10,20 30")).toEqual([{ x: 10, y: 20 }]);
  });

  it("returns [] for empty / null-ish / unparseable input", () => {
    expect(parse_points("")).toEqual([]);
    expect(parse_points("   ")).toEqual([]);
    expect(parse_points("nope")).toEqual([]);
  });

  it("ignores non-numeric tokens between numbers (lenient)", () => {
    // SVG parsers are tolerant of mixed input; we follow parseFloat
    // semantics — tokenize all numbers, pair them up.
    expect(parse_points("10,20 garbage 30,40")).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });
});

describe("parse_path_first_move", () => {
  it("parses uppercase M with comma separator", () => {
    expect(parse_path_first_move("M 10,20 L 30,40")).toEqual({ x: 10, y: 20 });
  });

  it("parses lowercase m (treated as absolute per spec)", () => {
    expect(parse_path_first_move("m 5 7 l 3 4")).toEqual({ x: 5, y: 7 });
  });

  it("parses fractional + negative coords", () => {
    expect(parse_path_first_move("M-1.5,2.5 L 3 4")).toEqual({
      x: -1.5,
      y: 2.5,
    });
  });

  it("tolerates leading whitespace", () => {
    expect(parse_path_first_move("   M 1 2")).toEqual({ x: 1, y: 2 });
  });

  it("returns null for empty / unparseable", () => {
    expect(parse_path_first_move("")).toBeNull();
    expect(parse_path_first_move("not a path")).toBeNull();
    // A path that starts with L is invalid SVG; we don't attempt recovery.
    expect(parse_path_first_move("L 10 20")).toBeNull();
  });

  it("returns null when the M is followed by non-numeric junk", () => {
    expect(parse_path_first_move("M abc def")).toBeNull();
  });

  it("parses sign-delimited compact form (M10-20)", () => {
    // Minified path data packs pairs using the sign of the second
    // number as the delimiter. Per SVG path syntax this is valid.
    expect(parse_path_first_move("M10-20L30,40")).toEqual({ x: 10, y: -20 });
    expect(parse_path_first_move("M-1.5-2.5")).toEqual({ x: -1.5, y: -2.5 });
    expect(parse_path_first_move("M10+20")).toEqual({ x: 10, y: 20 });
  });
});

describe("parse_leading_translate", () => {
  it("parses a bare translate", () => {
    expect(parse_leading_translate("translate(10 20)")).toEqual({
      tx: 10,
      ty: 20,
      rest: "",
    });
  });

  it("parses comma-separated translate", () => {
    expect(parse_leading_translate("translate(10, 20)")).toEqual({
      tx: 10,
      ty: 20,
      rest: "",
    });
  });

  it("preserves a trailing transform", () => {
    expect(parse_leading_translate("translate(5 7) rotate(30)")).toEqual({
      tx: 5,
      ty: 7,
      rest: "rotate(30)",
    });
  });

  it("trims trailing whitespace in `rest`", () => {
    const r = parse_leading_translate("translate(0 0)   scale(2)   ");
    expect(r).toEqual({ tx: 0, ty: 0, rest: "scale(2)" });
  });

  it("returns null when transform doesn't lead with translate", () => {
    expect(parse_leading_translate("rotate(30) translate(10 20)")).toBeNull();
    expect(parse_leading_translate("scale(2)")).toBeNull();
    expect(parse_leading_translate("matrix(1 0 0 1 10 20)")).toBeNull();
  });

  it("returns null for null / empty", () => {
    expect(parse_leading_translate(null)).toBeNull();
    expect(parse_leading_translate("")).toBeNull();
  });

  it("parses fractional + negative + exponent values", () => {
    expect(parse_leading_translate("translate(-1.5e1, .5)")).toEqual({
      tx: -15,
      ty: 0.5,
      rest: "",
    });
  });

  it("parses single-argument translate (implicit ty=0)", () => {
    // Per SVG transform syntax, translate(tx) is valid and means
    // translate(tx, 0). Common in minified output.
    expect(parse_leading_translate("translate(10)")).toEqual({
      tx: 10,
      ty: 0,
      rest: "",
    });
    expect(parse_leading_translate("translate(-3.5) rotate(45)")).toEqual({
      tx: -3.5,
      ty: 0,
      rest: "rotate(45)",
    });
  });
});

describe("points_top_left", () => {
  it("returns min(x), min(y) across pairs", () => {
    expect(
      points_top_left([
        { x: 5, y: 10 },
        { x: 2, y: 12 },
        { x: 8, y: 3 },
      ])
    ).toEqual({ x: 2, y: 3 });
  });

  it("returns null for empty array", () => {
    expect(points_top_left([])).toBeNull();
  });

  it("handles a single point", () => {
    expect(points_top_left([{ x: 5, y: 10 }])).toEqual({ x: 5, y: 10 });
  });

  it("works composed with parse_points (round-trip)", () => {
    expect(points_top_left(parse_points("30,5 10,50 20,15"))).toEqual({
      x: 10,
      y: 5,
    });
  });
});
