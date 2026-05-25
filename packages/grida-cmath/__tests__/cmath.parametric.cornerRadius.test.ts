import cmath from "..";

// Pins the corner-radius composer's geometry: the handle segments and
// per-corner `value` must compose so that evaluating each handle's
// curve at `t = value / domain.max` lands on the arc-center for that
// corner at that radius (corner + intercardinal-sign · radius).

describe("cmath.parametric.cornerRadiusHandles — shape", () => {
  const rect: cmath.Rectangle = { x: 10, y: 20, width: 100, height: 60 };
  const radii = { tl: 0, tr: 10, br: 20, bl: 30 };

  it("returns exactly four handles in nw/ne/se/sw order", () => {
    const input = cmath.parametric.cornerRadiusHandles("rect-1", rect, radii);
    expect(input.handles.map((h) => h.id)).toEqual(["nw", "ne", "se", "sw"]);
  });

  it("attaches node_id, no transform by default", () => {
    const input = cmath.parametric.cornerRadiusHandles("rect-1", rect, radii);
    expect(input.node_id).toBe("rect-1");
    expect(input.transform).toBeUndefined();
  });

  it("declares a single direction-resolved coincidence group over all four ids", () => {
    const input = cmath.parametric.cornerRadiusHandles("rect-1", rect, radii);
    expect(input.groups).toEqual([
      { ids: ["nw", "ne", "se", "sw"], policy: "direction-resolved" },
    ]);
  });

  it("propagates the optional local→doc transform untouched", () => {
    const t: cmath.Transform = [
      [1, 0, 5],
      [0, 1, 7],
    ];
    const input = cmath.parametric.cornerRadiusHandles(
      "rect-1",
      rect,
      radii,
      t
    );
    expect(input.transform).toBe(t);
  });
});

describe("cmath.parametric.cornerRadiusHandles — handle geometry", () => {
  const rect: cmath.Rectangle = { x: 0, y: 0, width: 100, height: 60 };
  const radii = { tl: 0, tr: 10, br: 20, bl: 30 };
  const max = 30; // min(100, 60) / 2

  it("nw segment runs from (0,0) toward the rect interior by `max` on both axes", () => {
    const input = cmath.parametric.cornerRadiusHandles("r", rect, radii);
    const nw = input.handles[0];
    expect(nw.track).toEqual({
      kind: "segment",
      a: [0, 0],
      b: [max, max],
    });
  });

  it("ne segment runs from (w,0) toward the interior by `max`", () => {
    const input = cmath.parametric.cornerRadiusHandles("r", rect, radii);
    const ne = input.handles[1];
    expect(ne.track).toEqual({
      kind: "segment",
      a: [100, 0],
      b: [100 - max, max],
    });
  });

  it("se segment runs from (w,h) toward the interior by `max`", () => {
    const input = cmath.parametric.cornerRadiusHandles("r", rect, radii);
    const se = input.handles[2];
    expect(se.track).toEqual({
      kind: "segment",
      a: [100, 60],
      b: [100 - max, 60 - max],
    });
  });

  it("sw segment runs from (0,h) toward the interior by `max`", () => {
    const input = cmath.parametric.cornerRadiusHandles("r", rect, radii);
    const sw = input.handles[3];
    expect(sw.track).toEqual({
      kind: "segment",
      a: [0, 60],
      b: [max, 60 - max],
    });
  });

  it("each handle carries its per-corner radius value", () => {
    const input = cmath.parametric.cornerRadiusHandles("r", rect, radii);
    expect(input.handles[0].value).toBe(radii.tl);
    expect(input.handles[1].value).toBe(radii.tr);
    expect(input.handles[2].value).toBe(radii.br);
    expect(input.handles[3].value).toBe(radii.bl);
  });

  it("each handle's domain is [0, min(w,h)/2]", () => {
    const input = cmath.parametric.cornerRadiusHandles("r", rect, radii);
    for (const h of input.handles) {
      expect(h.domain).toEqual({ min: 0, max });
    }
  });

  it("each handle carries the 16-px-per-axis snap-back inset, translated to √2·16 along-curve", () => {
    // The parametric primitive measures `inset` ALONG the curve, while
    // the corner-radius UX convention is "16 screen-px per axis."
    // For 45° diagonal segments those distances differ by √2, so the
    // composer scales to keep the visual identical to the bespoke
    // pre-migration corner-radius primitive.
    const input = cmath.parametric.cornerRadiusHandles("r", rect, radii);
    for (const h of input.handles) {
      expect(h.inset).toBeCloseTo(16 * Math.SQRT2);
    }
  });
});

