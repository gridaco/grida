import { cmath } from "../index"; // Adjust import path as needed

describe("cmath.ext.viewport", () => {
  const { transformToFit } = cmath.ext.viewport;
  describe("transformToFit", () => {
    it("returns identity when viewport or target is zero-sized", () => {
      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const zeroTarget = { x: 100, y: 100, width: 0, height: 0 };
      const result = transformToFit(viewport, zeroTarget);
      expect(result).toEqual([
        [1, 0, viewport.x],
        [0, 1, viewport.y],
      ]);
    });

    it("returns identity when effective viewport is negative or zero (large margin)", () => {
      const viewport = { x: 0, y: 0, width: 100, height: 100 };
      const target = { x: 0, y: 0, width: 50, height: 50 };
      // margin of 200 on each side => effectively zero viewport
      const result = transformToFit(viewport, target, 200);
      expect(result).toEqual([
        [1, 0, viewport.x],
        [0, 1, viewport.y],
      ]);
    });

    it("fits a larger target into the viewport (scale < 1)", () => {
      const viewport = { x: 0, y: 0, width: 400, height: 300 };
      const target = { x: 10, y: 20, width: 600, height: 400 };
      const t = transformToFit(viewport, target);

      expect(t[0][0]).toBeCloseTo(0.666);
      expect(t[1][1]).toBeCloseTo(0.666);

      const tx = t[0][2];
      const ty = t[1][2];

      expect(tx).not.toBeNaN();
      expect(ty).not.toBeNaN();
    });

    it("fits a smaller target into the viewport (scale >= 1 if content is smaller)", () => {
      const viewport = { x: 0, y: 0, width: 400, height: 300 };
      const target = { x: 10, y: 10, width: 200, height: 100 };
      const t = transformToFit(viewport, target);
      // Target is smaller, so scale could be >= 1. No forced clamp, but let's see.
      const scale = t[0][0];
      expect(scale).toBeGreaterThanOrEqual(1);
    });

    it("applies uniform margin", () => {
      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const target = { x: 0, y: 0, width: 400, height: 300 };
      // margin = 50 => effective viewport = (700 x 500)
      const t = transformToFit(viewport, target, 50);
      // scale ~ 700/400 => 1.75 or 500/300 => 1.666..., picks smaller => 1.666...
      expect(t[0][0]).toBeCloseTo(1.6667, 3);
      expect(t[1][1]).toBeCloseTo(1.6667, 3);
    });

    it("applies per-side margin array [top, right, bottom, left]", () => {
      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const target = { x: 100, y: 100, width: 600, height: 300 };
      const t = transformToFit(viewport, target, [50, 20, 50, 20]);
      // effective viewport => width=800-20-20=760, height=600-50-50=500
      // scale => min(760/600, 500/300) => min(1.266..., 1.666...) => 1.266...
      expect(t[0][0]).toBeCloseTo(1.2667, 3);
      expect(t[1][1]).toBeCloseTo(1.2667, 3);
    });
  });
});
