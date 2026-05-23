// Headless tests for the path-edit coordinate-projection helpers.
//
// **Repros the bug class found during browser smoke-testing**: vertex knobs
// at the wrong screen position, not tracking camera pan/zoom. Root cause was
// returning raw path-local viewBox coords from `vector_of` instead of the
// container CSS-px the HUD draws in (HUD keeps its own transform at identity;
// the SVG carries the camera as a CSS transform).
//
// These helpers are pure — no DOM, no canvas. The CTM-shaped object is just
// a 6-number affine in `{a,b,c,d,e,f}` form (matching `SVGMatrix`).

import { describe, it, expect } from "vitest";
import {
  project_point_through_ctm,
  project_delta_inverse_ctm,
} from "../src/dom";

// Helpers to build CTM-shaped objects readably.
type CTM = { a: number; b: number; c: number; d: number; e: number; f: number };

const identity: CTM = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const scale = (sx: number, sy = sx): CTM => ({
  a: sx,
  b: 0,
  c: 0,
  d: sy,
  e: 0,
  f: 0,
});

const translate = (tx: number, ty: number): CTM => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: tx,
  f: ty,
});

const compose = (outer: CTM, inner: CTM): CTM => ({
  // outer ∘ inner — for `getScreenCTM` semantics, outer = camera, inner = local.
  a: outer.a * inner.a + outer.c * inner.b,
  b: outer.b * inner.a + outer.d * inner.b,
  c: outer.a * inner.c + outer.c * inner.d,
  d: outer.b * inner.c + outer.d * inner.d,
  e: outer.a * inner.e + outer.c * inner.f + outer.e,
  f: outer.b * inner.e + outer.d * inner.f + outer.f,
});

describe("project_point_through_ctm — vertex position projection", () => {
  it("identity CTM + zero offset = point passthrough", () => {
    expect(project_point_through_ctm(10, 20, identity, [0, 0])).toEqual([
      10, 20,
    ]);
  });

  it("container offset shifts every projected point", () => {
    // Container at page (-300, -50) means subtracting -(-300, -50) = (300, 50)
    // is what `vector_of` does to translate page coords → container coords.
    expect(project_point_through_ctm(10, 20, identity, [300, 50])).toEqual([
      310, 70,
    ]);
  });

  it("camera-only scale 2× projects vertex at doubled distance from origin", () => {
    // SVG with no transform sits in a page that has been camera-zoomed 2×.
    // A path vertex at local (10, 10) renders at page (20, 20).
    const ctm = scale(2);
    expect(project_point_through_ctm(10, 10, ctm, [0, 0])).toEqual([20, 20]);
  });

  it("camera scale + container offset = position the HUD draws at", () => {
    // Camera 2×, container starts at page (-100, -50). After projection +
    // subtracting container offset, the HUD-drawing position for local (5, 5)
    // is (camera*5 - container_left) = (10 - (-100), 10 - (-50)) = (110, 60).
    const ctm = scale(2);
    const offset: [number, number] = [100, 50]; // = -cr.left, -cr.top
    expect(project_point_through_ctm(5, 5, ctm, offset)).toEqual([110, 60]);
  });

  it("camera pan = container-px position shifts by the pan amount", () => {
    // The user-visible bug-2 repro: pan the camera, knob should follow.
    const ctm_before = translate(0, 0); // no pan
    const ctm_after = translate(50, 30); // panned (50, 30)
    const before = project_point_through_ctm(10, 10, ctm_before, [0, 0]);
    const after = project_point_through_ctm(10, 10, ctm_after, [0, 0]);
    expect(after[0] - before[0]).toBe(50);
    expect(after[1] - before[1]).toBe(30);
  });

  it("camera zoom = container-px position scales relative to origin", () => {
    // Bug-1 repro: vertex at viewBox (10, 10) at 1× renders at container (10, 10).
    // After camera zoom to 3×, it renders at container (30, 30).
    const before = project_point_through_ctm(10, 10, scale(1), [0, 0]);
    const after = project_point_through_ctm(10, 10, scale(3), [0, 0]);
    expect(before).toEqual([10, 10]);
    expect(after).toEqual([30, 30]);
  });

  it("composed camera×local matches manual composition", () => {
    // <svg> has a viewBox + a CSS transform from the camera; the path inside
    // has no per-element transform. `getScreenCTM()` returns the composition.
    const camera = scale(2.5);
    const local = identity; // path has no transform
    const ctm = compose(camera, local);
    // Vertex local (4, 8) → camera (10, 20)
    expect(project_point_through_ctm(4, 8, ctm, [0, 0])).toEqual([10, 20]);
  });
});

