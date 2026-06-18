// Shift-resize on a SIDE EDGE — aspect-lock (uniform about the opposite-edge
// center). Sibling of `resize-from-center.test.ts` (Alt). Tests are the spec:
// each `it` names the rule.
//
// The whole feature lives in the headless math core: `compute_factors` gains
// edge arms in its Shift block, and the ctx-less `apply` re-derives the
// perpendicular (uniform) factor for edges via `plan.aspect_lock`. The
// `aspect_lock` STAGE stays corner-only — an edge handle's tracked midpoint
// doesn't move under perpendicular center-scaling, so the lock can't be a
// delta. These tests pin the behavior independent of any DOM wiring.
//
// The anchor is the opposite side's center:
//   - "e" → left-edge center; "w" → right-edge center
//   - "s" → top-edge center;  "n" → bottom-edge center
// so the perpendicular axis scales symmetrically and the aspect ratio holds.

import { describe, expect, it } from "vitest";
import cmath from "@grida/cmath";
import { svg_parse } from "@grida/svg/parse";
import { SvgDocument } from "../src/core/document";
import {
  ResizeOrchestrator,
  resize_pipeline,
  type ResizeBaseline,
  type ResizeDirection,
  type ResizeModifiers,
  type ResizeOptions,
  type ResizePlan,
} from "../src/core/resize-pipeline";
import { hit_shape_svg } from "../src/core/hit-shape-svg";
import { createSvgEditorWithInternals, first_tag } from "./_helpers";
import type { Rect } from "../src/types";

const OPTS: ResizeOptions = {
  pixel_grid_quantum: null,
  snap_enabled: false,
  snap_threshold_px: 10,
};

const ASPECT: ResizeModifiers = {
  aspect_lock: "uniform",
  from_center: false,
  force_disable_snap: false,
};

function rect_baseline(x = 0, y = 0, w = 100, h = 50): ResizeBaseline {
  return {
    bbox: { x, y, width: w, height: h },
    attrs: { kind: "rect", x, y, w, h },
    raw: [],
  };
}

function single(markup: string): { doc: SvgDocument; id: string } {
  const doc = new SvgDocument(
    `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`
  );
  return { doc, id: doc.element_children_of(doc.root)[0] };
}

/** capture → aspect-factors (shift = true) → apply, the full single-element
 *  edge aspect-lock path. */
function apply_aspect(
  doc: SvgDocument,
  id: string,
  bbox: Rect,
  dir: ResizeDirection,
  dx: number,
  dy: number,
  from_center = false
): void {
  const baseline = resize_pipeline.intent.capture_baseline(doc, id, bbox);
  const f = resize_pipeline.intent.compute_factors(
    baseline,
    dir,
    dx,
    dy,
    true,
    from_center
  );
  resize_pipeline.intent.apply(doc, id, baseline, f.sx, f.sy, f.origin);
}

function points_bbox(points: string): Rect {
  return cmath.rect.fromPointsOrZero(
    svg_parse.parse_points(points).map((p) => [p.x, p.y])
  );
}
function path_bbox(d: string): Rect {
  return cmath.rect.fromPointsOrZero(
    hit_shape_svg.path_control_polyline(d).map((p) => [p.x, p.y])
  );
}
function center_y(r: Rect) {
  return r.y + r.height / 2;
}

// ─── compute_factors — the edge arms ────────────────────────────────────────

