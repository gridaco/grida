// `applyResize` — aspect-lock under `{ aspect: true }` (Shift). A corner takes
// the max-magnitude axis factor; a side edge drives the perpendicular axis by
// the same factor about the perpendicular center. This variant drives the
// dashed resize *preview* so it matches an aspect-locking host (the emitted
// intent stays opposite-anchored / free — see state.ts). Composes with
// `fromCenter` (Alt) for uniform-about-center.

import { describe, it, expect } from "vitest";
import { applyResize } from "../event/gesture";
import type { SelectionShape } from "../event";

function rect(x: number, y: number, w: number, h: number): SelectionShape {
  return { kind: "rect", rect: { x, y, width: w, height: h } };
}
function bbox(s: SelectionShape) {
  if (s.kind !== "rect") throw new Error("expected rect");
  return s.rect;
}
function center(r: { x: number; y: number; width: number; height: number }) {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

describe("applyResize — aspect off is unchanged (regression guard)", () => {
  it("e edge stays free (perpendicular unchanged) without aspect", () => {
    expect(bbox(applyResize(rect(0, 0, 100, 50), "e", 20, 0))).toEqual({
      x: 0,
      y: 0,
      width: 120,
      height: 50,
    });
  });
});

describe("applyResize — aspect (Shift) on a side edge follows the perpendicular", () => {
  it("e: left edge pinned, height scales with width about the vertical center", () => {
    const r = bbox(
      applyResize(rect(0, 0, 100, 50), "e", 20, 0, { aspect: true })
    );
    expect(r).toEqual({ x: 0, y: -5, width: 120, height: 60 }); // s = 1.2
    expect(r.y + r.height / 2).toBe(25); // vertical center preserved
    expect(r.x).toBe(0); // left edge pinned
  });

  it("n: bottom edge pinned, width scales with height about the horizontal center", () => {
    const r = bbox(
      applyResize(rect(0, 0, 100, 50), "n", 0, -10, { aspect: true })
    );
    expect(r).toEqual({ x: -10, y: -10, width: 120, height: 60 }); // s = 1.2
    expect(r.x + r.width / 2).toBe(50); // horizontal center preserved
    expect(r.y + r.height).toBe(50); // bottom edge pinned
  });

  it("e: crossing the opposite edge clamps (no flip), matching core", () => {
    // Drag the E edge far left, past the left edge → free width would be -50.
    // Core clamps sx/sy to 0.001 (a thin box pinned at the left edge); the
    // preview must match, not mirror.
    const r = bbox(
      applyResize(rect(0, 0, 100, 50), "e", -150, 0, { aspect: true })
    );
    expect(r.width).toBeCloseTo(0.1, 6); // 100 * 0.001, never negative
    expect(r.height).toBeCloseTo(0.05, 6); // 50 * 0.001, followed
    expect(r.x).toBe(0); // left edge still pinned
  });
});

describe("applyResize — aspect (Shift) on a corner is max-magnitude uniform", () => {
  it("se collapses to the larger axis factor, origin pinned", () => {
    // sx = 1.2, sy = 1.1 → mag 1.2.
    const r = bbox(
      applyResize(rect(0, 0, 100, 50), "se", 20, 5, { aspect: true })
    );
    expect(r).toEqual({ x: 0, y: 0, width: 120, height: 60 });
  });
});

describe("applyResize — Shift+Alt is uniform about the bbox center", () => {
  it("e edge: both opposite edges move, center stays put", () => {
    const r = bbox(
      applyResize(rect(0, 0, 100, 50), "e", 20, 0, {
        fromCenter: true,
        aspect: true,
      })
    );
    expect(r).toEqual({ x: -20, y: -10, width: 140, height: 70 }); // s = 1.4
    expect(center(r)).toEqual({ x: 50, y: 25 }); // initial center
  });
});
