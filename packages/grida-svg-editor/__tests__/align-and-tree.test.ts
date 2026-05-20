// editor.commands.align / select_all / select_sibling — headless behavior
// pinned with a synthetic GeometryProvider derived from rect attrs (the
// same trick `multi-selection.test.ts` uses for resize_to).

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";
import type { GeometryProvider } from "../src/core/geometry";
import type { NodeId, Rect } from "../src/types";

function install_rect_geometry(
  editor: ReturnType<typeof createSvgEditor>
): void {
  const doc = editor.document;
  const num = (id: NodeId, name: string, fallback = 0) => {
    const raw = doc.get_attr(id, name);
    if (raw == null) return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const driver: GeometryProvider = {
    bounds_of(id: NodeId): Rect | null {
      const tag = doc.tag_of(id);
      if (tag === "rect") {
        return {
          x: num(id, "x"),
          y: num(id, "y"),
          width: num(id, "width"),
          height: num(id, "height"),
        };
      }
      if (tag === "svg") {
        // Parse the viewBox so the root has a stable bbox for single-
        // selection align tests.
        const vb = doc.get_attr(id, "viewBox");
        if (vb) {
          const [x, y, w, h] = vb.split(/[\s,]+/).map(Number);
          if ([x, y, w, h].every(Number.isFinite)) {
            return { x, y, width: w, height: h };
          }
        }
        return null;
      }
      if (tag === "g") {
        // Union of element children — same shape the real DOM `getBBox`
        // collapses to for a `<g>`.
        const kids = doc
          .element_children_of(id)
          .map((kid) => this.bounds_of(kid))
          .filter((b): b is Rect => b !== null);
        if (kids.length === 0) return null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const r of kids) {
          if (r.x < minX) minX = r.x;
          if (r.y < minY) minY = r.y;
          if (r.x + r.width > maxX) maxX = r.x + r.width;
          if (r.y + r.height > maxY) maxY = r.y + r.height;
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }
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
  editor._internal.set_geometry(driver);
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<rect id="A" x="0"  y="0"  width="10" height="10"/>
<rect id="B" x="50" y="30" width="40" height="20"/>
<rect id="C" x="80" y="70" width="10" height="5"/>
</svg>`;

function rect_ids(editor: ReturnType<typeof createSvgEditor>): {
  A: NodeId;
  B: NodeId;
  C: NodeId;
} {
  const tree = editor.tree();
  const by_id_attr = new Map<string, NodeId>();
  for (const [id] of tree.nodes) {
    const attr_id = editor.document.get_attr(id, "id");
    if (attr_id) by_id_attr.set(attr_id, id);
  }
  return {
    A: by_id_attr.get("A")!,
    B: by_id_attr.get("B")!,
    C: by_id_attr.get("C")!,
  };
}

// ─── align ───────────────────────────────────────────────────────────────────

describe("editor.commands.align", () => {
  it("refuses without an attached geometry provider", () => {
    const editor = createSvgEditor({ svg: SVG });
    const { A, B } = rect_ids(editor);
    editor.commands.select([A, B]);
    expect(editor.commands.align("left")).toBe(false);
  });

  it("refuses with no selection", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_rect_geometry(editor);
    expect(editor.commands.align("left")).toBe(false);
  });

  it("single selection → aligns to parent (svg viewport)", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_rect_geometry(editor);
    const { A } = rect_ids(editor);
    editor.commands.select(A);
    // A is at (0,0,10,10); parent <svg viewBox="0 0 200 200">.
    // Align right → x = 200 - 10 = 190.
    expect(editor.commands.align("right")).toBe(true);
    expect(editor.document.get_attr(A, "x")).toBe("190");
  });

  it("single selection on root → refuses (no parent to align to)", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_rect_geometry(editor);
    // Force-select the root.
    editor.commands.select(editor.tree().root);
    expect(editor.commands.align("left")).toBe(false);
  });

  it("align left → all rect x land at union.x", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_rect_geometry(editor);
    const { A, B, C } = rect_ids(editor);
    editor.commands.select([A, B, C]);
    expect(editor.commands.align("left")).toBe(true);
    const doc = editor.document;
    expect(doc.get_attr(A, "x")).toBe("0");
    expect(doc.get_attr(B, "x")).toBe("0");
    expect(doc.get_attr(C, "x")).toBe("0");
  });

  it("align bottom → all rect bottoms land at union.bottom", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_rect_geometry(editor);
    const { A, B, C } = rect_ids(editor);
    editor.commands.select([A, B, C]);
    expect(editor.commands.align("bottom")).toBe(true);
    const doc = editor.document;
    // union.bottom = 75; A height=10 → y=65; B height=20 → y=55; C height=5 → y=70
    expect(doc.get_attr(A, "y")).toBe("65");
    expect(doc.get_attr(B, "y")).toBe("55");
    expect(doc.get_attr(C, "y")).toBe("70");
  });

  it("align horizontal_centers → all center.x match union center.x", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_rect_geometry(editor);
    const { A, B, C } = rect_ids(editor);
    editor.commands.select([A, B, C]);
    expect(editor.commands.align("horizontal_centers")).toBe(true);
    const doc = editor.document;
    // union center.x = 45. A center.x = x + 5 → x = 40.
    expect(doc.get_attr(A, "x")).toBe("40");
    // B center.x = x + 20 → x = 25.
    expect(doc.get_attr(B, "x")).toBe("25");
    // C center.x = x + 5 → x = 40.
    expect(doc.get_attr(C, "x")).toBe("40");
  });

  it("undo restores byte-equal pre-align state", () => {
    const editor = createSvgEditor({ svg: SVG });
    install_rect_geometry(editor);
    const { A, B, C } = rect_ids(editor);
    editor.commands.select([A, B, C]);
    const before = editor.serialize();
    editor.commands.align("right");
    expect(editor.serialize()).not.toBe(before);
    editor.commands.undo();
    expect(editor.serialize()).toBe(before);
  });
});

// ─── tree navigation ────────────────────────────────────────────────────────

describe("editor.commands.select_all", () => {
  it("selects all element children of root", () => {
    const editor = createSvgEditor({ svg: SVG });
    const { A, B, C } = rect_ids(editor);
    expect(editor.commands.select_all()).toBe(true);
    expect(editor.state.selection).toEqual([A, B, C]);
  });

  it("returns false on an empty scope", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"/>`,
    });
    expect(editor.commands.select_all()).toBe(false);
    expect(editor.state.selection.length).toBe(0);
  });
});