describe("compute_factors — aspect-lock on a side edge (Shift)", () => {
  const baseline = rect_baseline(); // 100×50 at origin → center (50, 25)

  it("'e' drives x; the perpendicular (y) follows about the left-edge center", () => {
    const f = resize_pipeline.intent.compute_factors(
      baseline,
      "e",
      50, // dx → sx = (100 + 50) / 100 = 1.5
      999, // dy ignored on a horizontal edge
      true,
      false
    );
    expect(f.origin).toEqual({ x: 0, y: 25 }); // opposite side's center
    expect(f.sx).toBeCloseTo(1.5, 6);
    expect(f.sy).toBeCloseTo(1.5, 6); // uniform — follows x
  });

  it("'n' drives y; the perpendicular (x) follows about the bottom-edge center", () => {
    // "n" grows upward; orchestrator sign-adjusts dy negative = grow.
    const f = resize_pipeline.intent.compute_factors(
      baseline,
      "n",
      999,
      -25, // sy = (50 + 25) / 50 = 1.5
      true,
      false
    );
    expect(f.origin).toEqual({ x: 50, y: 50 }); // bottom-edge center
    expect(f.sy).toBeCloseTo(1.5, 6);
    expect(f.sx).toBeCloseTo(1.5, 6); // uniform — follows y
  });

  it("'w' anchors on the right-edge center; 's' on the top-edge center", () => {
    // For "w" the orchestrator sign-adjusts so outward growth arrives as a
    // negative dx (left edge moves left): sx = (-50 - 100) / (0 - 100) = 1.5.
    const w = resize_pipeline.intent.compute_factors(
      baseline,
      "w",
      -50,
      999,
      true,
      false
    );
    expect(w.origin).toEqual({ x: 100, y: 25 }); // pinned right-edge center
    expect(w.sx).toBeCloseTo(1.5, 6);
    expect(w.sy).toBeCloseTo(1.5, 6); // uniform

    const s = resize_pipeline.intent.compute_factors(
      baseline,
      "s",
      999,
      25,
      true,
      false
    );
    expect(s.origin).toEqual({ x: 50, y: 0 }); // top-edge center
    expect(s.sx).toBeCloseTo(s.sy, 6);
  });

  it("Shift OFF on an edge leaves the perpendicular axis free (no aspect)", () => {
    const f = resize_pipeline.intent.compute_factors(
      baseline,
      "e",
      50,
      0,
      false, // shift off
      false
    );
    expect(f.sx).toBeCloseTo(1.5, 6);
    expect(f.sy).toBe(1); // untouched
  });

  it("corner aspect-lock is unchanged (max-magnitude) — regression guard", () => {
    const f = resize_pipeline.intent.compute_factors(
      baseline,
      "se",
      20, // sx = 1.2
      5, // sy = 1.1
      true,
      false
    );
    expect(f.sx).toBeCloseTo(1.2, 6); // larger magnitude wins
    expect(f.sy).toBeCloseTo(1.2, 6);
    expect(f.origin).toEqual({ x: 0, y: 0 }); // NW corner, not an edge center
  });

  it("Shift+Alt on an edge is uniform about the bbox center", () => {
    const f = resize_pipeline.intent.compute_factors(
      baseline,
      "e",
      25, // about center: sx = (50 + 25) / 50 = 1.5
      999,
      true,
      true
    );
    expect(f.origin).toEqual({ x: 50, y: 25 }); // bbox center
    expect(f.sx).toBeCloseTo(1.5, 6);
    expect(f.sy).toBeCloseTo(1.5, 6);
  });
});

// ─── apply — per primitive: opposite edge pinned, perpendicular symmetric ────

