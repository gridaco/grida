// Vector-edit session: doctrine-level specs.
//
// The session is deliberately *small*: under the gesture-bracketed
// history doctrine, every committed gesture writes to the document's
// `d` attribute directly, which makes `d` the authoritative live store
// while the session is open. The session therefore stores ONLY what's
// not already in `d` — node id, original `d` (for diagnostics), the
// last `d` we KNOW we wrote (for external-mutation detection), and
// sub-selection.
//
// These tests pin that shape. They exist because the natural drift is
// to "just stash a parsed PathModel here for convenience" — which is
// precisely the cache-coherency bug we just designed out. A test
// failing here means someone reintroduced the parallel-state hazard.

import { describe, expect, it } from "vitest";
import {
  VectorEditSession,
  source_to_session_d,
  sub_selection_equal,
} from "../src/core/vector-edit";
import { SvgDocument } from "../src/core/document";

const D = "M0,0 L10,0 L10,10 Z";
const D2 = "M0,0 L20,0 L20,20 Z";

/** Helper: build a path-source session in the same shape these tests
 *  exercised before the v1 vector-edit refactor widened the constructor
 *  to take a `VectorEditSource`. Keeps each test's intent legible
 *  (`d` literal in one place, not two). */
function path_session(node_id: string, d: string): VectorEditSession {
  return new VectorEditSession(node_id, { kind: "path", d }, d);
}

describe("VectorEditSession — shape doctrine", () => {
  it("does NOT hold a parsed `model` field", () => {
    // Doctrine: `d` is the live store. The session must not carry a
    // parsed copy of geometry — that would be a cache obligated to
    // invalidate on every external write (undo / redo / collab /
    // programmatic), and the host has historically forgotten one such
    // hook (the undo bug that motivated this redesign). Catching
    // `model` here means someone reintroduced the parallel-state
    // hazard.
    const s = path_session("p1", D);
    expect("model" in s).toBe(false);
  });

  it("`last_seen_d` starts equal to the entry `d` and only moves via mark_seen", () => {
    // The watcher in the host compares `doc.get_attr(node_id, "d")`
    // against `last_seen_d` to detect external writes. Selection edits
    // do not touch `d`, so they must not advance `last_seen_d`
    // either.
    const s = path_session("p1", D);
    expect(s.last_seen_d).toBe(D);

    s.select_vertex(0, "replace");
    expect(s.last_seen_d).toBe(D);

    s.mark_seen(D2);
    expect(s.last_seen_d).toBe(D2);
  });

  it("mark_seen accepts the same value as a no-op", () => {
    // The subscribe callback fires on every editor tick, but `d`
    // rarely changes between ticks. Re-marking the same value is
    // valid and leaves state untouched.
    const s = path_session("p1", D);
    s.mark_seen(D);
    expect(s.last_seen_d).toBe(D);
  });
});

describe("VectorEditSession — selection invalidation contract", () => {
  // The host clears sub-selection on detected external mutation
  // (undo / redo). The reason is honest: selection indices reference
  // vertices and segments by ordinal position, and an external
  // mutation may have shifted them. Re-mapping is a bigger problem;
  // clearing is correct. These tests pin the clear semantics so the
  // host can lean on them.

  it("clear_selection wipes vertices, segments, AND tangents", () => {
    const s = path_session("p1", D);
    s.set_selection({
      vertices: [0, 1],
      segments: [0],
      tangents: [[1, 0]],
    });
    s.clear_selection();
    expect(s.selected_vertices).toEqual([]);
    expect(s.selected_segments).toEqual([]);
    expect(s.selected_tangents).toEqual([]);
  });

  it("clear_selection is a no-op on an already-empty session", () => {
    // The host calls this on every detected external mutation. When
    // nothing was selected the call should leave state unchanged.
    const s = path_session("p1", D);
    const vs = s.selected_vertices;
    const ss = s.selected_segments;
    const ts = s.selected_tangents;
    s.clear_selection();
    expect(s.selected_vertices).toBe(vs);
    expect(s.selected_segments).toBe(ss);
    expect(s.selected_tangents).toBe(ts);
  });

  it("clearing selection does NOT touch `node_id` or `last_seen_d`", () => {
    // Defensive: clearing is a selection-scope operation. It must
    // leave session identity (node id) untouched and not roll back
    // the external-mutation watermark.
    const s = path_session("p1", D);
    s.set_selection({ vertices: [0], segments: [], tangents: [] });
    s.mark_seen(D2);
    s.clear_selection();
    expect(s.node_id).toBe("p1");
    expect(s.last_seen_d).toBe(D2);
  });
});

