// PathModel round-trip and verb-preservation tests.
//
// The headline guarantee: for every supported SVG path verb (M/L/H/V/C/S/Q/T/A/Z),
// parsing `d` and emitting it back should produce a byte-equal string IFF the
// shape has not been edited. When the geometry no longer matches the recorded
// verb, the emitter honestly falls back to a more general verb (typically C).
//
// We use `SVGPathData(d).encode()` as a normalization step on the EXPECTED
// side because the input `d` we hand-write here may use a different spacing
// or precision than svg-pathdata's canonical encoding. The test is "round-
// trip stable under the encoder," not "byte-equal to the literal author
// input." This is the right contract: PathModel composes with svg-pathdata.

import { describe, it, expect } from "vitest";
import { SVGPathData, encodeSVGPath } from "@grida/svg/pathdata";
import { PathModel } from "../src/core/path-edit/model";

/** Normalize a `d` string through svg-pathdata's encoder. Any equality check
 *  in this file is against the normalized form, since PathModel emits via
 *  the same encoder. */
function canon(d: string): string {
  return encodeSVGPath(new SVGPathData(d).commands);
}

function roundtrip(d: string): string {
  return PathModel.fromSvgPathD(d).toSvgPathD();
}

describe("PathModel — single-verb round-trip", () => {
  it("M + L (lines)", () => {
    const d = "M 0 0 L 10 0 L 10 10 L 0 10";
    expect(roundtrip(d)).toBe(canon(d));
  });

  it("H (horizontal line)", () => {
    const d = "M 0 0 H 10";
    expect(roundtrip(d)).toBe(canon(d));
  });

  it("V (vertical line)", () => {
    const d = "M 0 0 V 10";
    expect(roundtrip(d)).toBe(canon(d));
  });

  it("C (cubic bezier)", () => {
    const d = "M 0 0 C 5 0 10 5 10 10";
    expect(roundtrip(d)).toBe(canon(d));
  });

  it("S (smooth cubic)", () => {
    // S requires a preceding C/S, and the implicit ta is the mirror of
    // the previous tb. Construct a smooth join.
    const d = "M 0 0 C 5 0 5 5 10 5 S 15 10 20 5";
    expect(roundtrip(d)).toBe(canon(d));
  });

  it("Q (quadratic)", () => {
    const d = "M 0 0 Q 5 10 10 0";
    expect(roundtrip(d)).toBe(canon(d));
  });

  it("T (smooth quadratic)", () => {
    const d = "M 0 0 Q 5 10 10 0 T 20 0";
    expect(roundtrip(d)).toBe(canon(d));
  });

  it("Z (close path) — line closure", () => {
    const d = "M 0 0 L 10 0 L 10 10 L 0 10 Z";
    expect(roundtrip(d)).toBe(canon(d));
  });

  it("A (arc)", () => {
    const d = "M 0 0 A 5 5 0 0 1 10 0";
    expect(roundtrip(d)).toBe(canon(d));
  });

  it("A (large-arc + sweep variations)", () => {
    const d = "M 0 0 A 10 5 30 1 0 20 10";
    expect(roundtrip(d)).toBe(canon(d));
  });
});

describe("PathModel — composite round-trip", () => {
  it("mixed verbs in one path", () => {
    const d = "M 0 0 L 5 0 H 10 V 5 C 10 10 5 10 0 5 Q 0 2 0 0 Z";
    expect(roundtrip(d)).toBe(canon(d));
  });

  it("multiple subpaths", () => {
    const d = "M 0 0 L 10 0 L 10 10 Z M 20 20 L 30 20 L 30 30 Z";
    expect(roundtrip(d)).toBe(canon(d));
  });

  it("rectangle as polyline+close", () => {
    const d = "M 0 0 L 100 0 L 100 50 L 0 50 Z";
    expect(roundtrip(d)).toBe(canon(d));
  });
});

