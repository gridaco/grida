// Vertex Transform Box — transform a vector sub-selection (gridaco/grida#881).
//
// A multi-vertex sub-selection in path edit mode is treated as a transformable
// object: a single affine (translate / scale / rotate, produced by the HUD
// transform-box gesture) maps the selected vertices (and their tangents);
// unselected vertices stay put. This pins the feature across its headless
// layers (see __tests__/README.md):
//
//   1. Pure geometry — `PathModel.transformVertices` (affine over selected
//      vertices + linear-part over their tangents; count- and type-preserving).
//   2. Screen → local affine — `box_transform_to_local_affine` (the box lives
//      in container px; the vertices live in path-local coords).
//   3. Policy + decision — `transform_vector_subselection` /
//      `subselection_transform_vertices` against a real session.
//
// The HUD gesture lifecycle + history bracketing live in the DOM surface and
// can't be mounted headlessly; they are exercised manually
// (test/svg-editor-vertex-transform-box.md).

import { describe, expect, it } from "vitest";
import cmath from "@grida/cmath";
import {
  box_transform_to_local_affine,
  obb_frame_from_corners,
} from "../src/dom";
import {
  PathModel,
  VectorEditSession,
  transform_vector_subselection,
  subselection_transform_vertices,
  subset_translation_delta,
  source_to_session_d,
} from "../src/core/vector-edit";
import type { VectorEditSource } from "../src/core/document";

type T = cmath.Transform;
const IDENTITY: T = [
  [1, 0, 0],
  [0, 1, 0],
];
const translate = (dx: number, dy: number): T => [
  [1, 0, dx],
  [0, 1, dy],
];
/** Uniform / non-uniform scale about the origin. */
const scale = (sx: number, sy: number = sx): T => [
  [sx, 0, 0],
  [0, sy, 0],
];
/** Rotate `deg` CCW about the origin (screen convention: y-down). */
const rotate = (deg: number): T => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [c, -s, 0],
    [s, c, 0],
  ];
};

/** Canonical (path-order) vertices of a model's emitted `d`. */
function verts(m: PathModel): [number, number][] {
  return PathModel.fromSvgPathD(m.toSvgPathD())
    .snapshot()
    .vertices.map((v) => [round(v[0]), round(v[1])]);
}
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

// ─── Layer 1: PathModel.transformVertices (pure geometry) ────────────────────

