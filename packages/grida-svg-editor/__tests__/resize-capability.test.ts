// Per-element resize semantics. Pure-function unit tests — no document,
// no DOM. The keystone of resize snap: if `effective_resize` lies about
// what the attribute write will produce, snap guides will lie too.

import { describe, expect, it } from "vitest";
import { resize_capability } from "../src/core/resize-capability";
import type {
  ResizeBaseline,
  ResizeDirection,
} from "../src/core/resize-pipeline";

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

function text_baseline(): ResizeBaseline {
  return {
    bbox: { x: 0, y: 0, width: 100, height: 20 },
    attrs: { kind: "text", x: 0, y: 0, fontSize: 16 },
    raw: [],
  };
}

describe("direction_mask", () => {
  const cases: Array<
    [ResizeDirection, ReturnType<typeof resize_capability.direction_mask>]
  > = [
    ["e", { affects_x: true, affects_y: false, x_edge: "right", y_edge: null }],
    ["w", { affects_x: true, affects_y: false, x_edge: "left", y_edge: null }],
    ["n", { affects_x: false, affects_y: true, x_edge: null, y_edge: "top" }],
    [
      "s",
      { affects_x: false, affects_y: true, x_edge: null, y_edge: "bottom" },
    ],
    [
      "ne",
      { affects_x: true, affects_y: true, x_edge: "right", y_edge: "top" },
    ],
    ["nw", { affects_x: true, affects_y: true, x_edge: "left", y_edge: "top" }],
    [
      "se",
      { affects_x: true, affects_y: true, x_edge: "right", y_edge: "bottom" },
    ],
    [
      "sw",
      { affects_x: true, affects_y: true, x_edge: "left", y_edge: "bottom" },
    ],
  ];
  for (const [dir, expected] of cases) {
    it(`${dir} → ${JSON.stringify(expected)}`, () => {
      expect(resize_capability.direction_mask(dir)).toEqual(expected);
    });
  }
});

describe("is_corner_direction", () => {
  it("returns true for corners only", () => {
    expect(resize_capability.is_corner("nw")).toBe(true);
    expect(resize_capability.is_corner("ne")).toBe(true);
    expect(resize_capability.is_corner("se")).toBe(true);
    expect(resize_capability.is_corner("sw")).toBe(true);
    expect(resize_capability.is_corner("n")).toBe(false);
    expect(resize_capability.is_corner("s")).toBe(false);
    expect(resize_capability.is_corner("e")).toBe(false);
    expect(resize_capability.is_corner("w")).toBe(false);
  });
});

describe("resize_constraint — rect (free element)", () => {
  it("is identity for rect", () => {
    const c = resize_capability.constraint(rect_baseline(), "se", 1.5, 0.8);
    expect(c).toEqual({ sx: 1.5, sy: 0.8, no_op: false, uniform: false });
  });
});

describe("resize_constraint — circle (uniform)", () => {
  it("collapses to min(sx, sy)", () => {
    const c = resize_capability.constraint(circle_baseline(), "se", 1.5, 0.8);
    expect(c).toEqual({ sx: 0.8, sy: 0.8, no_op: false, uniform: true });
  });
  it("works on edge handles too (circle is always uniform)", () => {
    const c = resize_capability.constraint(circle_baseline(), "e", 2, 1.2);
    expect(c).toEqual({ sx: 1.2, sy: 1.2, no_op: false, uniform: true });
  });
});

describe("resize_constraint — text", () => {
  it("uniform on corner drags", () => {
    const c = resize_capability.constraint(text_baseline(), "se", 1.5, 0.8);
    expect(c).toEqual({ sx: 0.8, sy: 0.8, no_op: false, uniform: true });
  });
  it("no-op on edge drags", () => {
    const c = resize_capability.constraint(text_baseline(), "e", 1.5, 1);
    expect(c).toEqual({ sx: 1, sy: 1, no_op: true, uniform: true });
  });
  it("no-op on top/bottom edge too", () => {
    const c = resize_capability.constraint(text_baseline(), "n", 1, 0.5);
    expect(c).toEqual({ sx: 1, sy: 1, no_op: true, uniform: true });
  });
});

describe("effective_resize — rect", () => {
  it("SE drag produces the gesture rect with origin at NW", () => {
    const eff = resize_capability.effective(
      rect_baseline(0, 0, 100, 50),
      "se",
      1.2,
      1.4
    );
    expect(eff.origin).toEqual({ x: 0, y: 0 });
    expect(eff.rect).toEqual({ x: 0, y: 0, width: 120, height: 70 });
    expect(eff.moving_corner).toEqual({ x: 120, y: 70 });
    expect(eff.uniform).toBe(false);
    expect(eff.no_op).toBe(false);
  });

  it("NW drag pivots around SE", () => {
    const eff = resize_capability.effective(
      rect_baseline(10, 20, 100, 50),
      "nw",
      0.5,
      0.5
    );
    expect(eff.origin).toEqual({ x: 110, y: 70 });
    // bbox scaled 0.5 around (110,70): new x = 110 + (10-110)*0.5 = 60.
    expect(eff.rect).toEqual({ x: 60, y: 45, width: 50, height: 25 });
    expect(eff.moving_corner).toEqual({ x: 60, y: 45 });
  });
});

describe("effective_resize — circle (Y component dropped)", () => {
  it("SE drag with sx > sy collapses to a square sized by sy", () => {
    const eff = resize_capability.effective(
      circle_baseline(50, 50, 25),
      "se",
      1.5,
      1.2
    );
    expect(eff.uniform).toBe(true);
    // s = min(1.5, 1.2) = 1.2; origin NW = (25, 25). New corner SE = (25 + 50*1.2, 25 + 50*1.2) = (85, 85).
    expect(eff.rect.width).toBeCloseTo(60, 6);
    expect(eff.rect.height).toBeCloseTo(60, 6);
    expect(eff.moving_corner.x).toBeCloseTo(85, 6);
    expect(eff.moving_corner.y).toBeCloseTo(85, 6);
  });
});

describe("effective_resize — text", () => {
  it("edge drag is a no-op rect (baseline returned)", () => {
    const b = text_baseline();
    const eff = resize_capability.effective(b, "e", 1.5, 1);
    expect(eff.no_op).toBe(true);
    // sx==sy==1, so rect == bbox (zero-delta scale around origin)
    expect(eff.rect).toEqual(b.bbox);
  });
  it("corner drag is uniform on min", () => {
    const eff = resize_capability.effective(text_baseline(), "se", 1.5, 1.2);
    expect(eff.uniform).toBe(true);
    expect(eff.rect.width).toBeCloseTo(120, 6);
    expect(eff.rect.height).toBeCloseTo(24, 6);
  });
});
