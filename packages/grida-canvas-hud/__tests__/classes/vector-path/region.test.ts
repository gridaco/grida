// Tests for vector region chrome — closed-loop body overlays during path
// content-edit.
//
// Pins:
//   - Schema-level feature flag: absence of `VectorOverlay.regions` =
//     no region overlays. Presence enables.
//   - Hit-test: AABB plus `customHitTest` (point-in-polygon) — inside
//     loop hits, outside misses.
//   - Hit-priority slot: REGION_PRIORITY (9), strictly above
//     SEGMENT_STRIP_PRIORITY (8); region loses to every specific control
//     within its bbox.
//   - Hover / selected paint: `vectorRegionHoverPaint` / `vectorRegionSelectedPaint`
//     from HUDStyle. Hover wins over selected.
//   - Idle = no render (transparent body).
//   - Action carries `region`, `segments`, `vertices` for the drag-promotion
//     path.
//   - Decision: classifies as HandleRegionReplace / HandleRegionAdd;
//     dispatches `immediate_select_region` with `translate_vector_selection`
//     drag promotion seeded with the loop's endpoint vertex indices.
//   - SurfaceState integration: pointer_down emits `select_region` eagerly.

import { describe, it, expect } from "vitest";
import cmath from "@grida/cmath";
import { buildVectorChrome } from "../../../classes/vector-path";
import type { VectorOverlay } from "../../../classes/vector-path";
import { DEFAULT_STYLE } from "../../../surface/style";
import {
  classifyScenario,
  decidePointerDown,
  Scenario,
  type PointerDownDecision,
  type PointerDownInput,
} from "../../../event/decision";
import { NO_MODS } from "../../../event/event";
import { SurfaceState } from "../../../event/state";
import type { OverlayElement } from "../../../event/overlay";
import type { Intent } from "../../../event/intent";

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

/** Square loop, 4 segments, vertices 0..3 in CCW order. */
function squareOverlay(): VectorOverlay {
  return {
    vertices: [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ],
    segments: [
      { a: 0, b: 1, a_control: [0, 0], b_control: [100, 0] }, // top
      { a: 1, b: 2, a_control: [100, 0], b_control: [100, 100] }, // right
      { a: 2, b: 3, a_control: [100, 100], b_control: [0, 100] }, // bottom
      { a: 3, b: 0, a_control: [0, 100], b_control: [0, 0] }, // left
    ],
    regions: [{ segments: [0, 1, 2, 3] }],
  };
}

/** Annulus — outer square loop (segments 0..3) + inner square loop
 *  (segments 4..7). Two regions; the inner loop's interior is a "hole"
 *  in the outer ring. */
function annulusOverlay(): VectorOverlay {
  return {
    vertices: [
      // outer
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
      // inner (40..60 box, inset 40px)
      [40, 40],
      [60, 40],
      [60, 60],
      [40, 60],
    ],
    segments: [
      { a: 0, b: 1, a_control: [0, 0], b_control: [100, 0] },
      { a: 1, b: 2, a_control: [100, 0], b_control: [100, 100] },
      { a: 2, b: 3, a_control: [100, 100], b_control: [0, 100] },
      { a: 3, b: 0, a_control: [0, 100], b_control: [0, 0] },
      { a: 4, b: 5, a_control: [40, 40], b_control: [60, 40] },
      { a: 5, b: 6, a_control: [60, 40], b_control: [60, 60] },
      { a: 6, b: 7, a_control: [60, 60], b_control: [40, 60] },
      { a: 7, b: 4, a_control: [40, 60], b_control: [40, 40] },
    ],
    regions: [
      { segments: [0, 1, 2, 3] }, // outer
      { segments: [4, 5, 6, 7] }, // inner
    ],
  };
}