describe("PathModel.transformVertices — geometry", () => {
  // open 4-point chain: 0→1→2→3
  const OPEN = "M0,0 L10,0 L20,0 L30,0";
  // closed quad polygon
  const QUAD = "M0,0 L10,0 L10,10 L0,10 Z";

  it("translates only the selected vertices; others stay put", () => {
    const m = PathModel.fromSvgPathD(OPEN);
    const out = m.transformVertices([2, 3], translate(0, 5));
    expect(verts(out)).toEqual([
      [0, 0],
      [10, 0],
      [20, 5],
      [30, 5],
    ]);
  });

  it("scales the selected vertices about the origin", () => {
    // The right edge of the quad (vertices 1,2 at x=10) scaled ×2 in x.
    const m = PathModel.fromSvgPathD(QUAD);
    const out = m.transformVertices([1, 2], scale(2, 1));
    expect(verts(out)).toEqual([
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ]);
  });

  it("rotates the selected vertices about the origin", () => {
    // Rotate vertex 1 (10,0) by 90° CCW (screen y-down) → (0,10).
    const m = PathModel.fromSvgPathD(OPEN);
    const out = m.transformVertices([1], rotate(90));
    expect(verts(out)[1]).toEqual([0, 10]);
    // others untouched
    expect(verts(out)[0]).toEqual([0, 0]);
    expect(verts(out)[3]).toEqual([30, 0]);
  });

  it("transforms a selected vertex's tangents by the linear part (both endpoints selected)", () => {
    // cubic: ta=[5,-5], tb=[-5,5]. Scale ×2 about origin → tangents ×2.
    const m = PathModel.fromSvgPathD("M0,0 C5,-5 5,5 10,0");
    const out = m.transformVertices([0, 1], scale(2));
    const seg = PathModel.fromSvgPathD(out.toSvgPathD()).snapshot().segments[0];
    expect(seg.ta).toEqual([10, -10]);
    expect(seg.tb).toEqual([-10, 10]);
    expect(verts(out)).toEqual([
      [0, 0],
      [20, 0],
    ]);
  });

  it("transforms only the selected endpoint's tangent; the other handle stays fixed (partial selection)", () => {
    // Select only vertex 0 (at the origin → it doesn't move under scale, but
    // its ta scales). The unselected vertex 1 and its tb are untouched.
    const m = PathModel.fromSvgPathD("M0,0 C5,-5 5,5 10,0");
    const out = m.transformVertices([0], scale(2));
    const seg = PathModel.fromSvgPathD(out.toSvgPathD()).snapshot().segments[0];
    expect(seg.ta).toEqual([10, -10]); // selected endpoint's handle scaled
    expect(seg.tb).toEqual([-5, 5]); // other endpoint's handle unchanged
    expect(verts(out)).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });

  it("preserves vertex count and a polygon's native expressibility (type-preserving)", () => {
    const m = PathModel.fromSvgPathD(QUAD);
    const out = m.transformVertices([1, 2], scale(2, 1));
    expect(out.vertexCount()).toBe(4);
    // zero-tangent transform keeps the chain expressible as <polygon>
    expect(out.toNativeAttrs("polygon")).not.toBeNull();
  });

  it("dedupes repeated indices (each vertex moves exactly once)", () => {
    const m = PathModel.fromSvgPathD(OPEN);
    const once = m.transformVertices([1], translate(5, 0));
    const twice = m.transformVertices([1, 1], translate(5, 0));
    expect(verts(twice)).toEqual(verts(once));
    expect(verts(twice)[1]).toEqual([15, 0]); // moved by 5, not 10
  });

  it("empty selection is an identity", () => {
    const m = PathModel.fromSvgPathD(OPEN);
    expect(verts(m.transformVertices([], scale(2)))).toEqual(verts(m));
  });

  it("throws on an out-of-range index", () => {
    const m = PathModel.fromSvgPathD(OPEN);
    expect(() => m.transformVertices([9], scale(2))).toThrow(/invalid vertex/);
  });

  it("a degenerate (collapsing) matrix does not produce NaN", () => {
    const m = PathModel.fromSvgPathD(QUAD);
    const collapse: T = [
      [0, 0, 0],
      [0, 0, 0],
    ];
    const out = m.transformVertices([1, 2], collapse);
    for (const v of out.snapshot().vertices) {
      expect(Number.isNaN(v[0])).toBe(false);
      expect(Number.isNaN(v[1])).toBe(false);
    }
  });
});

// ─── Layer 2: box_transform_to_local_affine (screen → local affine) ──────────

function expectMatrixClose(a: T, b: T): void {
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      expect(a[r][c]).toBeCloseTo(b[r][c], 9);
    }
  }
}

describe("box_transform_to_local_affine", () => {
  it("identity box transform → identity local affine", () => {
    const out = box_transform_to_local_affine(
      IDENTITY,
      [0, 0],
      [10, 10],
      IDENTITY
    );
    expectMatrixClose(out, IDENTITY);
  });

  it("de-normalizes the box-relative translation by box size (identity CTM)", () => {
    // tx=0.5 of a width-10 box = 5px; ty=0.25 of a height-20 box = 5px.
    const box: T = [
      [1, 0, 0.5],
      [0, 1, 0.25],
    ];
    const out = box_transform_to_local_affine(box, [0, 0], [10, 20], IDENTITY);
    expectMatrixClose(out, translate(5, 5));
  });

  it("re-anchors a scale to the box origin (identity CTM)", () => {
    // Scale ×2 about a box whose [0,0] is at container (3,4) → scale about (3,4).
    const out = box_transform_to_local_affine(
      scale(2),
      [3, 4],
      [10, 10],
      IDENTITY
    );
    expectMatrixClose(out, [
      [2, 0, -3],
      [0, 2, -4],
    ]);
  });

  it("round-trips a uniform scale through a scaled element CTM (conjugation-invariant)", () => {
    const ctm: T = [
      [0.5, 0, 0],
      [0, 0.5, 0],
    ];
    const out = box_transform_to_local_affine(scale(2), [0, 0], [10, 10], ctm);
    expectMatrixClose(out, scale(2));
  });

  it("a container-px translation becomes a larger local translation through a zoomed-out CTM", () => {
    // CTM maps local→container at 0.5×, so a 5px container translate is 10
    // local units.
    const ctm: T = [
      [0.5, 0, 0],
      [0, 0.5, 0],
    ];
    const box: T = [
      [1, 0, 0.5],
      [0, 1, 0],
    ];
    const out = box_transform_to_local_affine(box, [0, 0], [10, 10], ctm);
    expectMatrixClose(out, translate(10, 0));
  });

  it("honors the box rotation: a translate along the box's x-axis maps to the rotated world axis", () => {
    // A box rotated 90° CCW; a box-relative +x translation (tx = 1 → 10 px on
    // a width-10 box) comes out along world +y (identity CTM).
    const box: T = [
      [1, 0, 1],
      [0, 1, 0],
    ];
    const out = box_transform_to_local_affine(
      box,
      [0, 0],
      [10, 10],
      IDENTITY,
      90
    );
    expectMatrixClose(out, translate(0, 10));
  });
});

