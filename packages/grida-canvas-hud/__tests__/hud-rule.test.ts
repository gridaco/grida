import { describe, it, expect } from "vitest";
import { HUDCanvas } from "../primitives/canvas";

// HUDCanvas producer-side tests for HUDRule.strokeWidth. The same recorder
// pattern as `ruler.test.ts`: we don't check pixels, we pin the sequence
// of canvas ops so the forwarding contract is observable. Specifically,
// `drawRules` should mirror `drawLines.strokeWidth` — per-rule override
// of `ctx.lineWidth`, falling back to DEFAULT_LINE_WIDTH (0.5) when unset.

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
    "fillRect",
    "fillText",
    "setTransform",
    "translate",
    "rotate",
    "clearRect",
    "setLineDash",
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

const IDENTITY: [[number, number, number], [number, number, number]] = [
  [1, 0, 0],
  [0, 1, 0],
];

describe("HUDCanvas — HUDRule.strokeWidth", () => {
  // UX spec: an explicit `strokeWidth` on a HUDRule overrides the
  // canvas's default (0.5) for that rule's stroke. Hosts emit per-rule
  // visual state (hovered, selected) via this field so the strip tick
  // and the guide line read as one continuous stroke. Mirrors the
  // existing HUDLine.strokeWidth contract.
  it("paints a rule's stroke at the requested strokeWidth", () => {
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(400, 300);
    hud.setTransform(IDENTITY);
    hud.draw({ rules: [{ axis: "x", offset: 100, strokeWidth: 2 }] });
    const widthSet = calls.find(
      (c) => c.op === "set:lineWidth" && c.args[0] === 2
    );
    expect(widthSet).toBeDefined();
  });

  // UX spec (regression guard): omitting `strokeWidth` MUST keep the
  // existing default (DEFAULT_LINE_WIDTH = 0.5). The field is strictly
  // additive — pre-existing consumers see no behavior change.
  it("falls back to DEFAULT_LINE_WIDTH when strokeWidth is unset", () => {
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(400, 300);
    hud.setTransform(IDENTITY);
    hud.draw({ rules: [{ axis: "x", offset: 100 }] });
    // The only lineWidth assignment during the rules pass should be the
    // default. No `set:lineWidth` op with anything other than 0.5 should
    // be recorded between the start of the draw and the first `stroke`.
    const firstStrokeIdx = calls.findIndex((c) => c.op === "stroke");
    const widthsBeforeStroke = calls
      .slice(0, firstStrokeIdx + 1)
      .filter((c) => c.op === "set:lineWidth")
      .map((c) => c.args[0]);
    expect(widthsBeforeStroke.every((w) => w === 0.5)).toBe(true);
  });

  // UX spec: a mixed batch — one default + one overridden rule — must
  // update `lineWidth` for the overridden one, then leave it alone (or
  // restore explicitly) for the next default. This pins the per-rule
  // forwarding (vs. a strip-wide set) so hosts can compose hover/select
  // affordances on a per-guide basis without re-batching.
  it("varies lineWidth per-rule in a mixed batch", () => {
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(400, 300);
    hud.setTransform(IDENTITY);
    hud.draw({
      rules: [
        { axis: "x", offset: 50 },
        { axis: "x", offset: 150, strokeWidth: 1 },
      ],
    });
    const widthSets = calls.filter((c) => c.op === "set:lineWidth");
    // Default → 1 transition must be observable. We don't pin the exact
    // count (the renderer may collapse equal-valued sets), only that the
    // overridden value lands.
    expect(widthSets.some((c) => c.args[0] === 1)).toBe(true);
    expect(widthSets.some((c) => c.args[0] === 0.5)).toBe(true);
  });
});
