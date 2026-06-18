// Resize pipeline integration tests. Exercises the stages composition
// against the cmath snap engine. No DOM — uses raw rects + SnapSession.

import { describe, expect, it } from "vitest";
import { SnapSession } from "../src/core/snap";
import {
  resize_pipeline,
  type ResizeBaseline,
  type ResizeContext,
  type ResizeOptions,
  type ResizePlan,
} from "../src/core/resize-pipeline";

const OPTS: ResizeOptions = {
  pixel_grid_quantum: null,
  snap_enabled: true,
  snap_threshold_px: 10,
};

/** No modifier keys held — the default opposite-anchored, snap-enabled gesture. */
const NO_MODIFIERS = {
  aspect_lock: "off",
  from_center: false,
  force_disable_snap: false,
} as const;

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

function text_baseline_at(x: number, y: number): ResizeBaseline {
  return {
    bbox: { x, y, width: 100, height: 20 },
    attrs: { kind: "text", x, y, fontSize: 16 },
    raw: [],
  };
}

describe("resize-pipeline — rect E handle", () => {
  it("snaps right edge to a neighbor's left edge within threshold", () => {
    // Rect at (0,0,100,50). Neighbor at x=120. Drag E with dx=18 → right edge would be 118; threshold 10.
    const neighbor = { x: 120, y: 0, width: 20, height: 30 };
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
    };
    const ctx: ResizeContext = {
      input: { id: "a", direction: "e", dx: 18, dy: 0 },
      modifiers: NO_MODIFIERS,
      options: OPTS,
      snap_session: snap,
    };
    const out = resize_pipeline.run(plan, resize_pipeline.stages.DEFAULT, ctx);
    // Snapped right edge should land at 120 → dx = 20.
    expect(out.plan.dx).toBeCloseTo(20, 6);
    expect(out.plan.dy).toBe(0);
    expect(out.guides.length).toBe(1);
    snap.dispose();
  });

  it("does not snap when neighbor is beyond threshold", () => {
    const snap = new SnapSession({
      agents: [{ x: 0, y: 0, width: 100, height: 50 }],
      neighbors: [{ x: 500, y: 0, width: 20, height: 20 }],
    });
    const plan: ResizePlan = {
      id: "a",
      baseline: rect_baseline(),
      direction: "e",
      dx: 5,
      dy: 0,
    };
    const ctx: ResizeContext = {
      input: { id: "a", direction: "e", dx: 5, dy: 0 },
      modifiers: NO_MODIFIERS,
      options: OPTS,
      snap_session: snap,
    };
    const out = resize_pipeline.run(plan, resize_pipeline.stages.DEFAULT, ctx);
    expect(out.plan.dx).toBe(5);
    expect(out.guides.length).toBe(0);
    snap.dispose();
  });

  it("identity when snap disabled", () => {
    const snap = new SnapSession({
      agents: [{ x: 0, y: 0, width: 100, height: 50 }],
      neighbors: [{ x: 120, y: 0, width: 20, height: 30 }],
    });
    const plan: ResizePlan = {
      id: "a",
      baseline: rect_baseline(),
      direction: "e",
      dx: 18,
      dy: 0,
    };
    const ctx: ResizeContext = {
      input: { id: "a", direction: "e", dx: 18, dy: 0 },
      modifiers: NO_MODIFIERS,
      options: { ...OPTS, snap_enabled: false },
      snap_session: snap,
    };
    const out = resize_pipeline.run(plan, resize_pipeline.stages.DEFAULT, ctx);
    expect(out.plan.dx).toBe(18);
    expect(out.guides.length).toBe(0);
    snap.dispose();
  });
});

describe("resize-pipeline — rect SE corner", () => {
  it("snaps both axes independently", () => {
    // Rect at (0,0,100,50). Neighbor at (120, 60, 20, 20).
    // Drag SE dx=18 dy=14 → right edge would be 118 (snap target 120 dist 2),
    // bottom edge would be 64 (snap target 60 dist -4) — both within threshold 10.
    const snap = new SnapSession({
      agents: [{ x: 0, y: 0, width: 100, height: 50 }],
      neighbors: [{ x: 120, y: 60, width: 20, height: 20 }],
    });
    const plan: ResizePlan = {
      id: "a",
      baseline: rect_baseline(),
      direction: "se",
      dx: 18,
      dy: 14,
    };
    const ctx: ResizeContext = {
      input: { id: "a", direction: "se", dx: 18, dy: 14 },
      modifiers: NO_MODIFIERS,
      options: OPTS,
      snap_session: snap,
    };
    const out = resize_pipeline.run(plan, resize_pipeline.stages.DEFAULT, ctx);
    expect(out.plan.dx).toBeCloseTo(20, 6);
    expect(out.plan.dy).toBeCloseTo(10, 6);
    snap.dispose();
  });
});

