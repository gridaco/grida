// Pure-intent tests against the in-memory SvgDocument.
//
// These exercise the per-element translate / resize / line-endpoint math
// directly, without spinning up an editor. They're the regression net for
// the per-element capability modules.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import { resize_pipeline } from "../src/core/resize-pipeline";
import {
  translate_pipeline,
  type TranslateBaseline,
} from "../src/core/translate-pipeline";

function with_rect(attrs: Record<string, string | number>): {
  doc: SvgDocument;
  rect_id: string;
} {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  const doc = new SvgDocument(
    `<svg xmlns="http://www.w3.org/2000/svg"><rect ${a}/></svg>`
  );
  const rect_id = doc.element_children_of(doc.root)[0];
  return { doc, rect_id };
}

describe("compose_leading_translate", () => {
  it("returns null for zero delta on empty input", () => {
    expect(
      translate_pipeline.intent.compose_leading_translate("", 0, 0)
    ).toBeNull();
  });

  it("emits a translate when existing is empty", () => {
    expect(translate_pipeline.intent.compose_leading_translate("", 5, 10)).toBe(
      "translate(5 10)"
    );
  });

  it("merges into a leading translate without growing the string", () => {
    expect(
      translate_pipeline.intent.compose_leading_translate(
        "translate(10 20)",
        5,
        7
      )
    ).toBe("translate(15 27)");
  });

  it("merges with leading translate even when other ops follow", () => {
    expect(
      translate_pipeline.intent.compose_leading_translate(
        "translate(10 20) rotate(30)",
        5,
        7
      )
    ).toBe("translate(15 27) rotate(30)");
  });

  it("prepends when leading op is not translate", () => {
    expect(
      translate_pipeline.intent.compose_leading_translate("rotate(30)", 5, 7)
    ).toBe("translate(5 7) rotate(30)");
  });
});

describe("apply_translate", () => {
  it("translates a rect by writing x/y intrinsics", () => {
    const { doc, rect_id } = with_rect({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
    const baseline = translate_pipeline.intent.capture_baseline(doc, rect_id);
    translate_pipeline.intent.apply(doc, rect_id, baseline, 5, 7);
    expect(doc.get_attr(rect_id, "x")).toBe("15");
    expect(doc.get_attr(rect_id, "y")).toBe("27");
    expect(doc.get_attr(rect_id, "width")).toBe("100");
    expect(doc.get_attr(rect_id, "height")).toBe("50");
  });

  it("translates a circle via cx/cy", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="100" r="50"/></svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    translate_pipeline.intent.apply(
      doc,
      id,
      translate_pipeline.intent.capture_baseline(doc, id),
      -30,
      40
    );
    expect(doc.get_attr(id, "cx")).toBe("70");
    expect(doc.get_attr(id, "cy")).toBe("140");
  });

  it("groups translate via transform attribute and never bloat across drags", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(60 80)"/></svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    let baseline = translate_pipeline.intent.capture_baseline(doc, id);
    translate_pipeline.intent.apply(doc, id, baseline, 10, 0);
    expect(doc.get_attr(id, "transform")).toBe("translate(70 80)");
    baseline = translate_pipeline.intent.capture_baseline(doc, id);
    translate_pipeline.intent.apply(doc, id, baseline, 10, 0);
    expect(doc.get_attr(id, "transform")).toBe("translate(80 80)");
    baseline = translate_pipeline.intent.capture_baseline(doc, id);
    translate_pipeline.intent.apply(doc, id, baseline, 10, 0);
    expect(doc.get_attr(id, "transform")).toBe("translate(90 80)");
  });

  it("rotated group stays bounded at one extra term", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg"><g transform="rotate(20)"/></svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    translate_pipeline.intent.apply(
      doc,
      id,
      translate_pipeline.intent.capture_baseline(doc, id),
      10,
      0
    );
    expect(doc.get_attr(id, "transform")).toBe("translate(10 0) rotate(20)");
    translate_pipeline.intent.apply(
      doc,
      id,
      translate_pipeline.intent.capture_baseline(doc, id),
      10,
      0
    );
    expect(doc.get_attr(id, "transform")).toBe("translate(20 0) rotate(20)");
  });
});

