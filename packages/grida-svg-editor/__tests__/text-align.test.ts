// editor.commands.text_align — headless behavior pinned with a synthetic
// GeometryProvider that models the SVG text-anchor → bbox relationship:
// a line anchored `A` at `x` with rendered width `w` occupies
// `[x − F(A)·w, x + (1−F(A))·w]`, F = {start: 0, middle: .5, end: 1}.
//
// Per-line widths are encoded as a `data-w` attr so the test controls them
// deterministically (a real `getBBox` derives them from font + content —
// out of reach headlessly). Because the provider RE-reads attrs on every
// call, re-measuring after the command proves the rendered bbox is
// preserved, not just that some numbers were written. The same trick
// `align-and-tree.test.ts` uses for align.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";
import type { SvgEditorInternal } from "../src/core/editor";
import type { GeometryProvider } from "../src/core/geometry";
import type { NodeId, Rect } from "../src/types";

const F: Record<string, number> = { start: 0, middle: 0.5, end: 1 };

function viewbox_rect(vb: string | null): Rect | null {
  if (!vb) return null;
  const [x, y, w, h] = vb.split(/[\s,]+/).map(Number);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  return { x, y, width: w, height: h };
}

function union_of_rects(rects: ReadonlyArray<Rect>): Rect {
  const min_x = Math.min(...rects.map((r) => r.x));
  const min_y = Math.min(...rects.map((r) => r.y));
  const max_x = Math.max(...rects.map((r) => r.x + r.width));
  const max_y = Math.max(...rects.map((r) => r.y + r.height));
  return { x: min_x, y: min_y, width: max_x - min_x, height: max_y - min_y };
}

function ids_by_attr(
  editor: ReturnType<typeof createSvgEditor>
): Map<string, NodeId> {
  const out = new Map<string, NodeId>();
  for (const [id] of editor.tree().nodes) {
    const attr_id = editor.document.get_attr(id, "id");
    if (attr_id) out.set(attr_id, id);
  }
  return out;
}

/** Install a text-aware geometry provider. `data-w` = rendered line width;
 *  bbox.x folds in the line's resolved `text-anchor`. */
function install_text_geometry(
  editor: ReturnType<typeof createSvgEditor>
): void {
  const internal = editor as SvgEditorInternal;
  const doc = editor.document;
  const num = (id: NodeId, name: string, fallback = 0) => {
    const raw = doc.get_attr(id, name);
    if (raw == null) return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const anchor_of = (id: NodeId): "start" | "middle" | "end" => {
    let cur: NodeId | null = id;
    while (cur !== null) {
      const a = doc.get_attr(cur, "text-anchor");
      if (a === "start" || a === "middle" || a === "end") return a;
      cur = doc.parent_of(cur);
    }
    return "start";
  };
  const line_bbox = (id: NodeId): Rect => {
    const x = num(id, "x");
    const w = num(id, "data-w");
    return {
      x: x - F[anchor_of(id)] * w,
      y: num(id, "y"),
      width: w,
      height: 16,
    };
  };
  const line_tspans = (text_id: NodeId): NodeId[] =>
    doc
      .element_children_of(text_id)
      .filter(
        (c) => doc.tag_of(c) === "tspan" && doc.get_attr(c, "x") !== null
      );
  const driver: GeometryProvider = {
    bounds_of(id: NodeId): Rect | null {
      const tag = doc.tag_of(id);
      if (tag === "tspan") return line_bbox(id);
      if (tag === "text") {
        const lines = line_tspans(id);
        return lines.length > 0
          ? union_of_rects(lines.map(line_bbox))
          : line_bbox(id);
      }
      if (tag === "svg") return viewbox_rect(doc.get_attr(id, "viewBox"));
      return null;
    },
    bounds_of_many(ids) {
      const out = new Map<NodeId, Rect>();
      for (const id of ids) {
        const r = this.bounds_of(id);
        if (r) out.set(id, r);
      }
      return out;
    },
    nodes_in_rect: () => [],
    node_at_point: () => null,
  };
  internal._internal.set_geometry(driver);
}

function setup(svg: string, opts?: { geometry?: boolean }) {
  const editor = createSvgEditor({ svg });
  if (opts?.geometry !== false) install_text_geometry(editor);
  const ids = ids_by_attr(editor);
  const x = (name: string) => editor.document.get_attr(ids.get(name)!, "x");
  const bbox = (name: string) => editor.geometry!.bounds_of(ids.get(name)!);
  return { editor, ids, x, bbox };
}

// Flat single-run text — the text node is its own line.
const FLAT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text id="t" x="0" y="20" data-w="60">hello</text></svg>`;

// Deck shape — two tspans sharing the block x, different widths.
const DECK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text id="t" x="0" y="20"><tspan id="l1" x="0" dy="0" data-w="60">Hello there</tspan><tspan id="l2" x="0" dy="20" data-w="20">Hi</tspan></text></svg>`;

// Manual per-line indent — tspans with DIFFERENT x. A single block translate
// could not re-justify this; per-line re-anchoring must.
const INDENTED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text id="t" x="0" y="20"><tspan id="l1" x="0" dy="0" data-w="60">Hello there</tspan><tspan id="l2" x="10" dy="20" data-w="20">Hi</tspan></text></svg>`;

describe("editor.commands.text_align — refusals", () => {
  it("refuses without an attached geometry provider", () => {
    const { editor, ids } = setup(FLAT, { geometry: false });
    editor.commands.select(ids.get("t")!);
    expect(editor.commands.text_align("end")).toBe(false);
    expect(editor.state.can_undo).toBe(false);
  });

  it("refuses with no selection", () => {
    const { editor } = setup(FLAT);
    expect(editor.commands.text_align("end")).toBe(false);
  });

  it("refuses when the selection has no <text> in range", () => {
    const { editor } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="r" x="0" y="0" width="10" height="10"/></svg>`
    );
    const ids = ids_by_attr(editor);
    editor.commands.select(ids.get("r")!);
    expect(editor.commands.text_align("end")).toBe(false);
  });

  it("is a no-op when every target already has the requested anchor", () => {
    const { editor, ids } = setup(FLAT);
    editor.commands.select(ids.get("t")!);
    // FLAT defaults to start.
    expect(editor.commands.text_align("start")).toBe(false);
    expect(editor.state.can_undo).toBe(false);
  });

  it("ignores an invalid anchor value", () => {
    const { editor, ids } = setup(FLAT);
    editor.commands.select(ids.get("t")!);
    expect(editor.commands.text_align("left" as never)).toBe(false);
  });
});