describe("resize-pipeline — circle uniformity", () => {
  it("circle SE drag drops the Y component (uniform); snaps right edge", () => {
    // Circle r=25 at (50,50) → bbox (25,25,50,50). Neighbor at x=80 (left edge).
    // Drag SE dx=8 (right would be 83, snap to 80 → -3 correction → effective right = 80 → s = 55/50 = 1.1).
    // Y component of gesture (12) should be dropped (uniform → s = min(sx, sy)).
    const snap = new SnapSession({
      agents: [{ x: 25, y: 25, width: 50, height: 50 }],
      neighbors: [{ x: 80, y: 100, width: 20, height: 5 }],
    });
    const plan: ResizePlan = {
      id: "c",
      baseline: circle_baseline(),
      direction: "se",
      dx: 8,
      dy: 12,
    };
    const ctx: ResizeContext = {
      input: { id: "c", direction: "se", dx: 8, dy: 12 },
      modifiers: NO_MODIFIERS,
      options: OPTS,
      snap_session: snap,
    };
    const out = resize_pipeline.run(plan, resize_pipeline.stages.DEFAULT, ctx);
    // The pipeline derives a single `s` from the snapped X edge and back-
    // derives (dx, dy) for the gesture corner. The expected effective
    // right edge is 80 → s = (80 - 25) / 50 = 1.1. New SE corner at
    // (25 + 50*1.1, 25 + 50*1.1) = (80, 80). dx = 80 - 75 = 5, dy = 80 - 75 = 5.
    expect(out.plan.dx).toBeCloseTo(5, 6);
    expect(out.plan.dy).toBeCloseTo(5, 6);
    snap.dispose();
  });
});

describe("resize-pipeline — text edge no-op", () => {
  it("text E drag is a no-op (snap does not fire even with a neighbor)", () => {
    const snap = new SnapSession({
      agents: [{ x: 0, y: 0, width: 100, height: 20 }],
      neighbors: [{ x: 105, y: 0, width: 10, height: 10 }],
    });
    const plan: ResizePlan = {
      id: "t",
      baseline: text_baseline_at(0, 0),
      direction: "e",
      dx: 8,
      dy: 0,
    };
    const ctx: ResizeContext = {
      input: { id: "t", direction: "e", dx: 8, dy: 0 },
      modifiers: NO_MODIFIERS,
      options: OPTS,
      snap_session: snap,
    };
    const out = resize_pipeline.run(plan, resize_pipeline.stages.DEFAULT, ctx);
    // Text-on-edge is a no-op; the snap stage early-outs.
    expect(out.plan.dx).toBe(8);
    expect(out.guides.length).toBe(0);
    snap.dispose();
  });
});

describe("resize-pipeline — snap jitter regression", () => {
  it("snapped right edge holds steady across a fractional cursor sweep", () => {
    // Baseline (0,0,100,50); neighbor left at 120; threshold 10. Sweep
    // dx_in across 5 px at 0.1-px steps — all samples land inside the
    // snap zone, so the final right edge must be ≈ 120 for every
    // sample. Pre-fix this drifted by ~0.8 px every 0.5-px boundary.
    const neighbor = { x: 120, y: 0, width: 20, height: 30 };
    const samples: number[] = [];
    for (let i = 0; i <= 50; i++) {
      const dx_in = 15 + i * 0.1;
      // Fresh session per sample — snap_resize doesn't mutate state but
      // this also rules out cross-frame caching from confounding the test.
      const snap = new SnapSession({
        agents: [{ x: 0, y: 0, width: 100, height: 50 }],
        neighbors: [neighbor],
      });
      const plan: ResizePlan = {
        id: "a",
        baseline: rect_baseline(),
        direction: "e",
        dx: dx_in,
        dy: 0,
      };
      const ctx: ResizeContext = {
        input: { id: "a", direction: "e", dx: dx_in, dy: 0 },
        modifiers: NO_MODIFIERS,
        options: OPTS,
        snap_session: snap,
      };
      const out = resize_pipeline.run(
        plan,
        resize_pipeline.stages.DEFAULT,
        ctx
      );
      // Final right edge after pipeline = baseline right (100) + out.plan.dx.
      samples.push(100 + out.plan.dx);
      snap.dispose();
    }
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    expect(max - min).toBeLessThan(0.01);
    expect(samples[samples.length - 1]).toBeCloseTo(120, 6);
  });
});

