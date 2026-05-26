import { describe, it, expect } from "vitest";
import type cmath from "@grida/cmath";
import {
  drawCornerRadius,
  computeCornerRadiusLayout,
  cornerRadiusHandlePosRect,
  cornerRadiusHandlePosLine,
  cornerRadiusLayoutGroups,
  resolveCornerDragAnchor,
  DEFAULT_CORNER_RADIUS_HANDLE_INSET,
  type CornerRadiusInput,
} from "../primitives/corner-radius";
import { Surface } from "../surface/surface";
import { HUDCanvas } from "../primitives/canvas";
import type { Intent } from "../event/intent";

// A minimal recorder ctx — same shape as `ruler.test.ts`'s
// `mockCtx`. We don't check pixels; we verify the sequence of canvas
// ops so layout / paint order is pinned.
type Call = { op: string; args: unknown[] };
function mockCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const proxy: Record<string, unknown> = {};
  const record = (op: string) => {
    proxy[op] = (...args: unknown[]) => {
      calls.push({ op, args });
    };
  };
  for (const op of [
    "save",
    "restore",
    "beginPath",
    "moveTo",
    "lineTo",
    "stroke",
    "fill",
    "fillRect",
    "fillText",
    "setTransform",
    "translate",
    "rotate",
    "clearRect",
    "ellipse",
    "strokeRect",
  ]) {
    record(op);
  }
  for (const key of [
    "globalAlpha",
    "strokeStyle",
    "lineWidth",
    "fillStyle",
    "textAlign",
    "font",
  ]) {
    Object.defineProperty(proxy, key, {
      set(value) {
        calls.push({ op: `set:${key}`, args: [value] });
      },
      get() {
        return undefined;
      },
    });
  }
  return { ctx: proxy as unknown as CanvasRenderingContext2D, calls };
}

const IDENTITY: [[number, number, number], [number, number, number]] = [
  [1, 0, 0],
  [0, 1, 0],
];

// ─── Pure layout — arc-center math ────────────────────────────────────────

describe("cornerRadiusHandlePosRect — arc-center math", () => {
  // UX spec: each handle sits at the rounded-corner's ARC CENTER —
  // offset by `r` in BOTH x and y from the corner toward the rect's
  // interior. Travel direction is the corner's intercardinal
  // diagonal `(sign_x, sign_y)`, NOT the corner→rect-center vector.
  // The position reads as the radius value directly: a knob at (10,
  // 10) from the corner means radius=10.
  const rect = { x: 0, y: 0, width: 200, height: 200 };

  it("at radius=0 (resting), floors to the padded inset along (sign_x, sign_y)", () => {
    const p = cornerRadiusHandlePosRect(rect, "nw", 0, 1);
    // NW sign = (+1, +1). pad_doc = 16/1 = 16. handle = (0+16, 0+16).
    expect(p[0]).toBeCloseTo(16, 5);
    expect(p[1]).toBeCloseTo(16, 5);
  });

  it("at radius below pad (resting), still floors to padded inset", () => {
    const p = cornerRadiusHandlePosRect(rect, "nw", 5, 1);
    expect(p[0]).toBeCloseTo(16, 5);
    expect(p[1]).toBeCloseTo(16, 5);
  });

  it("at radius above pad (resting), follows the radius: (corner + r, corner + r)", () => {
    const p = cornerRadiusHandlePosRect(rect, "nw", 50, 1);
    expect(p[0]).toBeCloseTo(50, 5);
    expect(p[1]).toBeCloseTo(50, 5);
  });

  it("during gesture, lifts the padded floor — radius=0 puts the knob AT the corner", () => {
    const p = cornerRadiusHandlePosRect(rect, "nw", 0, 1, {
      during_gesture: true,
    });
    expect(p[0]).toBeCloseTo(0, 5);
    expect(p[1]).toBeCloseTo(0, 5);
  });

  it("places NE/SE/SW knobs symmetrically with their (sign_x, sign_y)", () => {
    // NE: (200, 0) + (-r, +r). At radius=0 (resting), pad=16.
    const ne = cornerRadiusHandlePosRect(rect, "ne", 0, 1);
    expect(ne[0]).toBeCloseTo(200 - 16, 5);
    expect(ne[1]).toBeCloseTo(0 + 16, 5);
    // SE: (200, 200) + (-r, -r).
    const se = cornerRadiusHandlePosRect(rect, "se", 0, 1);
    expect(se[0]).toBeCloseTo(200 - 16, 5);
    expect(se[1]).toBeCloseTo(200 - 16, 5);
    // SW: (0, 200) + (+r, -r).
    const sw = cornerRadiusHandlePosRect(rect, "sw", 0, 1);
    expect(sw[0]).toBeCloseTo(0 + 16, 5);
    expect(sw[1]).toBeCloseTo(200 - 16, 5);
  });

  it("scales the pad to doc-space when zoomed in (pad stays 16 screen-px)", () => {
    // At zoom 2, pad_doc = 16/2 = 8 doc-px. NW knob at radius=0 sits
    // at (8, 8) in doc-space.
    const p = cornerRadiusHandlePosRect(rect, "nw", 0, 2);
    expect(p[0]).toBeCloseTo(8, 5);
    expect(p[1]).toBeCloseTo(8, 5);
  });

  // UX spec: the handle never overshoots `min(w, h) / 2` — past that,
  // the rounded corner would overlap its neighbor. The chrome
  // enforces the geometric ceiling at the position layer; what the
  // host stores as `radius` is the host's choice (and the demo
  // clamps too).
  it("clamps handle position at min(w, h) / 2 even when the radius is larger", () => {
    const oblong = { x: 0, y: 0, width: 200, height: 120 };
    const cap = Math.min(oblong.width, oblong.height) / 2; // 60
    // NW: a "200" radius should still land the knob at (60, 60).
    const p = cornerRadiusHandlePosRect(oblong, "nw", 200, 1);
    expect(p[0]).toBeCloseTo(cap, 5);
    expect(p[1]).toBeCloseTo(cap, 5);
  });
});

