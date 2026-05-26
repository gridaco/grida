// Headless tests for PathModel's vector-edit surface:
// tangent reads + setTangent, splitSegment, translateSegment, bendSegment,
// segmentContainedByRect, neighbouringVertices.
//
// All tests run on POJO snapshots — no DOM, no HUD.
//
// History: `vertexAbsolute`, `evaluateSegment`, `projectPointOnSegment`,
// and `segmentIntersectsRect` used to live on PathModel and had test
// coverage here. They were removed because production callers always
// went through `snapshot()` + `cmath.bezier.*` directly — the helpers
// were only kept alive by their own tests.

import { describe, it, expect } from "vitest";
import { PathModel } from "../src/core/vector-edit";

describe("PathModel tangent reads + setTangent (chunk A)", () => {
  // Square-with-curved-top fixture: M0,0 C0,-5 10,-5 10,0 L10,10 L0,10 Z
  const D = "M0,0 C0,-5 10,-5 10,0 L10,10 L0,10 Z";

  it("tangentAbsolute returns vertex+tangent in doc-space", () => {
    const m = PathModel.fromSvgPathD(D);
    // The C command's first control: (0, -5) relative to vertex 0 (0,0)
    // → ta = (0, -5), so tangentAbsolute([0, 0]) should be (0, -5).
    const ta_abs = m.tangentAbsolute([0, 0], [0, 0]);
    expect(ta_abs).toEqual([0, -5]);
    // The C command's second control: (10, -5) relative to vertex 1 (10, 0)
    // → tb = (0, -5), so tangentAbsolute([1, 1]) = (10, -5).
    const tb_abs = m.tangentAbsolute([1, 1], [0, 0]);
    expect(tb_abs).toEqual([10, -5]);
  });

  it("tangentAbsolute respects origin offset", () => {
    const m = PathModel.fromSvgPathD(D);
    const p = m.tangentAbsolute([0, 0], [100, 200]);
    expect(p).toEqual([100, 195]);
  });

  it("tangentAbsolute returns null for a vertex without that tangent", () => {
    // Vertex 0 of a closed subpath has an incoming segment via Z, so it
    // would resolve. Use an open path instead so both endpoints lack one
    // of their two possible tangent attachments.
    const open = PathModel.fromSvgPathD("M0,0 L10,0");
    // Vertex 0: no segment has b===0, so [0, 1] is null.
    expect(open.tangentAbsolute([0, 1], [0, 0])).toBeNull();
    // Vertex 1: no segment has a===1.
    expect(open.tangentAbsolute([1, 0], [0, 0])).toBeNull();
  });

  it("setTangent moves the tangent and translates back through emit", () => {
    const m = PathModel.fromSvgPathD(D);
    // Move ta of the C segment from (0,-5) → (0,-20) (absolute).
    const next = m.setTangent([0, 0], [0, -20], "none");
    const snap = next.snapshot();
    // Segment 0 (the C) should have ta = (0, -20).
    expect(snap.segments[0].ta).toEqual([0, -20]);
    // The recorded verb should still be "C" — geometry is still cubic.
    expect(snap.segments[0].source_verb).toBe("C");
  });

  it("setTangent with mirror=all mirrors the opposite tangent length+angle", () => {
    // A simple two-segment open path where the middle vertex has both ta
    // and tb tangents, so mirror has something to mirror against.
    const m = PathModel.fromSvgPathD("M0,0 C5,0 10,5 10,10 C10,15 5,20 0,20");
    // The middle vertex (index 1) has tb on segment 0 and ta on segment 1.
    // Before edit: tb[0] = (10,5)-(10,10) = (0,-5); ta[1] = (10,15)-(10,10) = (0,5).
    // These are already mirrored (angle 180°, equal length).
    const snap0 = m.snapshot();
    expect(snap0.segments[0].tb).toEqual([0, -5]);
    expect(snap0.segments[1].ta).toEqual([0, 5]);
    // Move tb of segment 0 → new absolute (10, 0) (i.e., tb = (0, -10)).
    const next = m.setTangent([1, 1], [10, 0], "all");
    const snap = next.snapshot();
    expect(snap.segments[0].tb).toEqual([0, -10]);
    // mirror=all → opposite ta should mirror angle + length → (0, 10).
    // (Compare componentwise to dodge -0 vs 0 deepEqual quirks.)
    expect(snap.segments[1].ta[0]).toBeCloseTo(0, 10);
    expect(snap.segments[1].ta[1]).toBeCloseTo(10, 10);
  });
});

