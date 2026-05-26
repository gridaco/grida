// Co-target test matrix — enforces the composition contract:
// "any combination of named classes contributing to the same HitRegions
// registry resolves to deterministic hover/hit/cursor; no phantom hits."
//
// This is the FIRST cell of the matrix (padding × transform-box).
// Subsequent migrations grow it: every new class adds one row + one
// column. See __tests__/composition/README.md for the planned shape.
//
// What this cell pins:
//   - Both classes can co-exist in one HitRegions registry.
//   - Hit-test at a point where only ONE class registers returns that
//     class's action — the other class's overlays do not phantom-hit.
//   - Hit-test at empty space returns null — no class leaks overlays
//     outside its declared geometry.
//   - Priority sort wins when both classes' regions overlap (this
//     synthetic case uses overlapping handles for a clean assertion;
//     real-world overlap is rarer but the machinery is the same).

import { describe, it, expect } from "vitest";
import {
  buildPaddingOverlay,
  PADDING_HANDLE_PRIORITY,
  type PaddingOverlayInput,
} from "../../classes/padding";
import {
  buildTransformBox,
  TRANSFORM_BOX_CORNER_PRIORITY,
  type TransformBoxInput,
} from "../../classes/transform-box";
import { DEFAULT_STYLE } from "../../surface/style";
import { fanOverlays } from "../../surface/chrome";
import { HitRegions } from "../../event/hit-regions";
import { IDENTITY } from "../../event/transform";

function paddingFixture(): PaddingOverlayInput {
  return {
    node_id: "n1",
    rect: { x: 100, y: 100, width: 200, height: 200 },
    padding: { top: 40, right: 40, bottom: 40, left: 40 },
  };
}

function transformBoxFixture(): TransformBoxInput {
  return {
    id: "tb-1",
    transform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    size: [200, 200],
    origin: [100, 100],
  };
}

describe("co-target: padding × transform-box", () => {
  // Sanity — confirm the priority ladder the rest of the test relies on.
  it("documented priority ladder holds (padding-handle < transform-box-corner)", () => {
    expect(PADDING_HANDLE_PRIORITY).toBeLessThan(TRANSFORM_BOX_CORNER_PRIORITY);
  });

  it("both classes' overlays co-exist in one HitRegions registry", () => {
    const padding_overlays = buildPaddingOverlay({
      overlay: paddingFixture(),
      style: DEFAULT_STYLE,
      hover: null,
      alt_held: false,
      transform: IDENTITY,
    });
    const tb_overlays = buildTransformBox({
      overlay: transformBoxFixture(),
      style: DEFAULT_STYLE,
      hover: null,
      transform: IDENTITY,
    });

    const regions = new HitRegions();
    fanOverlays([...padding_overlays, ...tb_overlays], IDENTITY, regions);

    // Registry holds entries from both classes — no fan corruption.
    const labels = regions.toArray().map((r) => r.label);
    expect(labels.some((l) => l.startsWith("padding_"))).toBe(true);
    expect(labels.some((l) => l.startsWith("transform_box_"))).toBe(true);
  });

  it("hit at a point inside only the transform-box body returns the tb action — padding does not phantom-hit", () => {
    // Padding regions cover the OUTER 40px strips of the rect. The
    // inner core [140..260, 140..260] has NO padding hit but IS inside
    // the transform-box body.
    const padding_overlays = buildPaddingOverlay({
      overlay: paddingFixture(),
      style: DEFAULT_STYLE,
      hover: null,
      alt_held: false,
      transform: IDENTITY,
    });
    const tb_overlays = buildTransformBox({
      overlay: transformBoxFixture(),
      style: DEFAULT_STYLE,
      hover: null,
      transform: IDENTITY,
    });

    const regions = new HitRegions();
    fanOverlays([...padding_overlays, ...tb_overlays], IDENTITY, regions);

    const action = regions.hitTest([200, 200]);
    expect(action).not.toBeNull();
    expect(action?.kind).toBe("transform_box_body");
  });

  it("hit at empty space (outside both classes' rects) returns null", () => {
    const padding_overlays = buildPaddingOverlay({
      overlay: paddingFixture(),
      style: DEFAULT_STYLE,
      hover: null,
      alt_held: false,
      transform: IDENTITY,
    });
    const tb_overlays = buildTransformBox({
      overlay: transformBoxFixture(),
      style: DEFAULT_STYLE,
      hover: null,
      transform: IDENTITY,
    });

    const regions = new HitRegions();
    fanOverlays([...padding_overlays, ...tb_overlays], IDENTITY, regions);

    // Way outside the rect [100..300] — no class should claim it.
    expect(regions.hitTest([1000, 1000])).toBeNull();
  });

  it("adding transform-box does not shift padding's hit results (class independence)", () => {
    const padding_overlays = buildPaddingOverlay({
      overlay: paddingFixture(),
      style: DEFAULT_STYLE,
      hover: null,
      alt_held: false,
      transform: IDENTITY,
    });

    // Padding-only registry.
    const padding_only = new HitRegions();
    fanOverlays(padding_overlays, IDENTITY, padding_only);
    const padding_top_handle = padding_overlays.find(
      (o) => o.label === "padding_handle:top"
    );
    expect(padding_top_handle).toBeDefined();
    const handle_anchor =
      padding_top_handle!.hit.kind === "screen_rect_at_doc"
        ? padding_top_handle!.hit.anchor_doc
        : null;
    expect(handle_anchor).not.toBeNull();
    const padding_only_hit = padding_only.hitTest(handle_anchor!);

    // Combined registry — add transform-box on top.
    const tb_overlays = buildTransformBox({
      overlay: transformBoxFixture(),
      style: DEFAULT_STYLE,
      hover: null,
      transform: IDENTITY,
    });
    const combined = new HitRegions();
    fanOverlays([...padding_overlays, ...tb_overlays], IDENTITY, combined);
    const combined_hit = combined.hitTest(handle_anchor!);

    // Same kind wins in both registries. Padding handle priority (12) is
    // lower than any transform-box hit at the same point — combined hit
    // matches padding-only hit. No co-target interference.
    expect(padding_only_hit?.kind).toBe("padding_handle");
    expect(combined_hit?.kind).toBe("padding_handle");
  });
});
