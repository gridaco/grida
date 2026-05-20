// chrome → hit-test pipeline for `SelectionShape.transformed`.
//
// Asserts that the new variant produces the right zone count, that
// identity matrix is byte-equivalent to the rect path, and that
// rotation maps knob anchors and hit AABBs through the expected
// affine transform. Outline polylines for transformed shapes are also
// covered.

import { describe, it, expect } from "vitest";
import cmath from "@grida/cmath";
import { SurfaceState } from "../event/state";
import { buildChrome, fanOverlays } from "../surface/chrome";
import { DEFAULT_STYLE } from "../surface/style";
import type { NodeId, Rect } from "../event/gesture";
import { type SelectionShape, shapeBounds } from "../event/shape";

const IDENTITY_CAMERA: cmath.Transform = [
  [1, 0, 0],
  [0, 1, 0],
];

// `DEFAULT_STYLE.showRotationHandles` is `false`. The transformed-chrome
// behavior tests need the rotation halos so the 13-zone arithmetic
// (1 body + 4 corners + 4 edges + 4 rotates) holds.
const STYLE_WITH_ROTATE = { ...DEFAULT_STYLE, showRotationHandles: true };

function buildForShape(
  shape: SelectionShape,
  camera: cmath.Transform = IDENTITY_CAMERA,
  style: typeof DEFAULT_STYLE = STYLE_WITH_ROTATE
) {
  const state = new SurfaceState();
  state.setSelection(["a"]);
  state.setTransform(camera);
  const shapeOf = (id: NodeId): SelectionShape | null =>
    id === "a" ? shape : null;
  const { overlays, decoration } = buildChrome({
    state,
    shapeOf,
    style,
    width: 1000,
    height: 1000,
  });
  const regions = state.hitRegions();
  fanOverlays(overlays, state.getTransform(), regions);
  return {
    overlays,
    decoration,
    hitLabel: (point: [number, number]) =>
      regions.hitTestRegion(point)?.label ?? null,
  };
}

function labels(overlays: ReturnType<typeof buildForShape>["overlays"]) {
  return overlays.map((o) => o.label).sort();
}

function findByLabel(
  overlays: ReturnType<typeof buildForShape>["overlays"],
  label: string
) {
  return overlays.find((o) => o.label === label);
}

describe("transformed chrome — identity equivalence", () => {
  // Identity matrix `transformed` must produce the same overlay
  // labels (and priority ladder) as the `rect` path. Hit AABBs are
  // not byte-identical because the transformed path runs the layout
  // through a shadow rect + rotate(0) — a no-op that introduces
  // floating-point round-trips. We assert label parity and that
  // each label's hit AABB matches numerically to within 1e-9.
  const local: Rect = { x: 10, y: 20, width: 100, height: 50 };

  const rect_chrome = buildForShape({ kind: "rect", rect: local });
  const xform_chrome = buildForShape({
    kind: "transformed",
    local,
    matrix: cmath.transform.identity,
  });

  it("emits the same overlay label set", () => {
    expect(labels(xform_chrome.overlays)).toEqual(labels(rect_chrome.overlays));
  });

  it("emits matching hit AABBs per label", () => {
    for (const o of rect_chrome.overlays) {
      const x = findByLabel(xform_chrome.overlays, o.label);
      if (!x) throw new Error(`missing overlay ${o.label}`);
      if (o.hit.kind !== "screen_aabb" || x.hit.kind !== "screen_aabb")
        continue;
      const a = o.hit.rect;
      const b = x.hit.rect;
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.y).toBeCloseTo(a.y, 9);
      expect(b.width).toBeCloseTo(a.width, 9);
      expect(b.height).toBeCloseTo(a.height, 9);
    }
  });

  it("emits matching priorities per label", () => {
    for (const o of rect_chrome.overlays) {
      const x = findByLabel(xform_chrome.overlays, o.label);
      expect(x!.priority).toBe(o.priority);
    }
  });
});