describe("apply — 'e' aspect-lock keeps the left edge pinned and scales uniformly", () => {
  // dx = 100 → sx = sy = 2, origin = (10, 35) for a (10,10,100,50) box.
  const BBOX: Rect = { x: 10, y: 10, width: 100, height: 50 };

  it("rect: x/width grow, y re-seats, vertical center preserved", () => {
    const { doc, id } = single(`<rect x="10" y="10" width="100" height="50"/>`);
    apply_aspect(doc, id, BBOX, "e", 100, 0);
    expect(doc.get_attr(id, "x")).toBe("10"); // left edge pinned
    expect(doc.get_attr(id, "width")).toBe("200");
    expect(doc.get_attr(id, "y")).toBe("-15");
    expect(doc.get_attr(id, "height")).toBe("100");
    expect(-15 + 100 / 2).toBe(35); // center y == original (10 + 25)
    expect(200 / 100).toBeCloseTo(100 / 50, 6); // new w/h == original w/h
  });

  it("ellipse: cx grows, cy/center fixed, rx & ry scale together", () => {
    const { doc, id } = single(`<ellipse cx="60" cy="35" rx="50" ry="25"/>`);
    apply_aspect(doc, id, BBOX, "e", 100, 0);
    expect(doc.get_attr(id, "cx")).toBe("110");
    expect(doc.get_attr(id, "cy")).toBe("35"); // vertical center fixed
    expect(doc.get_attr(id, "rx")).toBe("100");
    expect(doc.get_attr(id, "ry")).toBe("50"); // followed uniformly
  });

  it("line: both endpoints scale uniformly about the left-edge center", () => {
    const { doc, id } = single(`<line x1="10" y1="10" x2="110" y2="60"/>`);
    apply_aspect(doc, id, BBOX, "e", 100, 0);
    expect(doc.get_attr(id, "x1")).toBe("10");
    expect(doc.get_attr(id, "y1")).toBe("-15");
    expect(doc.get_attr(id, "x2")).toBe("210");
    expect(doc.get_attr(id, "y2")).toBe("85");
  });

  it("polygon: bbox left edge pinned, height scales, center preserved", () => {
    const { doc, id } = single(`<polygon points="10,10 110,10 110,60 10,60"/>`);
    apply_aspect(doc, id, BBOX, "e", 100, 0);
    const bb = points_bbox(doc.get_attr(id, "points")!);
    expect(bb.x).toBeCloseTo(10, 6); // left pinned
    expect(bb.width).toBeCloseTo(200, 6);
    expect(bb.height).toBeCloseTo(100, 6); // perpendicular followed
    expect(center_y(bb)).toBeCloseTo(35, 6);
  });

  it("path: bbox left edge pinned, height scales, center preserved", () => {
    const { doc, id } = single(`<path d="M10 10 L110 10 L110 60 Z"/>`);
    apply_aspect(doc, id, BBOX, "e", 100, 0);
    const bb = path_bbox(doc.get_attr(id, "d")!);
    expect(bb.x).toBeCloseTo(10, 6);
    expect(bb.width).toBeCloseTo(200, 6);
    expect(bb.height).toBeCloseTo(100, 6);
    expect(center_y(bb)).toBeCloseTo(35, 6);
  });
});

describe("apply — 'n' aspect-lock keeps the bottom edge pinned, horizontal center fixed", () => {
  it("rect: y/height grow upward, width follows, horizontal center preserved", () => {
    // (0,0,100,50) box; "n" dy=-25 → sy=sx=1.5, origin=(50,50).
    const { doc, id } = single(`<rect x="0" y="0" width="100" height="50"/>`);
    apply_aspect(doc, id, { x: 0, y: 0, width: 100, height: 50 }, "n", 0, -25);
    expect(doc.get_attr(id, "height")).toBe("75");
    expect(doc.get_attr(id, "y")).toBe("-25"); // grew upward
    expect(doc.get_attr(id, "width")).toBe("150"); // followed uniformly
    const x = parseFloat(doc.get_attr(id, "x")!);
    const w = parseFloat(doc.get_attr(id, "width")!);
    expect(x + w / 2).toBeCloseTo(50, 6); // horizontal center fixed
    // bottom edge pinned at y = 50
    expect(-25 + 75).toBe(50);
  });
});

describe("apply — Shift+Alt on an edge is uniform about the bbox center", () => {
  it("rect 'e': both opposite edges move, center stays put, aspect held", () => {
    // (0,0,100,50), center (50,25). "e" dx=25 about center → s=1.5.
    const { doc, id } = single(`<rect x="0" y="0" width="100" height="50"/>`);
    apply_aspect(
      doc,
      id,
      { x: 0, y: 0, width: 100, height: 50 },
      "e",
      25,
      0,
      true
    );
    expect(doc.get_attr(id, "width")).toBe("150");
    expect(doc.get_attr(id, "height")).toBe("75");
    const x = parseFloat(doc.get_attr(id, "x")!);
    const y = parseFloat(doc.get_attr(id, "y")!);
    expect(x + 150 / 2).toBeCloseTo(50, 6); // center x preserved
    expect(y + 75 / 2).toBeCloseTo(25, 6); // center y preserved
  });
});

// ─── multi-member — union edge aspect-lock ──────────────────────────────────

