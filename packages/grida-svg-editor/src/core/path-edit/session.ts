// PathEditSession — host-side state for vector content-edit on a <path>.
//
// The session stores ONLY what is not already in the document: which
// node is under edit, the original `d` captured at entry (for
// diagnostics — "did the user change anything?"), and the sub-
// selection of vertices / segments / tangents. Geometry itself lives in
// the document's `d` attr; `PathModel` is derived from `d` on demand at
// the host's read sites.
//
// Why no cached `model` here? Under our gesture-bracketed history
// doctrine, every committed gesture writes to `d` directly. That makes
// `d` the live, authoritative store while the session is open. Holding
// a parallel parsed model on the session would be a cache obligated to
// invalidate on every external write (undo / redo / collab /
// programmatic `set_attr`) — and forgetting one such invalidation is
// exactly the class of bug we want to design out. So we don't hold one.
//
// `last_seen_d` is the one bookkeeping field tied to this: the host
// updates it after its own writes to `d`, and on the next state-change
// tick can compare against `doc.get_attr(node_id, "d")` to detect "the
// document changed under us" (selection indices may now be invalid).
//
// Boundary: this file does NOT import from `@grida/vn`. It is also no
// longer obligated to import `PathModel` — geometry has moved out.

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

function tangents_equal(a: TangentRef, b: TangentRef): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export class PathEditSession {
  readonly node_id: string;
  /** Original `d` captured at session entry. Used by the inspector
   *  ("what changed in this session?") and tests; not used for revert
   *  (gesture-bracketed history handles that). */
  readonly original_d: string;

  /** Last `d` the host KNOWS matches its mental model — i.e. the value
   *  written by our most recent gesture commit (or the initial `d` on
   *  entry). The state-change watcher compares this against the
   *  current `d` to detect external mutations (undo / redo /
   *  programmatic) and clear sub-selection accordingly. */
  private _last_seen_d: string;
  private _selected_vertices: VertexId[];
  private _selected_segments: SegmentId[];
  private _selected_tangents: TangentRef[];
  private _hovered_control: HoveredControl | null;

  constructor(node_id: string, d: string) {
    this.node_id = node_id;
    this.original_d = d;
    this._last_seen_d = d;
    this._selected_vertices = [];
    this._selected_segments = [];
    this._selected_tangents = [];
    this._hovered_control = null;
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
   * Record that the host's most recent gesture write produced `d`. The
   * next state-change tick uses this to distinguish "we wrote this"
   * from "the document changed under us".
   */
  mark_seen(d: string): void {
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