describe("cornerRadiusHandlePosRect — rotated rect via transform", () => {
  // UX spec: when the input carries a local → doc transform, handle
  // positions compute in local space first and then map through the
  // transform. For a 90°-rotated 200×200 rect, the NW corner in
  // LOCAL space (0, 0) becomes a different doc-space point — and
  // the (sign_x, sign_y)=+1,+1 direction rotates into doc space
  // too. The knob ends up offset from the rotated NW corner along
  // the ROTATED diagonal.
  const rect = { x: 0, y: 0, width: 200, height: 200 };

  it("rotates a NW handle by the transform's linear part", () => {
    // 90° CCW transform around the origin: maps (x, y) → (-y, x).
    // For local NW (0, 0): doc = (0, 0). Local (16, 16) padded
    // position → doc (-16, 16). The NW knob at radius=0 should sit
    // at (-16, 16) in doc-space.
    const rot90: cmath.Transform = [
      [0, -1, 0],
      [1, 0, 0],
    ];
    const p = cornerRadiusHandlePosRect(rect, "nw", 0, 1, {
      transform: rot90,
    });
    expect(p[0]).toBeCloseTo(-16, 5);
    expect(p[1]).toBeCloseTo(16, 5);
  });

  it("identity transform produces the same result as no transform", () => {
    const id: cmath.Transform = [
      [1, 0, 0],
      [0, 1, 0],
    ];
    const a = cornerRadiusHandlePosRect(rect, "ne", 50, 1);
    const b = cornerRadiusHandlePosRect(rect, "ne", 50, 1, { transform: id });
    expect(a[0]).toBeCloseTo(b[0], 5);
    expect(a[1]).toBeCloseTo(b[1], 5);
  });

  it("translates the rect by the transform's translation component", () => {
    // Translate by (100, 50) only — no rotation. The handle for NW
    // at radius=0 (pad=16) goes from (16, 16) → (116, 66).
    const tr: cmath.Transform = [
      [1, 0, 100],
      [0, 1, 50],
    ];
    const p = cornerRadiusHandlePosRect(rect, "nw", 0, 1, { transform: tr });
    expect(p[0]).toBeCloseTo(116, 5);
    expect(p[1]).toBeCloseTo(66, 5);
  });
});

describe("cornerRadiusHandlePosLine — projection along a → b", () => {
  it("renders at padded inset on the a→b axis at radius=0", () => {
    const p = cornerRadiusHandlePosLine([0, 0], [100, 0], 0, 1);
    expect(p[0]).toBeCloseTo(DEFAULT_CORNER_RADIUS_HANDLE_INSET, 5);
    expect(p[1]).toBeCloseTo(0, 5);
  });

  it("during gesture, lifts the floor — radius=0 sits AT a", () => {
    const p = cornerRadiusHandlePosLine([0, 0], [100, 0], 0, 1, {
      during_gesture: true,
    });
    expect(p[0]).toBeCloseTo(0, 5);
    expect(p[1]).toBeCloseTo(0, 5);
  });

  it("renders at the radius position once radius > pad", () => {
    const p = cornerRadiusHandlePosLine([0, 0], [100, 0], 40, 1);
    expect(p[0]).toBeCloseTo(40, 5);
    expect(p[1]).toBeCloseTo(0, 5);
  });

  it("clamps at b when radius exceeds the a→b distance", () => {
    const p = cornerRadiusHandlePosLine([0, 0], [100, 0], 200, 1);
    expect(p[0]).toBeCloseTo(100, 5);
    expect(p[1]).toBeCloseTo(0, 5);
  });
});

// ─── computeCornerRadiusLayout — handle enumeration ───────────────────────

