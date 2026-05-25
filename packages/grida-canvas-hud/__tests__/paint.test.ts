import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HUDCanvas } from "../primitives/canvas";
import {
  resolvePaint,
  computeStripesTileGeometry,
  DEFAULT_STRIPES_ANGLE_DEG,
  DEFAULT_STRIPES_SPACING_PX,
  DEFAULT_STRIPES_THICKNESS_PX,
  _clearStripesTileCache,
  buildStripesTile,
} from "../primitives/paint";
import type { HUDPaint, HUDPaintStripes } from "../primitives/types";

// ───────────────────────────────────────────────────────────────────────────
// Mocks — we don't render to real pixels in Node. The recorder pattern from
// `hud-rule.test.ts` is reused: every ctx call / property assignment lands in
// a string log we can assert on.
// ───────────────────────────────────────────────────────────────────────────

type Call = { op: string; args: unknown[] };

function mockTileCtx(calls: Call[]): unknown {
  const ctx: Record<string, unknown> = {};
  const record = (op: string) => {
    ctx[op] = (...args: unknown[]) => {
      calls.push({ op: `tile:${op}`, args });
    };
  };
  for (const op of [
    "clearRect",
    "save",
    "restore",
    "translate",
    "rotate",
    "fillRect",
  ]) {
    record(op);
  }
  for (const key of ["fillStyle"]) {
    Object.defineProperty(ctx, key, {
      set(value) {
        calls.push({ op: `tile:set:${key}`, args: [value] });
      },
      get() {
        return undefined;
      },
    });
  }
  return ctx;
}

// Minimal `OffscreenCanvas` polyfill for tests. Records the construction
// size and exposes a `getContext` that returns a recording 2d context.
function installOffscreenCanvasMock(): { tileCalls: Call[] } {
  const tileCalls: Call[] = [];
  class FakeOffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      tileCalls.push({ op: "tile:new", args: [w, h] });
    }
    getContext(_kind: string) {
      return mockTileCtx(tileCalls);
    }
  }
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas =
    FakeOffscreenCanvas;
  return { tileCalls };
}

function uninstallOffscreenCanvasMock() {
  delete (globalThis as unknown as { OffscreenCanvas?: unknown })
    .OffscreenCanvas;
}

// Mock ctx used by `resolvePaint` — needs `createPattern` and `getTransform`.
// We hand back a fake pattern that records `setTransform` so the
// counter-CTM contract is observable.
function mockResolveCtx(): {
  ctx: CanvasRenderingContext2D;
  patternCalls: Call[];
  setTransformArgs: unknown[][];
} {
  const patternCalls: Call[] = [];
  const setTransformArgs: unknown[][] = [];
  const pattern = {
    setTransform: (m: unknown) => {
      setTransformArgs.push([m]);
      patternCalls.push({ op: "pattern:setTransform", args: [m] });
    },
  };
  const identity = {
    inverse() {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    },
  };
  const ctx = {
    createPattern: (tile: unknown, repeat: string) => {
      patternCalls.push({ op: "ctx:createPattern", args: [tile, repeat] });
      return pattern;
    },
    getTransform: () => identity,
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    patternCalls,
    setTransformArgs,
  };
}

