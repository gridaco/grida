// Vector sub-selection affine transform — pure core (gridaco/grida#881).
//
// The decision + geometry behind the Vertex Transform Box: a multi-vertex
// sub-selection in path edit mode is treated as a transformable object, and a
// single affine (translate / scale / rotate, produced by the HUD transform-box
// gesture) is applied to the selected geometry. Unselected vertices stay put.
//
// Kept here (not in the DOM surface) so the policy gate and the resulting `d`
// are headlessly unit-testable against a `VectorEditSession` + `PathModel` —
// core-first testing doctrine (see __tests__/README.md). The surface
// (`dom.ts`) is the thin shell: it owns the screen-space → local-space affine
// mapping (the box lives in container pixels; the vertices live in path-local
// coords) and brackets the write as one undoable `vector_geometry_step`.
//
// Policy: the transform honors the policy-class `transform-vertices` verdict.
// For both accepting classes (vertex-chain and path) the chosen policy is
// `bake` — always proceed, count-preserving and type-preserving (no
// promote / restrict fork; a transformed zero-tangent polygon stays a
// polygon, a path stays a path). See
// docs/wg/feat-svg-editor/glossary/policy-class.md §sub-intent.
//
// Boundary: imports `./model`, `./session`, and the sibling `policy-class`
// (no `@grida/vn`, no DOM).

import type cmath from "@grida/cmath";
import type { PathModel, VertexId } from "./model";
import type { VectorEditSession } from "./session";
import type { VectorEditSource } from "../document";
import { policy_class } from "../policy-class";

/**
 * Result of resolving a transform-box affine against the open vector session.
 *
 *   - `noop`        — the sub-selection resolves to no movable vertex (empty,
 *                     or tangents-only); the document is left untouched.
 *   - `refused`     — the policy-class verdict rejects it (the source class
 *                     rejects `transform-vertices`). No mutation.
 *   - `transformed` — the new geometry after applying the affine to the
 *                     sub-selected vertices (and their tangents). Carries BOTH
 *                     the serialized `d` (for the document write) and the
 *                     `model` it was emitted from (so the caller can preview
 *                     the chrome without re-parsing). The sub-selection is
 *                     preserved (vertex count + indices are unchanged).
 */
export type TransformVectorOutcome =
  | {
      readonly kind: "transformed";
      readonly d: string;
      readonly model: PathModel;
    }
  | { readonly kind: "noop" }
  | { readonly kind: "refused" };

/**
 * The set of vertices a transform-box acts on, resolved from the session's
 * sub-selection against `model`. The box is a **vertex** tool: it is bound to
 * the explicitly-selected vertices ONLY.
 *
 * Segment and tangent selections are deliberately excluded — selecting a
 * segment (or a tangent) is NOT a vertex selection and must not summon the box
 * (it would otherwise pop up around a single edge's endpoints, which the user
 * never asked to transform). To transform an edge, select its vertices.
 * Tangents of the selected vertices still follow the affine's linear part
 * inside {@link PathModel.transformVertices}.
 *
 * Indices are validated against `model`, deduped, and ascending. Shared by the
 * surface (to compute the box's bounding rect) and by
 * {@link transform_vector_subselection} (to apply the transform), so the two
 * never disagree on what the box covers.
 */
export function subselection_transform_vertices(
  session: VectorEditSession,
  model: PathModel
): VertexId[] {
  const vertex_count = model.vertexCount();
  const out = new Set<VertexId>();
  for (const v of session.selected_vertices) {
    if (v >= 0 && v < vertex_count) out.add(v);
  }
  return Array.from(out).sort((a, b) => a - b);
}

/**
 * Decide and compute the affine transform of the session's current
 * sub-selection against `model` (which the caller derives from the live
 * session-d so the indices line up). `matrix` is the doc-space (path-local)
 * 2×3 affine the surface resolved from the screen-space transform-box gesture.
 *
 * Pure: consults the policy table and, when allowed, computes the new `d`; it
 * mutates neither the session nor the model.
 */
export function transform_vector_subselection(
  session: VectorEditSession,
  model: PathModel,
  matrix: cmath.Transform,
  source_kind: VectorEditSource["kind"]
): TransformVectorOutcome {
  const indices = subselection_transform_vertices(session, model);
  if (indices.length === 0) return { kind: "noop" };

  const cls = policy_class.of(source_kind);
  if (!policy_class.accepts(cls, "transform-vertices")) {
    return { kind: "refused" };
  }

  // Chosen policy is `bake` for every accepting class — count- and
  // type-preserving, so there is no `restrict` minimum-count gate (unlike
  // `delete-vertex`) and no `promote` fork. The element keeps its tag; a
  // vertex-chain whose tangents stay zero stays expressible as native attrs.
  const next = model.transformVertices(indices, matrix);
  return { kind: "transformed", d: next.toSvgPathD(), model: next };
}

/**
 * Reconcile two path models for the Vertex Transform Box session
 * (gridaco/grida#881): if `current` is `expected` with ONLY the `indices`
 * vertices moved by ONE shared translation (and everything else — other
 * vertices, all tangents, topology — unchanged), return that delta; else
 * `null`.
 *
 * The surface uses this to keep the persistent box frame in lock-step with the
 * geometry: a uniform translation of the sub-selection (a body-drag, a
 * multi-vertex knob drag, a nudge, an undo) is absorbed into the frame —
 * keeping its rotation — while any other edit (a tangent / single-vertex /
 * topology change) returns `null` so the frame resets. A zero delta (no change
 * at all) returns `[0, 0]` (the "keep, nothing moved" case).
 *
 * Pure: compares the two models; mutates neither.
 */
export function subset_translation_delta(
  expected: PathModel,
  current: PathModel,
  indices: ReadonlyArray<number>
): [number, number] | null {
  const a = expected.snapshot();
  const b = current.snapshot();
  if (
    a.vertices.length !== b.vertices.length ||
    a.segments.length !== b.segments.length
  ) {
    return null;
  }
  const EPS = 1e-6;
  // Tangents (and segment topology) must be identical — a translation never
  // changes relative tangents or which vertices a segment joins.
  for (let i = 0; i < a.segments.length; i++) {
    const sa = a.segments[i];
    const sb = b.segments[i];
    if (sa.a !== sb.a || sa.b !== sb.b) return null;
    if (Math.abs(sa.ta[0] - sb.ta[0]) > EPS) return null;
    if (Math.abs(sa.ta[1] - sb.ta[1]) > EPS) return null;
    if (Math.abs(sa.tb[0] - sb.tb[0]) > EPS) return null;
    if (Math.abs(sa.tb[1] - sb.tb[1]) > EPS) return null;
  }
  const moving = new Set(indices);
  let delta: [number, number] | null = null;
  for (let i = 0; i < a.vertices.length; i++) {
    const dx = b.vertices[i][0] - a.vertices[i][0];
    const dy = b.vertices[i][1] - a.vertices[i][1];
    if (moving.has(i)) {
      if (delta === null) delta = [dx, dy];
      else if (Math.abs(dx - delta[0]) > EPS || Math.abs(dy - delta[1]) > EPS) {
        return null; // affected vertices disagree → not a uniform translation
      }
    } else if (Math.abs(dx) > EPS || Math.abs(dy) > EPS) {
      return null; // an unaffected vertex moved → external non-uniform edit
    }
  }
  return delta ?? [0, 0];
}