describe("multi-member — 'e' aspect-lock scales about the union's left-edge center", () => {
  it("two rects: union left edge pinned, union vertical center preserved", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></svg>`;
    const doc = new SvgDocument(svg);
    const [a, b] = doc.all_elements().filter((id) => doc.tag_of(id) === "rect");
    const ba = resize_pipeline.intent.capture_baseline(doc, a, {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const bb = resize_pipeline.intent.capture_baseline(doc, b, {
      x: 20,
      y: 0,
      width: 10,
      height: 10,
    });
    const union = cmath.rect.union([ba.bbox, bb.bbox]); // (0,0,30,10), left-center (0,5)

    const plan: ResizePlan = {
      id: a,
      baseline: resize_pipeline.synthesize_group_baseline(union),
      members: [
        { id: a, baseline: ba },
        { id: b, baseline: bb },
      ],
      direction: "e",
      dx: 30, // sx = (30 + 30) / 30 = 2 → uniform s = 2
      dy: 0,
      aspect_lock: true,
    };
    resize_pipeline.apply(doc, plan);
    // Both scaled ×2 about (0, 5): left member's left edge stays at x=0,
    // every member's height doubles symmetrically about the union center y=5.
    expect(doc.get_attr(a, "x")).toBe("0");
    expect(doc.get_attr(a, "y")).toBe("-5");
    expect(doc.get_attr(a, "width")).toBe("20");
    expect(doc.get_attr(a, "height")).toBe("20");
    expect(doc.get_attr(b, "x")).toBe("40");
    expect(doc.get_attr(b, "width")).toBe("20");
  });
});

// ─── orchestrator path (end-to-end) + round-trip ────────────────────────────

function make_orch(
  editor: ReturnType<typeof createSvgEditorWithInternals>,
  bboxes: Record<string, Rect>
): ResizeOrchestrator {
  return new ResizeOrchestrator({
    get_doc: () => editor._internal.doc,
    emit: () => editor._internal.emit(),
    open_preview: (label) => editor._internal.history.preview(label),
    open_snap: () => null,
    options: () => OPTS,
    bbox_world: (id) => bboxes[id] ?? { x: 0, y: 0, width: 0, height: 0 },
  });
}

describe("orchestrator — drive 'e' with aspect-lock writes a uniform box", () => {
  it("an edge drag streams only the driven dim; the perpendicular is derived", () => {
    const editor = createSvgEditorWithInternals({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect x="10" y="10" width="100" height="50"/></svg>`,
    });
    const id = first_tag(editor, "rect");
    const orch = make_orch(editor, {
      [id]: { x: 10, y: 10, width: 100, height: 50 },
    });
    // HUD streams target_width grown, target_height UNCHANGED for an edge.
    const input = {
      ids: [id],
      direction: "e" as const,
      target_width: 200, // s = 2
      target_height: 50,
    };
    orch.drive(input, ASPECT, { phase: "preview", snap: false });
    orch.drive(input, ASPECT, { phase: "commit", snap: false });
    expect(editor.document.get_attr(id, "x")).toBe("10"); // left pinned
    expect(editor.document.get_attr(id, "width")).toBe("200");
    expect(editor.document.get_attr(id, "y")).toBe("-15");
    expect(editor.document.get_attr(id, "height")).toBe("100");
    const y = parseFloat(editor.document.get_attr(id, "y")!);
    expect(y + 100 / 2).toBeCloseTo(35, 6); // vertical center preserved
  });
});

describe("round-trip — edge aspect-lock preview → cancel restores authored bytes", () => {
  const CASES: ReadonlyArray<{ tag: string; markup: string; bbox: Rect }> = [
    {
      tag: "rect",
      markup: `<rect x="10" y="10" width="100" height="50"/>`,
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
    {
      tag: "ellipse",
      markup: `<ellipse cx="60" cy="35" rx="50" ry="25"/>`,
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
    {
      tag: "line",
      markup: `<line x1="10" y1="10" x2="110" y2="60"/>`,
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
    {
      tag: "path",
      markup: `<path d="M10 10 L110 10 L110 60 Z"/>`,
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
  ];

  for (const c of CASES) {
    it(`${c.tag}: edge aspect preview → cancel is byte-exact`, () => {
      const editor = createSvgEditorWithInternals({
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${c.markup}</svg>`,
      });
      const before = editor.serialize();
      const id = first_tag(editor, c.tag);
      const orch = make_orch(editor, { [id]: c.bbox });
      orch.drive(
        {
          ids: [id],
          direction: "e",
          target_width: c.bbox.width + 60,
          target_height: c.bbox.height, // edge: perpendicular unchanged
        },
        ASPECT,
        { phase: "preview", snap: false }
      );
      orch.cancel();
      expect(editor.serialize()).toBe(before);
    });
  }
});