describe("PathModel neighbouringVertices (chunk A)", () => {
  it("returns selected vertices + their 1-hop neighbours", () => {
    const m = PathModel.fromSvgPathD("M0,0 L10,0 L20,0 L30,0");
    // Path: 0-1-2-3. Select vertex 1 → neighbours: {0, 1, 2}.
    const n = m.neighbouringVertices({
      vertices: [1],
      segments: [],
      tangents: [],
    });
    expect(n).toEqual([0, 1, 2]);
  });

  // UX spec: segment selection seeds BOTH endpoints into the active set
  // and then expands uniformly to 1-hop neighbours. The user sees tangent
  // handles on the selected segment's endpoints AND on the next vertex
  // outward on each side — same spatial context they get from selecting
  // a vertex.
  it("expands selected segment to BOTH endpoints + their 1-hop neighbours", () => {
    const m = PathModel.fromSvgPathD("M0,0 L10,0 L20,0 L30,0");
    // Path: 0-1-2-3. Select segment 1 (vertices 1 and 2).
    // Phase 1 active = {1, 2}; phase 2 expansion adds {0} (neigh of 1)
    // and {3} (neigh of 2) → {0, 1, 2, 3}.
    const n = m.neighbouringVertices({
      vertices: [],
      segments: [1],
      tangents: [],
    });
    expect(n).toEqual([0, 1, 2, 3]);
  });

  // UX spec: tangent selection seeds the OWNING vertex (and the segment's
  // opposite endpoint) into the active set, then expands uniformly to
  // 1-hop neighbours. Without phase 2 here, selecting a single tangent
  // would hide every other tangent handle in the area — the user loses
  // spatial context immediately on selecting.
  it("expands tangent selection to owning vertex + 1-hop neighbours", () => {
    const m = PathModel.fromSvgPathD("M0,0 L10,0 L20,0 L30,0");
    // tangent [1, 1] = tb on segment 0 (a=0, b=1). Owning vertex = 1.
    // Phase 1 active = {1, 0} (owner + segment endpoints).
    // Phase 2: neigh(0) = {1}; neigh(1) = {0, 2} → result {0, 1, 2}.
    const n = m.neighbouringVertices({
      vertices: [],
      segments: [],
      tangents: [[1, 1]],
    });
    expect(n).toEqual([0, 1, 2]);
  });
});

describe("PathModel splitSegment (chunk B)", () => {
  it("splits a straight L segment into two halves", () => {
    const m = PathModel.fromSvgPathD("M0,0 L10,0");
    const { model, new_vertex } = m.splitSegment(0, 0.5);
    // Path-order canonical index — the new vertex sits BETWEEN the
    // start (index 0) and end (index 2). vn appends at index 2
    // internally; the canonical round-trip remaps it to 1.
    expect(new_vertex).toBe(1);
    const snap = model.snapshot();
    expect(snap.vertices.length).toBe(3);
    expect(snap.segments.length).toBe(2);
    // The vertex AT new_vertex is the geometric midpoint.
    expect(snap.vertices[new_vertex]).toEqual([5, 0]);
    // And path order is: start, new, end.
    expect(snap.vertices[0]).toEqual([0, 0]);
    expect(snap.vertices[2]).toEqual([10, 0]);
  });

  it("preserves a curve verb on both halves of a C split", () => {
    const m = PathModel.fromSvgPathD("M0,0 C5,0 10,5 10,10");
    const { model } = m.splitSegment(0, 0.5);
    const snap = model.snapshot();
    expect(snap.segments.length).toBe(2);
    expect(snap.segments[0].source_verb).toBe("C");
    expect(snap.segments[1].source_verb).toBe("C");
  });

  it("emitted d after split-then-drag is still well-formed", () => {
    const m = PathModel.fromSvgPathD("M0,0 L10,0 L10,10 Z");
    const { model, new_vertex } = m.splitSegment(1, 0.5);
    // New vertex inserted at midpoint of the second L segment.
    const moved = model.translateVertex(new_vertex, [5, 0]);
    const out = moved.toSvgPathD();
    // Sanity: re-parsing the output is consistent with the model.
    const reparsed = PathModel.fromSvgPathD(out);
    expect(reparsed.vertexCount()).toBe(model.vertexCount());
  });

  // UX spec (regression — browser observed `splited but not selected, drag
  // is no-op`): after a split, the returned `new_vertex` index must
  // address the same vertex in the d-roundtripped model that consumers
  // see. The host's `handle_translate_vertices` re-derives a PathModel
  // from the live `d` each frame — if the index it gets from the split
  // points to a different vertex in that re-derived model, the drag
  // translates the WRONG vertex (and from the user's POV the new vertex
  // sits still, which reads as "drag is no-op").
  //
  // VectorNetworkEditor.splitSegment appends the new vertex at the end of
  // the network's vertices array. When toSvgPathD writes path-order and
  // fromSvgPathD reads path-order, the new vertex's canonical index
  // sits BETWEEN its neighbours — not at the end. PathModel.splitSegment
  // must return the canonical (path-order) index so consumers don't
  // need to bridge two index spaces.
  it("returned new_vertex index addresses the new vertex in the d-roundtripped model", () => {
    const m = PathModel.fromSvgPathD("M 100 120 L 300 120");
    const { model, new_vertex } = m.splitSegment(0, 0.5);
    const target_d = model.toSvgPathD();
    // Simulate the host: re-derive from `d` (what handle_translate_vertices does).
    const live_model = PathModel.fromSvgPathD(target_d);
    // The vertex `live_model` exposes at the published index MUST be the
    // new midpoint, NOT some other vertex.
    const verts = live_model.snapshot().vertices;
    expect(verts[new_vertex]).toEqual([200, 120]);
  });

  it("translating the published new_vertex moves the inserted midpoint (not an aliased endpoint)", () => {
    const m = PathModel.fromSvgPathD("M 100 120 L 300 120");
    const { model: split_model, new_vertex } = m.splitSegment(0, 0.5);
    const target_d = split_model.toSvgPathD();
    // Mimic handle_translate_vertices: re-derive from `d`, apply the
    // translate against the published index.
    const live_model = PathModel.fromSvgPathD(target_d);
    const moved = live_model.translateVertices([new_vertex], [0, 30]);
    const verts = moved.snapshot().vertices;
    // Start and end must be UNCHANGED — only the middle vertex moves.
    expect(verts[0]).toEqual([100, 120]);
    expect(verts[2]).toEqual([300, 120]);
    // The new midpoint moved from (200, 120) to (200, 150).
    const moved_d = moved.toSvgPathD();
    expect(moved_d).toContain("200 150");
    expect(moved_d).not.toContain("300 150");
  });
});