function emptySelection(node_id = "n1") {
  return { node_id, vertices: [], segments: [], tangents: [] };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Feature flag — schema-level opt-in
// ───────────────────────────────────────────────────────────────────────────

describe("region — feature flag (schema-level)", () => {
  it("emits NO region overlays when `regions` is undefined", () => {
    const overlay: VectorOverlay = squareOverlay();
    delete (overlay as { regions?: unknown }).regions;
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: overlay,
      style: DEFAULT_STYLE,
    });
    expect(overlays.find((o) => o.action.kind === "region")).toBeUndefined();
  });

  it("emits NO region overlays when `regions` is empty array", () => {
    const overlay = { ...squareOverlay(), regions: [] };
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: overlay,
      style: DEFAULT_STYLE,
    });
    expect(overlays.find((o) => o.action.kind === "region")).toBeUndefined();
  });

  it("emits one region overlay per entry in `regions`", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: squareOverlay(),
      style: DEFAULT_STYLE,
    });
    const regions = overlays.filter((o) => o.action.kind === "region");
    expect(regions.length).toBe(1);
  });

  it("emits N overlays for multi-region overlay", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: annulusOverlay(),
      style: DEFAULT_STYLE,
    });
    const regions = overlays.filter((o) => o.action.kind === "region");
    expect(regions.length).toBe(2);
  });

  it("requires `segments` to be present (no segments = no region chrome)", () => {
    // Regions reference segment indices — without segment data, chrome
    // can't reconstruct the cubic loop. Region emission gated by both.
    const overlay: VectorOverlay = {
      vertices: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      regions: [{ segments: [0, 1, 2] }],
    };
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: overlay,
      style: DEFAULT_STYLE,
    });
    expect(overlays.find((o) => o.action.kind === "region")).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Hit-test geometry
// ───────────────────────────────────────────────────────────────────────────

describe("region — hit-test", () => {
  function regionEl(o: OverlayElement | undefined) {
    if (!o) throw new Error("no region overlay");
    if (o.hit.kind !== "screen_aabb") throw new Error("expected screen_aabb");
    return { hit: o.hit, customHitTest: o.customHitTest! };
  }

  it("hit AABB encloses the square loop in screen-space (identity transform)", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: squareOverlay(),
      style: DEFAULT_STYLE,
    });
    const r = regionEl(overlays.find((o) => o.action.kind === "region"));
    // Square 0..100 with 1px AABB pad → -1..101.
    expect(r.hit.rect.x).toBeLessThanOrEqual(0);
    expect(r.hit.rect.y).toBeLessThanOrEqual(0);
    expect(r.hit.rect.x + r.hit.rect.width).toBeGreaterThanOrEqual(100);
    expect(r.hit.rect.y + r.hit.rect.height).toBeGreaterThanOrEqual(100);
  });

  it("customHitTest accepts a point inside the loop", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: squareOverlay(),
      style: DEFAULT_STYLE,
    });
    const r = regionEl(overlays.find((o) => o.action.kind === "region"));
    expect(r.customHitTest([50, 50])).toBe(true);
  });

  it("customHitTest rejects a point outside the loop", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: squareOverlay(),
      style: DEFAULT_STYLE,
    });
    const r = regionEl(overlays.find((o) => o.action.kind === "region"));
    expect(r.customHitTest([-10, -10])).toBe(false);
    expect(r.customHitTest([200, 50])).toBe(false);
  });

  it("annulus: outer region hit by [50, 50] AND inner [50, 50] (both contain it)", () => {
    // Both overlays are emitted — the registry's priority resolves at
    // hit-time; here we just assert each loop's polygon contains [50, 50]
    // (the annulus center).
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: annulusOverlay(),
      style: DEFAULT_STYLE,
    });
    const regions = overlays.filter((o) => o.action.kind === "region");
    expect(regions.length).toBe(2);
    for (const o of regions) {
      expect(o.customHitTest!([50, 50])).toBe(true);
    }
  });

  it("inner-only point — annulus outer accepts, outer-only point — annulus inner rejects", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: annulusOverlay(),
      style: DEFAULT_STYLE,
    });
    const regions = overlays.filter((o) => o.action.kind === "region");
    const outer = regions[0];
    const inner = regions[1];
    // [10, 50] is inside outer (0..100), outside inner (40..60).
    expect(outer.customHitTest!([10, 50])).toBe(true);
    expect(inner.customHitTest!([10, 50])).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Hit-priority — region loses to specific controls, wins over miss