describe("computeCornerRadiusLayout", () => {
  const rect = { x: 0, y: 0, width: 200, height: 200 };

  it("emits 4 handles in nw/ne/se/sw order for a rect", () => {
    const input: CornerRadiusInput = {
      node_id: "n1",
      geometry: { kind: "rect", rect },
      radius: { tl: 8, tr: 12, br: 16, bl: 4 },
    };
    const layout = computeCornerRadiusLayout(input, null, 1);
    expect(layout).toHaveLength(4);
    expect(layout.map((h) => h.anchor)).toEqual(["nw", "ne", "se", "sw"]);
    expect(layout.map((h) => h.label)).toEqual([
      "corner_radius:nw",
      "corner_radius:ne",
      "corner_radius:se",
      "corner_radius:sw",
    ]);
  });

  it("emits 1 handle for line geometry, labelled corner_radius:line", () => {
    const input: CornerRadiusInput = {
      node_id: "n1",
      geometry: { kind: "line", a: [0, 0], b: [100, 0] },
      radius: { value: 0 },
    };
    const layout = computeCornerRadiusLayout(input, null, 1);
    expect(layout).toHaveLength(1);
    expect(layout[0].anchor).toBe("line");
    expect(layout[0].label).toBe("corner_radius:line");
  });

  it("falls back to the selection rect when geometry.rect is omitted", () => {
    const input: CornerRadiusInput = {
      node_id: "n1",
      geometry: { kind: "rect" },
      radius: { tl: 0, tr: 0, br: 0, bl: 0 },
    };
    const layout = computeCornerRadiusLayout(input, rect, 1);
    expect(layout).toHaveLength(4);
    expect(layout.map((h) => h.anchor)).toEqual(["nw", "ne", "se", "sw"]);
  });

  it("returns no handles when neither geometry.rect nor a fallback is supplied", () => {
    const input: CornerRadiusInput = {
      node_id: "n1",
      geometry: { kind: "rect" },
      radius: { tl: 0, tr: 0, br: 0, bl: 0 },
    };
    const layout = computeCornerRadiusLayout(input, null, 1);
    expect(layout).toHaveLength(0);
  });
});

// ─── cornerRadiusLayoutGroups — coincidence detection ─────────────────────

describe("cornerRadiusLayoutGroups", () => {
  // UX spec: groups represent N corners sharing a screen position.
  // Sub-max radii produce 4 single-anchor groups; oblong max
  // produces 2 pair-groups; square max produces 1 quadruple-group.
  // The grouping is geometric — value equality alone does NOT
  // collapse handles. Equal-but-small radii still produce 4 groups
  // because each knob has a DISTINCT position along the X.
  it("returns 4 single-member groups for sub-max radii (no coincidence)", () => {
    const rect = { x: 0, y: 0, width: 200, height: 200 };
    const input: CornerRadiusInput = {
      node_id: "n1",
      geometry: { kind: "rect", rect },
      radius: { tl: 30, tr: 30, br: 30, bl: 30 },
    };
    const layout = computeCornerRadiusLayout(input, null, 1);
    const groups = cornerRadiusLayoutGroups(layout);
    expect(groups).toHaveLength(4);
    expect(groups.map((g) => g.length)).toEqual([1, 1, 1, 1]);
  });

  // UX spec: a 200×120 oblong at max radius (60 = min(w,h)/2) puts
  // TL at (60, 60), TR at (140, 60), BR at (140, 60), BL at (60, 60).
  // TL coincides with BL; TR coincides with BR. Two pair groups.
  it("returns 2 pair-groups for an oblong (w > h) at max radius", () => {
    const oblong = { x: 0, y: 0, width: 200, height: 120 };
    const cap = Math.min(oblong.width, oblong.height) / 2; // 60
    const input: CornerRadiusInput = {
      node_id: "n1",
      geometry: { kind: "rect", rect: oblong },
      radius: { tl: cap, tr: cap, br: cap, bl: cap },
    };
    const layout = computeCornerRadiusLayout(input, null, 1);
    const groups = cornerRadiusLayoutGroups(layout);
    expect(groups).toHaveLength(2);
    // Group order is by iteration: nw is first, so its group leads;
    // sw shares with nw → ["nw", "sw"]. ne is next, se shares with
    // ne → ["ne", "se"].
    expect(groups[0]).toEqual(["nw", "sw"]);
    expect(groups[1]).toEqual(["ne", "se"]);
  });

  // UX spec: a tall oblong (h > w) collapses the OTHER axis — TL
  // pairs with TR, BL pairs with BR.
  it("returns 2 pair-groups for an oblong (h > w) at max radius", () => {
    const tall = { x: 0, y: 0, width: 120, height: 200 };
    const cap = Math.min(tall.width, tall.height) / 2; // 60
    const input: CornerRadiusInput = {
      node_id: "n1",
      geometry: { kind: "rect", rect: tall },
      radius: { tl: cap, tr: cap, br: cap, bl: cap },
    };
    const layout = computeCornerRadiusLayout(input, null, 1);
    const groups = cornerRadiusLayoutGroups(layout);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual(["nw", "ne"]);
    expect(groups[1]).toEqual(["se", "sw"]);
  });

  // UX spec: a square at max radius (= half-width = half-height)
  // collapses all four handles to the rect center.
  it("returns 1 quadruple-group for a square at max radius", () => {
    const sq = { x: 0, y: 0, width: 200, height: 200 };
    const cap = 100; // min(w,h)/2
    const input: CornerRadiusInput = {
      node_id: "n1",
      geometry: { kind: "rect", rect: sq },
      radius: { tl: cap, tr: cap, br: cap, bl: cap },
    };
    const layout = computeCornerRadiusLayout(input, null, 1);
    const groups = cornerRadiusLayoutGroups(layout);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(["nw", "ne", "se", "sw"]);
  });

  // UX spec: equal-but-small radii DON'T collapse — each knob has
  // a distinct position along the X. Pins the geometric-vs-value
  // rule against the legacy "all equal collapses" mistake.
  it("returns 4 single groups for equal but non-maximal radii", () => {
    const sq = { x: 0, y: 0, width: 200, height: 200 };
    const input: CornerRadiusInput = {
      node_id: "n1",
      geometry: { kind: "rect", rect: sq },
      radius: { tl: 30, tr: 30, br: 30, bl: 30 },
    };
    const layout = computeCornerRadiusLayout(input, null, 1);
    const groups = cornerRadiusLayoutGroups(layout);
    expect(groups).toHaveLength(4);
  });

  it("returns an empty list for line geometry", () => {
    const input: CornerRadiusInput = {
      node_id: "n1",
      geometry: { kind: "line", a: [0, 0], b: [100, 0] },
      radius: { value: 0 },
    };
    const layout = computeCornerRadiusLayout(input, null, 1);
    expect(cornerRadiusLayoutGroups(layout)).toEqual([]);
  });
});

