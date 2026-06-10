// editor.commands.align / select_all / select_sibling — headless behavior
// pinned with a synthetic GeometryProvider derived from rect attrs (the
// same trick `multi-selection.test.ts` uses for resize_to).

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";
import type { SvgEditorInternal } from "../src/core/editor";
import type { GeometryProvider } from "../src/core/geometry";
import { transform, type TransformOp } from "../src/core/transform";
import type { NodeId, Rect, Vec2 } from "../src/types";

/** Parse a `viewBox` attribute into a Rect (`null` when absent/malformed). */
function viewbox_rect(vb: string | null): Rect | null {
  if (!vb) return null;
  const [x, y, w, h] = vb.split(/[\s,]+/).map(Number);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  return { x, y, width: w, height: h };
}

/** AABB union — the shape the real DOM `getBBox` collapses to for a `<g>`. */
function union_of_rects(rects: ReadonlyArray<Rect>): Rect {
  const min_x = Math.min(...rects.map((r) => r.x));
  const min_y = Math.min(...rects.map((r) => r.y));
  const max_x = Math.max(...rects.map((r) => r.x + r.width));
  const max_y = Math.max(...rects.map((r) => r.y + r.height));
  return { x: min_x, y: min_y, width: max_x - min_x, height: max_y - min_y };
}

/** Internal NodeIds keyed by the authored `id` attribute. */
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