// ───────────────────────────────────────────────────────────────────────────

describe("region — hit priority", () => {
  it("region priority is strictly above segment-strip priority (lower wins)", () => {
    // We don't export the constants directly, but priority is observable
    // on the emitted OverlayElement. The plan: REGION_PRIORITY = 9,
    // SEGMENT_STRIP_PRIORITY = 8 → segment numerically lower → wins.
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: squareOverlay(),
      style: DEFAULT_STYLE,
    });
    const region = overlays.find((o) => o.action.kind === "region")!;
    const segment_strip = overlays.find(
      (o) => o.label.startsWith("segment:") && !o.label.startsWith("segment_")
    )!;
    expect(segment_strip.priority).toBeLessThan(region.priority);
  });

  it("region priority is strictly above vertex / tangent / ghost priorities", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: squareOverlay(),
      style: DEFAULT_STYLE,
    });
    const region = overlays.find((o) => o.action.kind === "region")!;
    const vertex = overlays.find((o) => o.action.kind === "vertex_handle")!;
    expect(vertex.priority).toBeLessThan(region.priority);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Paint states — idle / hover / selected
// ───────────────────────────────────────────────────────────────────────────

describe("region — paint states", () => {
  function findRegionRender(
    overlay: VectorOverlay,
    opts: {
      selected?: readonly number[];
      hovered?: number;
    }
  ) {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        ...emptySelection(),
        regions: opts.selected,
      },
      vector_overlay: overlay,
      style: DEFAULT_STYLE,
      vector_hover:
        opts.hovered !== undefined
          ? { kind: "region", node_id: "n1", region: opts.hovered }
          : null,
    });
    return overlays.find((o) => o.action.kind === "region");
  }

  it("idle: no render — transparent body, hit-only", () => {
    const r = findRegionRender(squareOverlay(), {});
    expect(r).toBeDefined();
    expect(r!.render).toBeUndefined();
  });

  it("hovered: render with vectorRegionHoverPaint", () => {
    const r = findRegionRender(squareOverlay(), { hovered: 0 });
    expect(r!.render).toBeDefined();
    if (r!.render?.kind !== "doc_polyline") throw new Error("kind");
    expect(r!.render.fill).toBe(true);
    expect(r!.render.fillPaint).toBe(DEFAULT_STYLE.vectorRegionHoverPaint);
  });

  it("selected (not hovered): render with vectorRegionSelectedPaint", () => {
    const r = findRegionRender(squareOverlay(), { selected: [0] });
    if (r!.render?.kind !== "doc_polyline") throw new Error("kind");
    expect(r!.render.fillPaint).toBe(DEFAULT_STYLE.vectorRegionSelectedPaint);
  });

  it("hovered AND selected: hover wins (precedence with other vector overlays)", () => {
    const r = findRegionRender(squareOverlay(), { hovered: 0, selected: [0] });
    if (r!.render?.kind !== "doc_polyline") throw new Error("kind");
    expect(r!.render.fillPaint).toBe(DEFAULT_STYLE.vectorRegionHoverPaint);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Closed loop — polyline closes
// ───────────────────────────────────────────────────────────────────────────

describe("region — render polyline closes", () => {
  it("last point equals first point (closed loop)", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: squareOverlay(),
      style: DEFAULT_STYLE,
      vector_hover: { kind: "region", node_id: "n1", region: 0 },
    });
    const region = overlays.find((o) => o.action.kind === "region")!;
    if (region.render?.kind !== "doc_polyline") throw new Error("kind");
    const pts = region.render.points;
    expect(pts[0]).toEqual(pts[pts.length - 1]);
  });

  it("polyline has more than 3 samples per segment (curved loops render smoothly)", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: squareOverlay(),
      style: DEFAULT_STYLE,
      vector_hover: { kind: "region", node_id: "n1", region: 0 },
    });
    const region = overlays.find((o) => o.action.kind === "region")!;
    if (region.render?.kind !== "doc_polyline") throw new Error("kind");
    // 4 segments × N samples + 1 closing point. At least 4 × 4 = 16.
    expect(region.render.points.length).toBeGreaterThan(16);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Action payload — segments + vertices carried for host routing
