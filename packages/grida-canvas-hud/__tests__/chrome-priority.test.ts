// End-to-end pipeline test: buildChrome → fanOverlays → HitRegions.hitTestRegion.
// All assertions are against the OverlayElement `label`, so future
// refactors of internal geometry don't churn the test surface.

import { describe, it, expect } from "vitest";
import cmath from "@grida/cmath";
import { SurfaceState } from "../event/state";
import { buildChrome, fanOverlays } from "../surface/chrome";
import { DEFAULT_STYLE } from "../surface/style";
import type { NodeId, Rect } from "../event/gesture";
import type { SelectionShape } from "../event/shape";

function chromeFor(
  rect: Rect,
  zoom: number = 1
): {
  state: SurfaceState;
  hitLabel: (point: [number, number]) => string | null;
} {
  const state = new SurfaceState();
  state.setSelection(["a"]);
  state.setTransform([
    [zoom, 0, 0],
    [0, zoom, 0],
  ] as cmath.Transform);

  const shapeOf = (id: NodeId): SelectionShape | null =>
    id === "a" ? { kind: "rect", rect } : null;

  const { overlays } = buildChrome({
    state,
    shapeOf,
    style: DEFAULT_STYLE,
    width: 1000,
    height: 1000,
  });
  const regions = state.hitRegions();
  fanOverlays(overlays, state.getTransform(), regions);

  return {
    state,
    hitLabel: (point) => regions.hitTestRegion(point)?.label ?? null,
  };
}

describe("chrome → hit-test pipeline (derived per-axis priority)", () => {
  // ── Comfortable content (50×50): default priority everywhere ────────────
  describe("comfortable bbox (50x50, above threshold on both axes)", () => {
    const RECT: Rect = { x: 0, y: 0, width: 50, height: 50 };
    const { hitLabel } = chromeFor(RECT);

    it("center → translate", () => {
      expect(hitLabel([25, 25])).toBe("translate");
    });

    it("corner → resize_handle:nw", () => {
      expect(hitLabel([0, 0])).toBe("resize_handle:nw");
    });

    it("side midpoint → resize_edge:n", () => {
      // Top edge midpoint at (25, 0). With default priorities, corner and
      // edge are equal-priority (30 vs 31) — but the strip at midpoint
      // lies between the corner hits, so only edge is hit.
      expect(hitLabel([25, 0])).toBe("resize_edge:n");
    });
  });

  // ── Small square (20×20): both axes violated; body wins interior ────────
  describe("small square (20x20) — both axes below threshold", () => {
    const RECT: Rect = { x: 0, y: 0, width: 20, height: 20 };
    const { hitLabel } = chromeFor(RECT);

    it("center → translate (body promoted over corner)", () => {
      expect(hitLabel([10, 10])).toBe("translate");
    });

    it("outside visual bbox but inside corner hit → resize_handle:nw", () => {
      // NW corner hit is centered at (0,0), 16x16 → covers (-8, -8, 16, 16).
      // Point (-4, -4) is outside the visual bbox so body doesn't claim it;
      // corner is the only zone matching.
      expect(hitLabel([-4, -4])).toBe("resize_handle:nw");
    });
  });

  // ── User example (20×100): only W-axis violated → asymmetric ─────────────
  describe("elongated strip (20x100) — W-axis violated, H-axis fine", () => {
    const RECT: Rect = { x: 0, y: 0, width: 20, height: 100 };
    const { hitLabel } = chromeFor(RECT);

    it("center → translate (body promoted because any-axis violated)", () => {
      expect(hitLabel([10, 50])).toBe("translate");
    });

    it("top edge midpoint → resize_edge:n (N/S promoted; W axis short)", () => {
      // The N edge strip lies at x∈[8, 12], y∈[-8, 8] — 4×16 strip. At
      // (10, 0) the body, N edge, and corners all could overlap. With the
      // per-axis policy: edge_n priority = SMALL_EDGE (22), body = SMALL_BODY
      // (25), corner = 31 (default). Edge wins.
      expect(hitLabel([10, 0])).toBe("resize_edge:n");
    });

    it("side mid-height → translate (W/E NOT promoted because H is fine)", () => {
      // The W edge strip at the body's mid-height: point (0, 50) is on the
      // visual left boundary. W edge priority = default 30 (H fine), body
      // priority = SMALL_BODY 25. Body wins.
      expect(hitLabel([0, 50])).toBe("translate");
    });

    it("outside-left at mid-height → resize_edge:w (only edge claims)", () => {
      // Point (-4, 50): W edge strip is x∈[-8, 8], y∈[8, 92] — contains
      // (-4, 50). Body doesn't reach negative x. Only W edge hits.
      expect(hitLabel([-4, 50])).toBe("resize_edge:w");
    });
  });

  // ── Wide strip (200×20): only H-axis violated → mirror ─────────────────
  describe("wide strip (200x20) — H-axis violated, W-axis fine", () => {
    const RECT: Rect = { x: 0, y: 0, width: 200, height: 20 };
    const { hitLabel } = chromeFor(RECT);

    it("center → translate (body promoted)", () => {
      expect(hitLabel([100, 10])).toBe("translate");
    });

    it("top mid → translate (N/S NOT promoted because W is fine)", () => {
      // Top edge midpoint inside the body. N edge priority = default 30
      // (W fine), body priority = SMALL_BODY 25. Body wins.
      expect(hitLabel([100, 0])).toBe("translate");
    });

    it("left edge mid → resize_edge:w (W/E promoted; H axis short)", () => {
      // Left edge strip is at x∈[-8, 8], y∈[8, 12] — 16×4. At (0, 10) the
      // W edge contains the point. W edge priority = SMALL_EDGE 22, body =
      // SMALL_BODY 25. Edge wins.
      expect(hitLabel([0, 10])).toBe("resize_edge:w");
    });
  });

  // ── Tiny (8×8): handles hidden, drag preserved ──────────────────────────
  describe("tiny bbox (8x8) — below MIN_CHROME_VISIBLE_SIZE", () => {
    const RECT: Rect = { x: 0, y: 0, width: 8, height: 8 };
    const { hitLabel } = chromeFor(RECT);

    it("anywhere in bbox → translate (chrome hidden)", () => {
      expect(hitLabel([4, 4])).toBe("translate");
      expect(hitLabel([0, 0])).toBe("translate");
      expect(hitLabel([7, 7])).toBe("translate");
    });

    it("outside bbox → null (no chrome to hit)", () => {
      expect(hitLabel([-5, -5])).toBeNull();
      expect(hitLabel([20, 20])).toBeNull();
    });
  });
});
