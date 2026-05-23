// Path-edit session: doctrine-level specs.
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
import { PathEditSession } from "../src/core/path-edit";

const D = "M0,0 L10,0 L10,10 Z";
const D2 = "M0,0 L20,0 L20,20 Z";

describe("PathEditSession — shape doctrine", () => {
  it("does NOT hold a parsed `model` field", () => {
    // Doctrine: `d` is the live store. The session must not carry a
    // parsed copy of geometry — that would be a cache obligated to
    // invalidate on every external write (undo / redo / collab /
    // programmatic), and the host has historically forgotten one such
    // hook (the undo bug that motivated this redesign). Catching
    // `model` here means someone reintroduced the parallel-state
    // hazard.
    const s = new PathEditSession("p1", D);
    expect("model" in s).toBe(false);
  });

  it("captures `original_d` at entry — never silently mutated", () => {
    // `original_d` is the inspector's anchor ("did anything change in
    // this session?"). It is NOT a revert anchor (gesture-bracketed
    // history handles revert via undo). It must stay byte-stable
    // across selection edits and external-mutation reconciliation.
    const s = new PathEditSession("p1", D);
    s.select_vertex(0, "replace");
    expect(s.original_d).toBe(D);
    s.mark_seen(D2); // simulate external change reconciled
    expect(s.original_d).toBe(D);
  });

  it("`last_seen_d` starts equal to `original_d` and only moves via mark_seen", () => {
    // The watcher in the host compares `doc.get_attr(node_id, "d")`
    // against `last_seen_d` to detect external writes. Selection edits
    // do not touch `d`, so they must not advance `last_seen_d`
    // either.
    const s = new PathEditSession("p1", D);
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
    const s = new PathEditSession("p1", D);
    s.mark_seen(D);
    expect(s.last_seen_d).toBe(D);
  });
});

describe("PathEditSession — selection invalidation contract", () => {
  // The host clears sub-selection on detected external mutation
  // (undo / redo). The reason is honest: selection indices reference
  // vertices and segments by ordinal position, and an external
  // mutation may have shifted them. Re-mapping is a bigger problem;
  // clearing is correct. These tests pin the clear semantics so the
  // host can lean on them.

  it("clear_selection wipes vertices, segments, AND tangents", () => {
    const s = new PathEditSession("p1", D);
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
    const s = new PathEditSession("p1", D);
    const vs = s.selected_vertices;
    const ss = s.selected_segments;
    const ts = s.selected_tangents;
    s.clear_selection();
    expect(s.selected_vertices).toBe(vs);
    expect(s.selected_segments).toBe(ss);
    expect(s.selected_tangents).toBe(ts);
  });

  it("clearing selection does NOT touch `original_d` or `node_id`", () => {
    // Defensive: clearing is a selection-scope operation. It must
    // leave session identity (node id) and the diagnostic anchor
    // untouched.
    const s = new PathEditSession("p1", D);
    s.set_selection({ vertices: [0], segments: [], tangents: [] });
    s.mark_seen(D2);
    s.clear_selection();
    expect(s.node_id).toBe("p1");
    expect(s.original_d).toBe(D);
    expect(s.last_seen_d).toBe(D2);
  });
});