// ─── resolveCornerDragAnchor — direction resolution ───────────────────────

describe("resolveCornerDragAnchor", () => {
  // UX spec: a multi-candidate drag resolves to the anchor whose
  // (sign_x, sign_y) direction best matches the NEGATED drag delta
  // (the user pulls the handle TOWARD the corner whose radius they
  // mean to shrink). Resolution is constrained to `candidates`.
  it("resolves nw when the drag pulls up-and-left (4 candidates)", () => {
    expect(resolveCornerDragAnchor(-10, -10, ["nw", "ne", "se", "sw"])).toBe(
      "nw"
    );
  });

  it("resolves se when the drag pulls down-and-right (4 candidates)", () => {
    expect(resolveCornerDragAnchor(10, 10, ["nw", "ne", "se", "sw"])).toBe(
      "se"
    );
  });

  // UX spec: when the candidate set is constrained (an oblong-max
  // pair, e.g. ["nw", "sw"]), the resolver picks among those two
  // only. A drag toward ne can't resolve to ne if ne isn't a
  // candidate — it falls to whichever of the candidates is closest.
  it("constrains resolution to the candidate set (oblong-max nw/sw pair)", () => {
    // Drag pulls up — nw direction (1,1) matches negated -10y better
    // than sw direction (1,-1) (which would match a downward pull).
    expect(resolveCornerDragAnchor(0, -10, ["nw", "sw"])).toBe("nw");
    // Drag pulls down — sw wins.
    expect(resolveCornerDragAnchor(0, 10, ["nw", "sw"])).toBe("sw");
  });

  it("ties break in candidate order (first listed wins)", () => {
    // dx=-10, dy=0 — equally matches nw [1,1] and sw [1,-1] (both
    // have -x in their negated direction). With ["nw", "sw"], nw
    // wins by being listed first.
    expect(resolveCornerDragAnchor(-10, 0, ["nw", "sw"])).toBe("nw");
  });

  // UX spec: on a rotated rect, the user's drag direction is in
  // doc-space — pulling "up-left-on-screen" should resolve to
  // whichever corner is up-and-left RELATIVE TO THE ROTATED RECT,
  // not whichever corner is up-and-left in world axes. The host
  // passes the rect's local→doc transform; the resolver rotates the
  // local sign vectors through it.
  it("rotates local sign vectors through transform for rotated rects", () => {
    // 90° rotation: T = [[0, -1, 0], [1, 0, 0]]. Local sign vectors
    // map through T.linear to doc-space:
    //   nw (1,1)   → ( 0·1 + -1·1,  1·1 + 0·1 ) = (-1, 1)
    //   ne (-1,1)  → ( 0·-1+ -1·1,  1·-1+ 0·1 ) = (-1,-1)
    //   se (-1,-1) → ( 0·-1+ -1·-1, 1·-1+ 0·-1) = ( 1,-1)
    //   sw (1,-1)  → ( 0·1 + -1·-1, 1·1 + 0·-1) = ( 1, 1)
    //
    // For drag delta (-10, 10) in doc-space, the resolver picks the
    // candidate maximizing `sign_doc · -delta = sign_doc · (10, -10)`:
    //   nw: -1·10 +  1·-10 = -20
    //   ne: -1·10 + -1·-10 =   0
    //   se:  1·10 + -1·-10 =  20   ← max
    //   sw:  1·10 +  1·-10 =   0
    // → se wins on the rotated rect.
    const transform90: cmath.Transform = [
      [0, -1, 0],
      [1, 0, 0],
    ];
    expect(
      resolveCornerDragAnchor(-10, 10, ["nw", "ne", "se", "sw"], transform90)
    ).toBe("se");
    // Sanity: same drag with no transform resolves to sw (the
    // axis-aligned answer — local sign (1,-1) dotted with (10,-10)
    // is 20, the max).
    expect(resolveCornerDragAnchor(-10, 10, ["nw", "ne", "se", "sw"])).toBe(
      "sw"
    );
  });

  it("is a no-op when transform is the identity (matches no-transform path)", () => {
    const identity: cmath.Transform = [
      [1, 0, 0],
      [0, 1, 0],
    ];
    expect(
      resolveCornerDragAnchor(-10, -10, ["nw", "ne", "se", "sw"], identity)
    ).toBe("nw");
    expect(
      resolveCornerDragAnchor(10, 10, ["nw", "ne", "se", "sw"], identity)
    ).toBe("se");
  });
});

