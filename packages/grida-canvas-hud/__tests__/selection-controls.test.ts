// Pure-math tests on `computeSelectionControlLayout`. No DOM, no state.
// Asserts the **rule** (relative priority orderings derived from the
// principle), not specific numeric values — so re-tuning
// `MIN_GUARANTEED_INTERACTIVE_DIM` won't churn tests.

import { describe, it, expect } from "vitest";
import {
  computeSelectionControlLayout,
  HUDHitPriority,
  BODY_FLIP_THRESHOLD,
  MIN_GUARANTEED_INTERACTIVE_DIM,
  negotiateAxis,
} from "../event/selection-controls";
import { MIN_HIT_SIZE } from "../event/overlay";

const OPTS = { handle_size: 8, show_rotation: true };

function zonesByRole(
  layout: ReturnType<typeof computeSelectionControlLayout>,
  kind: string
) {
  return layout.zones.filter((z) => z.role.kind === kind);
}

function findByLabel(
  layout: ReturnType<typeof computeSelectionControlLayout>,
  label: string
) {
  return layout.zones.find((z) => z.label === label);
}

describe("computeSelectionControlLayout — derived per-axis priority", () => {
  // ── Principle constants ────────────────────────────────────────────────
  it("threshold derives from MIN_GUARANTEED_INTERACTIVE_DIM + MIN_HIT_SIZE", () => {
    // MIN_HIT_SIZE = 16, default MIN_GUARANTEED_INTERACTIVE_DIM = 20.
    // BODY_FLIP_THRESHOLD = 20 + 16 = 36. If either constant changes, this
    // identity holds; tests below probe sizes relative to it.
    expect(BODY_FLIP_THRESHOLD).toBe(MIN_GUARANTEED_INTERACTIVE_DIM + 16);
  });

  // ── Large bbox: all-default priorities ─────────────────────────────────
  it("comfortable bbox (50×50): full set; default priorities", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 50, height: 50 },
      OPTS
    );
    expect(layout.controls_visible).toBe(true);
    expect(layout.small_mode).toBe(false);
    expect(zonesByRole(layout, "translate")).toHaveLength(1);
    expect(zonesByRole(layout, "resize_corner")).toHaveLength(4);
    expect(zonesByRole(layout, "resize_edge")).toHaveLength(4);
    expect(zonesByRole(layout, "rotate")).toHaveLength(4);

    expect(findByLabel(layout, "translate")!.priority).toBe(
      HUDHitPriority.TRANSLATE_BODY
    );
    expect(findByLabel(layout, "resize_handle:nw")!.priority).toBe(
      HUDHitPriority.RESIZE_HANDLE_CORNER
    );
    expect(findByLabel(layout, "resize_edge:n")!.priority).toBe(
      HUDHitPriority.RESIZE_HANDLE_EDGE
    );
    expect(findByLabel(layout, "rotate:nw")!.priority).toBe(
      HUDHitPriority.ROTATE_HANDLE
    );
  });

  it("fence-line bbox (exactly threshold): all default priorities", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: BODY_FLIP_THRESHOLD, height: BODY_FLIP_THRESHOLD },
      OPTS
    );
    expect(layout.small_mode).toBe(false);
    expect(findByLabel(layout, "translate")!.priority).toBe(
      HUDHitPriority.TRANSLATE_BODY
    );
  });

  // ── Square small bbox: BOTH axes violated ──────────────────────────────
  it("small square (20×20): both axes violated → body + all edges promoted", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 20, height: 20 },
      OPTS
    );
    expect(layout.small_mode).toBe(true);

    const body = findByLabel(layout, "translate")!;
    const corner = findByLabel(layout, "resize_handle:nw")!;
    const nEdge = findByLabel(layout, "resize_edge:n")!;
    const wEdge = findByLabel(layout, "resize_edge:w")!;

    expect(body.priority).toBe(HUDHitPriority.TRANSLATE_BODY_SMALL);
    expect(corner.priority).toBe(HUDHitPriority.RESIZE_HANDLE_CORNER);
    expect(nEdge.priority).toBe(HUDHitPriority.RESIZE_HANDLE_EDGE_SMALL);
    expect(wEdge.priority).toBe(HUDHitPriority.RESIZE_HANDLE_EDGE_SMALL);

    // Order: edge < body < corner — both flips active.
    expect(nEdge.priority).toBeLessThan(body.priority);
    expect(body.priority).toBe(HUDHitPriority.TRANSLATE_BODY_SMALL);
    expect(body.priority).toBeLessThan(corner.priority);
  });

  // ── Elongated strip: only ONE axis violated ────────────────────────────
  // The user's example: 20×100. W is short (interaction-violating), H is fine.
  // N/S edges (parallel to W) get promoted over corners; W/E edges (parallel
  // to H) keep default priority. Body is promoted because ANY violation
  // means body interior is at risk on one side.
  it("user example (20×100): W violated, H fine → asymmetric per-axis policy", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 20, height: 100 },
      OPTS
    );
    expect(layout.small_mode).toBe(true);

    const body = findByLabel(layout, "translate")!;
    const nEdge = findByLabel(layout, "resize_edge:n")!;
    const sEdge = findByLabel(layout, "resize_edge:s")!;
    const wEdge = findByLabel(layout, "resize_edge:w")!;
    const eEdge = findByLabel(layout, "resize_edge:e")!;

    // Body always promoted when any axis is short.
    expect(body.priority).toBe(HUDHitPriority.TRANSLATE_BODY_SMALL);

    // N/S edges parallel to W (=20, violated) → promoted.
    expect(nEdge.priority).toBe(HUDHitPriority.RESIZE_HANDLE_EDGE_SMALL);
    expect(sEdge.priority).toBe(HUDHitPriority.RESIZE_HANDLE_EDGE_SMALL);

    // W/E edges parallel to H (=100, fine) → DEFAULT, not promoted.
    expect(wEdge.priority).toBe(HUDHitPriority.RESIZE_HANDLE_EDGE);
    expect(eEdge.priority).toBe(HUDHitPriority.RESIZE_HANDLE_EDGE);
  });

  it("wide strip (200×20): H violated, W fine → mirror of the user example", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 200, height: 20 },
      OPTS
    );
    expect(layout.small_mode).toBe(true);

    const nEdge = findByLabel(layout, "resize_edge:n")!;
    const wEdge = findByLabel(layout, "resize_edge:w")!;
    const eEdge = findByLabel(layout, "resize_edge:e")!;

    // W axis fine (200) → N/S edges keep default priority.
    expect(nEdge.priority).toBe(HUDHitPriority.RESIZE_HANDLE_EDGE);
    // H axis violated (20) → W/E edges promoted.
    expect(wEdge.priority).toBe(HUDHitPriority.RESIZE_HANDLE_EDGE_SMALL);
    expect(eEdge.priority).toBe(HUDHitPriority.RESIZE_HANDLE_EDGE_SMALL);
  });

  // ── Tiny / degenerate ──────────────────────────────────────────────────
  it("tiny bbox (8×8): controls hidden but body remains hit-able", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 8, height: 8 },
      OPTS
    );
    expect(layout.controls_visible).toBe(false);
    expect(layout.small_mode).toBe(true);
    expect(zonesByRole(layout, "translate")).toHaveLength(1);
    expect(zonesByRole(layout, "resize_corner")).toHaveLength(0);
    expect(zonesByRole(layout, "resize_edge")).toHaveLength(0);
    expect(zonesByRole(layout, "rotate")).toHaveLength(0);
  });

  it("degenerate (0×0): no zones at all", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 0, height: 0 },
      OPTS
    );
    expect(layout.zones).toHaveLength(0);
  });

  // ── Rotation opt-out ───────────────────────────────────────────────────
  it("show_rotation: false omits rotation zones only", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 100, height: 100 },
      { handle_size: 8, show_rotation: false }
    );
    expect(zonesByRole(layout, "rotate")).toHaveLength(0);
    expect(zonesByRole(layout, "resize_corner")).toHaveLength(4);
    expect(zonesByRole(layout, "translate")).toHaveLength(1);
  });

  // ── Labels are stable ───────────────────────────────────────────────────
  it("zone labels follow the documented format", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 100, height: 100 },
      OPTS
    );
    const labels = layout.zones.map((z) => z.label).sort();
    expect(labels).toContain("translate");
    expect(labels).toContain("resize_handle:nw");
    expect(labels).toContain("resize_handle:ne");
    expect(labels).toContain("resize_handle:se");
    expect(labels).toContain("resize_handle:sw");
    expect(labels).toContain("resize_edge:n");
    expect(labels).toContain("resize_edge:e");
    expect(labels).toContain("resize_edge:s");
    expect(labels).toContain("resize_edge:w");
    expect(labels).toContain("rotate:nw");
  });
});