describe("transformed chrome — 90° rotation", () => {
  // Rect of 100×50 at local (0,0), rotated 90° around its center (50, 25).
  // `cmath.transform.rotate` builds a standard rotation matrix
  // [[cos, -sin], [sin, cos]] (y-up math convention; visually
  // clockwise in y-down screen space). For 90°: matrix is
  // [[0, -1], [1, 0]]. Applied to local NW corner (0, 0):
  //   delta from pivot = (-50, -25)
  //   rotated:         = (25, -50)
  //   doc:             = pivot + rotated = (75, -25)
  const local: Rect = { x: 0, y: 0, width: 100, height: 50 };
  const matrix = cmath.transform.rotate(cmath.transform.identity, 90, [50, 25]);
  const shape: SelectionShape = { kind: "transformed", local, matrix };

  const chrome = buildForShape(shape);

  it("renders all 13 zones (1 body + 4 corners + 4 edges + 4 rotates)", () => {
    const ls = labels(chrome.overlays);
    expect(ls).toContain("translate");
    for (const dir of ["nw", "ne", "se", "sw"]) {
      expect(ls).toContain(`resize_handle:${dir}`);
      expect(ls).toContain(`rotate:${dir}`);
    }
    for (const dir of ["n", "e", "s", "w"]) {
      expect(ls).toContain(`resize_edge:${dir}`);
    }
    expect(chrome.overlays.length).toBe(13);
  });

  it("NW corner knob's doc anchor is at the rotated NW point", () => {
    const nw = findByLabel(chrome.overlays, "resize_handle:nw");
    expect(nw?.render?.kind).toBe("screen_rect");
    if (nw?.render?.kind !== "screen_rect") return;
    expect(nw.render.anchor_doc[0]).toBeCloseTo(75, 9);
    expect(nw.render.anchor_doc[1]).toBeCloseTo(-25, 9);
  });

  it("knob render carries the screen rotation angle", () => {
    const nw = findByLabel(chrome.overlays, "resize_handle:nw");
    if (nw?.render?.kind !== "screen_rect") return;
    // 90° rotation = π/2 rad.
    expect(nw.render.angle ?? 0).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe("transformed chrome — 45° rotation", () => {
  // 100×100 square rotated 45° around its center. Diagonal = 100·√2 ≈ 141.42.
  const local: Rect = { x: 0, y: 0, width: 100, height: 100 };
  const matrix = cmath.transform.rotate(cmath.transform.identity, 45, [50, 50]);
  const shape: SelectionShape = { kind: "transformed", local, matrix };
  const chrome = buildForShape(shape);

  it("body click at the visual rect center returns translate", () => {
    // Center of the 100×100 rect rotated 45° around (50,50) is still (50,50).
    expect(chrome.hitLabel([50, 50])).toBe("translate");
  });

  it("click outside the rotated rect resolves to no chrome (no phantom resize)", () => {
    // 100×100 at 45° has its rotated AABB extending to about (-20.7..120.7) on
    // both axes. Pick a screen point well outside the rotated diamond — the
    // OLD code (AABB-of-rotated-corners) returned phantom translate/resize
    // here; the OBB-based hit shape should return null.
    expect(chrome.hitLabel([-100, -100])).toBeNull();
    expect(chrome.hitLabel([200, 200])).toBeNull();
  });

  it("each rotation halo encloses its corner knob in shadow space", () => {
    for (const dir of ["nw", "ne", "se", "sw"] as const) {
      const corner = findByLabel(chrome.overlays, `resize_handle:${dir}`);
      const rotate = findByLabel(chrome.overlays, `rotate:${dir}`);
      if (corner?.hit.kind !== "screen_obb") continue;
      if (rotate?.hit.kind !== "screen_obb") continue;
      const c = corner.hit.rect;
      const r = rotate.hit.rect;
      // In shadow space (where both rects live), the rotation halo strictly
      // contains the corner knob. Same containment guarantee as the old
      // AABB-based assertion, but now exact instead of conservative.
      expect(r.x).toBeLessThanOrEqual(c.x + 1e-6);
      expect(r.y).toBeLessThanOrEqual(c.y + 1e-6);
      expect(r.x + r.width).toBeGreaterThanOrEqual(c.x + c.width - 1e-6);
      expect(r.y + r.height).toBeGreaterThanOrEqual(c.y + c.height - 1e-6);
    }
  });
});

describe("transformed chrome — long-rect hit-test (regression)", () => {
  // 10:1 rect (200×20) at 30°, the user-reported repro: a long thin rect
  // where the un-rotated N edge zone is a 168×16 strip. Pre-fix, the
  // `pushTransformedChrome` AABB-of-rotated-corners inflated this to
  // ~163×99 — clicks well outside the visible top edge resolved to
  // `resize_edge:n`. The OBB hit shape keeps the test exact.
  const local: Rect = { x: 0, y: 0, width: 200, height: 20 };
  const matrix = cmath.transform.rotate(
    cmath.transform.identity,
    30,
    [100, 10]
  );
  const shape: SelectionShape = { kind: "transformed", local, matrix };
  const chrome = buildForShape(shape);

  it("click at (50, -50) — visually empty space — resolves to no chrome", () => {
    // Pre-fix this returned `resize_edge:n`. Post-fix it must be null:
    // the point is outside the rotated rect entirely.
    expect(chrome.hitLabel([50, -50])).toBeNull();
  });

  it("click at the visual rect center returns translate", () => {
    const center = cmath.vector2.transform([100, 10], matrix);
    expect(chrome.hitLabel(center as [number, number])).toBe("translate");
  });

  it("click on the visual N (top) edge midpoint returns resize_edge:n", () => {
    // Local N midpoint (100, 0) transformed through the matrix lands on the
    // visible top edge of the rotated rect.
    const n_mid = cmath.vector2.transform([100, 0], matrix);
    expect(chrome.hitLabel(n_mid as [number, number])).toBe("resize_edge:n");
  });
});

describe("transformed chrome — skew matrix", () => {
  // Skew on the X axis: [a b tx; c d ty] = [1 0.3 0; 0 1 0].
  // cmath.Transform column order: [[a, b, tx], [c, d, ty]].
  const local: Rect = { x: 0, y: 0, width: 80, height: 40 };
  const matrix: cmath.Transform = [
    [1, 0.3, 0],
    [0, 1, 0],
  ];
  const shape: SelectionShape = { kind: "transformed", local, matrix };
  const chrome = buildForShape(shape);

  it("shapeBounds matches cmath.rect.transform(local, matrix)", () => {
    const bounds = shapeBounds(shape);
    const expected = cmath.rect.transform(local, matrix);
    expect(bounds.x).toBeCloseTo(expected.x, 9);
    expect(bounds.y).toBeCloseTo(expected.y, 9);
    expect(bounds.width).toBeCloseTo(expected.width, 9);
    expect(bounds.height).toBeCloseTo(expected.height, 9);
  });

  it("emits the full 13-zone set", () => {
    expect(chrome.overlays.length).toBe(13);
  });
});

describe("transformed chrome — rotation + non-uniform scale", () => {
  // R(30°) · S(2, 0.5) around origin.
  const local: Rect = { x: 0, y: 0, width: 50, height: 50 };
  const matrix = cmath.transform.scale(
    cmath.transform.rotate(cmath.transform.identity, 30, [0, 0]),
    [2, 0.5],
    [0, 0]
  );
  const shape: SelectionShape = { kind: "transformed", local, matrix };
  const chrome = buildForShape(shape);

  it("each corner knob's doc anchor equals the transformed local corner", () => {
    const local_corners = cmath.rect.toCorners(local);
    // toCorners order: TL, TR, BR, BL → matches NW, NE, SE, SW chrome labels.
    const dirs = ["nw", "ne", "se", "sw"] as const;
    for (let i = 0; i < 4; i++) {
      const knob = findByLabel(chrome.overlays, `resize_handle:${dirs[i]}`);
      if (knob?.render?.kind !== "screen_rect") continue;
      const expected = cmath.vector2.transform(local_corners[i], matrix);
      expect(knob.render.anchor_doc[0]).toBeCloseTo(expected[0], 6);
      expect(knob.render.anchor_doc[1]).toBeCloseTo(expected[1], 6);
    }
  });
});

describe("transformed chrome — mirror (negative determinant)", () => {
  // Mirror in X: S(-1, 1). det = -1.
  const local: Rect = { x: 0, y: 0, width: 60, height: 30 };
  const matrix: cmath.Transform = [
    [-1, 0, 0],
    [0, 1, 0],
  ];
  const shape: SelectionShape = { kind: "transformed", local, matrix };
  const chrome = buildForShape(shape);

  it("does not crash; emits the full 13-zone set", () => {
    expect(chrome.overlays.length).toBe(13);
  });

  it("outline polyline winds through the mirrored corners", () => {
    const polylines = chrome.decoration.polylines ?? [];
    // Outline is the closed polyline of the 4 transformed corners.
    // Mirror in X negates the x-component of each corner.
    const expected_first = cmath.vector2.transform([0, 0], matrix); // (-0, 0)
    const outline = polylines.find(
      (p) => p.points.length === 5 // 4 corners + closing point
    );
    expect(outline).toBeDefined();
    if (!outline) return;
    expect(outline.points[0][0]).toBeCloseTo(expected_first[0], 9);
    expect(outline.points[0][1]).toBeCloseTo(expected_first[1], 9);
  });
});

describe("shapeBounds — transformed regression", () => {
  it("does not throw and returns the AABB of the 4 transformed corners", () => {
    const local: Rect = { x: 0, y: 0, width: 100, height: 50 };
    const matrix = cmath.transform.rotate(
      cmath.transform.identity,
      30,
      [50, 25]
    );
    const shape: SelectionShape = { kind: "transformed", local, matrix };
    expect(() => shapeBounds(shape)).not.toThrow();
    const bounds = shapeBounds(shape);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });
});

describe("transformed chrome — dashed resize preview", () => {
  // Mid-resize preview decoration on a `transformed` shape should be a
  // 4-corner dashed polyline aligned with the rotated artwork, not an
  // AABB rect that diverges from the rotated geometry. Catches the
  // pre-fix behavior where chrome.ts unconditionally pushed
  // `shapeBounds(current_shape)` into decoration_rects.
  it("emits a closed dashed polyline through the 4 transformed corners", () => {
    const local: Rect = { x: 0, y: 0, width: 100, height: 100 };
    const matrix = cmath.transform.rotate(
      cmath.transform.identity,
      30,
      [50, 50]
    );
    const state = new SurfaceState();
    state.setSelection(["a"]);
    state.setTransform(IDENTITY_CAMERA);
    // Force the resize gesture mid-flight. Bypasses pointer wiring.
    state.gesture = {
      kind: "resize",
      ids: ["a"],
      direction: "se",
      initial_shape: { kind: "transformed", local, matrix },
      anchor_doc: [0, 0],
      current_shape: { kind: "transformed", local, matrix },
    };
    const shapeOf = () => null;
    const { decoration } = buildChrome({
      state,
      shapeOf,
      style: STYLE_WITH_ROTATE,
      width: 1000,
      height: 1000,
    });
    const polylines = decoration.polylines ?? [];
    const preview = polylines.find((p) => p.dashed === true);
    expect(preview).toBeDefined();
    if (!preview) return;
    // 4 corners + closing point = 5 vertices.
    expect(preview.points.length).toBe(5);
    expect(preview.points[0]).toEqual(preview.points[4]);
    // The 4 corners equal the matrix-transformed local corners.
    const expected = cmath.rect
      .toCorners(local)
      .map((p) => cmath.vector2.transform(p, matrix));
    for (let i = 0; i < 4; i++) {
      expect(preview.points[i][0]).toBeCloseTo(expected[i][0], 9);
      expect(preview.points[i][1]).toBeCloseTo(expected[i][1], 9);
    }
    // And no AABB rect was emitted alongside.
    const dashed_rects = (decoration.rects ?? []).filter((r) => r.dashed);
    expect(dashed_rects).toHaveLength(0);
  });

  it("axis-aligned `rect` resize still emits a dashed rect (not a polyline)", () => {
    const rect: Rect = { x: 10, y: 20, width: 100, height: 50 };
    const state = new SurfaceState();
    state.setSelection(["a"]);
    state.setTransform(IDENTITY_CAMERA);
    state.gesture = {
      kind: "resize",
      ids: ["a"],
      direction: "se",
      initial_shape: { kind: "rect", rect },
      anchor_doc: [0, 0],
      current_shape: { kind: "rect", rect },
    };
    const shapeOf = () => null;
    const { decoration } = buildChrome({
      state,
      shapeOf,
      style: STYLE_WITH_ROTATE,
      width: 1000,
      height: 1000,
    });
    const dashed_rects = (decoration.rects ?? []).filter((r) => r.dashed);
    expect(dashed_rects).toHaveLength(1);
    const dashed_polylines = (decoration.polylines ?? []).filter(
      (p) => p.dashed
    );
    expect(dashed_polylines).toHaveLength(0);
  });
});
