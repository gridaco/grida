// Per-stage unit tests. Each stage tested in isolation as a pure
// function. No DOM — but `stage_snap` uses a real `SnapSession`
// (editor-agnostic — takes raw rects).

import { describe, expect, it } from "vitest";
import {
  translate_pipeline,
  type TranslateBaseline,
  type TranslateContext,
  type TranslatePlan,
} from "../../src/core/translate-pipeline";
import { SnapSession } from "../../src/core/snap";

const stage_axis_lock = translate_pipeline.stages.axis_lock;
const stage_snap = translate_pipeline.stages.snap;
const stage_pixel_grid = translate_pipeline.stages.pixel_grid;
import { rect } from "../_helpers";

const RECT_BASELINE: TranslateBaseline = { type: "rect", x: 0, y: 0 };

function plan_with_baseline(b: TranslateBaseline): TranslatePlan {
  return {
    ids: ["id"],
    baselines: new Map([["id", b]]),
    delta: { x: 0, y: 0 },
  };
}

function ctx_with(overrides: Partial<TranslateContext>): TranslateContext {
  return {
    input: { ids: ["id"], movement: [0, 0] },
    modifiers: { axis_lock: "off", force_disable_snap: false },
    options: {
      pixel_grid_quantum: null,
      snap_enabled: false,
      snap_threshold_px: 6,
    },
    snap_session: null,
    snap_policy: "engine",
    ...overrides,
  };
}

describe("stage_axis_lock", () => {
  it("normalizes Movement to Vec2 when axis_lock is off", () => {
    const r = stage_axis_lock.run(
      plan_with_baseline(RECT_BASELINE),
      ctx_with({ input: { ids: ["id"], movement: [3.5, -2] } })
    );
    expect(r.plan.delta).toEqual({ x: 3.5, y: -2 });
  });

  it("treats null axes as 0", () => {
    const r = stage_axis_lock.run(
      plan_with_baseline(RECT_BASELINE),
      ctx_with({ input: { ids: ["id"], movement: [null, 5] } })
    );
    expect(r.plan.delta).toEqual({ x: 0, y: 5 });
  });

  it("collapses lesser axis under by_dominance (x dominant)", () => {
    const r = stage_axis_lock.run(
      plan_with_baseline(RECT_BASELINE),
      ctx_with({
        input: { ids: ["id"], movement: [10, 3] },
        modifiers: { axis_lock: "by_dominance", force_disable_snap: false },
      })
    );
    expect(r.plan.delta).toEqual({ x: 10, y: 0 });
  });

  it("collapses lesser axis under by_dominance (y dominant)", () => {
    const r = stage_axis_lock.run(
      plan_with_baseline(RECT_BASELINE),
      ctx_with({
        input: { ids: ["id"], movement: [2, -8] },
        modifiers: { axis_lock: "by_dominance", force_disable_snap: false },
      })
    );
    expect(r.plan.delta).toEqual({ x: 0, y: -8 });
  });

  it("emits no guide", () => {
    const r = stage_axis_lock.run(
      plan_with_baseline(RECT_BASELINE),
      ctx_with({ input: { ids: ["id"], movement: [1, 1] } })
    );
    expect(r.emit).toBeUndefined();
  });
});

describe("stage_snap", () => {
  it("is identity when force_disable_snap is true", () => {
    const session = new SnapSession({
      agents: [rect(0, 0)],
      neighbors: [rect(50, 0)],
    });
    const plan: TranslatePlan = {
      ids: ["id"],
      baselines: new Map([["id", RECT_BASELINE]]),
      delta: { x: 42, y: 0 },
    };
    const r = stage_snap.run(
      plan,
      ctx_with({
        snap_session: session,
        options: {
          pixel_grid_quantum: null,
          snap_enabled: true,
          snap_threshold_px: 10,
        },
        modifiers: { axis_lock: "off", force_disable_snap: true },
      })
    );
    expect(r.plan.delta).toEqual({ x: 42, y: 0 });
    expect(r.emit).toBeUndefined();
  });

  it("is identity when no session is present", () => {
    const plan: TranslatePlan = {
      ids: ["id"],
      baselines: new Map([["id", RECT_BASELINE]]),
      delta: { x: 42, y: 0 },
    };
    const r = stage_snap.run(
      plan,
      ctx_with({
        snap_session: null,
        options: {
          pixel_grid_quantum: null,
          snap_enabled: true,
          snap_threshold_px: 10,
        },
      })
    );
    expect(r.plan.delta).toEqual({ x: 42, y: 0 });
  });

  it("is identity when options.snap_enabled is false", () => {
    const session = new SnapSession({
      agents: [rect(0, 0)],
      neighbors: [rect(50, 0)],
    });
    const plan: TranslatePlan = {
      ids: ["id"],
      baselines: new Map([["id", RECT_BASELINE]]),
      delta: { x: 42, y: 0 },
    };
    const r = stage_snap.run(
      plan,
      ctx_with({
        snap_session: session,
        options: {
          pixel_grid_quantum: null,
          snap_enabled: false,
          snap_threshold_px: 10,
        },
      })
    );
    expect(r.plan.delta).toEqual({ x: 42, y: 0 });
  });

  it("corrects delta and emits guide when within threshold", () => {
    // Mirror snap-session.test.ts edge-aligns scenario.
    const session = new SnapSession({
      agents: [rect(0, 0)],
      neighbors: [rect(48, 0)],
    });
    const plan: TranslatePlan = {
      ids: ["id"],
      baselines: new Map([["id", RECT_BASELINE]]),
      delta: { x: 37, y: 0 },
    };
    const r = stage_snap.run(
      plan,
      ctx_with({
        snap_session: session,
        options: {
          pixel_grid_quantum: null,
          snap_enabled: true,
          snap_threshold_px: 10,
        },
      })
    );
    expect(r.plan.delta.x).toBe(38);
    expect(r.emit?.guide).toBeDefined();
  });
});

