// Vector-edit selection candidates + generic point-in-rect math.
//
// This file is split into two layers:
//
//   1. **Math layer** (`marquee.points_in_rect` / `points_in_polygon`).
//      Generic. Takes a list of positioned items and a rect / polygon,
//      returns the hits. Knows nothing about vertices, tangents, or
//      selection state. Reusable for any "region picks positioned
//      items" question — marquee, lasso, hover gather, anything.
//
//   2. **Data-provider layer** (`marquee.subpath_select_candidates`).
//      State-controlled. Given a `PathModel` + the current sub-
//      selection, returns the candidate items the user can currently
//      claim. ALL UX visibility rules live here: tangent knobs are only
//      eligible when their owning vertex is in the pre-selection's
//      neighbourhood, because that's the *only* time they're rendered.
//      The math layer sees this as "the host gave me N candidates";
//      whether a tangent was eligible at all is a state-and-UX call,
//      not a math call.
//
// The host (e.g. `dom.ts`) is the orchestration layer: it calls (2) to
// get candidates, projects them into the right coordinate frame, calls
// (1) to test against the marquee rect, and applies any selection-
// policy post-filter (e.g. vertex-priority drops).

import cmath from "@grida/cmath";
import type { PathModel, SubSelection, TangentRef } from "./model";

/**
 * What the user can currently aim a region-selection at. Each list is
 * in the coordinate frame that `to_doc` projects into (typically doc-
 * space, the HUD's container CSS-px).
 */
export interface SubpathSelectCandidates {
  vertices: ReadonlyArray<{
    readonly key: number;
    readonly pos: readonly [number, number];
  }>;
  tangents: ReadonlyArray<{
    readonly key: TangentRef;
    readonly pos: readonly [number, number];
  }>;
  /** Segment ids eligible for containment tests. Containment is bezier
   *  math; the caller invokes `model.segmentContainedByRect(...)` or
   *  similar per id. The list lives here so the data provider can later
   *  filter (e.g. exclude segments fully outside the rendered
   *  viewport). */
  segments: ReadonlyArray<number>;
}

export namespace marquee {
  // ─── Math layer (generic) ────────────────────────────────────────────

  /**
   * Return the keys of every candidate whose position falls inside
   * `rect`.
   *
   * Generic. Reusable for any "region picks positioned items" query —
   * not tied to vector edit. The caller is responsible for projecting
   * the candidate positions into the same frame as `rect`.
   */
  export function points_in_rect<K>(
    candidates: ReadonlyArray<{
      readonly key: K;
      readonly pos: readonly [number, number];
    }>,
    rect: cmath.Rectangle
  ): K[] {
    const hits: K[] = [];
    for (const c of candidates) {
      const x = c.pos[0];
      const y = c.pos[1];
      if (
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height
      ) {
        hits.push(c.key);
      }
    }
    return hits;
  }

  /**
   * Sibling of {@link points_in_rect} for lasso (freeform polygon)
   * selection. Returns the keys of every candidate whose position lies
   * inside `polygon`, using ray-cast point-in-polygon
   * (`cmath.polygon.pointInPolygon`).
   *
   * The polygon is treated as closed (`polygon[last] → polygon[0]`
   * implicit). Same frame-agnostic contract as `points_in_rect`: caller
   * projects candidate positions into the same frame as the polygon
   * vertices.
   */
  export function points_in_polygon<K>(
    candidates: ReadonlyArray<{
      readonly key: K;
      readonly pos: readonly [number, number];
    }>,
    polygon: ReadonlyArray<cmath.Vector2>
  ): K[] {
    const hits: K[] = [];
    // `cmath.polygon.pointInPolygon` expects a mutable-typed
    // `Vector2[]` but only reads — safe to cast. Closure over the
    // polygon avoids realloc per candidate.
    const poly = polygon as cmath.Vector2[];
    for (const c of candidates) {
      if (cmath.polygon.pointInPolygon(c.pos as cmath.Vector2, poly)) {
        hits.push(c.key);
      }
    }
    return hits;
  }

