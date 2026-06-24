// Vector sub-selection deletion — pure core (gridaco/grida#880).
//
// The decision + geometry behind Delete / Backspace in path edit mode.
// Kept here (not in the DOM surface) so the policy gate and the resulting
// `d` are headlessly unit-testable against a `VectorEditSession` +
// `PathModel` — core-first testing doctrine (see __tests__/README.md). The
// surface (`dom.ts`) is a thin shell: read the session-d, build the model,
// call this, and on a `deleted` outcome write the `d` back as one undoable
// step that also clears the now-stale sub-selection.
//
// Policy: the deletion honors the policy-class `delete-vertex` verdict. For
// the vertex-chain class (line / polyline / polygon) the chosen policy is
// `restrict` — refuse the whole gesture when removing the selected vertices
// would drop the chain below its structural minimum (polygon ≥ 3,
// polyline ≥ 2, line == 2). For `path` the policy is `bake` — always
// proceed (the path may collapse to empty `d`; a separate concern, per the
// spec). See docs/wg/feat-svg-editor/glossary/policy-class.md §sub-intent.
//
// Boundary: imports `./model`, `./session`, and the sibling `policy-class`
// (no `@grida/vn`, no DOM).

import type { PathModel } from "./model";
import type { VectorEditSession } from "./session";
import type { VectorEditSource } from "../document";
import { policy_class } from "../policy-class";

/**
 * Result of resolving a Delete / Backspace against the open vector session.
 *
 *   - `noop`    — nothing is sub-selected; the document is left untouched
 *                 (and the keyboard chain falls through to nothing).
 *   - `refused` — the policy-class verdict rejects it (the source class
 *                 rejects `delete-vertex`, or a `restrict` source would drop
 *                 below its minimum vertex count). No mutation.
 *   - `deleted` — `d` is the new path geometry after removing the
 *                 sub-selected tangents / segments / vertices. The caller
 *                 writes it back and clears the sub-selection.
 */
export type DeleteVectorOutcome =
  | { readonly kind: "deleted"; readonly d: string }
  | { readonly kind: "noop" }
  | { readonly kind: "refused" };

/**
 * Minimum number of addressable vertices a `restrict` (vertex-chain) source
 * must retain. Mirrors the policy-class spec: polygon ≥ 3, polyline ≥ 2,
 * line == 2 (so any vertex deletion on a 2-point line is refused). Sources
 * without a minimum (`path`, and the `bake` primitives) never reach this.
 */
function min_vertices(kind: VectorEditSource["kind"]): number {
  switch (kind) {
    case "polygon":
      return 3;
    case "polyline":
    case "line":
      return 2;
    default:
      return 0;
  }
}

/**
 * Decide and compute the deletion of the session's current sub-selection
 * against `model` (which the caller derives from the live session-d so the
 * indices line up). Pure: consults the policy table and, when allowed,
 * computes the new `d`; it mutates neither the session nor the model.
 */
export function delete_vector_subselection(
  session: VectorEditSession,
  model: PathModel,
  source_kind: VectorEditSource["kind"]
): DeleteVectorOutcome {
  const vertices = session.selected_vertices;
  const segments = session.selected_segments;
  const tangents = session.selected_tangents;
  if (vertices.length === 0 && segments.length === 0 && tangents.length === 0) {
    return { kind: "noop" };
  }

  const cls = policy_class.of(source_kind);
  if (!policy_class.accepts(cls, "delete-vertex")) return { kind: "refused" };

  // `restrict` (vertex-chain): refuse when removing the selected vertices
  // would drop the chain below its structural minimum. Only the vertex track
  // moves the count — a segment / tangent-only delete passes the gate (it
  // opens / re-types the shape, handled downstream by `vector_apply`).
  if (policy_class.chosen_policy(cls, "delete-vertex") === "restrict") {
    const unique = new Set(vertices).size;
    if (model.vertexCount() - unique < min_vertices(source_kind)) {
      return { kind: "refused" };
    }
  }

  const next = model.deleteSubSelection({ vertices, segments, tangents });
  return { kind: "deleted", d: next.toSvgPathD() };
}
