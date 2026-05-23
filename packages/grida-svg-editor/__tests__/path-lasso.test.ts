// Headless tests for the path-edit lasso path.
//
// Lasso shares the same data-provider / merge layers as marquee — only
// the math layer changes:
//
//   - `points_in_rect`  → `points_in_polygon` (ray-cast)
//   - Segments are NEVER tested against the polygon (matches the main
//     editor's decision in editor/grida-canvas/reducers/methods/
//     vector.ts:163–291 — `selected_segments` only populates when a
//     `rect` argument is provided; lasso passes none).
//
// These tests cover the math layer and the host's orchestration
// behaviour (vertex / tangent claim; segments dropped).

import { describe, it, expect } from "vitest";
import { PathModel, marquee } from "../src/core/path-edit";

describe("points_in_polygon — math layer", () => {
  it("is generic over key type — works for any positioned items", () => {
    // A unit-ish triangle. Vertex inside → kept; vertex outside → dropped.
    const triangle: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [10, 0],
      [5, 10],
    ];
    const items = [
      { key: "inside", pos: [5, 3] as const },
      { key: "outside", pos: [50, 50] as const },
      { key: "on_edge_top", pos: [5, 0] as const }, // on the polygon boundary
    ];
    const hits = marquee.points_in_polygon(items, triangle);
    expect(hits).toContain("inside");
    expect(hits).not.toContain("outside");
    // Boundary points are treated as "inside" by cmath's ray-cast — we
    // rely on that exact contract (matches main editor).
    expect(hits).toContain("on_edge_top");
  });

  it("handles a non-convex polygon (concave 'C' shape)", () => {
    // 'C' opening to the right: x≈8 in the middle gap is OUTSIDE.
    const c: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [10, 0],
      [10, 3],
      [3, 3],
      [3, 7],
      [10, 7],
      [10, 10],
      [0, 10],
    ];
    const items = [
      { key: "in_lower", pos: [5, 1.5] as const },
      { key: "in_gap", pos: [8, 5] as const }, // falls in the concave gap → outside
      { key: "in_upper", pos: [5, 8.5] as const },
    ];
    const hits = marquee.points_in_polygon(items, c);
    expect(hits).toContain("in_lower");
    expect(hits).toContain("in_upper");
    expect(hits).not.toContain("in_gap");
  });
});

describe("integration — host orchestrates lasso", () => {
  it("vertices inside the polygon are claimed; outside are dropped", () => {
    // A horizontal segment with 3 vertices (the path defines 2 segments).
    const model = PathModel.fromSvgPathD("M0,0 L10,0 L20,0");
    const candidates = marquee.subpath_select_candidates(
      model,
      { vertices: [], segments: [], tangents: [] }
      // Default identity projector — polygon is in path-local space.
    );
    // Triangle around vertex 1 only.
    const polygon: ReadonlyArray<readonly [number, number]> = [
      [8, -2],
      [12, -2],
      [10, 2],
    ];
    const vertex_hits = marquee.points_in_polygon(candidates.vertices, polygon);
    expect(vertex_hits).toEqual([1]);
  });

  it("HOST POLICY: segments are NEVER hit-tested against the polygon", () => {
    // Why: the main editor's decision — segments require a rect-based
    // test. The lasso host calls handle_lasso_select which constructs
    // hits with `segments: []`. We re-create that orchestration here.
    const model = PathModel.fromSvgPathD("M0,0 L10,0 L20,0");
    const candidates = marquee.subpath_select_candidates(model, {
      vertices: [],
      segments: [],
      tangents: [],
    });
    const polygon: ReadonlyArray<readonly [number, number]> = [
      [-1, -5],
      [25, -5],
      [25, 5],
      [-1, 5],
    ];
    // A polygon that fully encloses every segment — the math layer would
    // happily "contain" the segment endpoints. But the host's lasso
    // handler still drops the segments to match the main editor.
    const vertex_hits = marquee.points_in_polygon(candidates.vertices, polygon);
    const merged = marquee.merge_subpath_hits(
      { vertices: [], segments: [], tangents: [] },
      { vertices: vertex_hits, segments: [], tangents: [] },
      false
    );
    expect(merged.vertices.sort()).toEqual([0, 1, 2]);
    // Segments stay empty even though the rect would have caught both.
    expect(merged.segments).toEqual([]);
  });

  it("UX RULE: tangent candidates respect pre-selection neighbourhood (same as marquee)", () => {
    // Why: the candidate-eligibility layer is shared with marquee; the
    // lasso path inherits the same rule — tangents only at vertices
    // whose knobs are currently rendered.
    const model = PathModel.fromSvgPathD("M0,0 C0,-5 10,-5 10,0");
    // With NO pre-selection, tangent knobs are NOT rendered — even if
    // their absolute control points fall inside the lasso polygon they
    // must not be claimed.
    const candidates = marquee.subpath_select_candidates(model, {
      vertices: [],
      segments: [],
      tangents: [],
    });
    expect(candidates.tangents).toEqual([]);
    const polygon: ReadonlyArray<readonly [number, number]> = [
      [-1, -6],
      [11, -6],
      [11, 1],
      [-1, 1],
    ];
    const tangent_hits = marquee.points_in_polygon(
      candidates.tangents,
      polygon
    );
    expect(tangent_hits).toEqual([]);

    // Once vertex 0 is pre-selected, both tangents become candidates and
    // the polygon claims them.
    const with_v0 = marquee.subpath_select_candidates(model, {
      vertices: [0],
      segments: [],
      tangents: [],
    });
    const tangent_hits2 = marquee.points_in_polygon(with_v0.tangents, polygon);
    expect(tangent_hits2.length).toBeGreaterThanOrEqual(1);
  });

  it("additive merge unions against the BASELINE — shrinking the polygon releases items", () => {
    // Why: a host that captures the gesture-start baseline and merges
    // against IT (not the live selection) keeps Shift-additive honest.
    // Test the merge layer directly — it has no opinion about the
    // gesture, the host wires it.
    const baseline = { vertices: [5], segments: [], tangents: [] };
    // First preview hit catches vertex 7. Additive (Shift) unions
    // baseline ∪ hits.
    const merged_wide = marquee.merge_subpath_hits(
      baseline,
      { vertices: [7], segments: [], tangents: [] },
      true
    );
    expect(merged_wide.vertices.sort((a, b) => a - b)).toEqual([5, 7]);
    // Second preview: polygon shrunk, no longer covers vertex 7.
    // Merge against the SAME baseline → vertex 7 drops back out.
    const merged_narrow = marquee.merge_subpath_hits(
      baseline,
      { vertices: [], segments: [], tangents: [] },
      true
    );
    expect(merged_narrow.vertices).toEqual([5]);
  });
});
