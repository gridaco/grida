// VectorEditSession — host-side state for vector content-edit on the
// three supported source tags: <path>, <polyline>, <polygon>.
//
// The session stores ONLY what is not already in the document: which
// node is under edit, the source tag (for projection on writeback), the
// sub-selection of vertices / segments / tangents, and a path-form `d`
// (the "session-d") that acts as the in-session geometry lingua franca.
//
// Why a session-d? Gesture handlers (translate-vertex, set-tangent,
// bend-segment, …) all express their work in PathModel terms — parse a
// `d`, mutate, emit a new `d`. For `<path>` sources the session-d IS
// the document's `d` (verbatim). For `<polyline>` / `<polygon>` the
// document holds native attrs (`points=`); the session keeps an
// equivalent `d` in sync, and the apply.ts shim (`apply_session_d`)
// projects each new `d` back to native attrs on its way to the
// document. Gesture handlers stay tag-oblivious.
//
// Why no cached `PathModel` here? Under our gesture-bracketed history
// doctrine, every committed gesture writes back (native attrs or `d`).
// The session-d is the canonical store; holding a parallel parsed
// model would be a cache obligated to invalidate on every external
// write (undo / redo / collab / programmatic `set_attr`).
//
// `last_seen_d` is the bookkeeping tied to this: the host updates it
// after its own writes, and the next state-change tick compares against
// the freshly-derived session-d to detect "the document changed under
// us" (selection indices may now be invalid).
//
// Boundary: this file does NOT import from `@grida/vn` or from
// `./model`. Geometry traffic lives in `apply.ts`; this file holds
// state.

import type { VectorEditSource } from "../document";
import type { VertexId, SegmentId, TangentRef } from "./model";

export type {
  Verb,
  VertexId,
  SegmentId,
  TangentRef,
  TangentMirrorMode,
} from "./model";

export type HoveredControl =
  | { kind: "vertex"; index: VertexId }
  | { kind: "segment"; index: SegmentId }
  | { kind: "tangent"; ref: TangentRef };

export type SelectMode = "replace" | "add" | "toggle";

/**
 * Frozen triple capturing a vector-edit sub-selection. Produced by
 * {@link VectorEditSession.snapshot_selection} and consumed by
 * {@link VectorEditSession.restore_selection}. Used by the orchestrator
 * to close over before/after sub-selection in gesture deltas so undo /
 * redo restores selection alongside the geometry, and by selection-only
 * deltas (clicks, marquee) so standalone selection changes are
 * themselves undoable.
 */
export type SubSelectionSnapshot = {
  readonly vertices: ReadonlyArray<VertexId>;
  readonly segments: ReadonlyArray<SegmentId>;
  readonly tangents: ReadonlyArray<TangentRef>;
};

function tangents_equal(a: TangentRef, b: TangentRef): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Shallow equality over the three sub-selection arrays. Order-sensitive
 * (mirrors how the host stores them). Used by the orchestrator to skip
 * pushing a no-op undo entry when a selection handler resolves to the
 * same state — e.g. clicking an already-selected vertex in `replace`
 * mode.
 */
export function sub_selection_equal(
  a: SubSelectionSnapshot,
  b: SubSelectionSnapshot
): boolean {
  if (a === b) return true;
  if (a.vertices.length !== b.vertices.length) return false;
  if (a.segments.length !== b.segments.length) return false;
  if (a.tangents.length !== b.tangents.length) return false;
  for (let i = 0; i < a.vertices.length; i++) {
    if (a.vertices[i] !== b.vertices[i]) return false;
  }
  for (let i = 0; i < a.segments.length; i++) {
    if (a.segments[i] !== b.segments[i]) return false;
  }
  for (let i = 0; i < a.tangents.length; i++) {
    if (!tangents_equal(a.tangents[i], b.tangents[i])) return false;
  }
  return true;
}

/**
 * Host-side state for vector content-edit (vertex / segment / tangent
 * gestures) on the supported source tags. "Vector" here names the
 * editing mode — NOT a `vn.VectorNetwork` wrapper. The session holds
 * the source tag's authored attrs plus a path-form session-d, and
 * delegates geometry to {@link PathModel} via the apply.ts shim.
 */
