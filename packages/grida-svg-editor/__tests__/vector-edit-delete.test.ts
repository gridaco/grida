// Vector sub-selection deletion in path-edit mode (gridaco/grida#880).
//
// Before #880, Delete / Backspace was bound unconditionally to
// `selection.remove`, the one structural handler without a mode guard — so
// pressing Delete with a vertex sub-selected in `edit-content` mode detached
// the WHOLE path node instead of the selected vertices. This pins the fix
// across the three layers (all headless — see __tests__/README.md):
//
//   1. Pure geometry — `PathModel.deleteSubSelection`.
//   2. Policy + decision — `delete_vector_subselection` (honors the
//      policy-class `delete-vertex` verdict against a real session).
//   3. Editor + keymap wiring — `commands.delete_vector_selection` delegates
//      to the surface driver, and Delete / Backspace mode-routes between
//      `vector.delete-vertex` (edit-content) and `selection.remove` (select).
//      The surface-private session itself can't be mounted headlessly, so we
//      stub the driver and assert the routing.

import { describe, expect, it, vi } from "vitest";
import { createSvgEditor } from "../src/index";
import { createSvgEditorWithInternals } from "./_helpers";
import {
  PathModel,
  VectorEditSession,
  delete_vector_subselection,
  source_to_session_d,
} from "../src/core/vector-edit";
import type { VectorEditSource } from "../src/core/document";

// ─── Layer 1: PathModel.deleteSubSelection (pure geometry) ───────────────────

/** Canonical (path-order) vertices of a model's emitted `d` — the index
 *  space every surface consumer re-derives from. */
function verts(m: PathModel): [number, number][] {
  return PathModel.fromSvgPathD(m.toSvgPathD())
    .snapshot()
    .vertices.map((v) => [v[0], v[1]]);
}