describe("compute_resize_factors", () => {
  const baseline = {
    bbox: { x: 0, y: 0, width: 100, height: 50 },
    attrs: { kind: "rect" as const, x: 0, y: 0, w: 100, h: 50 },
  };

  it("se drag scales positive from nw anchor", () => {
    const f = resize_pipeline.intent.compute_factors(
      baseline,
      "se",
      50,
      25,
      false
    );
    expect(f.sx).toBeCloseTo(1.5, 5);
    expect(f.sy).toBeCloseTo(1.5, 5);
    expect(f.origin).toEqual({ x: 0, y: 0 });
  });

  it("east edge handle only affects x", () => {
    const f = resize_pipeline.intent.compute_factors(
      baseline,
      "e",
      30,
      999,
      false
    );
    expect(f.sx).toBeCloseTo(1.3, 5);
    expect(f.sy).toBe(1);
  });

  it("shift on corner locks aspect to max", () => {
    const f = resize_pipeline.intent.compute_factors(
      baseline,
      "se",
      20,
      5,
      true
    );
    expect(f.sx).toBeCloseTo(1.2, 5);
    expect(f.sy).toBeCloseTo(1.2, 5);
  });
});

describe("apply_resize", () => {
  it("scales a rect's x/y/width/height around the given origin", () => {
    const { doc, rect_id } = with_rect({
      x: 10,
      y: 10,
      width: 100,
      height: 50,
    });
    const baseline = resize_pipeline.intent.capture_baseline(doc, rect_id, {
      x: 10,
      y: 10,
      width: 100,
      height: 50,
    });
    resize_pipeline.intent.apply(doc, rect_id, baseline, 2, 2, {
      x: 10,
      y: 10,
    });
    expect(doc.get_attr(rect_id, "x")).toBe("10");
    expect(doc.get_attr(rect_id, "y")).toBe("10");
    expect(doc.get_attr(rect_id, "width")).toBe("200");
    expect(doc.get_attr(rect_id, "height")).toBe("100");
  });

  it("clamps circle to uniform scale via min(sx, sy)", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="20"/></svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    const baseline = resize_pipeline.intent.capture_baseline(doc, id, {
      x: 30,
      y: 30,
      width: 40,
      height: 40,
    });
    resize_pipeline.intent.apply(doc, id, baseline, 3, 2, { x: 0, y: 0 });
    expect(doc.get_attr(id, "r")).toBe("40");
  });
});

/** Compute a local-frame point's doc-space position by applying the rect's
 *  current `transform="rotate(θ cx cy)"`. The rotate-then-translate desugaring
 *  per SVG 1.1 §7.6: `rotate(θ cx cy) ≡ translate(cx, cy) rotate(θ) translate(-cx, -cy)`. */
function rect_corner_in_doc(
  doc: SvgDocument,
  id: string,
  corner: "nw" | "ne" | "sw" | "se"
): { x: number; y: number } {
  const x = parseFloat(doc.get_attr(id, "x") ?? "0");
  const y = parseFloat(doc.get_attr(id, "y") ?? "0");
  const w = parseFloat(doc.get_attr(id, "width") ?? "0");
  const h = parseFloat(doc.get_attr(id, "height") ?? "0");
  const local = {
    nw: { x, y },
    ne: { x: x + w, y },
    sw: { x, y: y + h },
    se: { x: x + w, y: y + h },
  }[corner];
  const transform = doc.get_attr(id, "transform");
  if (!transform) return local;
  // Single rotate(θ cx cy) — sufficient for the tests in this section.
  const m = /rotate\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\)/.exec(transform);
  if (!m) return local;
  const theta = (parseFloat(m[1]) * Math.PI) / 180;
  const cx = parseFloat(m[2]);
  const cy = parseFloat(m[3]);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const dx = local.x - cx;
  const dy = local.y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

