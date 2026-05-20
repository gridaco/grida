// Translate pipeline shell — composition, ordering, emission aggregation.
//
// No editor, no DOM. Mock stages exercise the shell contract.

import { describe, expect, it } from "vitest";
import {
  run_translate_pipeline,
  type TranslateContext,
  type TranslatePlan,
  type TranslateStage,
} from "../../src/core/translate-pipeline";

const empty_plan: TranslatePlan = {
  ids: [],
  baselines: new Map(),
  delta: { x: 0, y: 0 },
};

function ctx(): TranslateContext {
  return {
    input: { ids: [], movement: [0, 0] },
    modifiers: { axis_lock: "off", force_disable_snap: false },
    options: {
      pixel_grid_quantum: null,
      snap_enabled: false,
      snap_threshold_px: 6,
    },
    snap_session: null,
    snap_policy: "engine",
  };
}

describe("run_translate_pipeline", () => {
  it("is identity when stage list is empty", () => {
    const r = run_translate_pipeline(empty_plan, [], ctx());
    expect(r.plan).toBe(empty_plan); // referential identity preserved
    expect(r.guides).toEqual([]);
  });

  it("threads plan through stages in order", () => {
    const order: string[] = [];
    const a: TranslateStage = {
      name: "a",
      run(plan) {
        order.push("a");
        return { plan: { ...plan, delta: { x: 1, y: 0 } } };
      },
    };
    const b: TranslateStage = {
      name: "b",
      run(plan) {
        order.push("b");
        // b reads what a wrote (x=1) and adds 10
        return { plan: { ...plan, delta: { x: plan.delta.x + 10, y: 0 } } };
      },
    };
    const r = run_translate_pipeline(empty_plan, [a, b], ctx());
    expect(order).toEqual(["a", "b"]);
    expect(r.plan.delta).toEqual({ x: 11, y: 0 });
  });

  it("aggregates guide emissions across stages", () => {
    const fake_guide_a = { lines: [], rules: [], points: [{} as never] };
    const fake_guide_b = { lines: [{} as never], rules: [], points: [] };
    const a: TranslateStage = {
      name: "a",
      run(plan) {
        return { plan, emit: { guide: fake_guide_a as never } };
      },
    };
    const b: TranslateStage = {
      name: "b",
      run(plan) {
        return { plan, emit: { guide: fake_guide_b as never } };
      },
    };
    const r = run_translate_pipeline(empty_plan, [a, b], ctx());
    expect(r.guides).toHaveLength(2);
    expect(r.guides[0]).toBe(fake_guide_a);
    expect(r.guides[1]).toBe(fake_guide_b);
  });

  it("skips undefined emissions", () => {
    const a: TranslateStage = {
      name: "a",
      run(plan) {
        return { plan }; // no emit
      },
    };
    const r = run_translate_pipeline(empty_plan, [a], ctx());
    expect(r.guides).toEqual([]);
  });

  it("does not mutate the input plan", () => {
    const plan: TranslatePlan = {
      ids: [],
      baselines: new Map(),
      delta: { x: 7, y: 9 },
    };
    const stage: TranslateStage = {
      name: "x",
      run(p) {
        return { plan: { ...p, delta: { x: -1, y: -1 } } };
      },
    };
    run_translate_pipeline(plan, [stage], ctx());
    // Original plan untouched
    expect(plan.delta).toEqual({ x: 7, y: 9 });
  });

  it("is deterministic — same input gives same output", () => {
    const stage: TranslateStage = {
      name: "x",
      run(p) {
        return {
          plan: { ...p, delta: { x: p.delta.x + 1, y: p.delta.y + 2 } },
        };
      },
    };
    const r1 = run_translate_pipeline(empty_plan, [stage, stage], ctx());
    const r2 = run_translate_pipeline(empty_plan, [stage, stage], ctx());
    expect(r1.plan.delta).toEqual(r2.plan.delta);
  });
});
