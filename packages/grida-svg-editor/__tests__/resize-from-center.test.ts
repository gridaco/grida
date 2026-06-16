// Alt-resize — resize from the bbox center (symmetric, bbox-anchored).
// The spec for #857. Tests are the spec: each `it` names the rule.
//
// Center-anchor is achieved entirely in the headless core: the only
// change is `compute_factors` re-anchoring on the bbox center (the apply
// handlers and per-element constraints are origin-agnostic). These tests
// pin that behavior independent of any DOM wiring — so the feature can't
// pass the core yet die at the shell.
//
// Categories that matter for round-trip:
//   - cx/cy-canonical (circle, ellipse): center IS the stored anchor, so
//     a single-element center-resize leaves cx/cy byte-identical.
//   - edge/vertex models (rect, line, path, ...): position coords re-seat.
// In-session revert is byte-exact for BOTH (raw-snapshot restore).

import { describe, expect, it } from "vitest";
import cmath from "@grida/cmath";
import { svg_parse } from "@grida/svg/parse";
import { SnapSession } from "../src/core/snap";
import { SvgDocument } from "../src/core/document";
import {
  ResizeOrchestrator,
  resize_pipeline,
  type ResizeBaseline,
  type ResizeContext,
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
  snap_enabled: true,
  snap_threshold_px: 10,
};