// HUDCanvas full-stack mock — same shape as `hud-rule.test.ts`.
function mockHUDCanvasCtx(): {
  ctx: CanvasRenderingContext2D;
  calls: Call[];
} {
  const calls: Call[] = [];
  const proxy: Record<string, unknown> = {};
  const record = (op: string) => {
    proxy[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      // createPattern / getTransform need real-ish returns even in the
      // HUDCanvas mock so the draw path doesn't crash.
      if (op === "createPattern") {
        return {
          setTransform: (m: unknown) =>
            calls.push({ op: "pattern.setTransform", args: [m] }),
        };
      }
      if (op === "getTransform") {
        return {
          inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        };
      }
      return undefined;
    };
  };
  for (const op of [
    "save",
    "restore",
    "beginPath",
    "moveTo",
    "lineTo",
    "stroke",
    "fillRect",
    "strokeRect",
    "fillText",
    "setTransform",
    "translate",
    "rotate",
    "clearRect",
    "setLineDash",
    "ellipse",
    "fill",
    "closePath",
    "createPattern",
    "getTransform",
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
    "textBaseline",
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

function fakeCanvas() {
  const { ctx, calls } = mockHUDCanvasCtx();
  const canvas = {
    width: 0,
    height: 0,
    style: { width: "", height: "" } as Record<string, string>,
    getContext: () => ctx,
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx, calls };
}

const IDENTITY: [[number, number, number], [number, number, number]] = [
  [1, 0, 0],
  [0, 1, 0],
];

// ───────────────────────────────────────────────────────────────────────────
// Spec
// ───────────────────────────────────────────────────────────────────────────

describe("HUDPaint resolver", () => {
  beforeEach(() => {
    _clearStripesTileCache();
    installOffscreenCanvasMock();
  });
  afterEach(() => {
    uninstallOffscreenCanvasMock();
  });

  it("solid paint resolves to a color string", () => {
    // Pure logic — solid doesn't touch the ctx beyond the function signature.
    // `style` is exactly the input color; `opacity` defaults to 1.
    const { ctx } = mockResolveCtx();
    const out = resolvePaint(ctx, { kind: "solid", color: "#ff0000" }, 1);
    expect(out.style).toBe("#ff0000");
    expect(out.opacity).toBe(1);
  });

  it("solid paint opacity falls through to the resolved value", () => {
    // The legacy `fillOpacity` field stays separate from paint opacity;
    // when a paint is set, its `opacity` field is the authoritative value.
    const { ctx } = mockResolveCtx();
    const out = resolvePaint(
      ctx,
      { kind: "solid", color: "#00f", opacity: 0.5 },
      1
    );
    expect(out.opacity).toBe(0.5);
  });

  it("stripes paint resolves to a CanvasPattern via createPattern", () => {
    // Stripes branch must build a tile and call ctx.createPattern with
    // repeat="repeat". The returned style is the CanvasPattern, not a
    // color string. Counter-CTM contract: setTransform is invoked with
    // the inverse of the ctx's current transform.
    const { ctx, patternCalls, setTransformArgs } = mockResolveCtx();
    const paint: HUDPaintStripes = { kind: "stripes", color: "#0a6" };
    const out = resolvePaint(ctx, paint, 1);
    expect(typeof out.style).toBe("object");
    expect(
      patternCalls.find((c) => c.op === "ctx:createPattern")?.args[1]
    ).toBe("repeat");
    expect(setTransformArgs.length).toBe(1);
  });

  it("stripes defaults pin the canonical design language (45° / 8px / 1.5px)", () => {
    // If these drift, the chrome vocabulary stops matching the main
    // editor's vector-edit hover pattern (svg-fill-patterns.tsx).
    expect(DEFAULT_STRIPES_ANGLE_DEG).toBe(45);
    expect(DEFAULT_STRIPES_SPACING_PX).toBe(8);
    expect(DEFAULT_STRIPES_THICKNESS_PX).toBe(1.5);
    const g = computeStripesTileGeometry({ kind: "stripes", color: "x" }, 1);
    expect(g.angleRad).toBeCloseTo(Math.PI / 4, 8);
    expect(g.spacingPx).toBe(8);
    expect(g.thicknessPx).toBe(1.5);
  });

  it("stripes geometry scales spacing and thickness by DPR", () => {
    // Device-pixel units mean the tile gets larger on high-DPR displays
    // so the visible spacing/thickness in CSS px stays the same.
    const g = computeStripesTileGeometry({ kind: "stripes", color: "x" }, 2);
    expect(g.spacingPx).toBe(16);
    expect(g.thicknessPx).toBe(3);
  });

  it("stripes color binds to the paint's color field", () => {
    // The tile rasterizer assigns ctx.fillStyle = paint.color. The
    // recording mock captures this assignment so we can assert the
    // host's color flowed through.
    const { tileCalls } = installOffscreenCanvasMock();
    buildStripesTile({ kind: "stripes", color: "#ff00ff" }, 1);
    const fillStyleSet = tileCalls.find((c) => c.op === "tile:set:fillStyle");
    expect(fillStyleSet?.args[0]).toBe("#ff00ff");
  });

  it("unknown HUDPaint kind throws at draw time", () => {
    // Closed-taxonomy enforcement — no silent passthrough. A host that
    // forges a kind (or ships with a stale type def after a HUD upgrade)
    // hits a loud error, not a chrome regression.
    const { ctx } = mockResolveCtx();
    expect(() =>
      resolvePaint(ctx, { kind: "foo", color: "x" } as unknown as HUDPaint, 1)
    ).toThrow(/Unknown HUDPaint kind/);
  });

  it("stripes tile is cached across resolvePaint calls", () => {
    // Tile rasterization is expensive — repeated paints with the same
    // params hit the cache. We assert by observing that the
    // OffscreenCanvas constructor (`tile:new`) fires once across two
    // resolution calls.
    const { tileCalls } = installOffscreenCanvasMock();
    const { ctx } = mockResolveCtx();
    const paint: HUDPaintStripes = { kind: "stripes", color: "#abc" };
    resolvePaint(ctx, paint, 1);
    resolvePaint(ctx, paint, 1);
    const constructs = tileCalls.filter((c) => c.op === "tile:new");
    expect(constructs.length).toBe(1);
  });

  it("stripes tile cache key includes dpr — different dpr re-rasterizes", () => {
    const { tileCalls } = installOffscreenCanvasMock();
    const { ctx } = mockResolveCtx();
    const paint: HUDPaintStripes = { kind: "stripes", color: "#abc" };
    resolvePaint(ctx, paint, 1);
    resolvePaint(ctx, paint, 2);
    const constructs = tileCalls.filter((c) => c.op === "tile:new");
    expect(constructs.length).toBe(2);
  });
});

describe("HUDCanvas paint integration", () => {
  beforeEach(() => {
    _clearStripesTileCache();
    installOffscreenCanvasMock();
  });
  afterEach(() => {
    uninstallOffscreenCanvasMock();
  });

  it("the same HUDPaint can be used for fill and stroke on a HUDRect", () => {
    // Symmetry pin: HUDPaint flows into both fillPaint and strokePaint.
    // Asserting that both fillStyle AND strokeStyle were assigned to a
    // pattern-like object (truthy, non-string).
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(800, 600);
    hud.setTransform(IDENTITY);
    const paint: HUDPaint = { kind: "stripes", color: "#0af" };
    hud.draw({
      rects: [
        {
          x: 10,
          y: 10,
          width: 100,
          height: 80,
          fill: true,
          fillPaint: paint,
          strokePaint: paint,
        },
      ],
    });
    const fillStyleSets = calls.filter((c) => c.op === "set:fillStyle");
    const strokeStyleSets = calls.filter((c) => c.op === "set:strokeStyle");
    expect(fillStyleSets.length).toBeGreaterThan(0);
    expect(strokeStyleSets.length).toBeGreaterThan(0);
    // Pattern objects are recorded as objects, not strings.
    const lastFill = fillStyleSets[fillStyleSets.length - 1].args[0];
    const lastStroke = strokeStyleSets[strokeStyleSets.length - 1].args[0];
    expect(typeof lastFill).toBe("object");
    expect(typeof lastStroke).toBe("object");
  });

  it("strokePaint applies to HUDLine", () => {
    // Strokes get full paint support, not just fills. The line's
    // strokeStyle assignment should land on a CanvasPattern object.
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(800, 600);
    hud.setTransform(IDENTITY);
    hud.draw({
      lines: [
        {
          x1: 10,
          y1: 10,
          x2: 100,
          y2: 10,
          strokePaint: { kind: "stripes", color: "#0af" },
        },
      ],
    });
    const strokeStyleSets = calls.filter((c) => c.op === "set:strokeStyle");
    expect(strokeStyleSets.length).toBeGreaterThan(0);
    const styleArg = strokeStyleSets[strokeStyleSets.length - 1].args[0];
    expect(typeof styleArg).toBe("object");
  });

  it("strokePaint applies to HUDPoint", () => {
    // Per the closed-taxonomy contract every primitive that strokes gets
    // strokePaint. Points are stroke-only.
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(800, 600);
    hud.setTransform(IDENTITY);
    hud.draw({
      points: [
        { x: 50, y: 50, strokePaint: { kind: "stripes", color: "#0af" } },
      ],
    });
    const strokeStyleSets = calls.filter((c) => c.op === "set:strokeStyle");
    expect(strokeStyleSets.length).toBeGreaterThan(0);
    const styleArg = strokeStyleSets[strokeStyleSets.length - 1].args[0];
    expect(typeof styleArg).toBe("object");
  });

  it("fillPaint wins over legacy color + fillOpacity when both are set", () => {
    // Precedence rule: when both legacy fields and the new paint field
    // are set on the same primitive, paint wins. We assert by checking
    // the final fillStyle is a pattern object, not the literal color
    // string passed in `color`.
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(800, 600);
    hud.setTransform(IDENTITY);
    hud.draw({
      rects: [
        {
          x: 10,
          y: 10,
          width: 100,
          height: 80,
          fill: true,
          color: "#ff0000",
          fillOpacity: 0.3,
          fillPaint: { kind: "stripes", color: "#00ff00" },
        },
      ],
    });
    const fillStyleSets = calls.filter((c) => c.op === "set:fillStyle");
    expect(fillStyleSets.length).toBeGreaterThan(0);
    const lastFill = fillStyleSets[fillStyleSets.length - 1].args[0];
    expect(typeof lastFill).toBe("object");
    expect(lastFill).not.toBe("#ff0000");
  });

  it("paint absent → legacy color path is preserved", () => {
    // Additive change: existing primitives that don't set fillPaint
    // continue to fill with the legacy `color` field. This is the
    // contract that lets the rest of the package keep working
    // unchanged.
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(800, 600);
    hud.setTransform(IDENTITY);
    hud.draw({
      rects: [
        {
          x: 10,
          y: 10,
          width: 100,
          height: 80,
          fill: true,
          color: "#ff0000",
        },
      ],
    });
    const fillStyleSets = calls.filter((c) => c.op === "set:fillStyle");
    expect(fillStyleSets[fillStyleSets.length - 1].args[0]).toBe("#ff0000");
  });

  it("HUDPolyline fillPaint matches the vector-edit hover-region vocabulary", () => {
    // The §0 demo + (future) vector-edit rehost both lean on closed
    // HUDPolyline + stripes fillPaint as the canonical "highlighted
    // region" chrome. Pin the call path so a refactor that drops
    // fillPaint on HUDPolyline is caught here.
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(800, 600);
    hud.setTransform(IDENTITY);
    hud.draw({
      polylines: [
        {
          points: [
            [10, 10],
            [100, 10],
            [100, 80],
            [10, 80],
          ],
          fill: true,
          fillPaint: { kind: "stripes", color: "#0af" },
        },
      ],
    });
    const fillStyleSets = calls.filter((c) => c.op === "set:fillStyle");
    expect(fillStyleSets.length).toBeGreaterThan(0);
    expect(typeof fillStyleSets[fillStyleSets.length - 1].args[0]).toBe(
      "object"
    );
  });
});
