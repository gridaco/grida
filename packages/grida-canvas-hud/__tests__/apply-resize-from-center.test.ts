// `applyResize` — opposite-anchored by default; symmetric about the
// initial center under `{ fromCenter: true }` (Alt). The center variant
// drives the dashed resize *preview* so it matches a center-anchoring
// host (the emitted intent stays opposite-anchored — see state.ts).

import { describe, it, expect } from "vitest";
import { applyResize } from "../event/gesture";
import type { SelectionShape, ResizeDirection } from "../event";

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

describe("applyResize — default is opposite-anchored (unchanged)", () => {
  it("se grows the far corner, origin pinned", () => {
    expect(bbox(applyResize(rect(0, 0, 100, 50), "se", 20, 10))).toEqual({
      x: 0,
      y: 0,
      width: 120,
      height: 60,
    });
  });

  it("nw moves the origin, far corner pinned", () => {
    expect(bbox(applyResize(rect(0, 0, 100, 50), "nw", 10, 5))).toEqual({
      x: 10,
      y: 5,
      width: 90,
      height: 45,
    });
  });
});

describe("applyResize — fromCenter (Alt) is symmetric about the center", () => {
  const O: ReadonlyArray<ResizeDirection> = [
    "n",
    "s",
    "e",
    "w",
    "ne",
    "nw",
    "se",
    "sw",
  ];

  it("se doubles the size delta and keeps the center put", () => {
    const r = bbox(
      applyResize(rect(0, 0, 100, 50), "se", 20, 10, { fromCenter: true })
    );
    expect(r).toEqual({ x: -20, y: -10, width: 140, height: 70 });
    expect(center(r)).toEqual({ x: 50, y: 25 }); // initial center
  });

  it("e (edge) is symmetric on x only", () => {
    expect(
      bbox(applyResize(rect(0, 0, 100, 50), "e", 20, 0, { fromCenter: true }))
    ).toEqual({ x: -20, y: 0, width: 140, height: 50 });
  });

  it("n (edge) is symmetric on y only", () => {
    expect(
      bbox(applyResize(rect(0, 0, 100, 50), "n", 0, 10, { fromCenter: true }))
    ).toEqual({ x: 0, y: 10, width: 100, height: 30 });
  });

  it("preserves the center for every handle direction", () => {
    const initial = rect(10, 20, 100, 50);
    const c0 = center(bbox(initial));
    for (const dir of O) {
      const r = bbox(applyResize(initial, dir, 12, 7, { fromCenter: true }));
      expect(center(r).x).toBeCloseTo(c0.x, 9);
      expect(center(r).y).toBeCloseTo(c0.y, 9);
    }
  });

  it("doubles the size delta vs the opposite-anchored default", () => {
    const opp = bbox(applyResize(rect(0, 0, 100, 50), "se", 20, 10));
    const ctr = bbox(
      applyResize(rect(0, 0, 100, 50), "se", 20, 10, { fromCenter: true })
    );
    expect(ctr.width - 100).toBeCloseTo((opp.width - 100) * 2, 9);
    expect(ctr.height - 50).toBeCloseTo((opp.height - 50) * 2, 9);
  });
});

describe("applyResize — transformed shape stays symmetric in the local frame", () => {
  it("identity matrix: fromCenter matches the rect path", () => {
    const transformed: SelectionShape = {
      kind: "transformed",
      local: { x: 0, y: 0, width: 100, height: 50 },
      matrix: [
        [1, 0, 0],
        [0, 1, 0],
      ],
    };
    const out = applyResize(transformed, "se", 20, 10, { fromCenter: true });
    if (out.kind !== "transformed") throw new Error("expected transformed");
    expect(out.local).toEqual({ x: -20, y: -10, width: 140, height: 70 });
  });
});