// ───────────────────────────────────────────────────────────────────────────

describe("region — action payload", () => {
  it("carries node_id, region index, and segment list", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: squareOverlay(),
      style: DEFAULT_STYLE,
    });
    const region = overlays.find((o) => o.action.kind === "region")!;
    expect(region.action.kind).toBe("region");
    if (region.action.kind !== "region") return;
    expect(region.action.node_id).toBe("n1");
    expect(region.action.region).toBe(0);
    expect(region.action.segments).toEqual([0, 1, 2, 3]);
  });

  it("vertices field carries the union of segment endpoint indices", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: squareOverlay(),
      style: DEFAULT_STYLE,
    });
    const region = overlays.find((o) => o.action.kind === "region")!;
    if (region.action.kind !== "region") return;
    // Square has 4 distinct vertices (0..3).
    expect(region.action.vertices.length).toBe(4);
    expect(new Set(region.action.vertices)).toEqual(new Set([0, 1, 2, 3]));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Decision module — classifier + dispatch
// ───────────────────────────────────────────────────────────────────────────

describe("decision — region pointer-down", () => {
  const action = {
    kind: "region" as const,
    node_id: "n1",
    region: 0,
    segments: [0, 1, 2, 3] as readonly number[],
    vertices: [0, 1, 2, 3] as readonly number[],
  };

  function input(overrides: Partial<PointerDownInput>): PointerDownInput {
    return {
      ui_action: action,
      hovered_id: null,
      selection_ids: [],
      modifiers: NO_MODS,
      click_count: 1,
      readonly: false,
      ...overrides,
    };
  }

  it("no-shift: classifies HandleRegionReplace", () => {
    expect(classifyScenario(input({}))).toBe(Scenario.HandleRegionReplace);
  });

  it("shift: classifies HandleRegionAdd", () => {
    expect(
      classifyScenario(input({ modifiers: { ...NO_MODS, shift: true } }))
    ).toBe(Scenario.HandleRegionAdd);
  });

  it("readonly: classifies Noop (no mutation)", () => {
    expect(classifyScenario(input({ readonly: true }))).toBe(Scenario.Noop);
  });

  it("dispatches immediate_select_region with mode 'replace'", () => {
    const d = decidePointerDown(input({})) as Extract<
      PointerDownDecision,
      { kind: "immediate_select_region" }
    >;
    expect(d.kind).toBe("immediate_select_region");
    expect(d.node_id).toBe("n1");
    expect(d.region).toBe(0);
    expect(d.mode).toBe("replace");
  });

  it("dispatches immediate_select_region with mode 'toggle' under shift", () => {
    const d = decidePointerDown(
      input({ modifiers: { ...NO_MODS, shift: true } })
    ) as Extract<PointerDownDecision, { kind: "immediate_select_region" }>;
    expect(d.mode).toBe("toggle");
  });

  it("drag-promotion seeds translate_vector_selection with loop vertices", () => {
    const d = decidePointerDown(input({})) as Extract<
      PointerDownDecision,
      { kind: "immediate_select_region" }
    >;
    expect(d.pending.promote_to?.kind).toBe("translate_vector_selection");
    if (d.pending.promote_to?.kind !== "translate_vector_selection") return;
    expect(d.pending.promote_to.additional_vertex_indices).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("dblclick on region in content-edit does NOT exit content-edit", () => {
    // Region is a vector-control overlay — dblclick stays inside content-edit
    // and routes through the regular pointer-down path. The Tier-0 ExitEdit
    // rule should NOT fire for a region hit.
    const i = input({ in_content_edit: true, click_count: 2 });
    expect(classifyScenario(i)).not.toBe(Scenario.ExitEdit);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. SurfaceState integration — emit select_region on pointer_down
// ───────────────────────────────────────────────────────────────────────────

describe("SurfaceState — region pointer_down emits select_region eagerly", () => {
  function setup() {
    const state = new SurfaceState();
    // Push a vector mirror so the surface knows we're in content-edit.
    state.setVectorSelection({
      node_id: "n1",
      vertices: [],
      segments: [],
      tangents: [],
    });
    // Register a region hit region directly (bypass chrome — we're
    // testing dispatch).
    const regions = state.hitRegions();
    regions.push({
      label: "region:0",
      priority: 9,
      rect: { x: 0, y: 0, width: 200, height: 200 },
      customHitTest: (pt) =>
        cmath.polygon.pointInPolygon(pt, [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ]),
      action: {
        kind: "region",
        node_id: "n1",
        region: 0,
        segments: [0, 1, 2, 3],
        vertices: [0, 1, 2, 3],
      },
    });
    return state;
  }

  it("emits select_region intent on pointer_down inside the loop", () => {
    const state = setup();
    const intents: Intent[] = [];
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      {
        pick: () => null,
        shapeOf: () => null,
        emitIntent: (i) => intents.push(i),
      }
    );
    const r = intents.find((i) => i.kind === "select_region");
    expect(r).toBeDefined();
    if (r?.kind !== "select_region") return;
    expect(r.node_id).toBe("n1");
    expect(r.region).toBe(0);
    expect(r.mode).toBe("replace");
  });

  it("emits with mode 'toggle' under shift", () => {
    const state = setup();
    const intents: Intent[] = [];
    state.dispatch(
      {
        kind: "pointer_down",
        x: 50,
        y: 50,
        button: "primary",
        mods: { ...NO_MODS, shift: true },
      },
      {
        pick: () => null,
        shapeOf: () => null,
        emitIntent: (i) => intents.push(i),
      }
    );
    const r = intents.find((i) => i.kind === "select_region");
    if (r?.kind !== "select_region") throw new Error("missing");
    expect(r.mode).toBe("toggle");
  });

  it("does NOT emit select_region when pointer_down lands outside the loop", () => {
    const state = setup();
    const intents: Intent[] = [];
    state.dispatch(
      {
        kind: "pointer_down",
        x: 500,
        y: 500,
        button: "primary",
        mods: NO_MODS,
      },
      {
        pick: () => null,
        shapeOf: () => null,
        emitIntent: (i) => intents.push(i),
      }
    );
    expect(intents.find((i) => i.kind === "select_region")).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. Hover — vectorHoverFromAction
// ───────────────────────────────────────────────────────────────────────────

describe("SurfaceState — region hover", () => {
  it("pointer_move over a region action sets vector_hover.kind = 'region'", () => {
    const state = new SurfaceState();
    state.setVectorSelection({
      node_id: "n1",
      vertices: [],
      segments: [],
      tangents: [],
    });
    state.hitRegions().push({
      label: "region:0",
      priority: 9,
      rect: { x: 0, y: 0, width: 200, height: 200 },
      customHitTest: (pt) =>
        cmath.polygon.pointInPolygon(pt, [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ]),
      action: {
        kind: "region",
        node_id: "n1",
        region: 0,
        segments: [0, 1, 2, 3],
        vertices: [0, 1, 2, 3],
      },
    });
    state.dispatch(
      { kind: "pointer_move", x: 50, y: 50, mods: NO_MODS },
      {
        pick: () => null,
        shapeOf: () => null,
        emitIntent: () => {},
      }
    );
    const h = state.getVectorHover();
    expect(h).toBeDefined();
    expect(h?.kind).toBe("region");
    if (h?.kind !== "region") return;
    expect(h.region).toBe(0);
    expect(h.node_id).toBe("n1");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 10. Group propagation — semantic group flows to the region overlay
// ───────────────────────────────────────────────────────────────────────────

describe("region — semantic group", () => {
  it("propagates the input `group` to the emitted overlay", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: emptySelection(),
      vector_overlay: squareOverlay(),
      style: DEFAULT_STYLE,
      group: "vectorChrome",
    });
    const region = overlays.find((o) => o.action.kind === "region")!;
    expect(region.group).toBe("vectorChrome");
  });
});