describe("negotiateAxis — 1D perimeter slot allocation", () => {
  // Phases summary:
  //   total >= 2*corner_preferred + edge_min  → comfortable
  //   total >= edge_min                        → squeezed
  //   else                                     → tiny
  const CORNER = MIN_HIT_SIZE; // 16
  const EDGE_MIN = MIN_GUARANTEED_INTERACTIVE_DIM; // 20

  it("comfortable: corners at preferred, side takes the surplus", () => {
    // total = 116 (e.g. bbox 100 + 2*8 extension). Plenty of room.
    const r = negotiateAxis(116, CORNER, EDGE_MIN);
    expect(r.corner).toBe(CORNER);
    expect(r.edge).toBe(116 - CORNER * 2);
    expect(r.corner * 2 + r.edge).toBe(116);
  });

  it("threshold (total = 2*corner + edge_min): boundary of comfortable", () => {
    const total = CORNER * 2 + EDGE_MIN; // 52
    const r = negotiateAxis(total, CORNER, EDGE_MIN);
    expect(r.corner).toBe(CORNER);
    expect(r.edge).toBe(EDGE_MIN);
  });

  it("squeezed: edge holds its min, corners share the remainder", () => {
    // total = 36 (e.g. bbox 20 + 2*8). corner = (36-20)/2 = 8.
    const r = negotiateAxis(36, CORNER, EDGE_MIN);
    expect(r.edge).toBe(EDGE_MIN);
    expect(r.corner).toBe((36 - EDGE_MIN) / 2);
    expect(r.corner * 2 + r.edge).toBe(36);
  });

  it("squeezed lower bound (total = edge_min): corner shrinks to 0", () => {
    const r = negotiateAxis(EDGE_MIN, CORNER, EDGE_MIN);
    expect(r.corner).toBe(0);
    expect(r.edge).toBe(EDGE_MIN);
  });

  it("tiny (total < edge_min): edge takes everything, no corners", () => {
    const r = negotiateAxis(10, CORNER, EDGE_MIN);
    expect(r.corner).toBe(0);
    expect(r.edge).toBe(10);
  });

  it("degenerate (total <= 0): both 0", () => {
    expect(negotiateAxis(0, CORNER, EDGE_MIN)).toEqual({ corner: 0, edge: 0 });
    expect(negotiateAxis(-5, CORNER, EDGE_MIN)).toEqual({ corner: 0, edge: 0 });
  });

  it("invariant: corner * 2 + edge === total in every phase (above 0)", () => {
    for (const total of [200, 116, 52, 51, 40, 36, 30, 20, 19, 10, 1]) {
      const r = negotiateAxis(total, CORNER, EDGE_MIN);
      expect(r.corner * 2 + r.edge).toBeCloseTo(total, 10);
    }
  });
});