describe("cmath.parametric.cornerRadiusHandles — t → arc-center math", () => {
  // Evaluating each handle's curve at `t = value / domain.max` must
  // equal the arc-center for that corner at the given radius:
  // `corner + intercardinal-sign · radius`.

  function arcCenter(
    rect: cmath.Rectangle,
    anchor: "nw" | "ne" | "se" | "sw",
    r: number
  ): cmath.Vector2 {
    const corners: Record<typeof anchor, cmath.Vector2> = {
      nw: [rect.x, rect.y],
      ne: [rect.x + rect.width, rect.y],
      se: [rect.x + rect.width, rect.y + rect.height],
      sw: [rect.x, rect.y + rect.height],
    };
    const signs: Record<typeof anchor, cmath.Vector2> = {
      nw: [1, 1],
      ne: [-1, 1],
      se: [-1, -1],
      sw: [1, -1],
    };
    const [cx, cy] = corners[anchor];
    const [sx, sy] = signs[anchor];
    return [cx + sx * r, cy + sy * r];
  }

  const cases: { name: string; rect: cmath.Rectangle; r: number }[] = [
    {
      name: "square @ r=0",
      rect: { x: 0, y: 0, width: 50, height: 50 },
      r: 0,
    },
    {
      name: "square @ r=10",
      rect: { x: 0, y: 0, width: 50, height: 50 },
      r: 10,
    },
    {
      name: "square @ r=max",
      rect: { x: 0, y: 0, width: 50, height: 50 },
      r: 25,
    },
    {
      name: "oblong wide @ r=15",
      rect: { x: 0, y: 0, width: 100, height: 60 },
      r: 15,
    },
    {
      name: "oblong wide @ r=max (=30)",
      rect: { x: 0, y: 0, width: 100, height: 60 },
      r: 30,
    },
    {
      name: "oblong tall @ r=10",
      rect: { x: 0, y: 0, width: 40, height: 100 },
      r: 10,
    },
    {
      name: "offset origin @ r=5",
      rect: { x: 100, y: 200, width: 80, height: 80 },
      r: 5,
    },
  ];

  for (const { name, rect, r } of cases) {
    const max = Math.min(rect.width, rect.height) / 2;
    const t = max === 0 ? 0 : r / max;
    const input = cmath.parametric.cornerRadiusHandles("r", rect, {
      tl: r,
      tr: r,
      br: r,
      bl: r,
    });
    for (const anchor of ["nw", "ne", "se", "sw"] as const) {
      it(`${name} — ${anchor} arc center matches handle.evaluate(t)`, () => {
        const handle = input.handles.find((h) => h.id === anchor)!;
        const pos = cmath.ui.evaluateCurve(handle.track as cmath.ui.Curve, t);
        const expected = arcCenter(rect, anchor, r);
        expect(pos[0]).toBeCloseTo(expected[0]);
        expect(pos[1]).toBeCloseTo(expected[1]);
      });
    }
  }
});

describe("cmath.parametric.cornerRadiusHandles — saturation behavior", () => {
  it("square at max — all four handles evaluate to the rect center", () => {
    const rect: cmath.Rectangle = { x: 0, y: 0, width: 50, height: 50 };
    const max = 25;
    const input = cmath.parametric.cornerRadiusHandles("r", rect, {
      tl: max,
      tr: max,
      br: max,
      bl: max,
    });
    for (const h of input.handles) {
      const pos = cmath.ui.evaluateCurve(h.track as cmath.ui.Curve, 1);
      expect(pos[0]).toBeCloseTo(25);
      expect(pos[1]).toBeCloseTo(25);
    }
  });

  it("oblong wide at max — nw/sw coincide on left, ne/se coincide on right", () => {
    const rect: cmath.Rectangle = { x: 0, y: 0, width: 100, height: 60 };
    const max = 30;
    const input = cmath.parametric.cornerRadiusHandles("r", rect, {
      tl: max,
      tr: max,
      br: max,
      bl: max,
    });
    const at = (id: "nw" | "ne" | "se" | "sw") => {
      const h = input.handles.find((h) => h.id === id)!;
      return cmath.ui.evaluateCurve(h.track as cmath.ui.Curve, 1);
    };
    expect(at("nw")).toEqual(at("sw"));
    expect(at("ne")).toEqual(at("se"));
    expect(at("nw")).not.toEqual(at("ne"));
  });

  it("oblong tall at max — nw/ne coincide on top, sw/se coincide on bottom", () => {
    const rect: cmath.Rectangle = { x: 0, y: 0, width: 40, height: 100 };
    const max = 20;
    const input = cmath.parametric.cornerRadiusHandles("r", rect, {
      tl: max,
      tr: max,
      br: max,
      bl: max,
    });
    const at = (id: "nw" | "ne" | "se" | "sw") => {
      const h = input.handles.find((h) => h.id === id)!;
      return cmath.ui.evaluateCurve(h.track as cmath.ui.Curve, 1);
    };
    expect(at("nw")).toEqual(at("ne"));
    expect(at("sw")).toEqual(at("se"));
    expect(at("nw")).not.toEqual(at("sw"));
  });
});