describe("obb_frame_from_corners", () => {
  it("axis-aligned corners → origin + size, rotation 0", () => {
    const f = obb_frame_from_corners({
      nw: [0, 0],
      ne: [10, 0],
      sw: [0, 5],
    });
    expect(f.origin).toEqual([0, 0]);
    expect(f.size[0]).toBeCloseTo(10, 9);
    expect(f.size[1]).toBeCloseTo(5, 9);
    expect(f.rotation).toBeCloseTo(0, 9);
  });

  it("a 90°-rotated rectangle → rotation 90, size from the axis lengths", () => {
    // width axis nw→ne points +y (rotated 90°); height axis nw→sw points −x.
    const f = obb_frame_from_corners({
      nw: [0, 0],
      ne: [0, 10],
      sw: [-5, 0],
    });
    expect(f.rotation).toBeCloseTo(90, 9);
    expect(f.size[0]).toBeCloseTo(10, 9);
    expect(f.size[1]).toBeCloseTo(5, 9);
  });
});

// ─── Layer 3: transform_vector_subselection (resolver + policy + decision) ───

function make(source: VectorEditSource): {
  session: VectorEditSession;
  model: PathModel;
} {
  const d = source_to_session_d(source);
  return {
    session: new VectorEditSession("n", source, d),
    model: PathModel.fromSvgPathD(d),
  };
}

const QUAD_POLY: VectorEditSource = {
  kind: "polygon",
  points: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
};

describe("subselection_transform_vertices — resolver", () => {
  it("resolves to the explicitly selected vertices (deduped, ascending)", () => {
    const { session, model } = make(QUAD_POLY);
    session.set_selection({ vertices: [3, 1, 1], segments: [], tangents: [] });
    expect(subselection_transform_vertices(session, model)).toEqual([1, 3]);
  });

  it("ignores selected segments — a segment selection is NOT a vertex selection (no box)", () => {
    const { session, model } = make(QUAD_POLY);
    // segment 0 is 0→1; selecting it must NOT resolve to its endpoints.
    session.set_selection({ vertices: [], segments: [0], tangents: [] });
    expect(subselection_transform_vertices(session, model)).toEqual([]);
  });

  it("a vertex + segment mix resolves to the vertices only (segment endpoints excluded)", () => {
    const { session, model } = make(QUAD_POLY);
    session.set_selection({ vertices: [3], segments: [0], tangents: [] });
    expect(subselection_transform_vertices(session, model)).toEqual([3]);
  });

  it("a tangent-only selection resolves to no movable vertex", () => {
    const { session, model } = make({ kind: "path", d: "M0,0 C5,-5 5,5 10,0" });
    session.set_selection({ vertices: [], segments: [], tangents: [[0, 0]] });
    expect(subselection_transform_vertices(session, model)).toEqual([]);
  });
});