describe("PathModel — snapshot exposes source_verb", () => {
  it("records verb per segment", () => {
    const m = PathModel.fromSvgPathD("M 0 0 L 10 0 C 15 0 20 5 20 10 Z");
    const snap = m.snapshot();
    expect(snap.segments.length).toBe(3);
    expect(snap.segments[0].source_verb).toBe("L");
    expect(snap.segments[1].source_verb).toBe("C");
    expect(snap.segments[2].source_verb).toBe("Z");
  });

  it("vertex count matches parse", () => {
    const m = PathModel.fromSvgPathD("M 0 0 L 10 0 L 10 10");
    expect(m.vertexCount()).toBe(3);
    expect(m.segmentCount()).toBe(2);
  });
});

describe("PathModel — bbox", () => {
  it("rect bbox", () => {
    const m = PathModel.fromSvgPathD("M 0 0 L 100 0 L 100 50 L 0 50 Z");
    const bb = m.bbox();
    expect(bb.x).toBe(0);
    expect(bb.y).toBe(0);
    expect(bb.width).toBe(100);
    expect(bb.height).toBe(50);
  });
});

describe("PathModel — translateVertex", () => {
  it("moves one vertex; connected segments follow", () => {
    const m = PathModel.fromSvgPathD("M 0 0 L 10 0 L 10 10");
    const m2 = m.translateVertex(1, [5, 0]);
    const snap = m2.snapshot();
    expect(snap.vertices[0]).toEqual([0, 0]);
    expect(snap.vertices[1]).toEqual([15, 0]);
    expect(snap.vertices[2]).toEqual([10, 10]);
  });

  it("translating an H endpoint vertically demotes H → L on emit", () => {
    // Original: H draws a horizontal line. Move endpoint up — no longer horizontal.
    const m = PathModel.fromSvgPathD("M 0 0 H 10").translateVertex(1, [0, 5]);
    const d = m.toSvgPathD();
    // Emitter must NOT emit H (endpoint y differs from start y).
    expect(d).not.toMatch(/H/);
    expect(d).toMatch(/L/);
  });

  it("returns a new PathModel (immutable)", () => {
    const m = PathModel.fromSvgPathD("M 0 0 L 10 0");
    const m2 = m.translateVertex(1, [5, 0]);
    expect(m).not.toBe(m2);
    // original is unchanged
    expect(m.snapshot().vertices[1]).toEqual([10, 0]);
  });

  it("invalid vertex throws", () => {
    const m = PathModel.fromSvgPathD("M 0 0 L 10 0");
    expect(() => m.translateVertex(99, [1, 1])).toThrow(/invalid vertex/i);
  });
});

describe("PathModel — translateVertices (bulk)", () => {
  it("moves multiple vertices by the same delta", () => {
    const m = PathModel.fromSvgPathD("M 0 0 L 10 0 L 10 10 L 0 10 Z");
    const m2 = m.translateVertices([1, 2], [100, 0]);
    const snap = m2.snapshot();
    expect(snap.vertices[0]).toEqual([0, 0]);
    expect(snap.vertices[1]).toEqual([110, 0]);
    expect(snap.vertices[2]).toEqual([110, 10]);
    expect(snap.vertices[3]).toEqual([0, 10]);
  });

  it("empty indices = no-op (returns same instance)", () => {
    const m = PathModel.fromSvgPathD("M 0 0 L 10 0");
    expect(m.translateVertices([], [5, 5])).toBe(m);
  });
});

describe("PathModel — empty / degenerate", () => {
  it("empty d emits empty string", () => {
    expect(roundtrip("")).toBe("");
  });

  it("M-only path emits M only (no segments)", () => {
    const m = PathModel.fromSvgPathD("M 5 5");
    expect(m.vertexCount()).toBe(1);
    expect(m.segmentCount()).toBe(0);
    // Emitter outputs "" for zero segments, matching vn.toSVGPathData behavior.
    expect(m.toSvgPathD()).toBe("");
  });
});