export class VectorEditSession {
  readonly node_id: string;
  /** Source tag + authored attrs captured at session entry. Tells the
   *  apply.ts shim how to project a path-form `d` back to the document.
   *
   *  Flips **at most once**, primitive → `path`, when a promotable
   *  primitive (rect / circle / ellipse) is promoted to `<path>` on its
   *  first committed gesture (see `vector_apply`). The flip is what keeps
   *  every downstream reader (overlay neighbours, tangent/bend gates, the
   *  external-mutation reconciler) consistent after the element re-types.
   *  `restore_source()` reverses it for gesture undo. */
  private _source: VectorEditSource;
  /** The pre-promotion source, retained so `restore_source` can reverse a
   *  single primitive→path flip. `null` when not promoted. */
  private _source_before_promotion: VectorEditSource | null;

  /** The in-session PathModel-form `d`. Gesture handlers parse from
   *  here and write back through `apply_session_d`; the writeback may
   *  land in native attrs (non-path sources) but this string is the
   *  canonical session-side view. */
  private _session_d: string;
  /** Last `d` the host KNOWS matches its mental model — i.e. the value
   *  produced by our most recent gesture commit (or the initial value
   *  on entry). The state-change watcher compares this against the
   *  current session-d to detect external mutations (undo / redo /
   *  programmatic) and clear sub-selection accordingly. */
  private _last_seen_d: string;
  private _selected_vertices: VertexId[];
  private _selected_segments: SegmentId[];
  private _selected_tangents: TangentRef[];
  private _hovered_control: HoveredControl | null;

  constructor(node_id: string, source: VectorEditSource, session_d: string) {
    this.node_id = node_id;
    this._source = source;
    this._source_before_promotion = null;
    this._session_d = session_d;
    this._last_seen_d = session_d;
    this._selected_vertices = [];
    this._selected_segments = [];
    this._selected_tangents = [];
    this._hovered_control = null;
  }

  /** Source tag the session currently projects through. See `_source`. */
  get source(): VectorEditSource {
    return this._source;
  }

  /**
   * Flip the source to `path` after the underlying element was promoted
   * (rect / circle / ellipse → `<path>`). Idempotent: a second call while
   * already promoted does nothing, so the pre-promotion source captured by
   * the first flip is never clobbered.
   */
  promote_source_to_path(): void {
    if (this._source_before_promotion !== null) return;
    if (this._source.kind === "path") return;
    this._source_before_promotion = this._source;
    this._source = { kind: "path", d: this._session_d };
  }

  /** Reverse a {@link promote_source_to_path} (gesture undo). No-op if the
   *  source was never promoted. */
  restore_source(): void {
    if (this._source_before_promotion === null) return;
    this._source = this._source_before_promotion;
    this._source_before_promotion = null;
  }

  /**
   * Re-sync the source to the document's current tag, outright. Unlike
   * {@link promote_source_to_path} / {@link restore_source} (which manage a
   * single primitive→path flip within one gesture), this sets the source to
   * an authoritative value derived from the live document and clears the
   * promotion bookkeeping.
   *
   * The host calls this when an undo/redo re-types the node out from under a
   * *different* live session object than the one that performed the original
   * flip (exit + undo-exit creates a fresh session; the captured session's
   * `restore_source` then no-ops). Without it the live session could keep
   * `source.kind === "path"` while the node is back to a primitive, and the
   * next gesture would write a stray `d` onto the native tag. Re-deriving
   * from the document keeps the live session authoritative.
   */
  sync_source(source: VectorEditSource): void {
    this._source = source;
    this._source_before_promotion = null;
  }

  /** The session's current PathModel-form `d`. Gesture handlers read
   *  this instead of `doc.get_attr(node_id, "d")` so they stay tag-
   *  oblivious (non-path sources have no `d` on the document). */
  get current_d(): string {
    return this._session_d;
  }

  /** Update the session's view after a write produced `next_d`. Caller
   *  is `apply_session_d` (or the gesture handler that called it). */
  update_session_d(next_d: string): void {
    this._session_d = next_d;
  }

  get last_seen_d(): string {
    return this._last_seen_d;
  }

  get selected_vertices(): ReadonlyArray<VertexId> {
    return this._selected_vertices;
  }

  get selected_segments(): ReadonlyArray<SegmentId> {
    return this._selected_segments;
  }

  get selected_tangents(): ReadonlyArray<TangentRef> {
    return this._selected_tangents;
  }

  get hovered_control(): HoveredControl | null {
    return this._hovered_control;
  }

  /**
   * Record that the host's most recent gesture write produced `d`.
   * Updates both the session-d (the in-session canonical form) and the
   * last-seen mark. The next state-change tick uses last_seen to
   * distinguish "we wrote this" from "the document changed under us".
   */
  mark_seen(d: string): void {
    this._session_d = d;
    this._last_seen_d = d;
  }