describe("PathModel translateSegment (chunk C)", () => {
  it("moves both endpoints of a segment by the same delta", () => {
    const m = PathModel.fromSvgPathD("M0,0 L10,0 L10,10");
    const moved = m.translateSegment(0, [3, 5]);
    const snap = moved.snapshot();
    expect(snap.vertices[0]).toEqual([3, 5]);
    expect(snap.vertices[1]).toEqual([13, 5]);
    // Vertex 2 (not on segment 0) is unchanged.
    expect(snap.vertices[2]).toEqual([10, 10]);
  });
});

describe("PathModel bendSegment (chunk C)", () => {
  it("re-solves tangents so B(ca)=cb under fixed endpoints", () => {
    const m = PathModel.fromSvgPathD("M0,0 L10,0");
    const snap0 = m.snapshot();
    const s = snap0.segments[0];
    const va = snap0.vertices[s.a];
    const vb = snap0.vertices[s.b];
    const bent = m.bendSegment(0, 0.5, [5, 5], {
      a: va,
      b: vb,
      ta: s.ta,
      tb: s.tb,
    });
    const snap1 = bent.snapshot();
    // Endpoints are still at (0,0) and (10,0).
    expect(snap1.vertices[0]).toEqual([0, 0]);
    expect(snap1.vertices[1]).toEqual([10, 0]);
    // Tangents are no longer zero — the segment now curves upward.
    expect(snap1.segments[0].ta[0] !== 0 || snap1.segments[0].ta[1] !== 0).toBe(
      true
    );
  });
});

describe("PathModel.segmentContainedByRect", () => {
  // The companion `segmentIntersectsRect`, plus the standalone
  // `evaluateSegment` / `projectPointOnSegment` helpers, used to live on
  // PathModel for symmetry with `segmentContainedByRect`. They were
  // removed because no production caller ever needed them — `cmath.bezier.*`
  // operating on a `snapshot()` was already the path through which every
  // real caller did the math. Containment stays here because the marquee
  // pipeline calls it directly.
  it("requires full containment", () => {
    const m = PathModel.fromSvgPathD("M0,0 L10,0");
    expect(
      m.segmentContainedByRect(0, {
        x: -1,
        y: -1,
        width: 12,
        height: 2,
      })
    ).toBe(true);
    expect(
      m.segmentContainedByRect(0, {
        x: 0,
        y: 0,
        width: 5,
        height: 1,
      })
    ).toBe(false);
  });
});