describe("computeSelectionControlLayout — 9-slice perimeter geometry", () => {
  const OPTS = { handle_size: 8, show_rotation: false };

  function find(
    layout: ReturnType<typeof computeSelectionControlLayout>,
    label: string
  ) {
    return layout.zones.find((z) => z.label === label)!;
  }

  // Verifies the 9-slice tiling — corners + edges form a strict
  // partition of the perimeter ring (no overlap among themselves; ring
  // tiles a `2*corner + edge` × `2*corner + edge` rectangle).
  it("comfortable (100×100): corners 16x16, N edge 84x16 fills the gap", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 100, height: 100 },
      OPTS
    );
    const nw = find(layout, "resize_handle:nw");
    const ne = find(layout, "resize_handle:ne");
    const n = find(layout, "resize_edge:n");
    expect(nw.rect.width).toBe(16);
    expect(nw.rect.height).toBe(16);
    expect(n.rect.width).toBe(84);
    expect(n.rect.height).toBe(16);
    // Mutually exclusive: NW ends where N begins.
    expect(nw.rect.x + nw.rect.width).toBe(n.rect.x);
    expect(n.rect.x + n.rect.width).toBe(ne.rect.x);
  });

  // Headline: the user's 20×100 example. Top axis is squeezed, left
  // axis is comfortable — corner is asymmetric (8 wide × 16 tall).
  it("asymmetric strip (20×100): NW corner 8×16, N edge 20×16", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 20, height: 100 },
      OPTS
    );
    const nw = find(layout, "resize_handle:nw");
    const n = find(layout, "resize_edge:n");
    const w = find(layout, "resize_edge:w");
    // Top axis: total = 36, squeezed → corner 8, edge 20.
    expect(nw.rect.width).toBe(8);
    expect(n.rect.width).toBe(20);
    // Left axis: total = 116, comfortable → corner 16, edge 84.
    expect(nw.rect.height).toBe(16);
    expect(w.rect.height).toBe(84);
    // W edge is `cx` (=8) wide — the perimeter ring is 8 px thick on
    // the left side because cx is squeezed.
    expect(w.rect.width).toBe(8);
  });

  // Squeezed both axes → side keeps min, corners shrink uniformly.
  it("small square (20×20): corner 8×8, edges 20×8 / 8×20", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 20, height: 20 },
      OPTS
    );
    const nw = find(layout, "resize_handle:nw");
    const n = find(layout, "resize_edge:n");
    const w = find(layout, "resize_edge:w");
    expect(nw.rect.width).toBe(8);
    expect(nw.rect.height).toBe(8);
    expect(n.rect.width).toBe(20);
    expect(n.rect.height).toBe(8);
    expect(w.rect.width).toBe(8);
    expect(w.rect.height).toBe(20);
  });

  // Mutually exclusive: no perimeter zone overlaps another's interior.
  // Sample many points along the perimeter ring; verify at most one
  // zone contains each interior point.
  it("perimeter zones are mutually exclusive (no double-counted interiors)", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 60, height: 40 },
      OPTS
    );
    const perimeter = layout.zones.filter(
      (z) => z.role.kind === "resize_corner" || z.role.kind === "resize_edge"
    );
    // Probe each zone's center — only that zone should claim it.
    for (const z of perimeter) {
      const cx = z.rect.x + z.rect.width / 2;
      const cy = z.rect.y + z.rect.height / 2;
      const claimers = perimeter.filter((other) => {
        const r = other.rect;
        // Strict interior containment (no boundary tie).
        return (
          cx > r.x && cx < r.x + r.width && cy > r.y && cy < r.y + r.height
        );
      });
      expect(claimers).toHaveLength(1);
      expect(claimers[0].label).toBe(z.label);
    }
  });

  // Sides take priority over corners on the shared boundary line.
  it("on the corner↔edge boundary: edge wins by priority", () => {
    const layout = computeSelectionControlLayout(
      { x: 0, y: 0, width: 100, height: 100 },
      OPTS
    );
    const nw = find(layout, "resize_handle:nw");
    const n = find(layout, "resize_edge:n");
    expect(n.priority).toBeLessThan(nw.priority);
  });

  // Sides give away space to corners until the edge_min is at risk.
  it("comfortable → squeezed transition: corner shrinks below preferred", () => {
    const comfortable = computeSelectionControlLayout(
      { x: 0, y: 0, width: 36, height: 100 },
      OPTS
    );
    const squeezed = computeSelectionControlLayout(
      { x: 0, y: 0, width: 30, height: 100 },
      OPTS
    );
    const cw = find(comfortable, "resize_handle:nw").rect.width;
    const sw = find(squeezed, "resize_handle:nw").rect.width;
    // At the W=36 boundary, corner is still at preferred (16). At W=30
    // (squeezed), corner has shrunk; edge has stayed at its min.
    expect(cw).toBe(16);
    expect(sw).toBeLessThan(16);
    expect(find(squeezed, "resize_edge:n").rect.width).toBe(
      MIN_GUARANTEED_INTERACTIVE_DIM
    );
  });

  // Edge always has at least MIN_GUARANTEED_INTERACTIVE_DIM until the
  // whole perimeter run drops below that min.
  it("edge length ≥ MIN_GUARANTEED_INTERACTIVE_DIM until run is tiny", () => {
    for (const width of [200, 100, 50, 36, 30, 20, 4]) {
      const layout = computeSelectionControlLayout(
        { x: 0, y: 0, width, height: 100 },
        OPTS
      );
      const n = layout.zones.find((z) => z.label === "resize_edge:n");
      if (!n) continue; // tiny phase may drop edge below visible
      expect(n.rect.width).toBeGreaterThanOrEqual(
        MIN_GUARANTEED_INTERACTIVE_DIM
      );
    }
  });
});