  // ─── Data-provider layer (state-controlled, UX-aware) ────────────────

  /**
   * Build the candidate list for a vector-edit region selection.
   *
   * **All UX visibility rules live here.** This is the single point
   * where "what is the user currently allowed to claim" is decided —
   * based on the *current* sub-selection (which controls what chrome
   * is rendering).
   *
   * Current rules:
   * - Every vertex is a candidate. Vertex knobs always render.
   * - A tangent is a candidate iff its owning vertex is in
   *   `model.neighbouringVertices(selection)` — i.e. its knob is
   *   currently on screen. Tangent knobs are NOT rendered for vertices
   *   outside that set, so claiming them via region selection would be
   *   a UX surprise.
   * - Every segment is a candidate for containment math; the host
   *   decides whether to apply vertex-priority on top of the raw
   *   containment hits.
   *
   * The math (`points_in_rect`, `PathModel.segmentContainedByRect`) is
   * frame-agnostic; the data provider commits to the frame by calling
   * `to_doc(local_point)` on each candidate's position. Pass the
   * identity projector to keep everything in path-local coords.
   */
  export function subpath_select_candidates(
    model: PathModel,
    selection: SubSelection,
    to_doc: (
      p: readonly [number, number]
    ) => readonly [number, number] = identity_proj
  ): SubpathSelectCandidates {
    const snap = model.snapshot();

    const vertices = snap.vertices.map((v, i) => ({
      key: i,
      pos: to_doc(v),
    }));

    // Tangents: only at vertices whose knob is currently rendered (= in
    // the selection's neighbouring set). This is the UX visibility
    // rule.
    const neigh_set = new Set(model.neighbouringVertices(selection));
    const tangents: Array<{
      key: TangentRef;
      pos: readonly [number, number];
    }> = [];
    for (let si = 0; si < snap.segments.length; si++) {
      const s = snap.segments[si];
      if (neigh_set.has(s.a)) {
        const va = snap.vertices[s.a];
        tangents.push({
          key: [s.a, 0],
          pos: to_doc([va[0] + s.ta[0], va[1] + s.ta[1]]),
        });
      }
      if (neigh_set.has(s.b)) {
        const vb = snap.vertices[s.b];
        tangents.push({
          key: [s.b, 1],
          pos: to_doc([vb[0] + s.tb[0], vb[1] + s.tb[1]]),
        });
      }
    }

    const segments: number[] = Array.from(
      { length: snap.segments.length },
      (_, i) => i
    );

    return { vertices, tangents, segments };
  }

  function identity_proj(
    p: readonly [number, number]
  ): readonly [number, number] {
    return p;
  }

  // ─── Selection merge (orchestration helper) ──────────────────────────

  /**
   * Merge fresh hits into the existing sub-selection. Not marquee-
   * specific — works for any region-selection commit.
   *
   * - Replace mode: hits become the new sub-selection (prior dropped).
   * - Additive mode: dedupe-union into the current sub-selection.
   */
  export function merge_subpath_hits(
    prev: SubSelection,
    hits: {
      vertices: ReadonlyArray<number>;
      segments: ReadonlyArray<number>;
      tangents: ReadonlyArray<TangentRef>;
    },
    additive: boolean
  ): { vertices: number[]; segments: number[]; tangents: TangentRef[] } {
    if (!additive) {
      return {
        vertices: [...hits.vertices],
        segments: [...hits.segments],
        tangents: hits.tangents.map((t) => [t[0], t[1]] as const),
      };
    }
    const vertices = Array.from(new Set([...prev.vertices, ...hits.vertices]));
    const segments = Array.from(new Set([...prev.segments, ...hits.segments]));
    const tangents: TangentRef[] = prev.tangents.map(
      (t) => [t[0], t[1]] as const
    );
    for (const t of hits.tangents) {
      if (!tangents.some((x) => x[0] === t[0] && x[1] === t[1])) {
        tangents.push(t);
      }
    }
    return { vertices, segments, tangents };
  }
}
