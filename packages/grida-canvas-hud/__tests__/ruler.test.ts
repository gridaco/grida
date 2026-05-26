import { describe, it, expect } from "vitest";
import { drawRuler, _internal, type RulerConfig } from "../primitives/ruler";
import { HUDCanvas } from "../primitives/canvas";

// A minimal recorder that satisfies the subset of CanvasRenderingContext2D
// the ruler draw routine touches. The unit tests do not check pixels —
// they verify the sequence of drawing calls (so that layout, axis order,
// and conditional branches are pinned), the way every other producer-side
// renderer test in this package does.
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
  ]) {
    record(op);
  }
  // settable style fields — capture sets as ops so order is visible.
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

// ---------------------------------------------------------------------------
// Pure layout helpers
// ---------------------------------------------------------------------------

describe("ruler — step-size selection", () => {
  // UX spec: at zoom 1, the smallest step whose pixel spacing ≥ 50 px wins.
  // Ensures labels don't crowd at the default zoom — same heuristic as
  // upstream `@grida/ruler`.
  it("picks the smallest step whose on-screen spacing meets the minimum", () => {
    const steps = [1, 2, 5, 10, 25, 50, 100];
    // At zoom 1: 1*1=1, 2*1=2, ..., 50*1=50 (first to satisfy ≥ 50).
    expect(_internal.getStepSize(steps, 1)).toBe(50);
    // At zoom 10: 5*10=50 (first), 10 not needed.
    expect(_internal.getStepSize(steps, 10)).toBe(5);
    // At zoom 0.01: nothing satisfies; fall back to the LAST step (the
    // contract is "always return something paintable").
    expect(_internal.getStepSize(steps, 0.01)).toBe(100);
  });
});

describe("ruler — subticks resolution", () => {
  // UX spec: false / 0 disables subticks; numeric is honored as-is;
  // 'auto'/true derives from the step's leading digit (1-2-5 family).
  it("disables subticks when false or 0", () => {
    expect(_internal.resolveSubticks(10, false)).toBe(0);
    expect(_internal.resolveSubticks(10, 0)).toBe(0);
  });

  it("honors explicit numeric subdivision counts", () => {
    expect(_internal.resolveSubticks(10, 5)).toBe(5);
    expect(_internal.resolveSubticks(10, 4)).toBe(4);
  });

  it("auto-derives subdivisions from the step's leading digit", () => {
    expect(_internal.resolveSubticks(10, "auto")).toBe(10); // leading 1
    expect(_internal.resolveSubticks(100, true)).toBe(10);
    expect(_internal.resolveSubticks(20, "auto")).toBe(4); // leading 2
    expect(_internal.resolveSubticks(25, "auto")).toBe(5); // leading 2.5
    expect(_internal.resolveSubticks(50, "auto")).toBe(5); // leading 5
  });
});

