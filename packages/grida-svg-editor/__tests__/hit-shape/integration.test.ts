// End-to-end-ish coverage: real SVG → SvgDocument → hit_shape_of_doc →
// pick_at_world. No DOM surface mount (jsdom + canvas peer dep is
// unreliable in this monorepo per presets-keynote.test.ts comment).
// Exercises the document attribute pipeline + path-d approximation +
// picker integration in one shot.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../../src/index";
import { pick_at_world, type HitShape } from "../../src/core/hit-shape";
import {
  hit_shape_of_doc,
  is_transparent_tag,
  path_control_polyline,
} from "../../src/core/hit-shape-svg";
import type { NodeId, Rect, Vec2 } from "../../src/types";

/** Mirrors `SvgHitShapeDriver` in dom.ts — intrinsic shape, then
 *  bounds-rect fallback for non-transparent tags. Keeps the integration
 *  test in lockstep with the production driver without needing a real
 *  DOM surface mount. */
function make_hit_shape_of(
  doc: ReturnType<typeof internalDoc>,
  fake_bounds: Map<NodeId, Rect>
) {
  return (id: NodeId): HitShape | null => {
    const intrinsic = hit_shape_of_doc(doc, id);
    if (intrinsic) return intrinsic;
    if (is_transparent_tag(doc.tag_of(id))) return null;
    const b = fake_bounds.get(id);
    if (!b) return null;
    return { kind: "rect", x: b.x, y: b.y, width: b.width, height: b.height };
  };
}

function internalDoc(editor: ReturnType<typeof createSvgEditor>) {
  return (
    editor as unknown as {
      _internal: { doc: import("../../src/core/document").SvgDocument };
    }
  )._internal.doc;
}

// Rough bbox of a HitShape for picker pre-filter; the picker normally
// uses GeometryProvider.bounds_of, but the integration test doesn't have
// a live DOM, so we compute a coarse AABB from attributes.
function bbox_for(
  doc: ReturnType<typeof internalDoc>,
  id: NodeId
): Rect | null {
  const tag = doc.tag_of(id);
  const num = (n: string) => parseFloat(doc.get_attr(id, n) ?? "0");
  switch (tag) {
    case "rect":
      return {
        x: num("x"),
        y: num("y"),
        width: num("width"),
        height: num("height"),
      };
    case "circle": {
      const r = num("r");
      return {
        x: num("cx") - r,
        y: num("cy") - r,
        width: 2 * r,
        height: 2 * r,
      };
    }
    case "line": {
      const x1 = num("x1");
      const y1 = num("y1");
      const x2 = num("x2");
      const y2 = num("y2");
      return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      };
    }
    case "path": {
      const pts = path_control_polyline(doc.get_attr(id, "d") ?? "");
      if (pts.length === 0) return null;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    }
    default:
      return null;
  }
}

