import cmath from "@grida/cmath";

import { schema } from "../schema";

describe("parametric_scale.scale_rect_about_anchor", () => {
  it("matches spec anchor formula", () => {
    const rect: cmath.Rectangle = { x: 10, y: 20, width: 100, height: 50 };
    const anchor: cmath.Vector2 = [0, 0];
    const s = 2;

    const out = schema.parametric_scale.scale_rect_about_anchor(
      rect,
      anchor,
      s
    );

    expect(out).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 100,
    });
  });
});

describe("parametric_scale._fe_blur", () => {
  it("scales radii for progressive blur but keeps normalized coords", () => {
    const initial: any = {
      type: "filter-blur",
      active: true,
      blur: {
        type: "progressive-blur",
        x1: -1,
        y1: -0.5,
        x2: 1,
        y2: 0.5,
        radius: 3,
        radius2: 7,
      },
    };

    const out = schema.parametric_scale._fe_blur(initial, 2) as any;

    expect(out.blur.x1).toBe(-1);
    expect(out.blur.y1).toBe(-0.5);
    expect(out.blur.x2).toBe(1);
    expect(out.blur.y2).toBe(0.5);
    expect(out.blur.radius).toBe(6);
    expect(out.blur.radius2).toBe(14);
  });
});

describe("parametric_scale._fe_shadow", () => {
  it("scales dx/dy/blur/spread but preserves non-length fields", () => {
    const initial: any = {
      type: "shadow",
      active: true,
      inset: false,
      color: { r: 1, g: 0, b: 0, a: 1 },
      dx: 1,
      dy: -2,
      blur: 3,
      spread: 4,
    };

    const out = schema.parametric_scale._fe_shadow(initial, 3) as any;

    expect(out.type).toBe("shadow");
    expect(out.active).toBe(true);
    expect(out.inset).toBe(false);
    expect(out.color).toEqual(initial.color);

    expect(out.dx).toBe(3);
    expect(out.dy).toBe(-6);
    expect(out.blur).toBe(9);
    expect(out.spread).toBe(12);
  });
});

describe("parametric_scale._fe_noise", () => {
  it("scales noise_size but preserves density/seed", () => {
    const initial: any = {
      type: "noise",
      active: true,
      noise_size: 5,
      density: 0.3,
      seed: 42,
    };

    const out = schema.parametric_scale._fe_noise(initial, 0.5) as any;

    expect(out.noise_size).toBe(2.5);
    expect(out.density).toBe(0.3);
    expect(out.seed).toBe(42);
  });
});

describe("parametric_scale._stroke_width_profile", () => {
  it("scales stop.r but preserves stop.u", () => {
    const initial: any = {
      stops: [
        { u: 0, r: 1 },
        { u: 0.5, r: 2 },
      ],
    };

    const out = schema.parametric_scale._stroke_width_profile(
      initial,
      4
    ) as any;

    expect(out.stops).toEqual([
      { u: 0, r: 4 },
      { u: 0.5, r: 8 },
    ]);
  });
});

describe("parametric_scale.apply_node", () => {
  it("scales stroke widths and dash arrays", () => {
    const node: any = {
      type: "rectangle",
      stroke_width: 2,
      stroke_dash_array: [1, 2, 3],
      corner_radius: 4,
    };

    schema.parametric_scale.apply_node(node, 2);

    expect(node.stroke_width).toBe(4);
    expect(node.stroke_dash_array).toEqual([2, 4, 6]);
    expect(node.corner_radius).toBe(8);
  });
});