describe("editor.commands.select_sibling", () => {
  it("from single selection, Tab → next; Shift+Tab → prev", () => {
    const editor = createSvgEditor({ svg: SVG });
    const { B, C } = rect_ids(editor);
    editor.commands.select(B);
    expect(editor.commands.select_sibling("next")).toBe(true);
    expect(editor.state.selection).toEqual([C]);
    expect(editor.commands.select_sibling("prev")).toBe(true);
    expect(editor.state.selection).toEqual([B]);
  });

  it("wraps at edges", () => {
    const editor = createSvgEditor({ svg: SVG });
    const { A, C } = rect_ids(editor);
    editor.commands.select(C);
    expect(editor.commands.select_sibling("next")).toBe(true);
    expect(editor.state.selection).toEqual([A]);
    expect(editor.commands.select_sibling("prev")).toBe(true);
    expect(editor.state.selection).toEqual([C]);
  });

  it("from empty selection, Tab → first child; Shift+Tab → last child", () => {
    const editor = createSvgEditor({ svg: SVG });
    const { A, C } = rect_ids(editor);
    expect(editor.commands.select_sibling("next")).toBe(true);
    expect(editor.state.selection).toEqual([A]);
    editor.commands.deselect();
    expect(editor.commands.select_sibling("prev")).toBe(true);
    expect(editor.state.selection).toEqual([C]);
  });
});