describe("editor.commands.text_align — flat text", () => {
  it("start → end re-anchors x and preserves the rendered bbox", () => {
    const { editor, ids, x, bbox } = setup(FLAT);
    const before = bbox("t")!;
    editor.commands.select(ids.get("t")!);
    expect(editor.commands.text_align("end")).toBe(true);
    // anchor written on the block, x moved to the right edge (0 + 1·60).
    expect(editor.document.get_attr(ids.get("t")!, "text-anchor")).toBe("end");
    expect(x("t")).toBe("60");
    const after = bbox("t")!;
    expect(after.x).toBeCloseTo(before.x);
    expect(after.width).toBeCloseTo(before.width);
  });

  it("start → middle anchors x at the block center", () => {
    const { editor, ids, x } = setup(FLAT);
    editor.commands.select(ids.get("t")!);
    expect(editor.commands.text_align("middle")).toBe(true);
    expect(x("t")).toBe("30"); // 0 + 0.5·60
  });
});

describe("editor.commands.text_align — deck (shared x)", () => {
  it("end: every line right-aligns and the block bbox is preserved", () => {
    const { editor, ids, x, bbox } = setup(DECK);
    const before = bbox("t")!;
    editor.commands.select(ids.get("t")!);
    expect(editor.commands.text_align("end")).toBe(true);
    expect(editor.document.get_attr(ids.get("t")!, "text-anchor")).toBe("end");
    // Both lines anchor at the block right edge (width 60).
    expect(x("l1")).toBe("60");
    expect(x("l2")).toBe("60");
    const after = bbox("t")!;
    expect(after.x).toBeCloseTo(before.x);
    expect(after.width).toBeCloseTo(before.width);
  });

  it("middle: every line centers on the block center", () => {
    const { editor, ids, x } = setup(DECK);
    editor.commands.select(ids.get("t")!);
    expect(editor.commands.text_align("middle")).toBe(true);
    expect(x("l1")).toBe("30");
    expect(x("l2")).toBe("30");
  });
});

describe("editor.commands.text_align — manual per-line indent", () => {
  it("re-justifies lines with different x and keeps the block bbox", () => {
    const { editor, ids, x, bbox } = setup(INDENTED);
    const before = bbox("t")!;
    editor.commands.select(ids.get("t")!);
    expect(editor.commands.text_align("end")).toBe(true);
    // l1 (x=0) and l2 (x=10) both collapse onto the block right edge — the
    // shared-x single-translate shortcut would have left l2 at 30.
    expect(x("l1")).toBe("60");
    expect(x("l2")).toBe("60");
    const after = bbox("t")!;
    expect(after.x).toBeCloseTo(before.x);
    expect(after.width).toBeCloseTo(before.width);
  });
});

