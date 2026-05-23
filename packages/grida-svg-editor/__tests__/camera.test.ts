// Unit tests for the surface-scoped Camera class.
//
// Camera is DOM-free; tests construct it with a stub `resolve_bounds` and
// exercise pan / zoom_at / set_center / set_zoom / fit / reset / subscribe
// against a synthetic 800×600 viewport. No editor or surface needed.

import { describe, expect, it, vi } from "vitest";
import cmath from "@grida/cmath";
import { Camera, DEFAULT_FIT_MARGIN } from "../src/core/camera";
import type { Rect } from "../src/types";

const VIEWPORT_W = 800;
const VIEWPORT_H = 600;

function mk_camera(opts?: {
  resolve?: (target: unknown) => Rect | null;
  initial?: cmath.Transform;
  width?: number;
  height?: number;
}): Camera {
  const camera = new Camera({
    resolve_bounds: opts?.resolve ?? (() => null),
    initial: opts?.initial,
  });
  camera._set_viewport_size(
    opts?.width ?? VIEWPORT_W,
    opts?.height ?? VIEWPORT_H
  );
  return camera;
}

describe("Camera — reads", () => {
  it("starts at identity by default", () => {
    const c = mk_camera();
    expect(c.zoom).toBe(1);
    expect(c.transform).toEqual(cmath.transform.identity);
  });

  it("center is the viewport midpoint in world space at identity", () => {
    const c = mk_camera();
    expect(c.center).toEqual({ x: VIEWPORT_W / 2, y: VIEWPORT_H / 2 });
  });

  it("bounds is the full viewport in world space at identity", () => {
    const c = mk_camera();
    expect(c.bounds).toEqual({
      x: 0,
      y: 0,
      width: VIEWPORT_W,
      height: VIEWPORT_H,
    });
  });

  it("accepts a non-identity initial transform", () => {
    const c = mk_camera({
      initial: [
        [2, 0, 100],
        [0, 2, 50],
      ],
    });
    expect(c.zoom).toBe(2);
  });
});

describe("Camera — pan", () => {
  it("translates by a screen-space delta", () => {
    const c = mk_camera();
    c.pan({ x: 30, y: -20 });
    expect(c.transform).toEqual([
      [1, 0, 30],
      [0, 1, -20],
    ]);
  });

  it("pan does not affect zoom", () => {
    const c = mk_camera();
    c.pan({ x: 100, y: 100 });
    expect(c.zoom).toBe(1);
  });
});