function install_rect_geometry(
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
        // viewBox so the root has a stable bbox for single-selection align.
        return viewbox_rect(doc.get_attr(id, "viewBox"));
      }
      if (tag === "g") {
        const kids = doc
          .element_children_of(id)
          .map((kid) => this.bounds_of(kid))
          .filter((b): b is Rect => b !== null);
        return kids.length === 0 ? null : union_of_rects(kids);
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
  internal._internal.set_geometry(driver);
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
  const ids = ids_by_attr(editor);
  return { A: ids.get("A")!, B: ids.get("B")!, C: ids.get("C")! };
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

// ─── align under a transformed <g> ancestor (#795) ──────────────────────────
//
// The flat provider above reads raw attrs as world bounds, so `world ≡ own`
// holds and the world→local projection gap is invisible. This provider is
// faithful to the real DOM driver: `bounds_of` = own bbox × ancestor CTM
// (`getBBox` + `getCTM`), and `world_delta_to_local` inverts the linear
// part of the PARENT's CTM — the frame position attributes are written in.

/** SVG 2×3 affine as the spec's `[a b c d e f]` column order:
 *  point (x, y) ↦ (a·x + c·y + e, b·x + d·y + f). */
type Mat = readonly [number, number, number, number, number, number];
const MAT_IDENT: Mat = [1, 0, 0, 1, 0, 0];

function mat_mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function op_mat(op: TransformOp): Mat {
  switch (op.type) {
    case "matrix":
      return [op.a, op.b, op.c, op.d, op.e, op.f];
    case "translate":
      return [1, 0, 0, 1, op.tx, op.ty];
    case "scale":
      return [op.sx, 0, 0, op.sy, 0, 0];
    case "rotate": {
      // rotate(θ cx cy) ≡ translate(cx cy) rotate(θ) translate(-cx -cy)
      const t = (op.angle * Math.PI) / 180;
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      return mat_mul(
        mat_mul([1, 0, 0, 1, op.cx, op.cy], [cos, sin, -sin, cos, 0, 0]),
        [1, 0, 0, 1, -op.cx, -op.cy]
      );
    }
    case "skewX":
    case "skewY":
      // Unused by these fixtures — fail fast rather than silently model
      // wrong geometry with an identity fallback.
      throw new Error(`op_mat: unsupported transform op "${op.type}"`);
  }
}

/** AABB of `r`'s four corners under `m` — what `getBBox` × `getCTM`
 *  collapses to. */
function mat_project_rect(r: Rect, m: Mat): Rect {
  const corners: ReadonlyArray<readonly [number, number]> = [
    [r.x, r.y],
    [r.x + r.width, r.y],
    [r.x, r.y + r.height],
    [r.x + r.width, r.y + r.height],
  ];
  const pts = corners.map(([x, y]) => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const min_x = Math.min(...xs);
  const min_y = Math.min(...ys);
  return {
    x: min_x,
    y: min_y,
    width: Math.max(...xs) - min_x,
    height: Math.max(...ys) - min_y,
  };
}

function install_ctm_geometry(
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
  // CTM from root user space down to `id`'s frame. `include_own` folds
  // the node's own `transform` (bounds path); without it the result is
  // the PARENT frame — the space `x`/`y` and a leading translate live in.
  const ctm_of = (id: NodeId, include_own: boolean): Mat => {
    const chain: NodeId[] = [];
    let cur: NodeId | null = include_own ? id : doc.parent_of(id);
    while (cur !== null) {
      chain.unshift(cur);
      cur = doc.parent_of(cur);
    }
    let m = MAT_IDENT;
    for (const node of chain) {
      const ops = transform.parse(doc.get_attr(node, "transform"));
      if (!ops) continue;
      for (const op of ops) m = mat_mul(m, op_mat(op));
    }
    return m;
  };
  const driver: GeometryProvider = {
    bounds_of(id: NodeId): Rect | null {
      const tag = doc.tag_of(id);
      if (tag === "rect") {
        const local = {
          x: num(id, "x"),
          y: num(id, "y"),
          width: num(id, "width"),
          height: num(id, "height"),
        };
        return mat_project_rect(local, ctm_of(id, true));
      }
      if (tag === "svg") {
        return viewbox_rect(doc.get_attr(id, "viewBox"));
      }
      if (tag === "g") {
        // Children's world bounds already fold the g's own transform.
        const kids = doc
          .element_children_of(id)
          .map((kid) => this.bounds_of(kid))
          .filter((b): b is Rect => b !== null);
        return kids.length === 0 ? null : union_of_rects(kids);
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
    world_delta_to_local(id: NodeId, delta: Vec2): Vec2 {
      const m = ctm_of(id, false);
      const det = m[0] * m[3] - m[2] * m[1];
      if (!Number.isFinite(det) || det === 0) return delta;
      return {
        x: (m[3] * delta.x - m[2] * delta.y) / det,
        y: (-m[1] * delta.x + m[0] * delta.y) / det,
      };
    },
  };
  internal._internal.set_geometry(driver);
}

// The issue's minimal reproduction: two rects under <g transform="scale(2)">.
// Pre-fix, align wrote world deltas into own-frame attrs — a 2× overshoot
// the next align corrected in the opposite direction, forever.
const SCALED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<g transform="scale(2)">
<rect id="A" x="0"  y="0" width="10" height="10"/>
<rect id="B" x="40" y="0" width="10" height="10"/>
</g>
</svg>`;

describe("editor.commands.align — transformed <g> ancestor (#795)", () => {
  it("scale(2) ancestor: lands exactly and the second align is a no-op", () => {
    const editor = createSvgEditor({ svg: SCALED_SVG });
    install_ctm_geometry(editor);
    const ids = ids_by_attr(editor);
    const A = ids.get("A")!;
    const B = ids.get("B")!;
    editor.commands.select([A, B]);

    // World bboxes: A=(0,0,20,20), B=(80,0,20,20) → union center.x = 50.
    // A needs +40 world = +20 local; B needs -40 world = -20 local.
    expect(editor.commands.align("horizontal_centers")).toBe(true);
    expect(editor.document.get_attr(A, "x")).toBe("20");
    expect(editor.document.get_attr(B, "x")).toBe("20");

    // Idempotent: every member is already at the target → zero deltas →
    // align refuses. Pre-fix this oscillated A↔B forever.
    const settled = editor.serialize();
    expect(editor.commands.align("horizontal_centers")).toBe(false);
    expect(editor.serialize()).toBe(settled);
  });

  it("scale(2) ancestor: align left converges in one step", () => {
    const editor = createSvgEditor({ svg: SCALED_SVG });
    install_ctm_geometry(editor);
    const ids = ids_by_attr(editor);
    const A = ids.get("A")!;
    const B = ids.get("B")!;
    editor.commands.select([A, B]);

    // Union left edge is A's (world x=0). B moves -80 world = -40 local.
    expect(editor.commands.align("left")).toBe(true);
    expect(editor.document.get_attr(A, "x")).toBe("0");
    expect(editor.document.get_attr(B, "x")).toBe("0");
    expect(editor.commands.align("left")).toBe(false);
  });

  it("rotated ancestor: align settles instead of spiraling", () => {
    // 90° rotation written as an exact integer matrix so the projected
    // deltas stay bit-exact (rotate(θ) for θ ∤ 90 leaves float residue
    // that would make the strict no-op assertion flaky).
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<g transform="matrix(0 1 -1 0 0 0)">
<rect id="A" x="0"  y="0" width="10" height="10"/>
<rect id="B" x="40" y="0" width="10" height="10"/>
</g>
</svg>`,
    });
    install_ctm_geometry(editor);
    const ids = ids_by_attr(editor);
    const A = ids.get("A")!;
    const B = ids.get("B")!;
    editor.commands.select([A, B]);

    // World bboxes: A=(-10,0,10,10), B=(-10,40,10,10) → union center.y=25.
    // The world deltas are purely vertical (±20), but under the 90°
    // ancestor they land on the members' local X axis: both x → 20.
    // Pre-fix, writing the world dy into own-frame y moved the members
    // horizontally in world space — never converging.
    expect(editor.commands.align("vertical_centers")).toBe(true);
    expect(editor.document.get_attr(A, "x")).toBe("20");
    expect(editor.document.get_attr(B, "x")).toBe("20");

    const settled = editor.serialize();
    expect(editor.commands.align("vertical_centers")).toBe(false);
    expect(editor.serialize()).toBe(settled);
  });

  it("single selection under a scaled <g>: aligns to the group, idempotent", () => {
    const editor = createSvgEditor({ svg: SCALED_SVG });
    install_ctm_geometry(editor);
    const ids = ids_by_attr(editor);
    const A = ids.get("A")!;
    editor.commands.select(A);

    // Parent <g> world bbox = (0,0,100,20). A's world right edge (20)
    // → 100 needs +80 world = +40 local → x = 40.
    expect(editor.commands.align("right")).toBe(true);
    expect(editor.document.get_attr(A, "x")).toBe("40");
    expect(editor.commands.align("right")).toBe(false);
  });

  it("undo restores byte-equal pre-align state under a scaled ancestor", () => {
    const editor = createSvgEditor({ svg: SCALED_SVG });
    install_ctm_geometry(editor);
    const ids = ids_by_attr(editor);
    editor.commands.select([ids.get("A")!, ids.get("B")!]);
    const before = editor.serialize();
    editor.commands.align("horizontal_centers");
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
