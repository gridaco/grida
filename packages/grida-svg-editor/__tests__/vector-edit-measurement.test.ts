// Point measurement in path edit — pure core (gridaco/grida#845).
//
// `vector_measurement_operands` resolves the two operands of the Alt-hover
// guide in path-local space, and owns the A-B de-duplication rules from the
// Grida Canvas vector-network measurement spec
// (docs/editor/features/vector-network-measurement.md). The DOM wiring is
// covered by `vector-edit-measurement.browser.test.ts`.

import { describe, expect, it } from "vitest";
import {
  PathModel,
  project_onto_segment,
  vector_measurement_operands,
} from "../src/core/vector-edit";

// v0 (0,0) · v1 (100,0) · v2 (100,100) · v3 (0,100) — open chain of straight
// segments s0 (v0→v1), s1 (v1→v2), s2 (v2→v3).
const CHAIN = PathModel.fromSvgPathD("M0,0 L100,0 L100,100 L0,100").snapshot();

// One cubic: (0,0) → (100,0) bulging up to y = -75 at t = 0.5.
const CURVE = PathModel.fromSvgPathD("M0,0 C0,-100 100,-100 100,0").snapshot();

const none = { vertices: [], segments: [] };

describe("vector_measurement_operands — vertex target", () => {
  it("measures a selected vertex to another vertex", () => {
    expect(
      vector_measurement_operands(
        CHAIN,
        { vertices: [0], segments: [] },
        { kind: "vertex", vertex: 2 }
      )
    ).toEqual({ a: [[0, 0]], b: [100, 100] });
  });

  it("measures from every selected vertex (the caller boxes them)", () => {
    expect(
      vector_measurement_operands(
        CHAIN,
        { vertices: [0, 1], segments: [] },
        { kind: "vertex", vertex: 3 }
      )
    ).toEqual({
      a: [
        [0, 0],
        [100, 0],
      ],
      b: [0, 100],
    });
  });

  it("measures from a selected segment's endpoints when no vertex is selected", () => {
    expect(
      vector_measurement_operands(
        CHAIN,
        { vertices: [], segments: [0] },
        { kind: "vertex", vertex: 3 }
      )
    ).toEqual({
      a: [
        [0, 0],
        [100, 0],
      ],
      b: [0, 100],
    });
  });

  it("prefers selected vertices over selected segments as the source", () => {
    expect(
      vector_measurement_operands(
        CHAIN,
        { vertices: [3], segments: [0] },
        { kind: "vertex", vertex: 2 }
      )?.a
    ).toEqual([[0, 100]]);
  });
});

describe("vector_measurement_operands — de-duplication", () => {
  it("skips a vertex measured against itself", () => {
    expect(
      vector_measurement_operands(
        CHAIN,
        { vertices: [1], segments: [] },
        { kind: "vertex", vertex: 1 }
      )
    ).toBeNull();
  });

  it("skips a target that is already in a multi-vertex selection", () => {
    expect(
      vector_measurement_operands(
        CHAIN,
        { vertices: [0, 2], segments: [] },
        { kind: "vertex", vertex: 2 }
      )
    ).toBeNull();
  });

  it("skips a vertex of a selected segment", () => {
    for (const vertex of [0, 1]) {
      expect(
        vector_measurement_operands(
          CHAIN,
          { vertices: [], segments: [0] },
          { kind: "vertex", vertex }
        )
      ).toBeNull();
    }
  });

  it("skips a vertex of any of several selected segments", () => {
    expect(
      vector_measurement_operands(
        CHAIN,
        { vertices: [], segments: [0, 2] },
        { kind: "vertex", vertex: 3 }
      )
    ).toBeNull();
  });

  it("measures a vertex of a segment that is not selected", () => {
    expect(
      vector_measurement_operands(
        CHAIN,
        { vertices: [], segments: [0] },
        { kind: "vertex", vertex: 2 }
      )
    ).not.toBeNull();
  });
});