// ─── drawCornerRadius — the pure painter ──────────────────────────────────

describe("drawCornerRadius", () => {
  it("paints nothing when handles is empty", () => {
    const { ctx, calls } = mockCtx();
    drawCornerRadius({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      handles: [],
      color: "#000",
    });
    expect(calls).toHaveLength(0);
  });

  it("sets the ctx transform to (dpr,0,0,dpr,0,0) before painting", () => {
    const { ctx, calls } = mockCtx();
    drawCornerRadius({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 2,
      handles: [
        {
          pos: [100, 100],
          size: 8,
          hit_size: 16,
          anchor: "nw",
          label: "corner_radius:nw",
        },
      ],
      color: "#000",
    });
    const dprSet = calls.find(
      (c) =>
        c.op === "setTransform" &&
        c.args[0] === 2 &&
        c.args[3] === 2 &&
        c.args[4] === 0 &&
        c.args[5] === 0
    );
    expect(dprSet).toBeDefined();
  });

  it("paints one ellipse per configured handle", () => {
    const { ctx, calls } = mockCtx();
    drawCornerRadius({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      handles: [
        {
          pos: [10, 10],
          size: 8,
          hit_size: 16,
          anchor: "nw",
          label: "corner_radius:nw",
        },
        {
          pos: [20, 20],
          size: 8,
          hit_size: 16,
          anchor: "ne",
          label: "corner_radius:ne",
        },
      ],
      color: "#000",
    });
    const ellipses = calls.filter((c) => c.op === "ellipse");
    expect(ellipses).toHaveLength(2);
  });

  // UX spec: when multiple handles project to the same screen pixel
  // (oblong-max pair, square-max quadruple), the painter dedups so
  // the user sees ONE knob, not N stacked. Dedup is at integer
  // screen-px granularity — same precision as the `drawCornerRadius`
  // ellipse(scrX, scrY, ...) call rounds to.
  it("dedups coincident handles into a single ellipse paint", () => {
    const { ctx, calls } = mockCtx();
    drawCornerRadius({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      handles: [
        {
          pos: [50, 50],
          size: 8,
          hit_size: 16,
          anchor: "nw",
          label: "corner_radius:nw",
        },
        {
          pos: [50, 50],
          size: 8,
          hit_size: 16,
          anchor: "sw",
          label: "corner_radius:sw",
        },
      ],
      color: "#000",
    });
    const ellipses = calls.filter((c) => c.op === "ellipse");
    expect(ellipses).toHaveLength(1);
  });
});

// ─── Surface integration — hit-test, intents, snap-back ───────────────────

