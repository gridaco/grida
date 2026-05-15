import { describe, it, expect } from "vitest";
import { measurementToHUDDraw } from "../primitives/measurement-guide";
import { measure, type Measurement } from "@grida/cmath/_measurement";

// A vs B: two non-intersecting rects placed so that the spacing has
// non-zero top, right, and left distances (B is up-and-left of A, with a
// horizontal gap to the right). This exercises the three-non-zero-side path.
const A = { x: 100, y: 100, width: 50, height: 50 };
const B = { x: 20, y: 20, width: 30, height: 30 };

describe("measurementToHUDDraw", () => {
  it("emits two rects (A, B) and a non-empty line set", () => {
    const m = measure(A, B);
    expect(m).not.toBeNull();
    const draw = measurementToHUDDraw(m as Measurement);
    expect(draw.rects).toHaveLength(2);
    expect(draw.rects?.[0]).toMatchObject({
      x: A.x,
      y: A.y,
      width: A.width,
      height: A.height,
    });
    expect(draw.rects?.[1]).toMatchObject({
      x: B.x,
      y: B.y,
      width: B.width,
      height: B.height,
    });
    expect(draw.lines?.length).toBeGreaterThan(0);
  });

  it("stamps the provided color on every rect and line", () => {
    const color = "#ff3a30";
    const m = measure(A, B) as Measurement;
    const draw = measurementToHUDDraw(m, color);
    for (const r of draw.rects ?? []) {
      expect(r.color).toBe(color);
    }
    for (const l of draw.lines ?? []) {
      expect(l.color).toBe(color);
    }
  });

  it("omits color on primitives when none is provided", () => {
    const m = measure(A, B) as Measurement;
    const draw = measurementToHUDDraw(m);
    for (const r of draw.rects ?? []) {
      expect(r.color).toBeUndefined();
    }
    for (const l of draw.lines ?? []) {
      expect(l.color).toBeUndefined();
    }
  });

  it("preserves the dashed flag on auxiliary lines", () => {
    const m = measure(A, B) as Measurement;
    const draw = measurementToHUDDraw(m, "#ff3a30");
    const labelled = draw.lines?.filter((l) => l.label) ?? [];
    const dashed = draw.lines?.filter((l) => l.dashed) ?? [];
    // Each non-zero-distance side contributes one labelled guide line and
    // (when the projection has length) one dashed auxiliary line.
    expect(labelled.length).toBeGreaterThan(0);
    expect(dashed.length).toBeGreaterThan(0);
    // No primitive should be both labelled and dashed.
    for (const l of draw.lines ?? []) {
      expect(!!l.label && !!l.dashed).toBe(false);
    }
  });

  it("skips labelled guides for sides whose distance is zero", () => {
    // A and B share their top edge (both at y=0). The top distance is 0 →
    // no top-side guide. The right, bottom, and left sides still emit
    // labelled guides (non-zero distance there).
    const a = { x: 100, y: 0, width: 50, height: 50 };
    const b = { x: 20, y: 0, width: 30, height: 30 };
    const m = measure(a, b);
    expect(m).not.toBeNull();
    const draw = measurementToHUDDraw(m as Measurement, "#ff3a30");
    const labelled = draw.lines?.filter((l) => l.label) ?? [];
    // top is 0 → at most 3 labelled guides emitted.
    expect(labelled.length).toBeLessThanOrEqual(3);
    expect(labelled.length).toBeGreaterThan(0);
  });
});