  /**
   * The session's response to a detected external mutation of `d`
   * (undo / redo / programmatic / collab). Atomically (a) advances
   * `last_seen_d` to the now-current value and (b) drops sub-selection
   * — selection indices reference vertices and segments by ordinal
   * position, and an external mutation may have shifted or removed
   * them.
   *
   * Exposed as a single method so callers cannot get the two halves
   * out of order. Doing `clear_selection` without `mark_seen` would
   * leave us "stuck dirty" — the next tick would reconcile again.
   * Doing `mark_seen` without `clear_selection` would leave stale
   * indices pointing into a geometry that no longer matches.
   */
  reconcile_after_external_mutation(d: string): void {
    this.mark_seen(d);
    this.clear_selection();
  }

  select_vertex(index: VertexId, mode: SelectMode): void {
    switch (mode) {
      case "replace":
        this._selected_vertices = [index];
        break;
      case "add":
        if (!this._selected_vertices.includes(index)) {
          this._selected_vertices = [...this._selected_vertices, index];
        }
        break;
      case "toggle":
        this._selected_vertices = this._selected_vertices.includes(index)
          ? this._selected_vertices.filter((v) => v !== index)
          : [...this._selected_vertices, index];
        break;
    }
    // Replace-mode clears segment / tangent sub-selection too; add /
    // toggle preserve them (Figma-like).
    if (mode === "replace") {
      this._selected_segments = [];
      this._selected_tangents = [];
    }
  }

  select_segment(index: SegmentId, mode: SelectMode): void {
    switch (mode) {
      case "replace":
        this._selected_segments = [index];
        break;
      case "add":
        if (!this._selected_segments.includes(index)) {
          this._selected_segments = [...this._selected_segments, index];
        }
        break;
      case "toggle":
        this._selected_segments = this._selected_segments.includes(index)
          ? this._selected_segments.filter((s) => s !== index)
          : [...this._selected_segments, index];
        break;
    }
    if (mode === "replace") {
      this._selected_vertices = [];
      this._selected_tangents = [];
    }
  }

  select_tangent(ref: TangentRef, mode: SelectMode): void {
    const has = this._selected_tangents.some((t) => tangents_equal(t, ref));
    switch (mode) {
      case "replace":
        this._selected_tangents = [ref];
        break;
      case "add":
        if (!has) this._selected_tangents = [...this._selected_tangents, ref];
        break;
      case "toggle":
        this._selected_tangents = has
          ? this._selected_tangents.filter((t) => !tangents_equal(t, ref))
          : [...this._selected_tangents, ref];
        break;
    }
    if (mode === "replace") {
      this._selected_vertices = [];
      this._selected_segments = [];
    }
  }

  /**
   * Replace the entire sub-selection at once. Useful for marquee /
   * lasso results, which compute the full set up-front.
   */
  set_selection(next: {
    vertices: ReadonlyArray<VertexId>;
    segments: ReadonlyArray<SegmentId>;
    tangents: ReadonlyArray<TangentRef>;
  }): void {
    this._selected_vertices = [...next.vertices];
    this._selected_segments = [...next.segments];
    this._selected_tangents = next.tangents.map((t) => [t[0], t[1]] as const);
  }

  /**
   * Capture the current sub-selection as a frozen triple. The
   * orchestrator closes over snapshots in gesture deltas (so undo
   * restores selection alongside geometry) and in standalone selection
   * deltas (so a click on a vertex is itself undoable).
   *
   * Returned arrays are fresh copies — safe to retain across
   * subsequent mutations of the session.
   */
  snapshot_selection(): SubSelectionSnapshot {
    return Object.freeze({
      vertices: Object.freeze([...this._selected_vertices]),
      segments: Object.freeze([...this._selected_segments]),
      tangents: Object.freeze(
        this._selected_tangents.map((t) => [t[0], t[1]] as TangentRef)
      ),
    });
  }

  /**
   * Restore a previously-captured sub-selection. Counterpart to
   * {@link snapshot_selection}. Equivalent to calling
   * {@link set_selection} with the snapshot's contents.
   */
  restore_selection(snap: SubSelectionSnapshot): void {
    this.set_selection(snap);
  }

  clear_selection(): void {
    if (
      this._selected_vertices.length === 0 &&
      this._selected_segments.length === 0 &&
      this._selected_tangents.length === 0
    ) {
      return;
    }
    this._selected_vertices = [];
    this._selected_segments = [];
    this._selected_tangents = [];
  }
}