// Visual-drift reproduction for rotated rects under resize. See
// docs/wg/feat-svg-editor/feedback-transform.md — the anchored corner must stay pinned in doc
// space across the gesture.
describe("apply_resize — rotated rect: visual position tracks gesture, not drifts", () => {
  it("SE-anchored resize keeps NW corner pinned in doc space", () => {
    const { doc, rect_id } = with_rect({
      x: 60,
      y: 80,
      width: 60,
      height: 60,
      transform: "rotate(30 90 110)",
    });
    const nw_before = rect_corner_in_doc(doc, rect_id, "nw");
    const baseline = resize_pipeline.intent.capture_baseline(doc, rect_id, {
      x: 60,
      y: 80,
      width: 60,
      height: 60,
    });
    // SE drag: anchor at NW = (60, 80), grow width by 20 (in local frame).
    resize_pipeline.intent.apply(doc, rect_id, baseline, 80 / 60, 1, {
      x: 60,
      y: 80,
    });
    const nw_after = rect_corner_in_doc(doc, rect_id, "nw");
    expect(nw_after.x).toBeCloseTo(nw_before.x, 4);
    expect(nw_after.y).toBeCloseTo(nw_before.y, 4);
  });

  it("multi-frame SE drag: NW pinned across cumulative frames (no drift accumulation)", () => {
    const { doc, rect_id } = with_rect({
      x: 60,
      y: 80,
      width: 60,
      height: 60,
      transform: "rotate(30 90 110)",
    });
    const nw_initial = rect_corner_in_doc(doc, rect_id, "nw");
    for (let i = 0; i < 10; i++) {
      const cur_w = parseFloat(doc.get_attr(rect_id, "width") ?? "0");
      const baseline = resize_pipeline.intent.capture_baseline(doc, rect_id, {
        x: parseFloat(doc.get_attr(rect_id, "x") ?? "0"),
        y: parseFloat(doc.get_attr(rect_id, "y") ?? "0"),
        width: cur_w,
        height: parseFloat(doc.get_attr(rect_id, "height") ?? "0"),
      });
      const target_w = cur_w + 2;
      resize_pipeline.intent.apply(
        doc,
        rect_id,
        baseline,
        target_w / cur_w,
        1,
        {
          x: parseFloat(doc.get_attr(rect_id, "x") ?? "0"),
          y: parseFloat(doc.get_attr(rect_id, "y") ?? "0"),
        }
      );
    }
    const nw_final = rect_corner_in_doc(doc, rect_id, "nw");
    expect(nw_final.x).toBeCloseTo(nw_initial.x, 3);
    expect(nw_final.y).toBeCloseTo(nw_initial.y, 3);
  });
});

/** Apply an element's current `translate(tx ty)? rotate(θ cx cy)` to a
 *  local-frame point. Returns `local` unchanged when the transform is
 *  absent. Used to assert visual-position preservation across mutations. */
function visual_of(
  doc: SvgDocument,
  id: string,
  local: { x: number; y: number }
): { x: number; y: number } {
  const t = doc.get_attr(id, "transform");
  if (!t) return local;
  let tx = 0,
    ty = 0;
  const mt = /translate\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/.exec(t);
  if (mt) {
    tx = parseFloat(mt[1]);
    ty = parseFloat(mt[2]);
  }
  const mr = /rotate\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\)/.exec(t);
  if (!mr) return { x: local.x + tx, y: local.y + ty };
  const theta = (parseFloat(mr[1]) * Math.PI) / 180;
  const cx = parseFloat(mr[2]);
  const cy = parseFloat(mr[3]);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const dx = local.x - cx;
  const dy = local.y - cy;
  return {
    x: cx + dx * cos - dy * sin + tx,
    y: cy + dx * sin + dy * cos + ty,
  };
}

/** Read parsed rotate args from the current `transform=`. */
function rotate_args(
  doc: SvgDocument,
  id: string
): { angle: number; cx: number; cy: number } | null {
  const t = doc.get_attr(id, "transform");
  if (!t) return null;
  const m = /rotate\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\)/.exec(t);
  if (!m) return null;
  return {
    angle: parseFloat(m[1]),
    cx: parseFloat(m[2]),
    cy: parseFloat(m[3]),
  };
}