describe("stage_pixel_grid", () => {
  it("is identity when quantum is null", () => {
    const plan: TranslatePlan = {
      ids: ["id"],
      baselines: new Map([["id", { type: "rect", x: 0, y: 0 }]]),
      delta: { x: 3.7, y: 2.4 },
    };
    const r = stage_pixel_grid.run(plan, ctx_with({}));
    expect(r.plan.delta).toEqual({ x: 3.7, y: 2.4 });
  });

  it("is identity when quantum is 0", () => {
    const plan: TranslatePlan = {
      ids: ["id"],
      baselines: new Map([["id", { type: "rect", x: 0, y: 0 }]]),
      delta: { x: 3.7, y: 2.4 },
    };
    const r = stage_pixel_grid.run(
      plan,
      ctx_with({
        options: {
          pixel_grid_quantum: 0,
          snap_enabled: false,
          snap_threshold_px: 6,
        },
      })
    );
    expect(r.plan.delta).toEqual({ x: 3.7, y: 2.4 });
  });

  it("quantizes from integer baseline to integer absolute position", () => {
    const plan: TranslatePlan = {
      ids: ["id"],
      baselines: new Map([["id", { type: "rect", x: 0, y: 0 }]]),
      delta: { x: 3.7, y: -2.4 },
    };
    const r = stage_pixel_grid.run(
      plan,
      ctx_with({
        options: {
          pixel_grid_quantum: 1,
          snap_enabled: false,
          snap_threshold_px: 6,
        },
      })
    );
    // baseline (0,0) + delta (3.7,-2.4) → absolute (3.7,-2.4) → round → (4,-2)
    // → corrected delta = (4-0, -2-0) = (4, -2)
    expect(r.plan.delta).toEqual({ x: 4, y: -2 });
  });

  it("settles fractional baseline to integer absolute on first move", () => {
    const plan: TranslatePlan = {
      ids: ["id"],
      baselines: new Map([["id", { type: "rect", x: 0.4, y: 0.7 }]]),
      delta: { x: 0, y: 0 },
    };
    const r = stage_pixel_grid.run(
      plan,
      ctx_with({
        options: {
          pixel_grid_quantum: 1,
          snap_enabled: false,
          snap_threshold_px: 6,
        },
      })
    );
    // (0.4 + 0) → round → 0; corrected = 0 - 0.4 = -0.4
    // (0.7 + 0) → round → 1; corrected = 1 - 0.7 ≈ 0.3
    expect(r.plan.delta.x).toBeCloseTo(-0.4);
    expect(r.plan.delta.y).toBeCloseTo(0.3);
  });

  it("nudge from fractional baseline lands on integer", () => {
    // Per plan: nudge x=0.4 by (1,0) should land at x=1.
    const plan: TranslatePlan = {
      ids: ["id"],
      baselines: new Map([["id", { type: "rect", x: 0.4, y: 0 }]]),
      delta: { x: 1, y: 0 },
    };
    const r = stage_pixel_grid.run(
      plan,
      ctx_with({
        options: {
          pixel_grid_quantum: 1,
          snap_enabled: false,
          snap_threshold_px: 6,
        },
      })
    );
    // (0.4 + 1) = 1.4 → round → 1; corrected = 1 - 0.4 = 0.6
    expect(r.plan.delta.x).toBeCloseTo(0.6);
  });

  it("respects custom quantum (e.g. 10)", () => {
    const plan: TranslatePlan = {
      ids: ["id"],
      baselines: new Map([["id", { type: "rect", x: 0, y: 0 }]]),
      delta: { x: 27, y: 4 },
    };
    const r = stage_pixel_grid.run(
      plan,
      ctx_with({
        options: {
          pixel_grid_quantum: 10,
          snap_enabled: false,
          snap_threshold_px: 6,
        },
      })
    );
    expect(r.plan.delta).toEqual({ x: 30, y: 0 });
  });

  it("multi-id quantizes union origin (min top-left)", () => {
    const plan: TranslatePlan = {
      ids: ["a", "b"],
      baselines: new Map<string, TranslateBaseline>([
        ["a", { type: "rect", x: 0.3, y: 0 }],
        ["b", { type: "rect", x: 0.7, y: 0 }],
      ]),
      delta: { x: 0, y: 0 },
    };
    const r = stage_pixel_grid.run(
      plan,
      ctx_with({
        options: {
          pixel_grid_quantum: 1,
          snap_enabled: false,
          snap_threshold_px: 6,
        },
      })
    );
    // union min x = 0.3 → round → 0; corrected = -0.3
    expect(r.plan.delta.x).toBeCloseTo(-0.3);
  });

  it("falls back gracefully when only unsupported baselines exist", () => {
    const plan: TranslatePlan = {
      ids: ["id"],
      baselines: new Map<string, TranslateBaseline>([
        ["id", { type: "unsupported" }],
      ]),
      delta: { x: 3.7, y: 0 },
    };
    const r = stage_pixel_grid.run(
      plan,
      ctx_with({
        options: {
          pixel_grid_quantum: 1,
          snap_enabled: false,
          snap_threshold_px: 6,
        },
      })
    );
    // No snap session, no extractable anchor → identity.
    expect(r.plan.delta).toEqual({ x: 3.7, y: 0 });
  });
});