describe("Camera — zoom_at", () => {
  it("multiplies zoom by factor", () => {
    const c = mk_camera();
    c.zoom_at(2, { x: 0, y: 0 });
    expect(c.zoom).toBe(2);
  });

  it("keeps origin_screen fixed in world space", () => {
    const c = mk_camera();
    const origin = { x: 200, y: 150 };
    // World position of origin before zoom
    const before = c.screen_to_world(origin);
    c.zoom_at(3, origin);
    // World position should be unchanged: zoom_at preserves the world
    // point under origin_screen.
    const after = c.screen_to_world(origin);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});

describe("Camera — set_center / set_zoom", () => {
  it("set_center places the world point at the viewport center", () => {
    const c = mk_camera();
    c.set_center({ x: 1000, y: 500 });
    expect(c.center.x).toBeCloseTo(1000);
    expect(c.center.y).toBeCloseTo(500);
  });

  it("set_center preserves zoom", () => {
    const c = mk_camera();
    c.set_zoom(2);
    c.set_center({ x: 500, y: 500 });
    expect(c.zoom).toBe(2);
  });

  it("set_zoom defaults to viewport-center pivot", () => {
    const c = mk_camera();
    const center_before = c.center;
    c.set_zoom(2);
    expect(c.zoom).toBe(2);
    // World point at viewport center stays put.
    expect(c.center.x).toBeCloseTo(center_before.x);
    expect(c.center.y).toBeCloseTo(center_before.y);
  });
});

describe("Camera — fit", () => {
  it("fits a Rect target into the viewport with default margin", () => {
    const c = mk_camera();
    const target: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
    c.fit(target);
    // After fit, the bounds should contain the target rect entirely.
    const b = c.bounds;
    expect(b.x).toBeLessThanOrEqual(target.x);
    expect(b.y).toBeLessThanOrEqual(target.y);
    expect(b.x + b.width).toBeGreaterThanOrEqual(target.x + target.width);
    expect(b.y + b.height).toBeGreaterThanOrEqual(target.y + target.height);
    // Default margin should keep the target strictly inside the viewport.
    expect(b.width).toBeGreaterThan(target.width);
  });

  it("fits a resolver-named target", () => {
    const target: Rect = { x: 100, y: 100, width: 400, height: 300 };
    const c = mk_camera({
      resolve: (name) => (name === "<root>" ? target : null),
    });
    c.fit("<root>");
    const b = c.bounds;
    expect(b.x).toBeLessThanOrEqual(target.x);
    expect(b.x + b.width).toBeGreaterThanOrEqual(target.x + target.width);
  });

  it("no-ops when resolver returns null", () => {
    const c = mk_camera({ resolve: () => null });
    const before = c.transform;
    c.fit("<root>");
    expect(c.transform).toBe(before); // unchanged reference
  });

  it("no-ops when viewport size is 0", () => {
    const c = mk_camera({ width: 0, height: 0 });
    const before = c.transform;
    c.fit({ x: 0, y: 0, width: 100, height: 100 });
    expect(c.transform).toBe(before);
  });

  it("honors custom margin", () => {
    const c = mk_camera();
    c.fit({ x: 0, y: 0, width: 100, height: 100 }, { margin: 0 });
    const b = c.bounds;
    // Zero margin: aspect-ratio-fit means one axis hugs the viewport.
    const min_axis_world = Math.min(b.width, b.height);
    expect(min_axis_world).toBeCloseTo(100);
  });

  it("DEFAULT_FIT_MARGIN is reasonable", () => {
    expect(DEFAULT_FIT_MARGIN).toBeGreaterThan(0);
    expect(DEFAULT_FIT_MARGIN).toBeLessThan(200);
  });
});

describe("Camera — reset", () => {
  it("returns to identity", () => {
    const c = mk_camera();
    c.set_zoom(4);
    c.pan({ x: 100, y: 100 });
    c.reset();
    expect(c.transform).toEqual(cmath.transform.identity);
  });
});

describe("Camera — subscribe", () => {
  it("fires on every mutation", () => {
    const c = mk_camera();
    const cb = vi.fn<() => void>();
    c.subscribe(cb);
    c.pan({ x: 10, y: 0 });
    c.zoom_at(2, { x: 0, y: 0 });
    c.reset();
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("fires on viewport-size change (so derived bounds/center stay live)", () => {
    const c = mk_camera();
    const cb = vi.fn<() => void>();
    c.subscribe(cb);
    c._set_viewport_size(1000, 800);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire when viewport size is unchanged", () => {
    const c = mk_camera();
    const cb = vi.fn<() => void>();
    c.subscribe(cb);
    c._set_viewport_size(VIEWPORT_W, VIEWPORT_H);
    expect(cb).toHaveBeenCalledTimes(0);
  });

  it("returns an unsubscribe function", () => {
    const c = mk_camera();
    const cb = vi.fn<() => void>();
    const unsubscribe = c.subscribe(cb);
    unsubscribe();
    c.pan({ x: 10, y: 0 });
    expect(cb).not.toHaveBeenCalled();
  });

  it("set_transform is idempotent — no notify when transform unchanged", () => {
    const c = mk_camera();
    const cb = vi.fn<() => void>();
    c.subscribe(cb);
    c.set_transform(c.transform); // same reference
    expect(cb).toHaveBeenCalledTimes(0);
    c.set_transform([
      [1, 0, 0],
      [0, 1, 0],
    ]); // element-equal but different reference
    expect(cb).toHaveBeenCalledTimes(0);
    c.set_transform([
      [2, 0, 0],
      [0, 2, 0],
    ]); // genuinely different
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("set_transform idempotence breaks the host-constraint recursion", () => {
    // The "subscribe → clamp → set_transform → subscribe → clamp → ..." loop
    // must terminate. With idempotence, after the clamped transform stabilizes
    // the recursion stops in finite steps.
    const c = mk_camera();
    let depth = 0;
    c.subscribe(() => {
      depth++;
      if (depth > 20) throw new Error("constraint loop did not terminate");
      // Trivial clamp: snap zoom to >= 1.
      const t = c.transform;
      if (t[0][0] < 1) {
        c.set_transform([
          [1, 0, t[0][2]],
          [0, 1, t[1][2]],
        ]);
      }
    });
    c.set_transform([
      [0.5, 0, 0],
      [0, 0.5, 0],
    ]);
    expect(c.zoom).toBe(1); // clamped
  });
});

describe("Camera — viewport_size", () => {
  it("exposes container dimensions for constraint math", () => {
    const c = mk_camera({ width: 1024, height: 768 });
    expect(c.viewport_size).toEqual({ width: 1024, height: 768 });
  });
});

describe("Camera — screen_to_world / world_to_screen", () => {
  it("are inverses", () => {
    const c = mk_camera();
    c.set_zoom(2);
    c.pan({ x: 100, y: 50 });
    const p = { x: 300, y: 200 };
    const w = c.screen_to_world(p);
    const back = c.world_to_screen(w);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});

const SLIDE: Rect = { x: 0, y: 0, width: 1920, height: 1080 };

function mk_cover_camera(opts?: {
  padding?: number;
  bounds?: Rect | "<root>";
  pan_overshoot?: number;
  width?: number;
  height?: number;
}): Camera {
  const c = mk_camera({
    resolve: (target) => (target === "<root>" ? SLIDE : null),
    width: opts?.width,
    height: opts?.height,
  });
  c.constraints = {
    type: "cover",
    bounds: opts?.bounds ?? "<root>",
    padding: opts?.padding ?? 0,
    pan_overshoot: opts?.pan_overshoot,
  };
  return c;
}

describe("Camera — constraints (cover)", () => {
  it("clamps zoom to fit-with-padding minimum (no zoom-out past the slide)", () => {
    const c = mk_cover_camera({ padding: 0 });
    // viewport 800×600, slide 1920×1080 → min_zoom = min(800/1920, 600/1080) ≈ 0.4167
    const expected_min = Math.min(800 / 1920, 600 / 1080);
    // Try to set zoom below min — constraint should pin to min.
    c.set_zoom(0.1);
    expect(c.zoom).toBeCloseTo(expected_min);
  });

  it("at min-zoom centers the slide (no pan possible)", () => {
    const c = mk_cover_camera({ padding: 0 });
    // Pan should be a no-op at min zoom because the constraint re-centers.
    const before = c.transform;
    c.pan({ x: 999, y: 999 });
    expect(c.transform).toEqual(before);
  });

  it("above min-zoom, clamps pan so slide always covers viewport", () => {
    const c = mk_cover_camera({ padding: 0 });
    c.set_zoom(2); // well above min_zoom (~0.42) — slide larger than viewport
    // Try to pan way past the slide's right edge (positive tx pushes content right).
    c.pan({ x: 5000, y: 0 });
    // After clamp: tx should be at most 0 (slide's left edge at viewport left).
    expect(c.transform[0][2]).toBeLessThanOrEqual(0);
    // And no less than vp.width - s * (slide.x + slide.width) = 800 - 2*1920 = -3040.
    expect(c.transform[0][2]).toBeGreaterThanOrEqual(800 - 2 * 1920);
  });

  it("honors padding (zoom floor accounts for inset)", () => {
    const c_no_pad = mk_cover_camera({ padding: 0 });
    const c_pad = mk_cover_camera({ padding: 80 });
    // Below min_zoom for both — constraint pins each to its own min.
    c_no_pad.set_zoom(0.01);
    c_pad.set_zoom(0.01);
    // Padded version has a SMALLER min_zoom (the effective viewport is smaller).
    expect(c_pad.zoom).toBeLessThan(c_no_pad.zoom);
  });

  it("accepts an explicit Rect for bounds (no resolver call)", () => {
    const c = mk_camera({ resolve: () => null });
    c.constraints = {
      type: "cover",
      bounds: { x: 0, y: 0, width: 400, height: 300 },
    };
    // Min zoom = min(800/400, 600/300) = 2
    c.set_zoom(0.5);
    expect(c.zoom).toBeCloseTo(2);
  });

  it("re-enforces synchronously when set (clamps current transform immediately)", () => {
    const c = mk_camera({ resolve: (t) => (t === "<root>" ? SLIDE : null) });
    c.set_zoom(0.01); // way below min for any reasonable bounds
    c.constraints = { type: "cover", bounds: "<root>" };
    expect(c.zoom).toBeGreaterThanOrEqual(Math.min(800 / 1920, 600 / 1080));
  });

  it("re-enforces on viewport resize (constraint range shifts)", () => {
    const c = mk_cover_camera({ padding: 0 });
    c.set_zoom(2);
    c.pan({ x: -100, y: -50 }); // valid for current viewport
    // Shrink the viewport — bounds-cover may force pan adjustment.
    c._set_viewport_size(400, 300);
    // Constraint must still hold: slide must cover the new viewport.
    const s = c.zoom;
    const tx = c.transform[0][2];
    const right_edge = s * SLIDE.width + tx;
    const left_edge = tx;
    expect(left_edge).toBeLessThanOrEqual(0);
    expect(right_edge).toBeGreaterThanOrEqual(400);
  });

  it("clearing the constraint (= null) restores free pan/zoom", () => {
    const c = mk_cover_camera({ padding: 0 });
    c.constraints = null;
    c.set_zoom(0.01);
    expect(c.zoom).toBeCloseTo(0.01); // no longer clamped
  });

  it("no-ops when resolver returns null (e.g. no document yet)", () => {
    const c = mk_camera({ resolve: () => null });
    c.constraints = { type: "cover", bounds: "<root>" };
    // No bounds → no clamp.
    c.set_zoom(0.01);
    expect(c.zoom).toBeCloseTo(0.01);
  });

  it("set_transform with already-clamped value is a no-op (idempotence preserved)", () => {
    const c = mk_cover_camera({ padding: 0 });
    const cb = vi.fn<() => void>();
    c.subscribe(cb);
    // Re-set the same transform — should not notify.
    c.set_transform(c.transform);
    expect(cb).toHaveBeenCalledTimes(0);
  });

  it("fit() respects constraints (final transform satisfies the clamp)", () => {
    const c = mk_cover_camera({ padding: 0 });
    c.fit({ x: 0, y: 0, width: 100, height: 100 }, { margin: 0 });
    // Even though we tried to fit a tiny rect (which would zoom WAY in),
    // fit goes through set_transform which applies the constraint. The
    // result should still cover the slide.
    const s = c.zoom;
    const min = Math.min(800 / 1920, 600 / 1080);
    expect(s).toBeGreaterThanOrEqual(min);
  });
});

describe("Camera — constraints (cover) pan_overshoot", () => {
  it("default (undefined) preserves strict cover behavior", () => {
    const c = mk_cover_camera();
    c.set_zoom(2); // above min — slide larger than viewport
    c.pan({ x: 5000, y: 0 });
    // Without overshoot, tx upper bound is exactly -s * bounds.x = 0.
    expect(c.transform[0][2]).toBe(0);
  });

  it("explicit 0 preserves strict cover behavior", () => {
    const c = mk_cover_camera({ pan_overshoot: 0 });
    c.set_zoom(2);
    c.pan({ x: 5000, y: 0 });
    expect(c.transform[0][2]).toBe(0);
  });

  it("allows pan past the right edge by overshoot px (negative tx)", () => {
    const c = mk_cover_camera({ pan_overshoot: 50 });
    c.set_zoom(2);
    // Try to pan past the slide's right edge (negative tx → content shifts left).
    c.pan({ x: -5000, y: 0 });
    // Lower bound is vp_w - s*(b.x+b.w) - overshoot = 800 - 2*1920 - 50 = -3090.
    expect(c.transform[0][2]).toBe(800 - 2 * 1920 - 50);
  });

  it("allows pan past the left edge by overshoot px (positive tx)", () => {
    const c = mk_cover_camera({ pan_overshoot: 50 });
    c.set_zoom(2);
    // Try to pan past the slide's left edge (positive tx → content shifts right).
    c.pan({ x: 5000, y: 0 });
    // Upper bound is -s*b.x + overshoot = 0 + 50 = 50.
    expect(c.transform[0][2]).toBe(50);
  });

  it("does NOT drift a fitted (centered) axis", () => {
    // Make a wide-only-scrollable scenario: viewport tall enough that the y
    // axis fits at zoom=0.5 (sy = 0.5*1080 = 540 < 600 viewport_h).
    const c = mk_cover_camera({ pan_overshoot: 50 });
    c.set_zoom(0.5);
    // x axis: sx = 0.5*1920 = 960 > 800 → scrollable + overshoot applies.
    // y axis: sy = 540 < 600 → centered branch, overshoot must NOT apply.
    const expected_ty_centered = (600 - 540) / 2; // (vp_h - sh)/2 with b.y = 0
    c.pan({ x: 0, y: 5000 });
    expect(c.transform[1][2]).toBe(expected_ty_centered);
    c.pan({ x: 0, y: -10000 });
    expect(c.transform[1][2]).toBe(expected_ty_centered);
  });

  it("does NOT drift either axis at min-zoom (both at fit/centered branch)", () => {
    const c = mk_cover_camera({ pan_overshoot: 50, padding: 80 });
    c.set_zoom(0); // pin to min_zoom via constraint
    // At min_zoom with padding>0, the limiting axis sits at sw == eff_w < vp_w
    // → centered branch on that axis. The looser axis may also be < vp_w.
    // Either way, the limiting axis should NOT pan.
    const before = c.transform;
    c.pan({ x: 99999, y: 99999 });
    // The limiting axis transform component is unchanged.
    // (Slide aspect 1920/1080 ≈ 1.78, viewport 800/600 ≈ 1.33; x is the
    //  limiting axis — sw == eff_w; y may have slack.)
    expect(c.transform[0][2]).toBe(before[0][2]);
  });

  it("negative pan_overshoot is treated as 0 (defended in clamp_cover)", () => {
    const c = mk_cover_camera({ pan_overshoot: -100 });
    c.set_zoom(2);
    c.pan({ x: 5000, y: 0 });
    // Same as overshoot=0: upper bound exactly 0.
    expect(c.transform[0][2]).toBe(0);
    c.pan({ x: -10000, y: 0 });
    // Same as overshoot=0: lower bound exactly 800 - 2*1920.
    expect(c.transform[0][2]).toBe(800 - 2 * 1920);
  });

  it("decreasing pan_overshoot pulls an out-of-range transform back", () => {
    const c = mk_cover_camera({ pan_overshoot: 100 });
    c.set_zoom(2);
    c.pan({ x: 5000, y: 0 }); // tx clamped to +100
    expect(c.transform[0][2]).toBe(100);
    // Now drop overshoot to 0 — reenforce should pull tx back to 0.
    c.constraints = {
      type: "cover",
      bounds: "<root>",
      padding: 0,
      pan_overshoot: 0,
    };
    expect(c.transform[0][2]).toBe(0);
  });

  it("decreasing pan_overshoot fires notify on the pull-back", () => {
    const c = mk_cover_camera({ pan_overshoot: 100 });
    c.set_zoom(2);
    c.pan({ x: 5000, y: 0 });
    const cb = vi.fn<() => void>();
    c.subscribe(cb);
    c.constraints = {
      type: "cover",
      bounds: "<root>",
      padding: 0,
      pan_overshoot: 0,
    };
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("viewport resize while overshooting does not pull if still in range", () => {
    // vp_w=800, slide 1920×1080, zoom=1, overshoot=50.
    // tx clamp range = [800 - 1920 - 50, 0 + 50] = [-1170, 50].
    const c = mk_cover_camera({ pan_overshoot: 50 });
    c.set_zoom(1);
    c.pan({ x: 5000, y: 0 }); // tx → 50
    expect(c.transform[0][2]).toBe(50);
    // Shrink viewport to 600 wide.
    // New tx clamp range = [600 - 1920 - 50, 0 + 50] = [-1370, 50].
    // tx=50 is still inside → no pull.
    c._set_viewport_size(600, 600);
    expect(c.transform[0][2]).toBe(50);
  });

  it("set_padding (via constraint replacement) re-evaluates against new min_zoom", () => {
    // At padding=0, min_zoom ≈ 0.4167 on the wider axis. With pan_overshoot,
    // a transform near the overshoot edge stays. Adding large padding raises
    // min_zoom of "effective viewport" and recenters at the new fit.
    const c = mk_cover_camera({ padding: 0, pan_overshoot: 100 });
    c.set_zoom(2);
    c.pan({ x: 5000, y: 0 });
    expect(c.transform[0][2]).toBe(100);
    // Replace constraint with large padding — at zoom=2 the slide is still
    // wider than vp_w so overshoot remains in effect.
    c.constraints = {
      type: "cover",
      bounds: "<root>",
      padding: 200,
      pan_overshoot: 100,
    };
    // Same upper bound, transform unchanged.
    expect(c.transform[0][2]).toBe(100);
    // Now drop overshoot — should pull back to 0.
    c.constraints = {
      type: "cover",
      bounds: "<root>",
      padding: 200,
      pan_overshoot: 0,
    };
    expect(c.transform[0][2]).toBe(0);
  });

  it("fit() result still satisfies the overshoot-relaxed clamp", () => {
    const c = mk_cover_camera({ pan_overshoot: 50 });
    c.fit("<root>");
    // After fit, the transform sits at (or above) min_zoom centered. Verify
    // the clamp accepts it as-is (idempotence: re-clamp is no-op).
    const before = c.transform;
    c.set_transform(before);
    expect(c.transform).toBe(before);
  });
});

describe("Camera — CameraConstraints type", () => {
  it("only ships 'cover' type at v1.1 (tagged union for forward compat)", () => {
    // This is a type-level test — the discriminant is exposed so future
    // variants can be added. We assert the runtime shape.
    const c: import("../src/core/camera").CameraConstraints = {
      type: "cover",
      bounds: "<root>",
    };
    expect(c.type).toBe("cover");
  });
});