describe("apply_resize — rotate pivot renormalization (commit-time)", () => {
  // After commit, the invariants are:
  //   1. Visual position of a sampled local-frame point is unchanged
  //      (the geometry-shift compensation cancels the pivot-move's
  //      doc-space offset).
  //   2. The new rotate pivot equals the post-shift local center (so
  //      subsequent rotate gestures pivot around the artwork's center).

  it("SE-anchored resize of rotated rect: visual NW preserved, pivot at new center", () => {
    const { doc, rect_id } = with_rect({
      x: 60,
      y: 80,
      width: 60,
      height: 60,
      transform: "rotate(30 90 110)",
    });
    const nw_before = visual_of(doc, rect_id, { x: 60, y: 80 });
    const baseline = resize_pipeline.intent.capture_baseline(doc, rect_id, {
      x: 60,
      y: 80,
      width: 60,
      height: 60,
    });
    resize_pipeline.intent.apply(doc, rect_id, baseline, 80 / 60, 1, {
      x: 60,
      y: 80,
    });
    expect(doc.get_attr(rect_id, "width")).toBe("80");
    const nw_local_after = {
      x: parseFloat(doc.get_attr(rect_id, "x") ?? "0"),
      y: parseFloat(doc.get_attr(rect_id, "y") ?? "0"),
    };
    const nw_after = visual_of(doc, rect_id, nw_local_after);
    expect(nw_after.x).toBeCloseTo(nw_before.x, 4);
    expect(nw_after.y).toBeCloseTo(nw_before.y, 4);
    const rot = rotate_args(doc, rect_id)!;
    expect(rot.cx).toBeCloseTo(
      nw_local_after.x + parseFloat(doc.get_attr(rect_id, "width")!) / 2,
      4
    );
    expect(rot.cy).toBeCloseTo(
      nw_local_after.y + parseFloat(doc.get_attr(rect_id, "height")!) / 2,
      4
    );
  });

  it("preserves leading translate verbatim across compensation", () => {
    const { doc, rect_id } = with_rect({
      x: 0,
      y: 0,
      width: 60,
      height: 60,
      transform: "translate(10 20) rotate(30 30 30)",
    });
    const baseline = resize_pipeline.intent.capture_baseline(doc, rect_id, {
      x: 0,
      y: 0,
      width: 60,
      height: 60,
    });
    resize_pipeline.intent.apply(doc, rect_id, baseline, 2, 1, { x: 0, y: 0 });
    const t = doc.get_attr(rect_id, "transform")!;
    expect(t.startsWith("translate(10 20)")).toBe(true);
  });

  it("leaves transform=null untouched on un-rotated rect", () => {
    const { doc, rect_id } = with_rect({
      x: 0,
      y: 0,
      width: 60,
      height: 60,
    });
    const baseline = resize_pipeline.intent.capture_baseline(doc, rect_id, {
      x: 0,
      y: 0,
      width: 60,
      height: 60,
    });
    resize_pipeline.intent.apply(doc, rect_id, baseline, 1.5, 1.5, {
      x: 0,
      y: 0,
    });
    expect(doc.get_attr(rect_id, "transform")).toBeNull();
  });

  it("zero-delta resize on rotated rect: transform byte-identical", () => {
    const { doc, rect_id } = with_rect({
      x: 60,
      y: 80,
      width: 60,
      height: 60,
      transform: "rotate(30 90 110)",
    });
    const baseline = resize_pipeline.intent.capture_baseline(doc, rect_id, {
      x: 60,
      y: 80,
      width: 60,
      height: 60,
    });
    resize_pipeline.intent.apply(doc, rect_id, baseline, 1, 1, {
      x: 60,
      y: 80,
    });
    expect(doc.get_attr(rect_id, "transform")).toBe("rotate(30 90 110)");
  });

  it("preview-phase call: no transform mutation, geometry written for preview", () => {
    const { doc, rect_id } = with_rect({
      x: 60,
      y: 80,
      width: 60,
      height: 60,
      transform: "rotate(30 90 110)",
    });
    const baseline = resize_pipeline.intent.capture_baseline(doc, rect_id, {
      x: 60,
      y: 80,
      width: 60,
      height: 60,
    });
    resize_pipeline.intent.apply(
      doc,
      rect_id,
      baseline,
      80 / 60,
      1,
      { x: 60, y: 80 },
      "preview"
    );
    expect(doc.get_attr(rect_id, "width")).toBe("80");
    // Preview: HUD's chrome assumes the matrix stays put, so the host must
    // not touch transform mid-gesture.
    expect(doc.get_attr(rect_id, "transform")).toBe("rotate(30 90 110)");
  });

  it("apply_resize leaves user-authored rotate(θ) verbatim (gate refuses)", () => {
    const { doc, rect_id } = with_rect({
      x: 0,
      y: 0,
      width: 60,
      height: 60,
      transform: "rotate(30)",
    });
    const baseline = resize_pipeline.intent.capture_baseline(doc, rect_id, {
      x: 0,
      y: 0,
      width: 60,
      height: 60,
    });
    resize_pipeline.intent.apply(doc, rect_id, baseline, 1.5, 1, {
      x: 0,
      y: 0,
    });
    expect(doc.get_attr(rect_id, "transform")).toBe("rotate(30)");
  });

  // For non-rect primitives, the universal commit-time invariant is:
  // the rotate pivot equals the artwork's current bbox-center. The
  // visual-position invariant is exercised by the rect tests above; the
  // compensation math is shared, so per-primitive smoke tests focus on
  // the pivot-at-center contract.
  it("circle: pivot lands at the new (cx, cy)", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="20" transform="rotate(45 50 50)"/></svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    const baseline = resize_pipeline.intent.capture_baseline(doc, id, {
      x: 30,
      y: 30,
      width: 40,
      height: 40,
    });
    resize_pipeline.intent.apply(doc, id, baseline, 2, 2, { x: 0, y: 0 });
    const cx = parseFloat(doc.get_attr(id, "cx") ?? "0");
    const cy = parseFloat(doc.get_attr(id, "cy") ?? "0");
    const rot = rotate_args(doc, id)!;
    expect(rot.cx).toBeCloseTo(cx, 4);
    expect(rot.cy).toBeCloseTo(cy, 4);
  });

  it("ellipse: pivot lands at the new (cx, cy)", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg"><ellipse cx="50" cy="50" rx="30" ry="20" transform="rotate(30 50 50)"/></svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    const baseline = resize_pipeline.intent.capture_baseline(doc, id, {
      x: 20,
      y: 30,
      width: 60,
      height: 40,
    });
    resize_pipeline.intent.apply(doc, id, baseline, 1, 2, { x: 0, y: 0 });
    const cx = parseFloat(doc.get_attr(id, "cx") ?? "0");
    const cy = parseFloat(doc.get_attr(id, "cy") ?? "0");
    const rot = rotate_args(doc, id)!;
    expect(rot.cx).toBeCloseTo(cx, 4);
    expect(rot.cy).toBeCloseTo(cy, 4);
  });

  it("line: pivot lands at the new midpoint of endpoints", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="100" y2="0" transform="rotate(45 50 0)"/></svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    const baseline = resize_pipeline.intent.capture_baseline(doc, id, {
      x: 0,
      y: 0,
      width: 100,
      height: 0,
    });
    resize_pipeline.intent.apply(doc, id, baseline, 2, 1, { x: 0, y: 0 });
    const x1 = parseFloat(doc.get_attr(id, "x1") ?? "0");
    const y1 = parseFloat(doc.get_attr(id, "y1") ?? "0");
    const x2 = parseFloat(doc.get_attr(id, "x2") ?? "0");
    const y2 = parseFloat(doc.get_attr(id, "y2") ?? "0");
    const rot = rotate_args(doc, id)!;
    expect(rot.cx).toBeCloseTo((x1 + x2) / 2, 4);
    expect(rot.cy).toBeCloseTo((y1 + y2) / 2, 4);
  });

  it("polygon: pivot lands at the new points-bbox center", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 100,0 100,100 0,100" transform="rotate(30 50 50)"/></svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    const baseline = resize_pipeline.intent.capture_baseline(doc, id, {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    resize_pipeline.intent.apply(doc, id, baseline, 2, 2, { x: 0, y: 0 });
    const pts = doc
      .get_attr(id, "points")!
      .split(/\s+/)
      .map((s) => s.split(",").map(parseFloat));
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [px, py] of pts) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    const rot = rotate_args(doc, id)!;
    expect(rot.cx).toBeCloseTo((minX + maxX) / 2, 3);
    expect(rot.cy).toBeCloseTo((minY + maxY) / 2, 3);
  });

  it("path: pivot lands at the new d-bbox center", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="M 0 0 L 100 0 L 100 100 Z" transform="rotate(30 50 50)"/></svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    const baseline = resize_pipeline.intent.capture_baseline(doc, id, {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    resize_pipeline.intent.apply(doc, id, baseline, 2, 2, { x: 0, y: 0 });
    const rot = rotate_args(doc, id)!;
    // Pivot lands somewhere inside the rendered bbox region — coarse
    // bound (±50) catches NaN/wildly wrong without overfitting to the
    // path-bbox approximation.
    expect(rot.cx).toBeGreaterThan(0);
    expect(rot.cx).toBeLessThan(200);
    expect(rot.cy).toBeGreaterThan(0);
    expect(rot.cy).toBeLessThan(200);
  });
});