describe("VectorEditSession — snapshot / restore for history wiring", () => {
  // The orchestrator closes over `snapshot_selection()` triples in
  // gesture deltas and selection-only deltas so undo / redo restores
  // sub-selection alongside (or instead of) geometry. These tests pin
  // the round-trip contract: a snapshot taken before a mutation is
  // sufficient input to `restore_selection` to recover that state.

  it("snapshot → mutate → restore round-trips all three tracks", () => {
    const s = path_session("p1", D);
    s.set_selection({
      vertices: [0, 1, 2],
      segments: [1],
      tangents: [[1, 0]],
    });
    const before = s.snapshot_selection();

    s.set_selection({ vertices: [], segments: [], tangents: [] });
    expect(s.selected_vertices).toEqual([]);

    s.restore_selection(before);
    expect(s.selected_vertices).toEqual([0, 1, 2]);
    expect(s.selected_segments).toEqual([1]);
    expect(s.selected_tangents).toEqual([[1, 0]]);
  });

  it("snapshot is detached — mutations after capture don't bleed in", () => {
    // Closures in dom.ts retain snapshots across drag commit → later
    // undo. A snapshot that aliased the live arrays would observe
    // mid-drag mutations and corrupt the undo target.
    const s = path_session("p1", D);
    s.set_selection({ vertices: [0], segments: [], tangents: [] });
    const snap = s.snapshot_selection();
    s.set_selection({ vertices: [5, 6], segments: [], tangents: [] });
    expect(snap.vertices).toEqual([0]);
  });

  it("sub_selection_equal matches identical content, rejects order swaps", () => {
    // Order matters — the host stores selection in user-pick order and
    // the host's snapshot equality should reflect that. Two arrays with
    // the same set but different orders are NOT equal under this
    // predicate (a different policy would silently merge undo entries
    // that the user perceives as distinct).
    const s = path_session("p1", D);
    s.set_selection({ vertices: [0, 1], segments: [], tangents: [] });
    const a = s.snapshot_selection();
    s.set_selection({ vertices: [0, 1], segments: [], tangents: [] });
    expect(sub_selection_equal(a, s.snapshot_selection())).toBe(true);

    s.set_selection({ vertices: [1, 0], segments: [], tangents: [] });
    expect(sub_selection_equal(a, s.snapshot_selection())).toBe(false);
  });

  it("sub_selection_equal compares tangents structurally, not by reference", () => {
    const s = path_session("p1", D);
    s.set_selection({ vertices: [], segments: [], tangents: [[2, 1]] });
    const a = s.snapshot_selection();
    s.set_selection({ vertices: [], segments: [], tangents: [[2, 1]] });
    expect(sub_selection_equal(a, s.snapshot_selection())).toBe(true);

    s.set_selection({ vertices: [], segments: [], tangents: [[2, 0]] });
    expect(sub_selection_equal(a, s.snapshot_selection())).toBe(false);
  });
});

describe("external-mutation reconciliation contract — tag-aware", () => {
  // The host watcher in `dom.ts` reconciles vector-edit sessions when
  // external writes hit the source-tag's native attr. v1 v1 watcher was
  // gated to <path>, which left <polyline>/<polygon> stale across undo,
  // redo, programmatic `set_attr`, or collab. These tests pin the
  // tag-aware reconciliation contract by exercising the same pipeline the
  // watcher uses: `doc.is_vector_edit_target` → `source_to_session_d` →
  // compare with `last_seen_d`.

  function find_first(doc: SvgDocument, tag: string): string {
    for (const id of doc.all_elements()) {
      if (doc.tag_of(id) === tag) return id;
    }
    throw new Error(`no <${tag}> in document`);
  }

  it("detects an external points= mutation on <polyline> and clears sub-selection", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0,0 10,0 10,10"/></svg>`;
    const doc = new SvgDocument(svg);
    const id = find_first(doc, "polyline");

    const source0 = doc.is_vector_edit_target(id)!;
    const ses = new VectorEditSession(
      id,
      source0,
      source_to_session_d(source0)
    );
    ses.set_selection({ vertices: [1, 2], segments: [], tangents: [] });

    // External mutation (undo / redo / programmatic / collab analogue):
    // some other code path writes `points=` directly on the document.
    doc.set_attr(id, "points", "0,0 20,0 20,20 0,20");

    // Watcher-equivalent read: rebuild the live source tag-aware, derive
    // the live session-d, compare against the session's last_seen mark.
    const live_source = doc.is_vector_edit_target(id)!;
    const live_d = source_to_session_d(live_source);
    expect(live_d).not.toBe(ses.last_seen_d);

    ses.reconcile_after_external_mutation(live_d);
    expect(ses.selected_vertices).toEqual([]);
    expect(ses.last_seen_d).toBe(live_d);
  });

  it("detects an external points= mutation on <polygon>", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 10,0 10,10 0,10"/></svg>`;
    const doc = new SvgDocument(svg);
    const id = find_first(doc, "polygon");

    const source0 = doc.is_vector_edit_target(id)!;
    const ses = new VectorEditSession(
      id,
      source0,
      source_to_session_d(source0)
    );

    doc.set_attr(id, "points", "0,0 5,0 5,5");

    const live_source = doc.is_vector_edit_target(id)!;
    const live_d = source_to_session_d(live_source);
    expect(live_d).not.toBe(ses.last_seen_d);
  });

  it("is a no-op when points= is unchanged", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0,0 10,0 10,10"/></svg>`;
    const doc = new SvgDocument(svg);
    const id = find_first(doc, "polyline");

    const source0 = doc.is_vector_edit_target(id)!;
    const ses = new VectorEditSession(
      id,
      source0,
      source_to_session_d(source0)
    );

    const live_source = doc.is_vector_edit_target(id)!;
    const live_d = source_to_session_d(live_source);
    expect(live_d).toBe(ses.last_seen_d);
  });
});