describe("hit-shape integration", () => {
  it("derives HitShape from <rect>/<line> attributes", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect id="r1" x="10" y="20" width="30" height="40"/>
        <line id="l1" x1="0" y1="0" x2="100" y2="0"/>
      </svg>`,
    });
    const doc = internalDoc(editor);
    let rect_id: NodeId | null = null;
    let line_id: NodeId | null = null;
    for (const id of doc.all_elements()) {
      if (doc.tag_of(id) === "rect") rect_id = id;
      if (doc.tag_of(id) === "line") line_id = id;
    }
    expect(hit_shape_of_doc(doc, rect_id!)).toEqual({
      kind: "rect",
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    });
    expect(hit_shape_of_doc(doc, line_id!)).toEqual({
      kind: "segment",
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
    });
  });

  it("rotated <rect> returns a 4-corner polygon in post-transform space", () => {
    // Closes the silent AABB downgrade: previously every node with a
    // `transform=` fell through to padded AABB. The Layer 1 transform
    // parser lets the hit-shape backend compose rotation directly.
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect id="r1" x="10" y="10" width="20" height="20" transform="rotate(45)"/>
      </svg>`,
    });
    const doc = internalDoc(editor);
    const id = doc.all_elements().find((e) => doc.tag_of(e) === "rect")!;
    const shape = hit_shape_of_doc(doc, id);
    expect(shape?.kind).toBe("polygon");
    const polygon = shape as Extract<typeof shape, { kind: "polygon" }>;
    expect(polygon.closed).toBe(true);
    expect(polygon.pts).toHaveLength(4);
    // The 45° rotation around (0,0) of (10,10) lands on (0, √200) ≈ (0, 14.14).
    expect(polygon.pts[0].x).toBeCloseTo(0, 4);
    expect(polygon.pts[0].y).toBeCloseTo(Math.sqrt(200), 4);
  });

  it("mixed transforms still fall back to bounds-rect via driver", () => {
    // `matrix(...)` classifies as mixed → null → driver fills AABB.
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect id="r1" x="10" y="10" width="20" height="20" transform="matrix(1 0 0 1 5 5)"/>
      </svg>`,
    });
    const doc = internalDoc(editor);
    const id = doc.all_elements().find((e) => doc.tag_of(e) === "rect")!;
    expect(hit_shape_of_doc(doc, id)).toBeNull();
    const world_bounds: Rect = { x: 15, y: 15, width: 20, height: 20 };
    const hit_shape_of = make_hit_shape_of(doc, new Map([[id, world_bounds]]));
    expect(hit_shape_of(id)).toEqual({
      kind: "rect",
      x: 15,
      y: 15,
      width: 20,
      height: 20,
    });
  });

  it("transparent tags (<g>, <defs>) report null even with bounds", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <g id="grp"><rect x="0" y="0" width="10" height="10"/></g>
      </svg>`,
    });
    const doc = internalDoc(editor);
    const g_id = doc.all_elements().find((e) => doc.tag_of(e) === "g")!;
    const hit_shape_of = make_hit_shape_of(
      doc,
      new Map([[g_id, { x: 0, y: 0, width: 10, height: 10 }]])
    );
    expect(hit_shape_of(g_id)).toBeNull();
  });

  it("text gets a bounds-rect hit-shape (the editor norm — bbox is the click target)", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
        <text x="20" y="50">Hello</text>
      </svg>`,
    });
    const doc = internalDoc(editor);
    const id = doc.all_elements().find((e) => doc.tag_of(e) === "text")!;
    expect(hit_shape_of_doc(doc, id)).toBeNull();
    const text_bbox: Rect = { x: 20, y: 38, width: 50, height: 16 };
    const hit_shape_of = make_hit_shape_of(doc, new Map([[id, text_bbox]]));
    expect(hit_shape_of(id)).toEqual({
      kind: "rect",
      x: 20,
      y: 38,
      width: 50,
      height: 16,
    });
  });

  it("regression: thin line on top of a background rect — picker prefers the line within tolerance", () => {
    // Mirrors the slides fixture stacking case: the background rect is
    // painted first and contains every point in the viewBox; the line is
    // painted on top. A click 3 px from the line should select the line,
    // NOT the background rect, even though the rect "contains" the point
    // at zero distance.
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
        <rect width="1920" height="1080" fill="#FAFAFA"/>
        <line x1="160" y1="160" x2="420" y2="160" stroke="#0F5647" stroke-width="2"/>
      </svg>`,
    });
    const doc = internalDoc(editor);
    const ids = doc.all_elements().filter((id) => id !== doc.root);
    const line_id = ids.find((id) => doc.tag_of(id) === "line")!;
    const rect_id = ids.find((id) => doc.tag_of(id) === "rect")!;
    const hit_shape_of = make_hit_shape_of(doc, new Map());
    const opts = {
      tolerance_world: 4,
      ordered_ids: ids,
      bounds_of: (id: NodeId) => bbox_for(doc, id),
      hit_shape_of,
    };
    // 3 px below the line.
    expect(pick_at_world({ x: 290, y: 163 }, opts)).toBe(line_id);
    // Dead-center inside the rect, far from the line — picks the rect.
    expect(pick_at_world({ x: 960, y: 540 }, opts)).toBe(rect_id);
    // 6 px below the line — past tolerance — picks the rect under it.
    expect(pick_at_world({ x: 290, y: 166 }, opts)).toBe(rect_id);
  });

  it("path control polyline picks up L / Q / C control points", () => {
    // M0,0 L10,0 Q15,5 10,10 C12,12 8,12 0,0 z
    const pts = path_control_polyline(
      "M0,0 L10,0 Q15,5 10,10 C12,12 8,12 0,0 z"
    );
    // After toAbs(): expect endpoints + Q control + C control1/control2.
    // At minimum, must include (0,0), (10,0), (15,5), (10,10), the two
    // C controls (12,12) (8,12), and the closing (0,0).
    const has = (x: number, y: number) =>
      pts.some((p) => p.x === x && p.y === y);
    expect(has(10, 0)).toBe(true); // L endpoint
    expect(has(15, 5)).toBe(true); // Q control
    expect(has(10, 10)).toBe(true); // Q endpoint
    expect(has(12, 12)).toBe(true); // C control 1
    expect(has(8, 12)).toBe(true); // C control 2
  });

  it("fat-hit selects a 1-px line within tolerance (zoom = 1)", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <line id="thin" x1="50" y1="100" x2="150" y2="100" stroke="black"/>
      </svg>`,
    });
    const doc = internalDoc(editor);
    const ids = doc.all_elements().filter((id) => doc.tag_of(id) === "line");
    const ordered_ids = ids;
    const opts = {
      tolerance_world: 4,
      ordered_ids,
      bounds_of: (id: NodeId) => bbox_for(doc, id),
      hit_shape_of: (id: NodeId) => hit_shape_of_doc(doc, id),
    };
    // 4px above the line — should hit.
    expect(pick_at_world({ x: 100, y: 96 }, opts)).toBe(ids[0]);
    // 6px above the line — should miss.
    expect(pick_at_world({ x: 100, y: 94 }, opts)).toBeNull();
  });

  it("tolerance = 0 falls back to elementFromPoint exact-only (picker returns null on near-miss)", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <line id="thin" x1="50" y1="100" x2="150" y2="100"/>
      </svg>`,
    });
    const doc = internalDoc(editor);
    const ids = doc.all_elements().filter((id) => doc.tag_of(id) === "line");
    const opts = {
      tolerance_world: 0,
      ordered_ids: ids,
      bounds_of: (id: NodeId) => bbox_for(doc, id),
      hit_shape_of: (id: NodeId) => hit_shape_of_doc(doc, id),
    };
    // Even 1 px away misses with zero tolerance.
    expect(pick_at_world({ x: 100, y: 99 }, opts)).toBeNull();
    // Exactly on the line is fine.
    expect(pick_at_world({ x: 100, y: 100 }, opts)).toBe(ids[0]);
  });

  it("zoom stability: tolerance_world scales inversely with zoom so screen-px feel is constant", () => {
    // The fat-hit conversion is `tolerance_world = tolerance_px / zoom`.
    // At zoom = 2 (zoomed in 2×), 4 screen-px ≡ 2 world-units. The
    // picker should still pick the line when the click is 2 world-units
    // away.
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <line id="thin" x1="50" y1="100" x2="150" y2="100"/>
      </svg>`,
    });
    const doc = internalDoc(editor);
    const ids = doc.all_elements().filter((id) => doc.tag_of(id) === "line");

    function pick_at_zoom(zoom: number, click_screen: Vec2): NodeId | null {
      const tolerance_px = 4;
      // Inverse of the surface's conversion: simulate the picker's input.
      const tolerance_world = tolerance_px / zoom;
      // For this test we don't model camera translation; the click is
      // already provided in world coords. We're isolating the tolerance
      // scaling.
      return pick_at_world(click_screen, {
        tolerance_world,
        ordered_ids: ids,
        bounds_of: (id) => bbox_for(doc, id),
        hit_shape_of: (id) => hit_shape_of_doc(doc, id),
      });
    }

    // At zoom = 1 (4-world tolerance): click 4 world-units away hits.
    expect(pick_at_zoom(1, { x: 100, y: 96 })).toBe(ids[0]);
    // At zoom = 2 (2-world tolerance): click 4 world-units away MISSES
    // (because 4 world > 2 world tolerance). 2 world-units away hits.
    expect(pick_at_zoom(2, { x: 100, y: 96 })).toBeNull();
    expect(pick_at_zoom(2, { x: 100, y: 98 })).toBe(ids[0]);
    // At zoom = 0.5 (8-world tolerance): even 7 world-units away hits.
    expect(pick_at_zoom(0.5, { x: 100, y: 93 })).toBe(ids[0]);
  });
});