describe("Surface — corner-radius integration", () => {
  function fakeCanvas() {
    const { ctx, calls } = mockCtx();
    const canvas = {
      width: 0,
      height: 0,
      style: { width: "", height: "" } as Record<string, string>,
      getContext: () => ctx,
    };
    return { canvas: canvas as unknown as HTMLCanvasElement, ctx, calls };
  }

  function makeSurface(intents: Intent[]) {
    const { canvas } = fakeCanvas();
    const rect = { x: 0, y: 0, width: 200, height: 200 };
    const surface = new Surface(canvas, {
      pick: () => null,
      shapeOf: () => ({ kind: "rect", rect }),
      onIntent: (i) => intents.push(i),
    });
    surface.setSize(400, 400);
    surface.setTransform(IDENTITY);
    return { surface, rect };
  }

  // UX spec: a sub-max input produces 4 single-anchor hit zones,
  // one per corner. pointer_down on the NW knob emits `corner_radius`
  // with anchor="nw" (default kind; alt off).
  it("enumerates 4 hit-zones for sub-max radii (one per corner)", () => {
    const intents: Intent[] = [];
    const { surface } = makeSurface(intents);
    surface.setCornerRadius({
      node_id: "n1",
      geometry: { kind: "rect", rect: { x: 0, y: 0, width: 200, height: 200 } },
      radius: { tl: 0, tr: 0, br: 0, bl: 8 }, // distinct (no coincidence)
    });
    surface.draw();

    // NW knob at radius=0 sits at (pad, pad) = (16, 16).
    surface.dispatch({
      kind: "pointer_down",
      x: 16,
      y: 16,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_move",
      x: 24,
      y: 24,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_up",
      x: 24,
      y: 24,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });

    const cr = intents.filter((i) => i.kind === "corner_radius");
    expect(cr.length).toBeGreaterThan(0);
    expect((cr[0] as Extract<Intent, { kind: "corner_radius" }>).anchor).toBe(
      "nw"
    );
  });

  // UX spec: line geometry emits `corner_radius_uniform`, not the
  // per-corner variants.
  it("emits corner_radius_uniform on line-geometry drag", () => {
    const intents: Intent[] = [];
    const { canvas } = fakeCanvas();
    const surface = new Surface(canvas, {
      pick: () => null,
      shapeOf: () => ({ kind: "line", p1: [0, 0], p2: [100, 0] }),
      onIntent: (i) => intents.push(i),
    });
    surface.setSize(400, 400);
    surface.setTransform(IDENTITY);
    surface.setCornerRadius({
      node_id: "n1",
      geometry: { kind: "line", a: [0, 0], b: [100, 0] },
      radius: { value: 0 },
    });
    surface.draw();

    const pad = DEFAULT_CORNER_RADIUS_HANDLE_INSET;
    surface.dispatch({
      kind: "pointer_down",
      x: pad,
      y: 0,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_move",
      x: pad + 10,
      y: 0,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_up",
      x: pad + 10,
      y: 0,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });

    expect(intents.some((i) => i.kind === "corner_radius_uniform")).toBe(true);
    expect(intents.some((i) => i.kind === "corner_radius")).toBe(false);
    expect(intents.some((i) => i.kind === "corner_radius_explicit")).toBe(
      false
    );
  });

  // UX spec: alt-held drag on a rect handle emits
  // `corner_radius_explicit`, not `corner_radius`. Intent kind is
  // decided ONCE at gesture start — toggling alt mid-drag doesn't
  // switch the branch.
  it("emits corner_radius_explicit when alt is held at pointer_down", () => {
    const intents: Intent[] = [];
    const { surface } = makeSurface(intents);
    surface.setCornerRadius({
      node_id: "n1",
      geometry: { kind: "rect", rect: { x: 0, y: 0, width: 200, height: 200 } },
      radius: { tl: 0, tr: 0, br: 0, bl: 8 },
    });
    surface.draw();

    surface.dispatch({
      kind: "pointer_down",
      x: 16,
      y: 16,
      button: "primary",
      mods: { shift: false, alt: true, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_move",
      x: 24,
      y: 24,
      mods: { shift: false, alt: true, meta: false, ctrl: false },
    });

    expect(intents.some((i) => i.kind === "corner_radius_explicit")).toBe(true);
    expect(intents.some((i) => i.kind === "corner_radius")).toBe(false);
  });

  // UX spec: square-max input collapses all four handles to one
  // hit zone at the rect center. pointer_down on that knob opens a
  // gesture with `candidates: [nw, ne, se, sw]` and `anchor: null`.
  // Pre-threshold movement emits NO intent (anchor not yet
  // resolved). Post-threshold, the direction resolves the anchor.
  it("center-resolve drag: pre-threshold emits no intent; post-threshold names the corner", () => {
    const intents: Intent[] = [];
    const { surface } = makeSurface(intents);
    // 200×200 square. min(w,h)/2 = 100 → all four handles coincide
    // at the rect center (100, 100).
    surface.setCornerRadius({
      node_id: "n1",
      geometry: { kind: "rect", rect: { x: 0, y: 0, width: 200, height: 200 } },
      radius: { tl: 100, tr: 100, br: 100, bl: 100 },
    });
    surface.draw();

    surface.dispatch({
      kind: "pointer_down",
      x: 100,
      y: 100,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    // Pre-threshold: 1-px move. No intent fires.
    surface.dispatch({
      kind: "pointer_move",
      x: 101,
      y: 101,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    expect(intents.length).toBe(0);

    // Post-threshold: pull up-and-left toward NW. The first intent
    // names anchor="nw".
    surface.dispatch({
      kind: "pointer_move",
      x: 90,
      y: 90,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    expect(intents.length).toBeGreaterThan(0);
    const first = intents[0] as Extract<Intent, { kind: "corner_radius" }>;
    expect(first.kind).toBe("corner_radius");
    expect(first.anchor).toBe("nw");
  });

  // UX spec: oblong-max input collapses handles in PAIRS. For a
  // 200×120 rect at radii = 60, TL & BL share (60, 60); TR & BR
  // share (140, 60). pointer_down on the left pair opens a gesture
  // with `candidates: ["nw", "sw"]` — direction resolves between
  // those two only, never to NE or SE.
  it("oblong-max pair: direction resolves AMONG candidates only (nw/sw, not ne/se)", () => {
    const intents: Intent[] = [];
    const { canvas } = fakeCanvas();
    const oblong = { x: 0, y: 0, width: 200, height: 120 };
    const surface = new Surface(canvas, {
      pick: () => null,
      shapeOf: () => ({ kind: "rect", rect: oblong }),
      onIntent: (i) => intents.push(i),
    });
    surface.setSize(400, 400);
    surface.setTransform(IDENTITY);
    const cap = 60; // min(200, 120) / 2
    surface.setCornerRadius({
      node_id: "n1",
      geometry: { kind: "rect", rect: oblong },
      radius: { tl: cap, tr: cap, br: cap, bl: cap },
    });
    surface.draw();

    // Left pair sits at (60, 60). pointer_down + a strongly DOWN
    // drag → should resolve to "sw" (which has sign (1, -1) — the
    // negated drag (0, -10) is (0, 10) which the SW sign minus-
    // matches best among {nw[1,1], sw[1,-1]}).
    surface.dispatch({
      kind: "pointer_down",
      x: 60,
      y: 60,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_move",
      x: 60,
      y: 80, // pull down past threshold
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    expect(intents.length).toBeGreaterThan(0);
    const first = intents[0] as Extract<Intent, { kind: "corner_radius" }>;
    // The candidate set was [nw, sw]; the resolved anchor must be
    // one of them (NOT ne or se, even if a strongly down drag could
    // intuit "se" in an unconstrained world).
    expect(["nw", "sw"]).toContain(first.anchor);
    expect(first.anchor).toBe("sw");
  });

  // UX spec: corner-radius handles outrank the resize-corner zones
  // in the hit-test ladder. A click ON the corner-radius knob takes
  // it, not the resize knob beneath. The knob at radius=0 sits at
  // (16, 16) — well inside the rect.
  it("corner-radius handle wins overlap with the resize-corner at its hit zone", () => {
    const intents: Intent[] = [];
    const { surface } = makeSurface(intents);
    surface.setSelection(["n1"]);
    surface.setCornerRadius({
      node_id: "n1",
      geometry: { kind: "rect", rect: { x: 0, y: 0, width: 200, height: 200 } },
      radius: { tl: 0, tr: 0, br: 0, bl: 8 }, // sub-max → 4 single zones
    });
    surface.draw();

    // Click AT the NW knob's resting position (16, 16). Hit-test must
    // produce a corner_radius intent, never a resize intent.
    surface.dispatch({
      kind: "pointer_down",
      x: 16,
      y: 16,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_move",
      x: 20,
      y: 20,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    expect(intents.some((i) => i.kind === "corner_radius")).toBe(true);
    expect(intents.some((i) => i.kind === "resize")).toBe(false);
  });

  // UX spec: a rotated rect input projects the cursor onto the
  // ROTATED diagonal axis, not the doc-axis one. With a 90° CCW
  // transform, the NW corner's diagonal direction becomes (-1, +1)
  // in doc-space — pulling the cursor toward (-, +) increases the
  // radius. This test moves the cursor by (-20, 20) in doc-space
  // and expects the emitted `value` to be ≈ 20 (the projection
  // magnitude divided by sqrt(2)·sqrt(2)/2 ≈ |Δ|·sqrt(2)/2).
  it("projects cursor onto the rotated diagonal for a transformed rect input", () => {
    const intents: Intent[] = [];
    const { canvas } = fakeCanvas();
    const rect = { x: 0, y: 0, width: 200, height: 200 };
    // 90° CCW around the origin: doc = ([-y, x]).
    const rot90: cmath.Transform = [
      [0, -1, 0],
      [1, 0, 0],
    ];
    const surface = new Surface(canvas, {
      pick: () => null,
      shapeOf: () => ({ kind: "rect", rect }),
      onIntent: (i) => intents.push(i),
    });
    surface.setSize(400, 400);
    surface.setTransform(IDENTITY);
    surface.setCornerRadius({
      node_id: "n1",
      geometry: { kind: "rect", rect, transform: rot90 },
      radius: { tl: 0, tr: 0, br: 0, bl: 8 }, // distinct positions
    });
    surface.draw();

    // NW handle at radius=0, padded inset = 16. Local position = (16, 16).
    // Doc position = rot90 · (16, 16) = (-16, 16).
    surface.dispatch({
      kind: "pointer_down",
      x: -16,
      y: 16,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    // Drag in doc-space toward (-36, 36) — that's moving "along" the
    // rotated diagonal of the NW corner. The projected r should be ≈ 20.
    surface.dispatch({
      kind: "pointer_move",
      x: -36,
      y: 36,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    const last = intents[intents.length - 1] as Extract<
      Intent,
      { kind: "corner_radius" }
    >;
    expect(last.kind).toBe("corner_radius");
    expect(last.anchor).toBe("nw");
    // The handle was at (-16, 16); cursor moved to (-36, 36) which
    // corresponds to local (36, 36). Local r = (36*1 + 36*1)/2 = 36.
    expect(last.value).toBeCloseTo(36, 1);
  });

  // UX spec: setCornerRadius accepts an ARRAY — two nodes can be
  // edited at once in the same viewport. Each input's chrome is
  // independent; each emitted intent carries its own node_id. Pins
  // the multi-input contract used by §15's combined rect demo
  // (axis-aligned + rotated rects in one canvas).
  it("renders chrome for multiple inputs at once and routes intents by node_id", () => {
    const intents: Intent[] = [];
    const { canvas } = fakeCanvas();
    // Two non-overlapping rects so each set of knobs has its own
    // hit zones. Left rect at (0, 0, 100, 100); right at (200, 0, 100, 100).
    const left = { x: 0, y: 0, width: 100, height: 100 };
    const right = { x: 200, y: 0, width: 100, height: 100 };
    const surface = new Surface(canvas, {
      pick: () => null,
      shapeOf: (id) => ({
        kind: "rect",
        rect: id === "L" ? left : right,
      }),
      onIntent: (i) => intents.push(i),
    });
    surface.setSize(400, 400);
    surface.setTransform(IDENTITY);
    surface.setCornerRadius([
      {
        node_id: "L",
        geometry: { kind: "rect", rect: left },
        radius: { tl: 0, tr: 0, br: 0, bl: 0 },
      },
      {
        node_id: "R",
        geometry: { kind: "rect", rect: right },
        radius: { tl: 0, tr: 0, br: 0, bl: 0 },
      },
    ]);
    surface.draw();

    // Drag the LEFT NW knob (sits at (16, 16)). Intent should carry
    // node_id="L".
    surface.dispatch({
      kind: "pointer_down",
      x: 16,
      y: 16,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_move",
      x: 24,
      y: 24,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    const left_intent = intents[intents.length - 1] as Extract<
      Intent,
      { kind: "corner_radius" }
    >;
    expect(left_intent.kind).toBe("corner_radius");
    expect(left_intent.node_id).toBe("L");

    surface.dispatch({
      kind: "pointer_up",
      x: 24,
      y: 24,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });

    // Now drag the RIGHT NW knob (sits at (216, 16)). Intent
    // node_id should be "R", NOT "L".
    surface.dispatch({
      kind: "pointer_down",
      x: 216,
      y: 16,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_move",
      x: 224,
      y: 24,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    const right_intent = intents[intents.length - 1] as Extract<
      Intent,
      { kind: "corner_radius" }
    >;
    expect(right_intent.kind).toBe("corner_radius");
    expect(right_intent.node_id).toBe("R");
  });

  // UX spec: setCornerRadius(null) clears the chrome — subsequent
  // draws paint no handles and pointer_down at the previous knob
  // position no longer produces a corner_radius intent.
  it("clears the chrome when setCornerRadius(null) is called", () => {
    const intents: Intent[] = [];
    const { surface } = makeSurface(intents);
    surface.setCornerRadius({
      node_id: "n1",
      geometry: { kind: "rect", rect: { x: 0, y: 0, width: 200, height: 200 } },
      radius: { tl: 0, tr: 0, br: 0, bl: 8 },
    });
    surface.draw();
    surface.setCornerRadius(null);
    surface.draw();

    surface.dispatch({
      kind: "pointer_down",
      x: 16,
      y: 16,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_move",
      x: 24,
      y: 24,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });

    expect(intents.some((i) => i.kind === "corner_radius")).toBe(false);
  });
});

// ─── HUDCanvas paint-band integration ─────────────────────────────────────

describe("HUDCanvas — corner-radius paint band", () => {
  function fakeCanvas() {
    const { ctx, calls } = mockCtx();
    const canvas = {
      width: 0,
      height: 0,
      style: { width: "", height: "" } as Record<string, string>,
      getContext: () => ctx,
    };
    return { canvas: canvas as unknown as HTMLCanvasElement, ctx, calls };
  }

  it("does not paint corner-radius handles unless setCornerRadiusHandles is called with non-null", () => {
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(400, 300);
    hud.setTransform(IDENTITY);
    hud.draw(undefined);
    expect(calls.some((c) => c.op === "ellipse")).toBe(false);
  });

  it("paints handles when setCornerRadiusHandles is non-null", () => {
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(400, 300);
    hud.setTransform(IDENTITY);
    hud.setCornerRadiusHandles([
      {
        pos: [100, 100],
        size: 8,
        hit_size: 16,
        anchor: "nw",
        label: "corner_radius:nw",
      },
    ]);
    hud.draw(undefined);
    expect(calls.some((c) => c.op === "ellipse")).toBe(true);
  });
});