describe("editor.commands.text_align — selection resolution & abort", () => {
  it("resolves a selected <tspan> to its enclosing <text>", () => {
    const { editor, ids, x } = setup(DECK);
    editor.commands.select(ids.get("l1")!); // a line, not the block
    expect(editor.commands.text_align("end")).toBe(true);
    expect(editor.document.get_attr(ids.get("t")!, "text-anchor")).toBe("end");
    expect(x("l1")).toBe("60");
    expect(x("l2")).toBe("60");
  });

  it("leaves a block untouched when a line uses a per-glyph x list", () => {
    const { editor, ids, x } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text id="t" x="0" y="20"><tspan id="l1" x="0 5 10" dy="0" data-w="60">abc</tspan></text></svg>`
    );
    editor.commands.select(ids.get("t")!);
    expect(editor.commands.text_align("end")).toBe(false);
    expect(x("l1")).toBe("0 5 10");
    expect(editor.state.can_undo).toBe(false);
  });
});

describe("editor.commands.text_align — atomic history", () => {
  it("is ONE history step: a single undo restores byte-equal state", () => {
    const { editor, ids } = setup(DECK);
    editor.commands.select(ids.get("t")!);
    const before = editor.serialize();
    expect(editor.commands.text_align("end")).toBe(true);
    expect(editor.serialize()).not.toBe(before);
    expect(editor.state.can_undo).toBe(true);
    editor.commands.undo();
    expect(editor.serialize()).toBe(before);
    expect(editor.state.can_undo).toBe(false);
  });

  it("multi-block selection collapses into a single undo step", () => {
    const { editor } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><text id="a" x="0" y="20" data-w="40">one</text><text id="b" x="0" y="60" data-w="80">two</text></svg>`
    );
    const ids = ids_by_attr(editor);
    editor.commands.select([ids.get("a")!, ids.get("b")!]);
    const before = editor.serialize();
    expect(editor.commands.text_align("end")).toBe(true);
    expect(editor.document.get_attr(ids.get("a")!, "x")).toBe("40");
    expect(editor.document.get_attr(ids.get("b")!, "x")).toBe("80");
    editor.commands.undo();
    expect(editor.serialize()).toBe(before);
    expect(editor.state.can_undo).toBe(false);
  });
});

describe("editor.commands.text_align — unit / percentage x", () => {
  for (const unit of ["10px", "50%", "2em"]) {
    it(`leaves a block untouched when x is "${unit}" (no unit coercion)`, () => {
      const { editor, ids, x } = setup(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text id="t" x="${unit}" y="20" data-w="60">hi</text></svg>`
      );
      editor.commands.select(ids.get("t")!);
      expect(editor.commands.text_align("end")).toBe(false);
      expect(x("t")).toBe(unit); // unit preserved, not rewritten to a number
      expect(editor.state.can_undo).toBe(false);
    });
  }
});

describe("editor.commands.text_align — mixed direct text + tspan lines", () => {
  it("refuses a <text> that has both a direct run and line-tspans", () => {
    const { editor, ids, x } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text id="t" x="0" y="20" data-w="40">Title<tspan id="l1" x="0" dy="20" data-w="60">Sub</tspan></text></svg>`
    );
    editor.commands.select(ids.get("t")!);
    expect(editor.commands.text_align("end")).toBe(false);
    expect(x("t")).toBe("0");
    expect(x("l1")).toBe("0");
    expect(editor.state.can_undo).toBe(false);
  });
});

describe("editor.commands.text_align — transformed frame", () => {
  it("refuses a block under a rotated ancestor", () => {
    const { editor, ids, x } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g transform="rotate(30)"><text id="t" x="0" y="20" data-w="60">hi</text></g></svg>`
    );
    editor.commands.select(ids.get("t")!);
    expect(editor.commands.text_align("end")).toBe(false);
    expect(x("t")).toBe("0");
    expect(editor.document.get_attr(ids.get("t")!, "text-anchor")).toBe(null);
  });

  it("allows a block under a (axis-aligned) scaled ancestor", () => {
    const { editor, ids, x } = setup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g transform="scale(2)"><text id="t" x="0" y="20" data-w="60">hi</text></g></svg>`
    );
    editor.commands.select(ids.get("t")!);
    expect(editor.commands.text_align("end")).toBe(true);
    expect(x("t")).toBe("60");
  });
});

describe("editor.commands.text_align — preview supersession", () => {
  it("supersedes a live text-anchor preview and computes from committed state", () => {
    const { editor, ids, x } = setup(FLAT);
    editor.commands.select(ids.get("t")!);
    const session = editor.commands.preview_property("text-anchor");
    session.update("middle"); // previews middle on the block
    expect(session.live).toBe(true);

    expect(editor.commands.text_align("end")).toBe(true);
    expect(session.live).toBe(false); // discrete write superseded the preview
    expect(editor.document.get_attr(ids.get("t")!, "text-anchor")).toBe("end");
    // Computed from committed (start) state → 60. Had the preview leaked,
    // f_old would be 0.5 and x would land at 30.
    expect(x("t")).toBe("60");
  });
});
