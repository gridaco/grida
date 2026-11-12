// Point measurement in path edit — pure core (gridaco/grida#845).
//
// Holding Alt while hovering a vertex or a segment in path edit measures the
// distance from the vector sub-selection to that point, instead of the
// bounding-box measurement used between whole elements. The behavioral spec
// is the Grida Canvas vector-network measurement
// (docs/editor/features/vector-network-measurement.md): its vertex → vertex
// and vertex → point-on-curve cases, and its A-B de-duplication rules.
// Region measurement is out of scope (svg-editor has no face model).
//
// This module resolves the two operands in path-local space; the DOM surface
// projects them through the element CTMs and draws the guide. Kept here — not
// in `dom.ts` — so the operand and de-duplication rules are headlessly
// unit-testable (see __tests__/README.md).
//
// Boundary: imports only `./model` and `@grida/cmath` (no `@grida/vn`, no
// DOM).

import cmath from "@grida/cmath";
import type { PathSnapshot, SegmentId, VertexId } from "./model";

type Point = readonly [number, number];

/**
 * What the pointer is over, in the measurement's terms.
 *
 *   - `vertex`  — a vertex knob; B is that vertex.
 *   - `segment` — a segment body; B is the point at parameter `t` on it
 *                 (see {@link project_onto_segment}).
 */
export type VectorMeasurementTarget =
  | { kind: "vertex"; vertex: VertexId }
  | { kind: "segment"; segment: SegmentId; t: number };

/** The vector sub-selection that is measured from (operand A). */
export type VectorMeasurementSource = {
  readonly vertices: ReadonlyArray<VertexId>;
  readonly segments: ReadonlyArray<SegmentId>;
};

/**
 * The two measurement operands, in path-local space.
 *
 *   - `a` — the source points. A single selected vertex measures as a point;
 *           several measure as their bounding box. Kept as points (not a box)
 *           so the caller can project each one through a non-axis-aligned
 *           CTM before taking the box in the target frame.
 *   - `b` — the target point.
 */
export type VectorMeasurementOperands = {
  a: Point[];
  b: Point;
};

/**
 * Resolve the operands of a point measurement, or `null` when there is
 * nothing meaningful to measure:
 *
 *   - the sub-selection has no vertices and no segments (a tangent-only
 *     selection has no point to measure from);
 *   - the target vertex is selected, or is an endpoint of a selected segment,
 *     or the target segment is itself selected (measuring the selection
 *     against part of itself);
 *   - an index is out of range for `snapshot` (stale hover).
 *
 * Source A is the selected vertices when there are any, otherwise the
 * endpoints of the selected segments.
 */
export function vector_measurement_operands(
  snapshot: PathSnapshot,
  source: VectorMeasurementSource,
  target: VectorMeasurementTarget
): VectorMeasurementOperands | null {
  const { vertices, segments } = snapshot;

  let b: Point;
  if (target.kind === "vertex") {
    const v = vertices[target.vertex];
    if (!v) return null;
    if (source.vertices.includes(target.vertex)) return null;
    for (const si of source.segments) {
      const s = segments[si];
      if (s && (s.a === target.vertex || s.b === target.vertex)) return null;
    }
    b = [v[0], v[1]];
  } else {
    if (source.segments.includes(target.segment)) return null;
    const s = segments[target.segment];
    if (!s) return null;
    const va = vertices[s.a];
    const vb = vertices[s.b];
    if (!va || !vb) return null;
    b = cmath.bezier.evaluate(
      [va[0], va[1]],
      [vb[0], vb[1]],
      [s.ta[0], s.ta[1]],
      [s.tb[0], s.tb[1]],
      target.t
    );
  }

  const a: Point[] = [];
  if (source.vertices.length > 0) {
    for (const vi of source.vertices) {
      const v = vertices[vi];
      if (v) a.push([v[0], v[1]]);
    }
  } else {
    for (const si of source.segments) {
      const s = segments[si];
      if (!s) continue;
      const va = vertices[s.a];
      const vb = vertices[s.b];
      if (va) a.push([va[0], va[1]]);
      if (vb) a.push([vb[0], vb[1]]);
    }
  }
  if (a.length === 0) return null;

  return { a, b };
}

/**
 * Parameter `t` of the point on `segment` nearest to `point`, measured in the
 * frame `project` maps path-local coordinates into (the surface passes its
 * path-local → screen projection, so "nearest" is what the user sees under
 * any element transform). `project` must be affine: a cubic's control points
 * map to the projected cubic's control points, so `t` addresses the same
 * point in path-local space. `null` when the segment is out of range.
 */
export function project_onto_segment(
  snapshot: PathSnapshot,
  segment: SegmentId,
  project: (p: Point) => Point,
  point: Point
): number | null {
  const s = snapshot.segments[segment];
  if (!s) return null;
  const va = snapshot.vertices[s.a];
  const vb = snapshot.vertices[s.b];
  if (!va || !vb) return null;
  const a = project(va);
  const b = project(vb);
  const a_control = project([va[0] + s.ta[0], va[1] + s.ta[1]]);
  const b_control = project([vb[0] + s.tb[0], vb[1] + s.tb[1]]);
  return cmath.bezier.project(
    [a[0], a[1]],
    [b[0], b[1]],
    [a_control[0] - a[0], a_control[1] - a[1]],
    [b_control[0] - b[0], b_control[1] - b[1]],
    [point[0], point[1]]
  );
}
