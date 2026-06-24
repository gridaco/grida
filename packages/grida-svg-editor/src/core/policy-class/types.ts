// Policy Class — type vocabulary.
// Spec: docs/wg/feat-svg-editor/glossary/policy-class.md
// Tests in __tests__/policy-class/ assert doc ↔ code consistency.

/**
 * The seven Policy Classes (five active in v1, two deferred), plus a
 * sentinel `"none"` for elements that are not editable as geometry.
 * Membership is defined by {@link policy_class_of}.
 *
 * @see docs/wg/feat-svg-editor/glossary/policy-class.md#the-v1-partition
 */
export type PolicyClass =
  | "vertex-chain"
  | "vertex-box"
  | "circle"
  | "ellipse"
  | "path"
  | "text"
  | "group"
  | "none";

/**
 * The set of {@link PolicyClass} values that are documented and active
 * in v1 (not deferred, not the sentinel). Useful as a test-time
 * enumeration.
 */
export const ACTIVE_POLICY_CLASSES: readonly PolicyClass[] = [
  "vertex-chain",
  "vertex-box",
  "circle",
  "ellipse",
  "path",
] as const;

/**
 * All declared {@link PolicyClass} values including deferred and
 * sentinel. Test-time enumeration for exhaustiveness checks.
 */
export const ALL_POLICY_CLASSES: readonly PolicyClass[] = [
  "vertex-chain",
  "vertex-box",
  "circle",
  "ellipse",
  "path",
  "text",
  "group",
  "none",
] as const;

/**
 * The editor's intent vocabulary at the Policy Class layer.
 *
 * Top-level intents (gestures emitted by the HUD):
 *   - `resize`              — drag a resize handle
 *   - `translate`           — drag the element body
 *   - `rotate`              — drag a rotate handle
 *   - `enter-vector-edit`   — switch into vertex-editing mode for the element
 *
 * Sub-intents only meaningful inside vector-edit mode. These apply to
 * the VertexChain ∪ Path subset of classes; all other classes reject
 * them at the capability gate.
 *
 *   - `translate-vertex`       — move one addressable vertex
 *   - `transform-vertices`     — apply a single affine (translate / scale /
 *                                rotate) to a multi-vertex sub-selection via
 *                                the Vertex Transform Box (gridaco/grida#881)
 *   - `insert-vertex`          — insert a vertex along a segment
 *   - `delete-vertex`          — remove an addressable vertex
 *   - `close-shape`            — close an open chain (polyline → polygon, path Z)
 *   - `open-shape`             — open a closed chain
 *   - `insert-tangent`         — promote a linear segment to a curve (Path only)
 *   - `adjust-tangent`         — move a curve's control handle (Path only)
 *   - `convert-segment-type`   — L ↔ C ↔ Q ↔ A (Path only)
 *   - `adjust-arc-radii`       — change an A-segment's rx / ry (Path only)
 *   - `split-sub-path`         — break a path into two sub-paths (Path only)
 *
 * @see docs/wg/feat-svg-editor/glossary/policy-class.md#v1-intent-coverage
 */
export type Intent =
  | "resize"
  | "translate"
  | "rotate"
  | "enter-vector-edit"
  | "translate-vertex"
  | "transform-vertices"
  | "insert-vertex"
  | "delete-vertex"
  | "close-shape"
  | "open-shape"
  | "insert-tangent"
  | "adjust-tangent"
  | "convert-segment-type"
  | "adjust-arc-radii"
  | "split-sub-path";

/**
 * The four top-level intents — distinguished as their own constant for
 * tables that only declare top-level intent cells.
 */
export const TOP_LEVEL_INTENTS: readonly Intent[] = [
  "resize",
  "translate",
  "rotate",
  "enter-vector-edit",
] as const;

/**
 * The vector-edit sub-intents — the atomic operations exposed inside
 * vector-editing mode. See the v1 intent coverage section of the
 * glossary doc for the per-class table.
 */
export const VECTOR_EDIT_SUB_INTENTS: readonly Intent[] = [
  "translate-vertex",
  "transform-vertices",
  "insert-vertex",
  "delete-vertex",
  "close-shape",
  "open-shape",
  "insert-tangent",
  "adjust-tangent",
  "convert-segment-type",
  "adjust-arc-radii",
  "split-sub-path",
] as const;

/**
 * All declared intents. Test-time enumeration.
 */
export const ALL_INTENTS: readonly Intent[] = [
  ...TOP_LEVEL_INTENTS,
  ...VECTOR_EDIT_SUB_INTENTS,
] as const;

/**
 * The universal vocabulary for "how an intent could be realised on a
 * class". The host's policy choice for any (class, intent) cell is
 * always exactly one of these four.
 *
 *   - `bake`            — write the gesture into the element's geometry
 *                         attributes (`points`, `d`, `x/y/width/height`,
 *                         `cx/cy/r/rx/ry`, …). The element's type
 *                         is preserved.
 *   - `via-transform`   — compose the gesture into the element's own
 *                         `transform=` attribute. Geometry attributes
 *                         are untouched.
 *   - `promote`         — re-type the element to a sibling that lacks
 *                         one of its constraints (circle → ellipse, rect
 *                         → polygon, polyline → polygon, line → polyline).
 *                         The element's type changes.
 *   - `restrict`        — the editor enforces the class's constraint at
 *                         the cost of the gesture. The runtime realisation
 *                         depends on whether the constraint admits a
 *                         natural projection onto the constraint surface:
 *
 *                           - **Projectable constraint**: the gesture is
 *                             clamped onto the constraint surface and
 *                             baked. Example: Circle × Resize. The
 *                             constraint `rx = ry` projects (sx, sy) to
 *                             (min(sx,sy), min(sx,sy)); the projection
 *                             is then baked. The element moves, but
 *                             only along the constraint subspace.
 *                           - **Non-projectable constraint**: the
 *                             gesture is refused entirely; the element
 *                             does not move. Example: deleting a vertex
 *                             from a polygon with exactly 3 vertices
 *                             (the constraint `n ≥ 3` has no natural
 *                             projection — there is no "partial
 *                             deletion").
 *
 *                         The choice between projection and refusal is
 *                         a constraint-layer detail, not a Policy Class
 *                         choice. From Policy Class's vantage, `restrict`
 *                         is one solution; the constraint layer (deferred
 *                         to v2 — see the "base + constraints" section
 *                         of the glossary doc) is the future home for
 *                         the projection-vs-refusal distinction.
 *
 * @see docs/wg/feat-svg-editor/glossary/policy-class.md#table-2--solution-space-per-policy-class--intent
 */
export type Solution = "bake" | "via-transform" | "promote" | "restrict";

/**
 * The set of legal solutions for a single (class, intent) cell.
 *
 *   - Empty array  — the intent is **rejected** by the class (capability gate
 *                    returns false).
 *   - Length 1     — the intent has no policy decision; the single
 *                    solution is the implementation contract.
 *   - Length ≥ 2   — the intent has a host-configurable policy. This is
 *                    where the term Policy Class earns its keep.
 */
export type SolutionSpace = readonly Solution[];