describe("vector_measurement_operands — segment target", () => {
  it("measures to the point at `t` on the hovered segment", () => {
    expect(
      vector_measurement_operands(
        CHAIN,
        { vertices: [0], segments: [] },
        { kind: "segment", segment: 1, t: 0.5 }
      )
    ).toEqual({ a: [[0, 0]], b: [100, 50] });
  });

  it("evaluates curved segments on the curve, not the chord", () => {
    const out = vector_measurement_operands(
      CURVE,
      { vertices: [0], segments: [] },
      { kind: "segment", segment: 0, t: 0.5 }
    );
    expect(out!.b[0]).toBeCloseTo(50, 6);
    expect(out!.b[1]).toBeCloseTo(-75, 6);
  });

  it("measures a point on a selected vertex's own segment", () => {
    // Only vertex targets are de-duplicated; a point on the curve is a
    // distinct dynamic point even when the segment touches the selection.
    expect(
      vector_measurement_operands(
        CHAIN,
        { vertices: [1], segments: [] },
        { kind: "segment", segment: 1, t: 0.5 }
      )
    ).toEqual({ a: [[100, 0]], b: [100, 50] });
  });
});

describe("vector_measurement_operands — nothing to measure", () => {
  it("skips a selected segment as the target", () => {
    expect(
      vector_measurement_operands(
        CURVE,
        { vertices: [], segments: [0] },
        { kind: "segment", segment: 0, t: 0.5 }
      )
    ).toBeNull();
  });

  it("returns null without a vertex or segment selection", () => {
    expect(
      vector_measurement_operands(CHAIN, none, { kind: "vertex", vertex: 2 })
    ).toBeNull();
    expect(
      vector_measurement_operands(CHAIN, none, {
        kind: "segment",
        segment: 0,
        t: 0.5,
      })
    ).toBeNull();
  });

  it("returns null for a stale (out-of-range) target", () => {
    const source = { vertices: [0], segments: [] };
    expect(
      vector_measurement_operands(CHAIN, source, { kind: "vertex", vertex: 9 })
    ).toBeNull();
    expect(
      vector_measurement_operands(CHAIN, source, {
        kind: "segment",
        segment: 9,
        t: 0.5,
      })
    ).toBeNull();
  });

  it("returns null when every selected index is stale", () => {
    expect(
      vector_measurement_operands(
        CHAIN,
        { vertices: [9], segments: [] },
        { kind: "vertex", vertex: 2 }
      )
    ).toBeNull();
  });
});

describe("project_onto_segment", () => {
  const identity = (p: readonly [number, number]) => p;

  it("resolves the point on the segment nearest the cursor", () => {
    // A straight `L` is a zero-tangent cubic, so `t` is not proportional to
    // length — what matters is that projecting and evaluating agree.
    const t = project_onto_segment(CHAIN, 1, identity, [130, 40])!;
    const out = vector_measurement_operands(
      CHAIN,
      { vertices: [0], segments: [] },
      { kind: "segment", segment: 1, t }
    );
    expect(out!.b[0]).toBeCloseTo(100, 6);
    expect(out!.b[1]).toBeCloseTo(40, 3);
  });

  it("projects in the frame the projection maps into", () => {
    // Screen frame = path-local scaled 2× and shifted by (10, 20): the
    // screen point (210, 120) is local (100, 50), the middle of s1.
    const to_screen = (p: readonly [number, number]) =>
      [p[0] * 2 + 10, p[1] * 2 + 20] as const;
    expect(project_onto_segment(CHAIN, 1, to_screen, [210, 120])).toBeCloseTo(
      0.5,
      3
    );
  });

  it("finds the curve point nearest the cursor", () => {
    const t = project_onto_segment(CURVE, 0, identity, [50, -90])!;
    expect(t).toBeCloseTo(0.5, 2);
  });

  it("returns null for an out-of-range segment", () => {
    expect(project_onto_segment(CHAIN, 9, identity, [0, 0])).toBeNull();
  });
});