describe("PathModel.deleteSubSelection — geometry", () => {
  // open 4-point chain: 0→1→2→3
  const OPEN = "M0,0 L10,0 L20,0 L30,0";

  it("drops the trailing segment when the last vertex is deleted", () => {
    const m = PathModel.fromSvgPathD(OPEN);
    const out = m.deleteSubSelection({
      vertices: [3],
      segments: [],
      tangents: [],
    });
    expect(verts(out)).toEqual([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
  });

  it("drops the leading segment when the first vertex is deleted", () => {
    const m = PathModel.fromSvgPathD(OPEN);
    const out = m.deleteSubSelection({
      vertices: [0],
      segments: [],
      tangents: [],
    });
    expect(verts(out)).toEqual([
      [10, 0],
      [20, 0],
      [30, 0],
    ]);
  });

  it("removes both incident segments of an interior vertex (no reconnect — mirrors the main editor)", () => {
    // Deleting vertex 1 drops segments 0→1 and 1→2, leaving only 2→3 — so
    // vertex 0 is isolated and does not emit. This is the documented
    // non-reconnecting behavior shared with editor/grida-canvas; reconnection
    // would be a separate enhancement to both editors.
    const m = PathModel.fromSvgPathD(OPEN);
    const out = m.deleteSubSelection({
      vertices: [1],
      segments: [],
      tangents: [],
    });
    expect(verts(out)).toEqual([
      [20, 0],
      [30, 0],
    ]);
  });

  it("deletes multiple vertices safely (descending-order splice)", () => {
    const m = PathModel.fromSvgPathD(OPEN);
    const out = m.deleteSubSelection({
      vertices: [0, 1],
      segments: [],
      tangents: [],
    });
    // 0→1 and 1→2 gone; 2→3 survives → a 2-point chain.
    expect(verts(out)).toEqual([
      [20, 0],
      [30, 0],
    ]);
  });

  it("deletes a segment without touching its endpoints' other segments", () => {
    const m = PathModel.fromSvgPathD(OPEN);
    const out = m.deleteSubSelection({
      vertices: [],
      segments: [1], // 1→2
      tangents: [],
    });
    const snap = PathModel.fromSvgPathD(out.toSvgPathD()).snapshot();
    // The middle segment is gone, splitting the chain into 0→1 and 2→3.
    expect(snap.segments.length).toBe(2);
  });

  it("zeroing both tangents of a curve demotes it to a straight line", () => {
    const m = PathModel.fromSvgPathD("M0,0 C5,-5 5,5 10,0");
    const out = m.deleteSubSelection({
      vertices: [],
      segments: [],
      tangents: [
        [0, 0], // ta on vertex 0
        [1, 1], // tb on vertex 1
      ] as ReadonlyArray<readonly [number, 0 | 1]>,
    });
    const seg = PathModel.fromSvgPathD(out.toSvgPathD()).snapshot().segments[0];
    expect(seg.ta).toEqual([0, 0]);
    expect(seg.tb).toEqual([0, 0]);
    expect(verts(out)).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });

  it("preserves untouched segments' verbs on a tangent-only delete (minimal mutation)", () => {
    // An H segment followed by a cubic. Deleting only the cubic's tangents is
    // not a topology change, so the untouched H must keep its authored verb;
    // the cubic auto-demotes to L via emit-time honesty (#880 Codex review).
    const m = PathModel.fromSvgPathD("M0,0 H10 C15,-5 15,5 20,0");
    const out = m.deleteSubSelection({
      vertices: [],
      segments: [],
      tangents: [
        [1, 0], // ta of the cubic (segment whose a === vertex 1)
        [2, 1], // tb of the cubic (segment whose b === vertex 2)
      ] as ReadonlyArray<readonly [number, 0 | 1]>,
    });
    const snap = PathModel.fromSvgPathD(out.toSvgPathD()).snapshot();
    expect(snap.segments[0].source_verb).toBe("H"); // untouched verb survives
    // the cubic's tangents are gone → it demoted to a straight line
    expect(snap.segments[1].source_verb).toBe("L");
    expect(snap.segments[1].ta).toEqual([0, 0]);
    expect(snap.segments[1].tb).toEqual([0, 0]);
  });

  it("empty selection is an identity (geometry unchanged)", () => {
    const m = PathModel.fromSvgPathD(OPEN);
    const out = m.deleteSubSelection({
      vertices: [],
      segments: [],
      tangents: [],
    });
    expect(verts(out)).toEqual([
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
    ]);
  });
});

// ─── Layer 2: delete_vector_subselection (policy + decision) ─────────────────

function make(source: VectorEditSource): {
  session: VectorEditSession;
  model: PathModel;
} {
  const d = source_to_session_d(source);
  return {
    session: new VectorEditSession("n", source, d),
    model: PathModel.fromSvgPathD(d),
  };
}

const TRI: VectorEditSource = {
  kind: "polygon",
  points: [
    [0, 0],
    [10, 0],
    [10, 10],
  ],
};
const QUAD: VectorEditSource = {
  kind: "polygon",
  points: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
};
const POLYLINE3: VectorEditSource = {
  kind: "polyline",
  points: [
    [0, 0],
    [10, 0],
    [20, 0],
  ],
};
const LINE: VectorEditSource = { kind: "line", x1: 0, y1: 0, x2: 10, y2: 0 };

describe("delete_vector_subselection — noop / policy gate", () => {
  it("returns noop when nothing is sub-selected", () => {
    const { session, model } = make(QUAD);
    expect(delete_vector_subselection(session, model, "polygon")).toEqual({
      kind: "noop",
    });
  });

  it("refuses dropping a triangle <polygon> below 3 vertices (restrict)", () => {
    const { session, model } = make(TRI);
    session.set_selection({ vertices: [0], segments: [], tangents: [] });
    expect(delete_vector_subselection(session, model, "polygon")).toEqual({
      kind: "refused",
    });
  });

  it("allows deleting a vertex from a quad <polygon> (stays ≥ 3)", () => {
    const { session, model } = make(QUAD);
    session.set_selection({ vertices: [0], segments: [], tangents: [] });
    const out = delete_vector_subselection(session, model, "polygon");
    expect(out.kind).toBe("deleted");
  });

  it("refuses any vertex deletion on a <line> (must keep exactly 2)", () => {
    const { session, model } = make(LINE);
    session.set_selection({ vertices: [0], segments: [], tangents: [] });
    expect(delete_vector_subselection(session, model, "line")).toEqual({
      kind: "refused",
    });
  });

  it("allows a polyline down to 2 but refuses below it", () => {
    {
      const { session, model } = make(POLYLINE3);
      session.set_selection({ vertices: [1], segments: [], tangents: [] });
      expect(delete_vector_subselection(session, model, "polyline").kind).toBe(
        "deleted"
      );
    }
    {
      const { session, model } = make(POLYLINE3);
      session.set_selection({ vertices: [0, 1], segments: [], tangents: [] });
      expect(delete_vector_subselection(session, model, "polyline")).toEqual({
        kind: "refused",
      });
    }
  });

  it("passes the restrict gate for a segment-only delete (vertex count unchanged)", () => {
    // No vertices selected → the chain can't drop below its minimum, so even
    // a triangle allows deleting an edge (it opens / re-types downstream).
    const { session, model } = make(TRI);
    session.set_selection({ vertices: [], segments: [0], tangents: [] });
    expect(delete_vector_subselection(session, model, "polygon").kind).toBe(
      "deleted"
    );
  });

  it("a <path> always bakes — even deleting every vertex (may collapse to empty)", () => {
    const source: VectorEditSource = { kind: "path", d: "M0,0 L10,0 L20,0" };
    const { session, model } = make(source);
    session.set_selection({ vertices: [0, 1, 2], segments: [], tangents: [] });
    const out = delete_vector_subselection(session, model, "path");
    expect(out.kind).toBe("deleted");
  });
});

// ─── Layer 3: editor command + keymap routing (driver-stubbed) ───────────────

type Internal = {
  set_vector_delete_driver: (fn: (() => boolean) | null) => void;
};

const PATH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path id="p" d="M0,0 L10,0 L20,0 Z"/>
</svg>`;

function internal(editor: ReturnType<typeof createSvgEditor>): Internal {
  return (editor as unknown as { _internal: Internal })._internal;
}

function pathId(editor: ReturnType<typeof createSvgEditor>): string {
  for (const [id, node] of editor.tree().nodes) {
    if (node.tag === "path") return id;
  }
  throw new Error("no <path>");
}

function countTag(
  editor: ReturnType<typeof createSvgEditor>,
  tag: string
): number {
  let n = 0;
  for (const node of editor.tree().nodes.values()) if (node.tag === tag) n++;
  return n;
}

function mkEvent(code: string): KeyboardEvent {
  return {
    code,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
}

describe("commands.delete_vector_selection — delegates to the surface driver", () => {
  it("returns the driver's result (true)", () => {
    const editor = createSvgEditor({ svg: PATH_SVG });
    const driver = vi.fn<() => boolean>(() => true);
    internal(editor).set_vector_delete_driver(driver);
    expect(editor.commands.delete_vector_selection()).toBe(true);
    expect(driver).toHaveBeenCalledOnce();
  });

  it("is a no-op (false) when no surface driver is attached", () => {
    const editor = createSvgEditor({ svg: PATH_SVG });
    expect(editor.commands.delete_vector_selection()).toBe(false);
  });

  it("propagates a driver refusal (false)", () => {
    const editor = createSvgEditor({ svg: PATH_SVG });
    internal(editor).set_vector_delete_driver(() => false);
    expect(editor.commands.delete_vector_selection()).toBe(false);
  });
});

describe("default keymap — Delete / Backspace mode routing (#880)", () => {
  it("Delete removes the selected element in select mode", () => {
    const editor = createSvgEditorWithInternals({ svg: PATH_SVG });
    editor.commands.select(pathId(editor));
    expect(countTag(editor, "path")).toBe(1);
    expect(editor.keymap.dispatch(mkEvent("Delete"))).toBe(true);
    expect(countTag(editor, "path")).toBe(0);
  });

  it("Backspace removes the selected element in select mode", () => {
    const editor = createSvgEditorWithInternals({ svg: PATH_SVG });
    editor.commands.select(pathId(editor));
    expect(editor.keymap.dispatch(mkEvent("Backspace"))).toBe(true);
    expect(countTag(editor, "path")).toBe(0);
  });

  it("vector.delete-vertex is a no-op (false) in select mode", () => {
    const editor = createSvgEditorWithInternals({ svg: PATH_SVG });
    // Even with a driver wired, the command's mode guard rejects in select.
    internal(editor).set_vector_delete_driver(() => true);
    editor.commands.select(pathId(editor));
    expect(editor.commands.invoke("vector.delete-vertex")).toBe(false);
  });

  it("Delete routes to vector.delete-vertex in edit-content mode (element survives)", () => {
    const editor = createSvgEditorWithInternals({ svg: PATH_SVG });
    const driver = vi.fn<() => boolean>(() => true);
    internal(editor).set_vector_delete_driver(driver);
    editor.commands.select(pathId(editor));
    editor.commands.set_mode("edit-content");

    expect(editor.keymap.dispatch(mkEvent("Delete"))).toBe(true);
    expect(driver).toHaveBeenCalledOnce(); // sub-selection delete, not element remove
    expect(countTag(editor, "path")).toBe(1); // element NOT detached
  });

  it("Delete with a driver refusal in edit-content mode leaves the element intact", () => {
    // The chain must NOT fall through to selection.remove (guarded on select
    // mode) — an empty sub-selection / policy refusal is a clean no-op.
    const editor = createSvgEditorWithInternals({ svg: PATH_SVG });
    internal(editor).set_vector_delete_driver(() => false);
    editor.commands.select(pathId(editor));
    editor.commands.set_mode("edit-content");

    expect(editor.keymap.dispatch(mkEvent("Delete"))).toBe(false);
    expect(countTag(editor, "path")).toBe(1);
  });
});
