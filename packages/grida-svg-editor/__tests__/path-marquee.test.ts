// Headless tests for the path-edit region-selection layers.
//
// The two layers under test (see `core/path-edit/marquee.ts`):
//
//   1. Data provider (`subpath_select_candidates`) — STATE-OWNED, UX-AWARE.
//      Decides what the user can currently claim. The visibility rules
//      live HERE, NOT in the math layer.
//
//   2. Math layer (`points_in_rect`) — GENERIC. Takes positioned items +
//      a rect, returns hits. Knows nothing about vertices, tangents, or
//      selection state.
//
// Together they replace the older monolithic `vector_marquee_predicate`.

import { describe, it, expect } from "vitest";
import { PathModel, marquee } from "../src/core/path-edit";

const identity = (p: readonly [number, number]) => p;

describe("points_in_rect — math layer", () => {
  it("is generic over key type — works for any positioned items", () => {
    const items = [
      { key: "alpha", pos: [5, 5] as const },
      { key: "beta", pos: [50, 5] as const },
      { key: "gamma", pos: [5, 50] as const },
    ];
    const hits = marquee.points_in_rect(items, {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(hits).toEqual(["alpha"]);
  });

  it("inclusive on the rect edges", () => {
    const items = [
      { key: "tl", pos: [0, 0] as const },
      { key: "br", pos: [10, 10] as const },
    ];
    const hits = marquee.points_in_rect(items, {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(hits.sort()).toEqual(["br", "tl"]);
  });
});

describe("subpath_select_candidates — data-provider / UX layer", () => {
  it("UX RULE: tangent candidates are gated by pre-selection neighbourhood", () => {
    // A cubic from (0,0) → (10,0). The ta at vertex 0 lives at (0, -5).
    // With NO pre-selection, vertex 0 is NOT in any neighbourhood, so
    // its tangent knob is NOT rendered → must NOT appear as a candidate.
    const model = PathModel.fromSvgPathD("M0,0 C0,-5 10,-5 10,0");
    const empty_pre = { vertices: [], segments: [], tangents: [] };
    const c0 = marquee.subpath_select_candidates(model, empty_pre);
    expect(c0.tangents).toEqual([]);
    // Vertices are always candidates — knobs render unconditionally.
    expect(c0.vertices.map((v) => v.key)).toEqual([0, 1]);

    // Once vertex 0 is in the selection, both v0 and v1 are in the
    // neighbourhood — their tangents become candidates.
    const with_v0 = { vertices: [0], segments: [], tangents: [] };
    const c1 = marquee.subpath_select_candidates(model, with_v0);
    const tangent_keys = c1.tangents.map((t) => `${t.key[0]}:${t.key[1]}`);
    expect(tangent_keys).toContain("0:0");
    expect(tangent_keys).toContain("1:1");
  });

  it("projects positions through the to_doc callback", () => {
    const model = PathModel.fromSvgPathD("M0,0 L10,0");
    // A simple scale-by-2 projector.
    const c = marquee.subpath_select_candidates(
      model,
      { vertices: [], segments: [], tangents: [] },
      (p) => [p[0] * 2, p[1] * 2]
    );
    expect(c.vertices[0].pos).toEqual([0, 0]);
    expect(c.vertices[1].pos).toEqual([20, 0]);
  });

  it("default projector is identity (path-local space)", () => {
    const model = PathModel.fromSvgPathD("M3,4 L7,8");
    const c = marquee.subpath_select_candidates(model, {
      vertices: [],
      segments: [],
      tangents: [],
    });
    expect(c.vertices[0].pos).toEqual([3, 4]);
    expect(c.vertices[1].pos).toEqual([7, 8]);
  });

  it("exposes every segment id as a containment candidate", () => {
    const model = PathModel.fromSvgPathD("M0,0 L10,0 L20,0");
    const c = marquee.subpath_select_candidates(model, {
      vertices: [],
      segments: [],
      tangents: [],
    });
    expect(c.segments).toEqual([0, 1]);
  });
});

describe("integration — host orchestrates data-provider + math", () => {
  // Re-creates the host's marquee orchestration (dom.ts):
  //   1. ask the data provider for candidates
  //   2. run the math against the rect
  //   3. apply policy (vertex-priority drop on segments)

  it("REGRESSION: marquee over a vertex + invisible tangent picks ONLY the vertex", () => {
    const model = PathModel.fromSvgPathD("M0,0 C0,-5 10,-5 10,0");
    const pre = { vertices: [], segments: [], tangents: [] };
    const candidates = marquee.subpath_select_candidates(model, pre, identity);

    const rect = { x: -1, y: -6, width: 2, height: 8 };
    const vertex_hits = marquee.points_in_rect(candidates.vertices, rect);
    const tangent_hits = marquee.points_in_rect(candidates.tangents, rect);

    expect(vertex_hits).toEqual([0]);
    // Critical: the (off-screen) tangent at (0,-5) is NOT in the
    // candidate list, so the math can never pick it. No special-case
    // logic in the math layer required.
    expect(tangent_hits).toEqual([]);
  });

  it("vertex-priority drop on segments is host-policy, not provider-policy", () => {
    // Three vertices on a line. Marquee enclosing all three.
    const model = PathModel.fromSvgPathD("M0,0 L10,0 L20,0");
    const candidates = marquee.subpath_select_candidates(
      model,
      { vertices: [], segments: [], tangents: [] },
      identity
    );
    const rect = { x: -1, y: -1, width: 22, height: 2 };
    const vertex_hits = marquee.points_in_rect(candidates.vertices, rect);
    // The data provider still lists every segment as a candidate — it
    // doesn't know about vertex-priority. The host applies the drop.
    expect(candidates.segments).toEqual([0, 1]);

    const vertex_hit_set = new Set(vertex_hits);
    const segment_hits: number[] = [];
    for (const sid of candidates.segments) {
      const snap = model.snapshot();
      const s = snap.segments[sid];
      if (vertex_hit_set.has(s.a) || vertex_hit_set.has(s.b)) continue;
      if (model.segmentContainedByRect(sid, rect)) segment_hits.push(sid);
    }
    expect(vertex_hits).toEqual([0, 1, 2]);
    expect(segment_hits).toEqual([]);
  });
});

describe("merge_subpath_hits", () => {
  it("replace mode overwrites prior sub-selection", () => {
    const merged = marquee.merge_subpath_hits(
      { vertices: [9], segments: [9], tangents: [[9, 0]] },
      { vertices: [0, 1], segments: [], tangents: [] },
      false
    );
    expect(merged.vertices).toEqual([0, 1]);
    expect(merged.segments).toEqual([]);
    expect(merged.tangents).toEqual([]);
  });

  it("additive mode unions without duplicates", () => {
    const merged = marquee.merge_subpath_hits(
      { vertices: [0, 1], segments: [2], tangents: [[3, 0]] },
      {
        vertices: [1, 2],
        segments: [2, 3],
        tangents: [
          [3, 0],
          [4, 1],
        ],
      },
      true
    );
    expect(merged.vertices.sort()).toEqual([0, 1, 2]);
    expect(merged.segments.sort()).toEqual([2, 3]);
    expect(merged.tangents).toContainEqual([3, 0]);
    expect(merged.tangents).toContainEqual([4, 1]);
    expect(merged.tangents.length).toBe(2);
  });
});