const CENTER: ResizeModifiers = {
  aspect_lock: "off",
  from_center: true,
  force_disable_snap: false,
};
const OPPOSITE: ResizeModifiers = {
  aspect_lock: "off",
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
function circle_baseline(cx = 50, cy = 50, r = 25): ResizeBaseline {
  return {
    bbox: { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
    attrs: { kind: "circle", cx, cy, r },
    raw: [],
  };
}

function single(markup: string): { doc: SvgDocument; id: string } {
  const doc = new SvgDocument(
    `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`
  );
  return { doc, id: doc.element_children_of(doc.root)[0] };
}

/** capture → center-factors → apply, the full single-element center path. */
function apply_center(
  doc: SvgDocument,
  id: string,
  bbox: Rect,
  dir: ResizeDirection,
  dx: number,
  dy: number
): void {
  const baseline = resize_pipeline.intent.capture_baseline(doc, id, bbox);
  const f = resize_pipeline.intent.compute_factors(
    baseline,
    dir,
    dx,
    dy,
    false,
    true
  );
  resize_pipeline.intent.apply(doc, id, baseline, f.sx, f.sy, f.origin);
}

function center_of(r: Rect) {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
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

// ─── compute_factors — the center anchor ───────────────────────────────────

describe("compute_factors — from_center (Alt)", () => {
  const baseline = rect_baseline(); // 100×50 at origin → center (50, 25)

  it("se drag anchors on the bbox center and doubles the scale vs opposite-anchor", () => {
    const c = resize_pipeline.intent.compute_factors(
      baseline,
      "se",
      25,
      12.5,
      false,
      true
    );
    expect(c.origin).toEqual({ x: 50, y: 25 }); // bbox center, not the NW corner
    expect(c.sx).toBeCloseTo(1.5, 6); // (50/2 ... half-extent denom) → (50+25)/50
    expect(c.sy).toBeCloseTo(1.5, 6);

    // Same drag, opposite anchor: the marginal scale from the same dx is HALF.
    const o = resize_pipeline.intent.compute_factors(
      baseline,
      "se",
      25,
      12.5,
      false,
      false
    );
    expect(o.origin).toEqual({ x: 0, y: 0 });
    expect(o.sx).toBeCloseTo(1.25, 6);
  });

  it("north edge drag scales only the y-axis, about the center", () => {
    // "n" grows upward; orchestrator sign-adjusts dy negative = grow.
    const f = resize_pipeline.intent.compute_factors(
      baseline,
      "n",
      999,
      -10,
      false,
      true
    );
    expect(f.sx).toBe(1); // affectsX === false on an edge handle
    expect(f.origin).toEqual({ x: 50, y: 25 }); // center
    expect(f.sy).toBeCloseTo(1.4, 6); // (25 + 10)/25 — doubled about center (opp would be 1.2)
  });
});

// ─── apply — symmetric about the center, per primitive ──────────────────────

describe("apply — from_center is symmetric about the bbox center", () => {
  it("rect re-seats x/y and doubles size, center stays put", () => {
    const { doc, id } = single(`<rect x="10" y="10" width="100" height="50"/>`);
    apply_center(
      doc,
      id,
      { x: 10, y: 10, width: 100, height: 50 },
      "se",
      50,
      25
    ); // s=2
    expect(doc.get_attr(id, "x")).toBe("-40");
    expect(doc.get_attr(id, "y")).toBe("-15");
    expect(doc.get_attr(id, "width")).toBe("200");
    expect(doc.get_attr(id, "height")).toBe("100");
    // new center == old center (60, 35)
    expect(-40 + 200 / 2).toBe(60);
    expect(-15 + 100 / 2).toBe(35);
  });

  it("image (VertexBox, same arm as rect/use) re-seats symmetrically", () => {
    const { doc, id } = single(
      `<image x="10" y="10" width="100" height="50"/>`
    );
    apply_center(
      doc,
      id,
      { x: 10, y: 10, width: 100, height: 50 },
      "se",
      50,
      25
    );
    expect(doc.get_attr(id, "x")).toBe("-40");
    expect(doc.get_attr(id, "width")).toBe("200");
  });

  it("circle — the natural case: cx/cy byte-identical, only r changes", () => {
    const { doc, id } = single(`<circle cx="50" cy="50" r="20"/>`);
    apply_center(
      doc,
      id,
      { x: 30, y: 30, width: 40, height: 40 },
      "se",
      20,
      20
    ); // s=2
    expect(doc.get_attr(id, "cx")).toBe("50"); // unchanged
    expect(doc.get_attr(id, "cy")).toBe("50"); // unchanged
    expect(doc.get_attr(id, "r")).toBe("40");
  });

  it("ellipse — natural case: cx/cy byte-identical, only rx/ry change", () => {
    const { doc, id } = single(`<ellipse cx="50" cy="60" rx="25" ry="15"/>`);
    apply_center(
      doc,
      id,
      { x: 25, y: 45, width: 50, height: 30 },
      "se",
      25,
      15
    ); // s=2 each
    expect(doc.get_attr(id, "cx")).toBe("50");
    expect(doc.get_attr(id, "cy")).toBe("60");
    expect(doc.get_attr(id, "rx")).toBe("50");
    expect(doc.get_attr(id, "ry")).toBe("30");
  });

  it("line — both endpoints scale about the center", () => {
    const { doc, id } = single(`<line x1="0" y1="0" x2="100" y2="40"/>`);
    apply_center(doc, id, { x: 0, y: 0, width: 100, height: 40 }, "se", 50, 20); // s=2
    expect(doc.get_attr(id, "x1")).toBe("-50");
    expect(doc.get_attr(id, "y1")).toBe("-20");
    expect(doc.get_attr(id, "x2")).toBe("150");
    expect(doc.get_attr(id, "y2")).toBe("60");
  });

  it("polyline — bbox center preserved, size doubled", () => {
    const { doc, id } = single(`<polyline points="0,0 100,0 100,40"/>`);
    apply_center(doc, id, { x: 0, y: 0, width: 100, height: 40 }, "se", 50, 20);
    const bb = points_bbox(doc.get_attr(id, "points")!);
    expect(center_of(bb).x).toBeCloseTo(50, 6);
    expect(center_of(bb).y).toBeCloseTo(20, 6);
    expect(bb.width).toBeCloseTo(200, 6);
    expect(bb.height).toBeCloseTo(80, 6);
  });

  it("polygon — bbox center preserved, size doubled", () => {
    const { doc, id } = single(`<polygon points="0,0 100,0 100,40 0,40"/>`);
    apply_center(doc, id, { x: 0, y: 0, width: 100, height: 40 }, "se", 50, 20);
    const bb = points_bbox(doc.get_attr(id, "points")!);
    expect(center_of(bb).x).toBeCloseTo(50, 6);
    expect(bb.width).toBeCloseTo(200, 6);
  });

  it("path — bbox center preserved, size doubled", () => {
    const { doc, id } = single(`<path d="M0 0 L100 0 L100 40 Z"/>`);
    apply_center(doc, id, { x: 0, y: 0, width: 100, height: 40 }, "se", 50, 20);
    const bb = path_bbox(doc.get_attr(id, "d")!);
    expect(center_of(bb).x).toBeCloseTo(50, 6);
    expect(center_of(bb).y).toBeCloseTo(20, 6);
    expect(bb.width).toBeCloseTo(200, 6);
    expect(bb.height).toBeCloseTo(80, 6);
  });

  it("text on a corner scales uniformly about the center", () => {
    const { doc, id } = single(`<text x="0" y="20" font-size="16">hi</text>`);
    apply_center(doc, id, { x: 0, y: 0, width: 100, height: 20 }, "se", 50, 10); // s=2
    expect(doc.get_attr(id, "x")).toBe("-50");
    expect(doc.get_attr(id, "y")).toBe("30");
    expect(doc.get_attr(id, "font-size")).toBe("32");
  });

  it("text on an edge is a no-op (unchanged), even under center anchor", () => {
    const { doc, id } = single(`<text x="0" y="20" font-size="16">hi</text>`);
    apply_center(doc, id, { x: 0, y: 0, width: 100, height: 20 }, "e", 50, 0);
    expect(doc.get_attr(id, "x")).toBe("0");
    expect(doc.get_attr(id, "y")).toBe("20");
    expect(doc.get_attr(id, "font-size")).toBe("16");
  });
});

// ─── Shift + Alt composes to uniform-about-center ───────────────────────────

describe("aspect_lock stage — Shift+Alt is uniform about the center", () => {
  it("locks the center-anchored factors to a single ratio", () => {
    const baseline = rect_baseline(); // center (50, 25)
    // SE drag dx=20 (center sx=1.4), dy=5 (center sy=1.2). Uniform → max = 1.4.
    const plan: ResizePlan = {
      id: "a",
      baseline,
      direction: "se",
      dx: 20,
      dy: 5,
      from_center: true,
    };
    const out = resize_pipeline.stages.aspect_lock.run(plan, {
      input: { id: "a", direction: "se", dx: 20, dy: 5 },
      modifiers: {
        aspect_lock: "uniform",
        from_center: true,
        force_disable_snap: false,
      },
      options: OPTS,
      snap_session: null,
    });
    // The locked deltas, fed back through the center factors, are uniform.
    const f = resize_pipeline.intent.compute_factors(
      baseline,
      "se",
      out.plan.dx,
      out.plan.dy,
      false,
      true
    );
    expect(f.sx).toBeCloseTo(1.4, 6);
    expect(f.sy).toBeCloseTo(1.4, 6);
    expect(f.origin).toEqual({ x: 50, y: 25 }); // still the center
  });
});

// ─── snap — free branch is mode-invariant; uniform branch stays centered ────

describe("snap under center anchor", () => {
  it("free element: the moving-edge snap correction matches opposite-anchor mode", () => {
    const neighbor = { x: 120, y: 0, width: 20, height: 30 };
    const run = (m: ResizeModifiers) => {
      const snap = new SnapSession({
        agents: [{ x: 0, y: 0, width: 100, height: 50 }],
        neighbors: [neighbor],
      });
      const plan: ResizePlan = {
        id: "a",
        baseline: rect_baseline(),
        direction: "e",
        dx: 18,
        dy: 0,
        from_center: m.from_center,
      };
      const ctx: ResizeContext = {
        input: { id: "a", direction: "e", dx: 18, dy: 0 },
        modifiers: m,
        options: OPTS,
        snap_session: snap,
      };
      const out = resize_pipeline.run(
        plan,
        resize_pipeline.stages.DEFAULT,
        ctx
      );
      snap.dispose();
      return out.plan.dx;
    };
    // Moving edge lands on the neighbor's left edge (120 → dx 20) in BOTH modes.
    expect(run(CENTER)).toBeCloseTo(run(OPPOSITE), 6);
    expect(run(CENTER)).toBeCloseTo(20, 6);
  });

  it("circle (uniform branch): snapping the dragged edge keeps the center put", () => {
    // Circle (50,50,r=25), bbox (25,25,50,50). SE drag; neighbor's NW edge at
    // (90,90). Unsnapped SE corner ≈ 87 → within threshold → snaps to 90, so
    // cx + r = 90 → r = 40, and cx/cy must stay 50.
    const snap = new SnapSession({
      agents: [{ x: 25, y: 25, width: 50, height: 50 }],
      neighbors: [{ x: 90, y: 90, width: 20, height: 20 }],
    });
    const plan: ResizePlan = {
      id: "c",
      baseline: circle_baseline(50, 50, 25),
      direction: "se",
      dx: 12,
      dy: 12,
      from_center: true,
    };
    const ctx: ResizeContext = {
      input: { id: "c", direction: "se", dx: 12, dy: 12 },
      modifiers: CENTER,
      options: OPTS,
      snap_session: snap,
    };
    const out = resize_pipeline.run(plan, resize_pipeline.stages.DEFAULT, ctx);
    snap.dispose();

    const { doc, id } = single(`<circle cx="50" cy="50" r="25"/>`);
    const b = resize_pipeline.intent.capture_baseline(doc, id, {
      x: 25,
      y: 25,
      width: 50,
      height: 50,
    });
    const f = resize_pipeline.intent.compute_factors(
      b,
      "se",
      out.plan.dx,
      out.plan.dy,
      false,
      true
    );
    resize_pipeline.intent.apply(doc, id, b, f.sx, f.sy, f.origin);
    expect(doc.get_attr(id, "cx")).toBe("50"); // center preserved under snap
    expect(doc.get_attr(id, "cy")).toBe("50");
    expect(parseFloat(doc.get_attr(id, "r")!)).toBeCloseTo(40, 4); // snapped: cx + r = 90
  });
});

// ─── multi-selection — both members scale about the shared union center ─────

describe("multi-member — center anchor uses the union center", () => {
  it("two rects scale about the union center, union center preserved", () => {
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
    const union = cmath.rect.union([ba.bbox, bb.bbox]); // (0,0,30,10), center (15,5)

    const plan: ResizePlan = {
      id: a,
      baseline: resize_pipeline.synthesize_group_baseline(union),
      members: [
        { id: a, baseline: ba },
        { id: b, baseline: bb },
      ],
      direction: "se",
      dx: 15, // half-width → s=2 about center
      dy: 5,
      from_center: true,
    };
    resize_pipeline.apply(doc, plan);
    // Both doubled about the union center (15,5):
    expect(doc.get_attr(a, "x")).toBe("-15");
    expect(doc.get_attr(a, "y")).toBe("-5");
    expect(doc.get_attr(a, "width")).toBe("20");
    expect(doc.get_attr(b, "x")).toBe("25");
    expect(doc.get_attr(b, "width")).toBe("20");
  });
});

// ─── round-trip + the stable-center invariant (orchestrator path) ───────────

function make_orch(
  editor: ReturnType<typeof createSvgEditorWithInternals>,
  bboxes: Record<string, Rect>
): ResizeOrchestrator {
  const NO_SNAP: ResizeOptions = { ...OPTS, snap_enabled: false };
  return new ResizeOrchestrator({
    get_doc: () => editor._internal.doc,
    emit: () => editor._internal.emit(),
    open_preview: (label) => editor._internal.history.preview(label),
    open_snap: () => null,
    options: () => NO_SNAP,
    bbox_world: (id) => bboxes[id] ?? { x: 0, y: 0, width: 0, height: 0 },
  });
}

describe("round-trip — in-session revert is byte-exact for every kind", () => {
  const CASES: ReadonlyArray<{ tag: string; markup: string; bbox: Rect }> = [
    {
      tag: "rect",
      markup: `<rect x="10" y="10" width="100" height="50"/>`,
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
    {
      tag: "circle",
      markup: `<circle cx="50" cy="50" r="25"/>`,
      bbox: { x: 25, y: 25, width: 50, height: 50 },
    },
    {
      tag: "line",
      markup: `<line x1="0" y1="0" x2="100" y2="40"/>`,
      bbox: { x: 0, y: 0, width: 100, height: 40 },
    },
    {
      tag: "path",
      markup: `<path d="M0 0 L100 0 L100 40 Z"/>`,
      bbox: { x: 0, y: 0, width: 100, height: 40 },
    },
  ];

  for (const c of CASES) {
    it(`${c.tag}: center-resize preview → cancel restores authored bytes`, () => {
      const editor = createSvgEditorWithInternals({
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${c.markup}</svg>`,
      });
      const before = editor.serialize();
      const id = first_tag(editor, c.tag);
      const orch = make_orch(editor, { [id]: c.bbox });
      orch.drive(
        {
          ids: [id],
          direction: "se",
          target_width: c.bbox.width + 40,
          target_height: c.bbox.height + 40,
        },
        CENTER,
        { phase: "preview", snap: false }
      );
      orch.cancel(); // Escape / discard
      expect(editor.serialize()).toBe(before);
    });
  }
});

describe("round-trip — stable center across two deltas in one session", () => {
  it("anchor is frozen at gesture open; result depends only on the final delta", () => {
    const editor = createSvgEditorWithInternals({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect x="10" y="10" width="100" height="50"/></svg>`,
    });
    const id = first_tag(editor, "rect"); // center (60, 35)
    const orch = make_orch(editor, {
      [id]: { x: 10, y: 10, width: 100, height: 50 },
    });
    const input = (w: number, h: number) => ({
      ids: [id],
      direction: "se" as const,
      target_width: w,
      target_height: h,
    });

    orch.drive(input(150, 75), CENTER, { phase: "preview", snap: false }); // delta A
    orch.drive(input(200, 100), CENTER, { phase: "preview", snap: false }); // delta B
    orch.drive(input(200, 100), CENTER, { phase: "commit", snap: false }); // commit B

    // Width reflects ONLY B (200 → s=3 → 300), not A+B; center unchanged.
    expect(editor.document.get_attr(id, "width")).toBe("300");
    const x = parseFloat(editor.document.get_attr(id, "x")!);
    const w = parseFloat(editor.document.get_attr(id, "width")!);
    expect(x + w / 2).toBeCloseTo(60, 6); // center preserved
  });
});

describe("round-trip — accepted cross-gesture drift on edge/vertex models", () => {
  it("a committed center-resize on a rect changes x/y (expected, not a violation)", () => {
    // Unlike circle/ellipse, a rect's position coords re-seat around the new
    // anchor. After commit, x/y differ from the authored values; a second
    // open won't match the original position. This is a real edit, accepted.
    const editor = createSvgEditorWithInternals({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect x="10" y="10" width="100" height="50"/></svg>`,
    });
    const id = first_tag(editor, "rect");
    const orch = make_orch(editor, {
      [id]: { x: 10, y: 10, width: 100, height: 50 },
    });
    const input = {
      ids: [id],
      direction: "se" as const,
      target_width: 200,
      target_height: 100,
    };
    orch.drive(input, CENTER, { phase: "preview", snap: false });
    orch.drive(input, CENTER, { phase: "commit", snap: false });
    expect(editor.document.get_attr(id, "x")).toBe("-90"); // moved (s=3 about center 60)
    expect(editor.document.get_attr(id, "y")).toBe("-40");
  });
});