describe("ruler — range merging", () => {
  // UX spec: overlapping highlight ranges must merge into one fill so the
  // accent labels don't double-paint at the same boundary.
  it("merges overlapping ranges into one", () => {
    expect(
      _internal.mergeOverlappingRanges([
        [0, 10],
        [5, 20],
      ])
    ).toEqual([[0, 20]]);
  });

  it("keeps disjoint ranges separate", () => {
    expect(
      _internal.mergeOverlappingRanges([
        [0, 10],
        [20, 30],
      ])
    ).toEqual([
      [0, 10],
      [20, 30],
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(_internal.mergeOverlappingRanges([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// drawRuler — the pure painter
// ---------------------------------------------------------------------------

describe("drawRuler", () => {
  // UX spec: when `enabled` is false the ruler produces NO drawing calls.
  // Hosts toggle the chrome cheaply by flipping the flag.
  it("paints nothing when disabled", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: { enabled: false },
    });
    expect(calls).toHaveLength(0);
  });

  // UX spec: by default both axes paint (the L-shape). `axes: ["x"]`
  // suppresses the left strip without affecting the top strip. Ensures
  // hosts can opt into single-axis chrome without forking the config.
  it("respects the `axes` filter — single axis paints only that strip", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: { enabled: true, axes: ["x"] },
    });
    // Should record at least one stroke (a tick) — i.e. it did paint.
    expect(calls.some((c) => c.op === "stroke")).toBe(true);
    // The left-axis label path translates+rotates the ctx (-PI/2).
    // For an X-only render, no rotate(-PI/2) call should appear.
    const rotated = calls.some(
      (c) => c.op === "rotate" && c.args[0] === -Math.PI / 2
    );
    expect(rotated).toBe(false);
  });

  // UX spec: the y-axis labels are drawn by translating to the strip and
  // rotating the ctx by -PI/2 so text reads bottom-to-top, matching the
  // upstream `@grida/ruler` behavior.
  it("rotates the ctx by -PI/2 when painting the y-axis labels", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 600, // tall so the y-axis has labels to paint
      dpr: 1,
      config: { enabled: true, axes: ["y"] },
    });
    const rotated = calls.some(
      (c) => c.op === "rotate" && c.args[0] === -Math.PI / 2
    );
    expect(rotated).toBe(true);
  });

  // UX spec: the ruler applies its own DPR transform on every paint, so
  // the caller never has to. Mirrors the pixel-grid contract.
  it("sets the ctx transform to (dpr,0,0,dpr,0,0) before painting", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 2,
      config: { enabled: true, axes: ["x"] },
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

  // UX spec: with `backgroundColor: "transparent"` (the default) NO
  // fillRect of the whole strip happens. Tick/label fills are unaffected.
  // This is what lets the ruler sit over arbitrary editor backgrounds.
  it("skips the strip fillRect when backgroundColor is transparent", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: { enabled: true, axes: ["x"] },
    });
    // A strip fillRect would be (0, 0, width, strip). Make sure no such
    // call exists — only the per-tick text fills (which use fillText, not
    // fillRect) should remain.
    const stripFill = calls.find(
      (c) => c.op === "fillRect" && c.args[0] === 0 && c.args[1] === 0
    );
    expect(stripFill).toBeUndefined();
  });

  // UX spec: an explicit (non-transparent) background DOES paint the
  // strip rect once per axis. Hosts that want an opaque ruler get it.
  it("fills the strip when backgroundColor is set", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: {
        enabled: true,
        axes: ["x"],
        backgroundColor: "#101010",
        strip: 24,
      },
    });
    const stripFill = calls.find(
      (c) =>
        c.op === "fillRect" &&
        c.args[0] === 0 &&
        c.args[1] === 0 &&
        c.args[2] === 400 &&
        c.args[3] === 24
    );
    expect(stripFill).toBeDefined();
  });

  // UX spec: every painted strip carries a 1-px inner-edge separator
  // along its inner boundary — the universal "this is where chrome
  // ends and content begins" affordance. For the top strip this is a
  // horizontal segment from (0, strip-0.5) to (length, strip-0.5);
  // the 0.5 offset keeps the line on a pixel boundary so it
  // rasterizes crisply. The presence of the matched moveTo/lineTo
  // pair pins the separator without asserting on the surrounding
  // tick path (which also uses moveTo/lineTo at unrelated y's).
  it("paints a 1-px inner-edge separator at the bottom of the top strip", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: { enabled: true, axes: ["x"], strip: 20 },
    });
    // strip = 20 → separator at y = 19.5, from x=0 to x=length (400).
    const moves = calls
      .map((c, i) => ({ c, i }))
      .filter(
        (x) => x.c.op === "moveTo" && x.c.args[0] === 0 && x.c.args[1] === 19.5
      );
    const lines = calls
      .map((c, i) => ({ c, i }))
      .filter(
        (x) =>
          x.c.op === "lineTo" && x.c.args[0] === 400 && x.c.args[1] === 19.5
      );
    expect(moves.length).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(0);
    // The lineTo must come after the matching moveTo in the same path.
    expect(lines[0].i).toBeGreaterThan(moves[0].i);
  });

  // UX spec: the left strip's separator is the vertical mirror —
  // x = strip-0.5, from y=0 to y=length. The corner square stays blank
  // because the two separators run along their own axes and meet at
  // right angles inside the L's inside corner.
  it("paints a 1-px inner-edge separator at the right of the left strip", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 600,
      dpr: 1,
      config: { enabled: true, axes: ["y"], strip: 20 },
    });
    // strip = 20 → separator at x = 19.5, from y=0 to y=length (600).
    const moves = calls
      .map((c, i) => ({ c, i }))
      .filter(
        (x) => x.c.op === "moveTo" && x.c.args[0] === 19.5 && x.c.args[1] === 0
      );
    const lines = calls
      .map((c, i) => ({ c, i }))
      .filter(
        (x) =>
          x.c.op === "lineTo" && x.c.args[0] === 19.5 && x.c.args[1] === 600
      );
    expect(moves.length).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].i).toBeGreaterThan(moves[0].i);
  });

  // UX spec: the separator obeys the same `axes` filter as the rest of
  // the strip. With `axes: ["x"]` only, no vertical separator at
  // x=strip-0.5 is drawn (and vice versa). Confirms the separator is
  // part of the strip's own pass, not a global frame the filter skips.
  it("does not paint the left-strip separator when axes is x-only", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 600,
      dpr: 1,
      config: { enabled: true, axes: ["x"], strip: 20 },
    });
    const verticalSeparatorMove = calls.find(
      (c) => c.op === "moveTo" && c.args[0] === 19.5 && c.args[1] === 0
    );
    expect(verticalSeparatorMove).toBeUndefined();
  });

  // UX spec: a minimal `{ pos }` mark must render identically to a
  // regular step tick — short stroke at `tickHeight`. The recorded
  // moveTo/lineTo pair for the mark lands at y = (strip - tickHeight)
  // and y = strip, matching what the per-step tick loop would emit.
  // This guards the additive-defaults contract: existing callers that
  // pass only `pos` do not regress when the richer mark fields land.
  it("renders a minimal mark (only `pos`) as a short tick at tickHeight", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: {
        enabled: true,
        axes: ["x"],
        strip: 20,
        tickHeight: 6,
        marks: { x: [{ pos: 50 }] },
      },
    });
    // Mark at pos=50 (doc) → screen 50 (identity zoom, no offset).
    // Stroke spans (50, strip - tickHeight) → (50, strip) = (50,14)→(50,20).
    const markMove = calls.find(
      (c) => c.op === "moveTo" && c.args[0] === 50 && c.args[1] === 14
    );
    const markLine = calls.find(
      (c) => c.op === "lineTo" && c.args[0] === 50 && c.args[1] === 20
    );
    expect(markMove).toBeDefined();
    expect(markLine).toBeDefined();
  });

  // UX spec: setting `strokeHeight` to the strip width makes the mark
  // span the full strip — the standard guide-position affordance. The
  // recorded moveTo/lineTo pair for the mark lands at y = (strip -
  // strokeHeight) = 0 and y = strip, i.e. a full-strip vertical line.
  it("paints a mark with strokeHeight: strip as a full-strip line", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: {
        enabled: true,
        axes: ["x"],
        strip: 20,
        marks: { x: [{ pos: 100, strokeHeight: 20 }] },
      },
    });
    const fullStripMove = calls.find(
      (c) => c.op === "moveTo" && c.args[0] === 100 && c.args[1] === 0
    );
    const fullStripLine = calls.find(
      (c) => c.op === "lineTo" && c.args[0] === 100 && c.args[1] === 20
    );
    expect(fullStripMove).toBeDefined();
    expect(fullStripLine).toBeDefined();
  });

  // UX spec: when both `strokeColor` and `color` (the label color) are
  // set, the stroke uses the former and the label fill uses the latter
  // — independently. Pins that the producer forwards both fields,
  // rather than collapsing them onto a single style. The recorded
  // strokeStyle and fillStyle assignments around the mark's draw must
  // carry the two distinct values.
  it("paints stroke and label in different colors when strokeColor and color differ", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: {
        enabled: true,
        axes: ["x"],
        strip: 20,
        marks: {
          x: [
            {
              pos: 75,
              text: "75",
              color: "#ff0000",
              strokeColor: "#0000ff",
            },
          ],
        },
      },
    });
    const strokeSet = calls.find(
      (c) => c.op === "set:strokeStyle" && c.args[0] === "#0000ff"
    );
    const fillSet = calls.find(
      (c) => c.op === "set:fillStyle" && c.args[0] === "#ff0000"
    );
    expect(strokeSet).toBeDefined();
    expect(fillSet).toBeDefined();
  });

  // UX spec: `textColor` overrides the label color independently of
  // `color`. With `color` set for the stroke and `textColor` set for
  // the label, the fillStyle assignment must carry the `textColor`
  // value — not the `color` value.
  it("uses textColor for the label fill when both color and textColor are set", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: {
        enabled: true,
        axes: ["x"],
        strip: 20,
        marks: {
          x: [
            {
              pos: 75,
              text: "75",
              color: "#ff0000",
              textColor: "#00ff00",
            },
          ],
        },
      },
    });
    // The label-fill assignment must use textColor (#00ff00), not the
    // `color` value (#ff0000). Both will be present in the recorded
    // stream (color is still used for the stroke), so look for the
    // green fill specifically.
    const greenFill = calls.find(
      (c) => c.op === "set:fillStyle" && c.args[0] === "#00ff00"
    );
    expect(greenFill).toBeDefined();
  });

  // UX spec: `textAlign` and `textAlignOffset` pass through to the
  // canvas label. With `textAlign: "start"` and `textAlignOffset: 8`,
  // the recorded ctx.textAlign assignment must carry "start" and the
  // label fillText x-coord must equal `pos + 8`.
  it("paints the label with the requested textAlign and textAlignOffset", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: {
        enabled: true,
        axes: ["x"],
        strip: 20,
        marks: {
          x: [
            {
              pos: 100,
              text: "100",
              textAlign: "start",
              textAlignOffset: 8,
            },
          ],
        },
      },
    });
    const alignSet = calls.find(
      (c) => c.op === "set:textAlign" && c.args[0] === "start"
    );
    expect(alignSet).toBeDefined();
    // The mark's label fillText x = pos + textAlignOffset = 108.
    const labelText = calls.find(
      (c) => c.op === "fillText" && c.args[0] === "100" && c.args[1] === 108
    );
    expect(labelText).toBeDefined();
  });

  // UX spec: `strokeWidth` overrides the default lineWidth (1) for the
  // mark's stroke only — neighbouring step ticks keep their default.
  // Pins that the field is forwarded distinctly per-tick rather than
  // applied as a strip-wide setting.
  it("paints the mark stroke with the requested strokeWidth", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: {
        enabled: true,
        axes: ["x"],
        strip: 20,
        marks: { x: [{ pos: 100, strokeWidth: 2 }] },
      },
    });
    const widthSet = calls.find(
      (c) => c.op === "set:lineWidth" && c.args[0] === 2
    );
    expect(widthSet).toBeDefined();
  });

  // UX spec: the inner-edge separator falls back to `color` when no
  // explicit `borderColor` is provided. Pins the backward-compatible
  // default — existing consumers that pass only `color` still see the
  // separator painted in that color (no behavior regression vs the
  // prior `accept-A` round that shipped the separator without a knob).
  it("strokes the separator with `color` when `borderColor` is unset", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: {
        enabled: true,
        axes: ["x"],
        strip: 20,
        color: "#808080",
      },
    });
    // The separator is the FIRST stroked path of the axis pass (it
    // paints early so that ticks land on top of it — see the
    // ticks-over-separator paint-order spec below). Find the first
    // strokeStyle assignment that precedes the first `stroke()` and
    // verify it carries `color`.
    const firstStrokeIdx = calls.findIndex((c) => c.op === "stroke");
    const firstStrokeStyle = calls
      .slice(0, firstStrokeIdx)
      .reverse()
      .find((c) => c.op === "set:strokeStyle");
    expect(firstStrokeStyle?.args[0]).toBe("#808080");
  });

  // UX spec: when `borderColor` is provided it overrides `color` for
  // the inner-edge separator ONLY — the tick strokes continue to use
  // `color`. This is the universal main-editor look: numerals at a
  // medium gray, the strip-end line at a much lighter neutral. Pins
  // that the two responsibilities are independently controllable.
  it("strokes the separator with `borderColor` when set, independent of `color`", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: {
        enabled: true,
        axes: ["x"],
        strip: 20,
        color: "#808080",
        borderColor: "#ebebeb",
      },
    });
    // The separator is the FIRST stroked path; its strokeStyle is the
    // most recent assignment before the first stroke().
    const firstStrokeIdx = calls.findIndex((c) => c.op === "stroke");
    const firstStrokeStyle = calls
      .slice(0, firstStrokeIdx)
      .reverse()
      .find((c) => c.op === "set:strokeStyle");
    expect(firstStrokeStyle?.args[0]).toBe("#ebebeb");

    // And `color` is still used somewhere later in the pass — the
    // tick strokes haven't been hijacked.
    const tickStyle = calls.find(
      (c) => c.op === "set:strokeStyle" && c.args[0] === "#808080"
    );
    expect(tickStyle).toBeDefined();
  });

  // UX spec: `borderColor` is honored independently on each axis. With
  // both axes painting and a custom `borderColor`, the separator on
  // BOTH the top and left strips uses that color. Pins that the field
  // threads through to every axis pass — a regression where `borderColor`
  // only applied to one axis would silently leave the other strip with
  // the wrong-weight edge in production.
  it("applies `borderColor` to both axes when both are painted", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 600,
      dpr: 1,
      config: {
        enabled: true,
        // both axes (default)
        strip: 20,
        color: "#808080",
        borderColor: "#ebebeb",
      },
    });
    // Two axes → two separator strokes (the last stroke of each
    // axis's pass). Both must be preceded by a strokeStyle assignment
    // of `borderColor`. Easiest pin: count how many times `#ebebeb` is
    // assigned to strokeStyle — must be at least 2.
    const borderStyleCount = calls.filter(
      (c) => c.op === "set:strokeStyle" && c.args[0] === "#ebebeb"
    ).length;
    expect(borderStyleCount).toBeGreaterThanOrEqual(2);
  });

  // UX spec: within a single axis pass, the inner-edge separator
  // paints BEFORE any tick / mark / range stroke. The separator is
  // cosmetic chrome ("where does the strip end?"); the ticks and marks
  // are data ("what's the position?"). Chrome below, data above — the
  // same paint-order rule the README spells out for substrate (pixel
  // grid, back-most) vs frame (ruler, top-most), applied one level
  // deeper inside the strip itself.
  //
  // The observable consequence: a full-strip mark (`strokeHeight: strip`)
  // now reads as one continuous stroke crossing the strip boundary into
  // the canvas guide below, instead of being capped by a 1-px separator
  // painted on top. Every production editor (Figma, Sketch, XD,
  // Illustrator, Affinity) paints the separator under ticks; the hud
  // now follows.
  //
  // Pin: the separator stroke (identified by its strokeStyle being set
  // to the borderColor and its moveTo landing at y = strip - 0.5) is
  // recorded BEFORE the first tick stroke at the standard tickHeight
  // offset (y = strip - tickHeight). Asserting on the relative order of
  // the two stroke() calls — rather than the index of strokeStyle
  // assignments — keeps this resilient to internal ctx.save/restore
  // bookkeeping changes.
  it("paints the inner-edge separator BEFORE ticks (ticks visually cover the separator)", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: {
        enabled: true,
        axes: ["x"],
        strip: 20,
        tickHeight: 6,
        color: "#808080",
        borderColor: "#ebebeb",
      },
    });
    // The separator's path: moveTo(0, 19.5). The first tick's path at
    // unit 0 / zoom 1 starts with moveTo(0, 14) (strip - tickHeight).
    // Find the call index of each and the index of the stroke() that
    // immediately follows each.
    const separatorMoveIdx = calls.findIndex(
      (c) => c.op === "moveTo" && c.args[0] === 0 && c.args[1] === 19.5
    );
    expect(separatorMoveIdx).toBeGreaterThan(-1);
    // The first tick MoveTo at y = strip - tickHeight = 14. There can
    // be more than one (one per painted step); the first one in
    // recorded order is the one we care about.
    const firstTickMoveIdx = calls.findIndex(
      (c) => c.op === "moveTo" && c.args[1] === 14
    );
    expect(firstTickMoveIdx).toBeGreaterThan(-1);
    // Separator path must be recorded before the first tick path.
    expect(separatorMoveIdx).toBeLessThan(firstTickMoveIdx);

    // And the stroke() that closes the separator path must be
    // recorded before the stroke() that closes the first tick.
    const firstStrokeAfter = (from: number) =>
      from + 1 + calls.slice(from + 1).findIndex((c) => c.op === "stroke");
    const separatorStrokeIdx = firstStrokeAfter(separatorMoveIdx);
    const firstTickStrokeIdx = firstStrokeAfter(firstTickMoveIdx);
    expect(separatorStrokeIdx).toBeGreaterThan(-1);
    expect(firstTickStrokeIdx).toBeGreaterThan(-1);
    expect(separatorStrokeIdx).toBeLessThan(firstTickStrokeIdx);
  });

  // UX spec: marks share the new chrome-below / data-above ordering
  // with step ticks. A full-strip mark (`strokeHeight: strip`) — the
  // standard guide-position affordance — must read as a single stroke
  // crossing the strip boundary, not as a tick capped by the 1-px
  // separator. Pin: the mark's path (moveTo at y=0 for the top strip)
  // is recorded AFTER the separator's path (moveTo at y=strip-0.5).
  it("paints full-strip marks AFTER the inner-edge separator", () => {
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: IDENTITY,
      width: 400,
      height: 300,
      dpr: 1,
      config: {
        enabled: true,
        axes: ["x"],
        strip: 20,
        marks: { x: [{ pos: 150, strokeHeight: 20 }] },
      },
    });
    const separatorMoveIdx = calls.findIndex(
      (c) => c.op === "moveTo" && c.args[0] === 0 && c.args[1] === 19.5
    );
    const markMoveIdx = calls.findIndex(
      (c) => c.op === "moveTo" && c.args[0] === 150 && c.args[1] === 0
    );
    expect(separatorMoveIdx).toBeGreaterThan(-1);
    expect(markMoveIdx).toBeGreaterThan(-1);
    expect(separatorMoveIdx).toBeLessThan(markMoveIdx);
  });

  // UX spec: a non-trivial camera shifts every tick on-screen by the
  // camera's translate component. Verifying the first major tick lands at
  // an expected screen-px lets us pin the screen↔doc mapping without
  // asserting on every tick.
  it("paints ticks at screen-space positions derived from the camera transform", () => {
    // zoom 2, translate +100 px. Default step series at zoom 2 picks 25
    // (25*2 = 50 ≥ 50). startUnit = -100/2 = -50, so firstTick = -50.
    // The first POSITIVE tick on-screen is at unit 0 → 0*2 + 100 = 100 px.
    const config: RulerConfig = { enabled: true, axes: ["x"] };
    const { ctx, calls } = mockCtx();
    drawRuler({
      ctx,
      transform: [
        [2, 0, 100],
        [0, 2, 0],
      ],
      width: 400,
      height: 300,
      dpr: 1,
      config,
    });
    // tick at screen-x = 100 → a moveTo(100, _) + lineTo(100, _) pair.
    const tickAt100 = calls.find((c) => c.op === "moveTo" && c.args[0] === 100);
    expect(tickAt100).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// HUDCanvas integration — paint order + setRuler / setRulerTransform
// ---------------------------------------------------------------------------

describe("HUDCanvas — ruler integration", () => {
  // Tests that exercise the real HUDCanvas need a real canvas-shaped
  // object. Node's vitest env has no DOM, so we patch a minimal shim
  // that returns a recorder context. We're not testing pixel output —
  // we're pinning the wiring (when setRuler is called, draw() must
  // invoke the ruler routine; when nulled, it must not).
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

  // UX spec: a fresh HUDCanvas with no ruler config draws nothing
  // ruler-shaped, even after draw(undefined). The ruler is opt-in.
  it("does not paint a ruler unless setRuler is called", () => {
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(400, 300);
    hud.setTransform(IDENTITY);
    hud.draw(undefined);
    // The only paint should be the clear (setTransform identity + clear).
    // No tick strokes.
    expect(calls.some((c) => c.op === "stroke")).toBe(false);
  });

  // UX spec: once setRuler({enabled:true}) lands, the next draw paints
  // ruler strokes; once setRuler(null) clears the config, the next draw
  // does not. The toggle is the supported control surface.
  it("toggles painting via setRuler({enabled:true}) / setRuler(null)", () => {
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(400, 300);
    hud.setTransform(IDENTITY);

    hud.setRuler({ enabled: true });
    hud.draw(undefined);
    expect(calls.some((c) => c.op === "stroke")).toBe(true);

    calls.length = 0;
    hud.setRuler(null);
    hud.draw(undefined);
    expect(calls.some((c) => c.op === "stroke")).toBe(false);
  });

  // UX spec: setRulerTransform updates only the camera; it must NOT
  // disable a previously-configured ruler. Cheap per-tick contract.
  it("preserves the ruler config across setRulerTransform calls", () => {
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(400, 300);
    hud.setTransform(IDENTITY);
    hud.setRuler({ enabled: true, axes: ["x"] });
    hud.setRulerTransform([
      [2, 0, 100],
      [0, 2, 0],
    ]);
    hud.draw(undefined);

    // The new transform's first POSITIVE tick lands at screen-x 100.
    const tickAt100 = calls.find((c) => c.op === "moveTo" && c.args[0] === 100);
    expect(tickAt100).toBeDefined();
  });

  // UX spec: pixel grid is a substrate and paints back-most; ruler is a
  // frame and paints top-most. When both are enabled, the grid's
  // setTransform (sx*dpr on column 0) lands BEFORE the ruler's dpr-only
  // setTransform. The split is observable in the order of recorded ops
  // and pins the substrate-vs-frame paint-order rule from the README.
  it("paints the pixel grid back-most and the ruler top-most when both are enabled", () => {
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(400, 300);
    // Zoom-in transform so the pixel grid's threshold passes.
    const cam: [[number, number, number], [number, number, number]] = [
      [10, 0, 0],
      [0, 10, 0],
    ];
    hud.setTransform(cam);
    hud.setPixelGrid({ enabled: true, zoomThreshold: 1, transform: cam });
    hud.setRuler({ enabled: true, transform: cam });

    // First paint with the ruler ON — capture the call sequence.
    hud.draw(undefined);
    const callsWithRuler = [...calls];

    // Second paint with the ruler OFF — capture again. Removing the ruler
    // strictly fewer setTransforms (it stops contributing its dpr-anchor).
    calls.length = 0;
    hud.setRuler(null);
    hud.draw(undefined);
    const callsWithoutRuler = [...calls];

    const setTxWith = callsWithRuler.filter((c) => c.op === "setTransform");
    const setTxWithout = callsWithoutRuler.filter(
      (c) => c.op === "setTransform"
    );

    // Ruler on adds at least one extra setTransform (its own dpr-anchor).
    expect(setTxWith.length).toBeGreaterThan(setTxWithout.length);

    // The grid's setTransform uses sx*dpr (= 10 here) on the first column.
    // It must appear in BOTH paint sequences (grid is on either way).
    const gridIdxWith = setTxWith.findIndex((c) => c.args[0] === 10);
    expect(gridIdxWith).toBeGreaterThanOrEqual(0);

    // The EXTRA setTransform that ruler adds must land AFTER the grid's.
    // Concretely: the last setTransform in `callsWithRuler` is the ruler's
    // own dpr-anchor (it's the most recent matrix push at draw end). The
    // grid sits at the substrate slot; the ruler sits at the frame slot.
    const lastIdxWith = setTxWith.length - 1;
    expect(lastIdxWith).toBeGreaterThan(gridIdxWith);
  });

  // UX spec: the ruler is a viewport frame, so it must paint AFTER any
  // host-fed extras (HUDDraw.rects, .lines, .polylines, .topRects, etc.).
  // A host extra that visually overlaps the strip — a debug widget, a
  // guide pip, a measurement label — gets clipped by the ruler on top,
  // not the other way around. Without this, content-band overlays bleed
  // into the frame and the viewport boundary stops reading as a boundary.
  it("paints the ruler AFTER host-fed extras", () => {
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(400, 300);
    hud.setTransform(IDENTITY);
    hud.setRuler({ enabled: true, axes: ["x"] });

    // A single extra HUDRect — its fill records as a fillRect call.
    hud.draw({
      rects: [
        {
          x: 10,
          y: 10,
          width: 20,
          height: 20,
          fill: true,
          stroke: false,
          color: "#abcdef",
        },
      ],
    });

    // The extras pass draws the rect via fillRect; the ruler then paints
    // its tick strokes. The LAST stroke in the recorded sequence must
    // come after the extra's fillRect.
    const lastStroke = calls
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.op === "stroke")
      .pop();
    const extraFill = calls
      .map((c, i) => ({ c, i }))
      .find((x) => x.c.op === "fillRect");

    expect(lastStroke).toBeDefined();
    expect(extraFill).toBeDefined();
    expect(lastStroke!.i).toBeGreaterThan(extraFill!.i);
  });

  // UX spec: even the chrome "top layer" (HUDDraw.topRects /
  // .topPolylines — marquee, lasso) sits BENEATH the ruler. The "top"
  // in topRects means "top of the chrome pass," not "top of the
  // frame." Pinning this prevents a future contributor from promoting
  // topRects past the ruler by reading "top" too literally.
  it("paints the ruler AFTER HUDDraw.topRects (chrome top layer is still below the frame)", () => {
    const { canvas, calls } = fakeCanvas();
    const hud = new HUDCanvas(canvas);
    hud.setSize(400, 300);
    hud.setTransform(IDENTITY);
    hud.setRuler({ enabled: true, axes: ["x"] });

    hud.draw({
      topRects: [
        {
          x: 10,
          y: 10,
          width: 20,
          height: 20,
          fill: true,
          stroke: false,
          color: "#abcdef",
        },
      ],
    });

    const lastStroke = calls
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.op === "stroke")
      .pop();
    const topFill = calls
      .map((c, i) => ({ c, i }))
      .find((x) => x.c.op === "fillRect");

    expect(lastStroke).toBeDefined();
    expect(topFill).toBeDefined();
    expect(lastStroke!.i).toBeGreaterThan(topFill!.i);
  });
});
