// Rotate pipeline + RPC integration tests. No DOM, no editor — exercises
// the orchestrator-free RPC path and the stage composition.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import {
  rotate_pipeline,
  type RotateContext,
  type RotateOptions,
  type RotatePlan,
} from "../src/core/rotate-pipeline";

const DEG = Math.PI / 180;
const OPTS: RotateOptions = { angle_snap_step_radians: 15 * DEG };

function with_two_rects(): { doc: SvgDocument; ids: string[] } {
  const doc = new SvgDocument(
    `<svg xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="10" height="10"/>` +
      `<rect x="20" y="20" width="10" height="10"/>` +
      `</svg>`
  );
  const ids = doc.element_children_of(doc.root) as string[];
  return { doc, ids };
}

describe("rotate-pipeline — stage_angle_snap", () => {
  it("snaps to step multiples when angle_snap === step", () => {
    const plan: RotatePlan = {
      members: [],
      pivot: { x: 0, y: 0 },
      angle_radians: 19 * DEG, // closest 15° multiple is 15°
    };
    const ctx: RotateContext = {
      input: { ids: [], angle_radians: 19 * DEG },
      modifiers: { angle_snap: "step", force_disable_snap: false },
      options: OPTS,
    };
    const out = rotate_pipeline.run(plan, rotate_pipeline.stages.DEFAULT, ctx);
    expect(out.plan.angle_radians).toBeCloseTo(15 * DEG, 9);
  });

  it("is identity when angle_snap === off", () => {
    const plan: RotatePlan = {
      members: [],
      pivot: { x: 0, y: 0 },
      angle_radians: 19 * DEG,
    };
    const ctx: RotateContext = {
      input: { ids: [], angle_radians: 19 * DEG },
      modifiers: { angle_snap: "off", force_disable_snap: false },
      options: OPTS,
    };
    const out = rotate_pipeline.run(plan, rotate_pipeline.stages.DEFAULT, ctx);
    expect(out.plan.angle_radians).toBeCloseTo(19 * DEG, 9);
  });

  it("respects force_disable_snap even when angle_snap === step", () => {
    const plan: RotatePlan = {
      members: [],
      pivot: { x: 0, y: 0 },
      angle_radians: 19 * DEG,
    };
    const ctx: RotateContext = {
      input: { ids: [], angle_radians: 19 * DEG },
      modifiers: { angle_snap: "step", force_disable_snap: true },
      options: OPTS,
    };
    const out = rotate_pipeline.run(plan, rotate_pipeline.stages.DEFAULT, ctx);
    expect(out.plan.angle_radians).toBeCloseTo(19 * DEG, 9);
  });
});

describe("prepare_rotate_rpc — single member", () => {
  it("writes one rotate token around pivot", () => {
    const { doc, ids } = with_two_rects();
    const r = rotate_pipeline.prepare_rpc({
      doc,
      ids: [ids[0]],
      pivot: { x: 5, y: 5 },
      angle_radians: 30 * DEG,
      options: OPTS,
      emit: () => {},
    });
    r.apply();
    expect(doc.get_attr(ids[0], "transform")).toBe("rotate(30 5 5)");
  });

  it("revert restores baseline transform", () => {
    const { doc, ids } = with_two_rects();
    const r = rotate_pipeline.prepare_rpc({
      doc,
      ids: [ids[0]],
      pivot: { x: 5, y: 5 },
      angle_radians: 30 * DEG,
      options: OPTS,
      emit: () => {},
    });
    r.apply();
    r.revert();
    // Baseline had no transform → revert restores null byte-equal.
    expect(doc.get_attr(ids[0], "transform")).toBeNull();
  });

  it("returns a refuse verdict for an element with a matrix transform", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg">` +
        `<rect x="0" y="0" width="10" height="10" transform="matrix(1 0 0 1 5 5)"/>` +
        `</svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    const r = rotate_pipeline.prepare_rpc({
      doc,
      ids: [id],
      pivot: { x: 5, y: 5 },
      angle_radians: 30 * DEG,
      options: OPTS,
      emit: () => {},
    });
    expect(r.verdicts.get(id)).toEqual({
      kind: "refuse",
      reason: "non-trivial-transform",
    });
    // r.apply still writes (callers gate on verdicts).
  });
});

describe("prepare_rotate_rpc — multi-member", () => {
  it("applies the same angle to each member around the shared pivot", () => {
    const { doc, ids } = with_two_rects();
    // Union bbox is (0,0,30,30); center is (15,15).
    const r = rotate_pipeline.prepare_rpc({
      doc,
      ids,
      pivot: { x: 15, y: 15 },
      angle_radians: 45 * DEG,
      options: OPTS,
      emit: () => {},
    });
    r.apply();
    expect(doc.get_attr(ids[0], "transform")).toBe("rotate(45 15 15)");
    expect(doc.get_attr(ids[1], "transform")).toBe("rotate(45 15 15)");
  });

  it("revert returns both members to baseline", () => {
    const { doc, ids } = with_two_rects();
    const r = rotate_pipeline.prepare_rpc({
      doc,
      ids,
      pivot: { x: 15, y: 15 },
      angle_radians: 45 * DEG,
      options: OPTS,
      emit: () => {},
    });
    r.apply();
    r.revert();
    expect(doc.get_attr(ids[0], "transform")).toBeNull();
    expect(doc.get_attr(ids[1], "transform")).toBeNull();
  });

  it("prunes nested members — only the ancestor's transform changes", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg">` +
        `<g><rect x="0" y="0" width="10" height="10"/></g>` +
        `</svg>`
    );
    const g_id = doc.element_children_of(doc.root)[0];
    const rect_id = doc.element_children_of(g_id)[0];
    const r = rotate_pipeline.prepare_rpc({
      doc,
      ids: [g_id, rect_id], // both selected, but pruning drops the rect
      pivot: { x: 5, y: 5 },
      angle_radians: 30 * DEG,
      options: OPTS,
      emit: () => {},
    });
    r.apply();
    expect(doc.get_attr(g_id, "transform")).toBe("rotate(30 5 5)");
    // Rect's transform stays null — pruning dropped it from the apply set.
    expect(doc.get_attr(rect_id, "transform")).toBeNull();
  });
});