describe("baseline_anchor", () => {
  it("returns (x, y) for rect / text / tspan / image / use", () => {
    expect(
      translate_pipeline.intent.baseline_anchor({ type: "rect", x: 5, y: 10 })
    ).toEqual({
      x: 5,
      y: 10,
    });
    expect(
      translate_pipeline.intent.baseline_anchor({ type: "text", x: 3, y: 4 })
    ).toEqual({
      x: 3,
      y: 4,
    });
  });

  it("returns (cx, cy) for circle / ellipse", () => {
    expect(
      translate_pipeline.intent.baseline_anchor({
        type: "circle",
        cx: 10,
        cy: 20,
      })
    ).toEqual({
      x: 10,
      y: 20,
    });
    expect(
      translate_pipeline.intent.baseline_anchor({
        type: "ellipse",
        cx: 1,
        cy: 2,
      })
    ).toEqual({
      x: 1,
      y: 2,
    });
  });

  it("returns min of endpoints for line", () => {
    expect(
      translate_pipeline.intent.baseline_anchor({
        type: "line",
        x1: 30,
        y1: 5,
        x2: 10,
        y2: 50,
      })
    ).toEqual({ x: 10, y: 5 });
  });

  it("parses polyline / polygon points", () => {
    expect(
      translate_pipeline.intent.baseline_anchor({
        type: "polyline",
        points: "30,5 10,50 20,15",
      })
    ).toEqual({ x: 10, y: 5 });
  });

  it("parses first M command for path", () => {
    expect(
      translate_pipeline.intent.baseline_anchor({
        type: "path",
        d: "M 12.5 7 L 100 200",
      })
    ).toEqual({
      x: 12.5,
      y: 7,
    });
  });

  it("uses leading-translate as anchor for viaTransform", () => {
    // Closes the silent pixel-grid-snap disable for viaTransform nodes:
    // when the transform is a clean leading translate (or starts with
    // one), the translate value is the user-visible NW-shift anchor.
    expect(
      translate_pipeline.intent.baseline_anchor({
        type: "viaTransform",
        transform: "translate(10 20)",
      })
    ).toEqual({ x: 10, y: 20 });
    expect(
      translate_pipeline.intent.baseline_anchor({
        type: "viaTransform",
        transform: "translate(10 20) rotate(15)",
      })
    ).toEqual({ x: 10, y: 20 });
    // Null transform → no anchor (e.g. a `<g>` with no transform yet).
    expect(
      translate_pipeline.intent.baseline_anchor({
        type: "viaTransform",
        transform: null,
      })
    ).toBeNull();
    // Non-translate-leading or unparseable transforms → null.
    expect(
      translate_pipeline.intent.baseline_anchor({
        type: "viaTransform",
        transform: "rotate(15)",
      })
    ).toBeNull();
    expect(
      translate_pipeline.intent.baseline_anchor({
        type: "viaTransform",
        transform: "matrix(1 0 0 1 5 5)",
      })
    ).toBeNull();
    expect(
      translate_pipeline.intent.baseline_anchor({ type: "unsupported" })
    ).toBeNull();
  });
});