describe("project_delta_inverse_ctm — drag delta projection", () => {
  it("identity CTM returns delta unchanged", () => {
    expect(project_delta_inverse_ctm(7, 11, identity)).toEqual([7, 11]);
  });

  it("camera scale 2× → 10px drag in container = 5px move in path local", () => {
    // Bug-1's other half: when the user drags 10px on screen under 2× zoom,
    // the path vertex should move 5 SVG units, not 10. Without this inverse
    // projection the vertex moves too far at high zoom.
    expect(project_delta_inverse_ctm(10, 10, scale(2))).toEqual([5, 5]);
  });

  it("camera scale 0.5× → 10px drag = 20px move in local", () => {
    // Inverse of the above — at zoomed-out, drag distance covers more SVG units.
    expect(project_delta_inverse_ctm(10, 10, scale(0.5))).toEqual([20, 20]);
  });

  it("camera translation is invariant for deltas (linear inverse drops it)", () => {
    // Panning the camera doesn't change how a drag-delta maps to local units —
    // only scale/rotation matter. This is the contract that makes drag
    // continue to work correctly across mid-gesture pans (if any).
    const t = translate(123, 456);
    expect(project_delta_inverse_ctm(5, 7, t)).toEqual([5, 7]);
  });

  it("90° rotation: container (dx, 0) maps to local (0, -dx)", () => {
    // CTM for a +90° CCW rotation: a=0, b=1, c=-1, d=0.
    const rot90: CTM = { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 };
    expect(project_delta_inverse_ctm(10, 0, rot90)).toEqual([0, -10]);
    // And (0, dy) maps to (dy, 0)
    expect(project_delta_inverse_ctm(0, 10, rot90)).toEqual([10, 0]);
  });

  it("rotate + scale composes correctly under inverse", () => {
    // Scale-2 then rotate-90 CCW: a=0, b=2, c=-2, d=0
    // Container (4, 0) should map to local (0, -2)
    const m: CTM = { a: 0, b: 2, c: -2, d: 0, e: 100, f: 200 };
    expect(project_delta_inverse_ctm(4, 0, m)).toEqual([0, -2]);
  });

  it("singular matrix throws", () => {
    const singular: CTM = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };
    expect(() => project_delta_inverse_ctm(1, 1, singular)).toThrow(
      /singular/i
    );
  });
});

describe("round-trip: project then invert is a no-op for points represented as deltas", () => {
  it("project a delta through forward, then inverse, returns the same delta", () => {
    // Forward "project a delta" = drop translation, apply linear part:
    //   [a c; b d] * [dx, dy] = [a*dx + c*dy, b*dx + d*dy]
    // Then inverse should return the original (dx, dy).
    const m: CTM = { a: 2, b: 1, c: -1, d: 2, e: 999, f: -42 };
    const dx = 7;
    const dy = -3;
    const fwd_dx = m.a * dx + m.c * dy;
    const fwd_dy = m.b * dx + m.d * dy;
    const [back_dx, back_dy] = project_delta_inverse_ctm(fwd_dx, fwd_dy, m);
    expect(back_dx).toBeCloseTo(dx, 10);
    expect(back_dy).toBeCloseTo(dy, 10);
  });
});