describe("resize-pipeline — pixel grid", () => {
  it("quantizes the moving corner to integer pixels", () => {
    const plan: ResizePlan = {
      id: "a",
      baseline: rect_baseline(),
      direction: "e",
      dx: 17.4,
      dy: 0,
    };
    const ctx: ResizeContext = {
      input: { id: "a", direction: "e", dx: 17.4, dy: 0 },
      modifiers: NO_MODIFIERS,
      options: { ...OPTS, pixel_grid_quantum: 1, snap_enabled: false },
      snap_session: null,
    };
    const out = resize_pipeline.run(plan, resize_pipeline.stages.DEFAULT, ctx);
    // baseline right edge = 100, gesture corner = 117.4 → round to 117 → dx = 17.
    expect(out.plan.dx).toBeCloseTo(17, 6);
  });
});

describe("resize-pipeline — aspect lock (Shift)", () => {
  it("collapses to uniform on corner drag", () => {
    // Rect 100×50, SE drag dx=20 (sx=1.2), dy=5 (sy=1.1). Shift → mag = 1.2;
    // new SE corner = origin + (Hx_base - origin)*mag = (0 + 100*1.2, 0 + 50*1.2) = (120, 60).
    // dx = 120 - 100 = 20, dy = 60 - 50 = 10.
    const plan: ResizePlan = {
      id: "a",
      baseline: rect_baseline(),
      direction: "se",
      dx: 20,
      dy: 5,
    };
    const out = resize_pipeline.stages.aspect_lock.run(plan, {
      input: { id: "a", direction: "se", dx: 20, dy: 5 },
      modifiers: {
        aspect_lock: "uniform",
        from_center: false,
        force_disable_snap: false,
      },
      options: OPTS,
      snap_session: null,
    });
    expect(out.plan.dx).toBeCloseTo(20, 6);
    expect(out.plan.dy).toBeCloseTo(10, 6);
  });

  it("STAGE is a delta no-op on edge handles even when Shift held", () => {
    // The aspect_lock STAGE rewrites deltas only for corners. An edge
    // handle's tracked midpoint doesn't move under perpendicular
    // center-scaling, so edge aspect-lock can't be encoded as a delta —
    // it's carried as a factor at apply time (`plan.aspect_lock` →
    // `compute_factors`), exercised by `resize-aspect-edge.test.ts`. This
    // test pins that the stage leaves edge deltas untouched.
    const plan: ResizePlan = {
      id: "a",
      baseline: rect_baseline(),
      direction: "e",
      dx: 20,
      dy: 0,
    };
    const out = resize_pipeline.stages.aspect_lock.run(plan, {
      input: { id: "a", direction: "e", dx: 20, dy: 0 },
      modifiers: {
        aspect_lock: "uniform",
        from_center: false,
        force_disable_snap: false,
      },
      options: OPTS,
      snap_session: null,
    });
    expect(out.plan.dx).toBe(20);
    expect(out.plan.dy).toBe(0);
  });
});

describe("resize-pipeline — force_disable_snap", () => {
  it("snap stage is identity when force_disable_snap is on", () => {
    const snap = new SnapSession({
      agents: [{ x: 0, y: 0, width: 100, height: 50 }],
      neighbors: [{ x: 120, y: 0, width: 20, height: 30 }],
    });
    const plan: ResizePlan = {
      id: "a",
      baseline: rect_baseline(),
      direction: "e",
      dx: 18,
      dy: 0,
    };
    const out = resize_pipeline.stages.snap.run(plan, {
      input: { id: "a", direction: "e", dx: 18, dy: 0 },
      modifiers: {
        aspect_lock: "off",
        from_center: false,
        force_disable_snap: true,
      },
      options: OPTS,
      snap_session: snap,
    });
    expect(out.plan.dx).toBe(18);
    expect(out.emit).toBeUndefined();
    snap.dispose();
  });
});

describe("resize-pipeline — pixel_grid stage", () => {
  it("identity when quantum is null", () => {
    const plan: ResizePlan = {
      id: "a",
      baseline: rect_baseline(),
      direction: "e",
      dx: 17.4,
      dy: 0,
    };
    const out = resize_pipeline.stages.pixel_grid.run(plan, {
      input: { id: "a", direction: "e", dx: 17.4, dy: 0 },
      modifiers: NO_MODIFIERS,
      options: { ...OPTS, pixel_grid_quantum: null },
      snap_session: null,
    });
    expect(out.plan.dx).toBe(17.4);
  });
});