describe("baseline_union_top_left", () => {
  it("takes the min over all anchors", () => {
    const m = new Map<string, TranslateBaseline>([
      ["a", { type: "rect", x: 5, y: 10 }],
      ["b", { type: "rect", x: 2, y: 12 }],
    ]);
    expect(translate_pipeline.intent.baseline_union_top_left(m)).toEqual({
      x: 2,
      y: 10,
    });
  });

  it("ignores baselines with no anchor (anchorless viaTransform / unsupported)", () => {
    const m = new Map<string, TranslateBaseline>([
      ["a", { type: "rect", x: 5, y: 10 }],
      ["b", { type: "viaTransform", transform: null }],
      ["c", { type: "unsupported" }],
    ]);
    expect(translate_pipeline.intent.baseline_union_top_left(m)).toEqual({
      x: 5,
      y: 10,
    });
  });

  it("returns null when no baseline yields an anchor", () => {
    const m = new Map<string, TranslateBaseline>([
      ["a", { type: "viaTransform", transform: null }],
      ["b", { type: "unsupported" }],
    ]);
    expect(translate_pipeline.intent.baseline_union_top_left(m)).toBeNull();
  });

  it("includes viaTransform leading-translate anchors in the union", () => {
    // viaTransform with `translate(10 20)` contributes (10, 20) as anchor;
    // unioned with a rect at (5, 10) the top-left is (5, 10).
    const m = new Map<string, TranslateBaseline>([
      ["a", { type: "rect", x: 5, y: 30 }],
      ["b", { type: "viaTransform", transform: "translate(10 20)" }],
    ]);
    expect(translate_pipeline.intent.baseline_union_top_left(m)).toEqual({
      x: 5,
      y: 20,
    });
  });
});
