// Programmatic vector sub-selection writes (gridaco/grida#790).
//
// The pure core behind `commands.set_vector_selection` and the atomic-entry
// `enter_content_edit(id, opts)` form. Kept here — not in the DOM surface —
// so the validation + apply rules are headlessly unit-testable against a
// `VectorEditSession` + `PathModel` (the surface can't be mounted in jsdom;
// see `__tests__/README.md`). The surface (`dom.ts`) is a thin shell that
// resolves the live session/model, calls these, then syncs the mirror and
// pushes the undoable history step.
//
// Boundary: imports only `./model` and `./session` (no `@grida/vn`, no DOM).

import type { PathModel, TangentRef } from "./model";
import type { SelectMode, VectorEditSession } from "./session";
import { sub_selection_equal } from "./session";

/**
 * Write triple for a sub-selection. Structurally identical to the package's
 * public `VectorSubSelectionInput` (`../../types`) — kept local so this
 * low-level module stays decoupled from the root public types.
 */
export type SubSelectionInput = {
  readonly vertices?: ReadonlyArray<number>;
  readonly segments?: ReadonlyArray<number>;
  readonly tangents?: ReadonlyArray<readonly [number, 0 | 1]>;
};

/**
 * Validate a sub-selection write against the live path model. Vertex /
 * segment indices must be integers in `[0, count)`; a tangent ref must be
 * `[vertexInRange, 0 | 1]`. Returns `false` if ANY track is out of range —
 * callers refuse the whole write rather than silently dropping offending
 * indices (a strict surface rejects wrong contents). An empty input is valid
 * (it clears the selection in `replace` mode).
 */
export function validate_subselection(
  input: SubSelectionInput,
  model: PathModel
): boolean {
  const vcount = model.vertexCount();
  const scount = model.segmentCount();
  const in_range = (n: unknown, count: number): boolean =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) < count;
  for (const v of input.vertices ?? []) {
    if (!in_range(v, vcount)) return false;
  }
  for (const s of input.segments ?? []) {
    if (!in_range(s, scount)) return false;
  }
  for (const t of input.tangents ?? []) {
    if (!in_range(t?.[0], vcount)) return false;
    if (t[1] !== 0 && t[1] !== 1) return false;
  }
  return true;
}

/**
 * Validate `input` against `model` and apply it to `session`.
 *
 * - `replace` (default elsewhere) swaps `input` in as the WHOLE sub-selection;
 *   omitted tracks are cleared.
 * - `add` / `toggle` fold each track into the existing selection (each
 *   per-item call preserves the other tracks — Figma-like), so omitted tracks
 *   are left intact.
 *
 * Returns `true` when the selection actually changed (and was valid), `false`
 * when the input is out of range OR resolves to the current sub-selection (a
 * no-op the caller should not record as a history step). Pure session
 * mutation — no mirror sync, no history; the caller owns those.
 */
export function apply_subselection(
  session: VectorEditSession,
  model: PathModel,
  input: SubSelectionInput,
  mode: SelectMode
): boolean {
  if (!validate_subselection(input, model)) return false;
  const before = session.snapshot_selection();
  const vertices = input.vertices ?? [];
  const segments = input.segments ?? [];
  const tangents: ReadonlyArray<TangentRef> = input.tangents ?? [];
  if (mode === "replace") {
    session.set_selection({ vertices, segments, tangents });
  } else {
    for (const v of vertices) session.select_vertex(v, mode);
    for (const s of segments) session.select_segment(s, mode);
    for (const t of tangents) session.select_tangent(t, mode);
  }
  return !sub_selection_equal(before, session.snapshot_selection());
}