describe("transform_vector_subselection — noop / policy gate / outcome", () => {
  it("returns noop when nothing movable is sub-selected", () => {
    const { session, model } = make(QUAD_POLY);
    expect(
      transform_vector_subselection(session, model, scale(2), "polygon")
    ).toEqual({ kind: "noop" });
  });

  it("transforms a polygon sub-selection and stays a polygon (bake, type-preserving)", () => {
    const { session, model } = make(QUAD_POLY);
    session.set_selection({ vertices: [1, 2], segments: [], tangents: [] });
    const out = transform_vector_subselection(
      session,
      model,
      scale(2, 1),
      "polygon"
    );
    expect(out.kind).toBe("transformed");
    if (out.kind !== "transformed") return;
    const next = PathModel.fromSvgPathD(out.d);
    expect(next.vertexCount()).toBe(4); // count preserved
    expect(next.toNativeAttrs("polygon")).not.toBeNull(); // type preserved
    expect(verts(next)).toEqual([
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ]);
  });

  it("transforms a <path> sub-selection (always bake)", () => {
    const { session, model } = make({ kind: "path", d: "M0,0 L10,0 L20,0" });
    session.set_selection({ vertices: [0, 1, 2], segments: [], tangents: [] });
    const out = transform_vector_subselection(
      session,
      model,
      translate(0, 5),
      "path"
    );
    expect(out.kind).toBe("transformed");
    if (out.kind !== "transformed") return;
    expect(verts(PathModel.fromSvgPathD(out.d))).toEqual([
      [0, 5],
      [10, 5],
      [20, 5],
    ]);
  });

  it("refuses a source whose policy class rejects transform-vertices (rect → vertex-box)", () => {
    const { session, model } = make({
      kind: "rect",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    session.set_selection({ vertices: [0], segments: [], tangents: [] });
    expect(
      transform_vector_subselection(session, model, scale(2), "rect")
    ).toEqual({ kind: "refused" });
  });

  it("refuses a circle source (circle class rejects transform-vertices)", () => {
    const { session, model } = make({ kind: "circle", cx: 5, cy: 5, r: 5 });
    session.set_selection({ vertices: [0], segments: [], tangents: [] });
    expect(
      transform_vector_subselection(session, model, scale(2), "circle")
    ).toEqual({ kind: "refused" });
  });
});

// ─── subset_translation_delta — session reconcile (absorb vs reset) ──────────

describe("subset_translation_delta", () => {
  const OPEN = "M0,0 L10,0 L20,0 L30,0"; // 4-vertex chain

  it("returns the shared delta when ONLY the subset moved uniformly", () => {
    const expected = PathModel.fromSvgPathD(OPEN);
    const current = expected.transformVertices([2, 3], translate(5, 7));
    expect(subset_translation_delta(expected, current, [2, 3])).toEqual([5, 7]);
  });

  it("returns [0,0] when nothing moved (the keep case)", () => {
    const expected = PathModel.fromSvgPathD(OPEN);
    const current = PathModel.fromSvgPathD(OPEN);
    expect(subset_translation_delta(expected, current, [2, 3])).toEqual([0, 0]);
  });

  it("returns null when the subset vertices disagree (non-uniform)", () => {
    const expected = PathModel.fromSvgPathD(OPEN);
    const current = expected
      .transformVertices([2], translate(5, 0))
      .transformVertices([3], translate(0, 9));
    expect(subset_translation_delta(expected, current, [2, 3])).toBeNull();
  });

  it("returns null when an UNaffected vertex moved (external edit)", () => {
    const expected = PathModel.fromSvgPathD(OPEN);
    // Vertex 1 is not in the subset [2,3] — its movement must reset the frame.
    const current = expected.transformVertices([1], translate(5, 0));
    expect(subset_translation_delta(expected, current, [2, 3])).toBeNull();
  });

  it("returns null when a tangent changed even if no vertex moved", () => {
    // Scaling vertex 0 about the origin leaves its position but scales its
    // tangent — a non-translation edit must reset, not absorb.
    const expected = PathModel.fromSvgPathD("M0,0 C5,-5 5,5 10,0");
    const current = expected.transformVertices([0], scale(2));
    expect(subset_translation_delta(expected, current, [0, 1])).toBeNull();
  });

  it("returns null on a topology change (vertex count differs)", () => {
    const expected = PathModel.fromSvgPathD(OPEN);
    const current = PathModel.fromSvgPathD("M0,0 L10,0 L20,0");
    expect(subset_translation_delta(expected, current, [2])).toBeNull();
  });
});
