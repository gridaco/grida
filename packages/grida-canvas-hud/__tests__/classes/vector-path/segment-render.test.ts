// Tests for the rich segment chrome introduced in the "full vector chrome"
// pass: per-segment polyline outline with state-driven color/width/opacity,
// hover affordances on vertices/tangents/segments, and tangent-line width
// variants.

import { describe, it, expect } from "vitest";
import { buildVectorChrome } from "../../../classes/vector-path";
import { DEFAULT_STYLE } from "../../../surface/style";
import type { VectorOverlay } from "../../../classes/vector-path";

const SEG_OVERLAY: VectorOverlay = {
  vertices: [
    [0, 0],
    [10, 0],
  ],
  segments: [
    {
      a: 0,
      b: 1,
      a_control: [0, -5],
      b_control: [10, -5],
    },
  ],
  neighbours: [0, 1],
};

describe("segment outline (chunk E2)", () => {
  it("emits one polyline outline overlay per segment", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
    });
    const outlines = overlays.filter((o) =>
      o.label.startsWith("segment_outline:")
    );
    expect(outlines.length).toBe(1);
  });

  it("idle outline uses segmentIdleColor + segmentIdleWidth (full opacity)", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
    });
    const o = overlays.find((x) => x.label === "segment_outline:0");
    if (o?.render?.kind !== "doc_polyline") {
      throw new Error("expected doc_polyline render for segment_outline:0");
    }
    expect(o.render.color).toBe(DEFAULT_STYLE.segmentIdleColor);
    expect(o.render.strokeWidth).toBe(DEFAULT_STYLE.segmentIdleWidth);
    expect(o.render.strokeOpacity ?? 1).toBe(1);
  });

  it("hovered outline uses segmentActiveColor + segmentActiveWidth + segmentHoverOpacity", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
      vector_hover: {
        kind: "segment",
        node_id: "n1",
        segment: 0,
        t: 0.5,
      },
    });
    const o = overlays.find((x) => x.label === "segment_outline:0");
    if (o?.render?.kind !== "doc_polyline") {
      throw new Error("expected doc_polyline render for segment_outline:0");
    }
    expect(o.render.color).toBe(DEFAULT_STYLE.segmentActiveColor);
    expect(o.render.strokeWidth).toBe(DEFAULT_STYLE.segmentActiveWidth);
    expect(o.render.strokeOpacity).toBe(DEFAULT_STYLE.segmentHoverOpacity);
  });

  it("selected outline uses segmentActiveColor + segmentActiveWidth (full opacity)", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [0],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
    });
    const o = overlays.find((x) => x.label === "segment_outline:0");
    if (o?.render?.kind !== "doc_polyline") {
      throw new Error("expected doc_polyline render for segment_outline:0");
    }
    expect(o.render.color).toBe(DEFAULT_STYLE.segmentActiveColor);
    expect(o.render.strokeWidth).toBe(DEFAULT_STYLE.segmentActiveWidth);
    // Selected (not hovered) → full opacity.
    expect(o.render.strokeOpacity ?? 1).toBe(1);
  });

  // UX spec: hovered wins over selected. The user always gets feedback
  // for the control under the cursor; without this, hovering an already-
  // selected segment is indistinguishable from hovering empty space.
  // Same precedence applies to vertex / tangent / ghost (the four
  // interactive overlays in this package).
  it("hovered wins over selected for segment outline", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [0],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
      // Hover the same segment that's selected.
      vector_hover: {
        kind: "segment",
        node_id: "n1",
        segment: 0,
        t: 0.5,
      },
    });
    const o = overlays.find((x) => x.label === "segment_outline:0");
    if (o?.render?.kind !== "doc_polyline") {
      throw new Error("expected doc_polyline render for segment_outline:0");
    }
    // Hovered → segmentHoverOpacity (NOT the full opacity of pure-selected).
    expect(o.render.strokeOpacity).toBe(DEFAULT_STYLE.segmentHoverOpacity);
  });

  it("outline polyline has SEGMENT_SAMPLES+1 points (curve includes endpoints)", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
    });
    const o = overlays.find((x) => x.label === "segment_outline:0");
    if (o?.render?.kind !== "doc_polyline") {
      throw new Error("expected doc_polyline render for segment_outline:0");
    }
    // SEGMENT_SAMPLES = 24 → 25 points.
    expect(o.render.points.length).toBe(25);
    // Endpoints match the doc-space vertex positions.
    expect(o.render.points[0]).toEqual([0, 0]);
    expect(o.render.points[24]).toEqual([10, 0]);
  });

  it("outline overlay carries zero-area hit region (purely decorative)", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
    });
    const o = overlays.find((x) => x.label === "segment_outline:0");
    if (o?.hit.kind !== "screen_aabb") {
      throw new Error("expected screen_aabb hit shape");
    }
    expect(o.hit.rect.width).toBe(0);
    expect(o.hit.rect.height).toBe(0);
  });
});

describe("vertex/tangent hover affordances (chunk E2)", () => {
  it("hovered (unselected) vertex uses hoverColor as fill", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
      vector_hover: { kind: "vertex", node_id: "n1", index: 0 },
    });
    const v0 = overlays.find((o) => o.label === "vertex:0");
    const v1 = overlays.find((o) => o.label === "vertex:1");
    if (
      v0?.render?.kind !== "screen_rect" ||
      v1?.render?.kind !== "screen_rect"
    ) {
      throw new Error("expected screen_rect renders");
    }
    expect(v0.render.fillColor).toBe(DEFAULT_STYLE.hoverColor);
    expect(v1.render.fillColor).toBe(DEFAULT_STYLE.handleFill);
  });

  it("hovered (unselected) tangent knob uses hoverColor as fill", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
      vector_hover: {
        kind: "tangent",
        node_id: "n1",
        tangent: [0, 0],
      },
    });
    const hovered = overlays.find((o) => o.label === "tangent:0:0");
    const other = overlays.find((o) => o.label === "tangent:1:1");
    if (
      hovered?.render?.kind !== "screen_rect" ||
      other?.render?.kind !== "screen_rect"
    ) {
      throw new Error("expected screen_rect renders");
    }
    expect(hovered.render.fillColor).toBe(DEFAULT_STYLE.hoverColor);
    expect(other.render.fillColor).toBe(DEFAULT_STYLE.handleFill);
  });

  // UX spec: hovered wins over selected for the vertex knob fill. Same
  // precedence as segment / tangent / ghost — the user always gets
  // feedback for the control under the cursor, even when that control
  // happens to be already selected.
  it("hovered wins over selected for vertex fill", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [0],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
      vector_hover: { kind: "vertex", node_id: "n1", index: 0 },
    });
    const v0 = overlays.find((o) => o.label === "vertex:0");
    if (v0?.render?.kind !== "screen_rect") {
      throw new Error("expected screen_rect render for vertex:0");
    }
    expect(v0.render.fillColor).toBe(DEFAULT_STYLE.hoverColor);
  });
});

describe("ghost vertex (segment insertion preview) state model", () => {
  // UX spec: hovering a segment renders a ghost vertex at the projected
  // insertion point. By default it MUST look like an idle vertex —
  // outlined, not filled with the accent — otherwise the user can't tell
  // preview ("about to insert") from committed ("a real vertex sits
  // there"). The state model mirrors a real vertex: default / hover /
  // (committed → no longer a ghost).
  it("ghost render uses handleFill + handleStroke when cursor is on the segment but OFF the ghost (DEFAULT state)", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
      vector_hover: {
        kind: "segment",
        node_id: "n1",
        segment: 0,
        t: 0.5,
      },
    });
    const ghost = overlays.find((o) => o.label === "segment_ghost:0");
    if (ghost?.render?.kind !== "screen_rect") {
      throw new Error("expected screen_rect render for the ghost");
    }
    // Default state mirrors a real idle vertex.
    expect(ghost.render.fillColor).toBe(DEFAULT_STYLE.handleFill);
    expect(ghost.render.strokeColor).toBe(DEFAULT_STYLE.handleStroke);
  });

  // UX spec: when the ghost-handle hit region claims the cursor, the
  // hover discriminator switches from "segment" to "ghost" — the chrome
  // upgrades the render to hover style. Mirrors the vertex hover
  // affordance. State-driven, not proximity-driven: a real hit region
  // owns the transition.
  it("ghost render uses hoverColor as fill when cursor is on the ghost (HOVER state)", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
      vector_hover: {
        kind: "ghost",
        node_id: "n1",
        segment: 0,
        t: 0.5,
      },
    });
    const ghost = overlays.find((o) => o.label === "segment_ghost:0");
    if (ghost?.render?.kind !== "screen_rect") {
      throw new Error("expected screen_rect render for the ghost");
    }
    expect(ghost.render.fillColor).toBe(DEFAULT_STYLE.hoverColor);
    expect(ghost.render.strokeColor).toBe(DEFAULT_STYLE.handleStroke);
  });

  // UX spec: ghost STILL renders on an already-selected segment — the
  // user must be able to insert a vertex on a selected segment without
  // first deselecting. There's no specification that selection blocks
  // insertion; treating it that way would force a deselect-click-select
  // dance for a common workflow.
  it("ghost IS emitted even when the underlying segment is already selected", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [0],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
      vector_hover: {
        kind: "ghost",
        node_id: "n1",
        segment: 0,
        t: 0.5,
      },
    });
    const ghost = overlays.find((o) => o.label === "segment_ghost:0");
    if (ghost?.render?.kind !== "screen_rect") {
      throw new Error("expected screen_rect render for the ghost");
    }
    // Hover state still wins — even with the segment selected.
    expect(ghost.render.fillColor).toBe(DEFAULT_STYLE.hoverColor);
  });

  // UX spec: ghost is a PAIRED first-class control — visible knob +
  // dedicated padded hit region. The hit region (NOT the visible disc)
  // lets the user reach for the knob the way they reach for a vertex.
  // Render and hit deliberately disagree in size: visual ~6px, hit
  // ≥MIN_HIT_SIZE for Fitts'.
  it("ghost overlay has a padded hit region (PAIRED — not decorative)", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
      vector_hover: {
        kind: "segment",
        node_id: "n1",
        segment: 0,
        t: 0.5,
      },
    });
    const ghost = overlays.find((o) => o.label === "segment_ghost:0");
    if (ghost?.hit.kind !== "screen_rect_at_doc") {
      throw new Error("expected screen_rect_at_doc hit shape");
    }
    // Hit AABB is ≥ MIN_HIT_SIZE = 16px on a side (matches vertex/tangent).
    expect(ghost.hit.width).toBeGreaterThanOrEqual(16);
    expect(ghost.hit.height).toBeGreaterThanOrEqual(16);
    // Action carries `ghost_handle` semantics so the decision module's
    // dedicated dispatch fires on click.
    expect(ghost.action.kind).toBe("ghost_handle");
  });

  // UX spec: ghost is a PREVIEW affordance — visible only while the
  // user is idly hovering. Once the user has committed pointer input
  // (pending pointer-down or active gesture), the ghost vanishes so it
  // doesn't compete with the user's actual intent. Same gate would
  // apply to any future hover-derived preview overlay (drop indicators,
  // snap previews, etc.).
  it("ghost is NOT emitted while the user is mid-interaction (is_interacting=true)", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
      vector_hover: {
        kind: "segment",
        node_id: "n1",
        segment: 0,
        t: 0.5,
      },
      is_interacting: true,
    });
    const ghost = overlays.find((o) => o.label === "segment_ghost:0");
    expect(ghost).toBeUndefined();
  });
});

describe("tangent line width (chunk E2)", () => {
  it("idle tangent line uses tangentLineIdleWidth", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
    });
    const line = overlays.find((o) => o.label === "tangent_line:0:0");
    if (line?.render?.kind !== "doc_line") {
      throw new Error("expected doc_line render for tangent_line:0:0");
    }
    expect(line.render.strokeWidth).toBe(DEFAULT_STYLE.tangentLineIdleWidth);
  });

  it("selected tangent line uses tangentLineActiveWidth", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [[0, 0]],
      },
      vector_overlay: SEG_OVERLAY,
      style: DEFAULT_STYLE,
    });
    const line = overlays.find((o) => o.label === "tangent_line:0:0");
    if (line?.render?.kind !== "doc_line") {
      throw new Error("expected doc_line render for tangent_line:0:0");
    }
    expect(line.render.strokeWidth).toBe(DEFAULT_STYLE.tangentLineActiveWidth);
    // The unselected tangent's line stays at idle width.
    const other = overlays.find((o) => o.label === "tangent_line:1:1");
    if (other?.render?.kind !== "doc_line") {
      throw new Error("expected doc_line render for tangent_line:1:1");
    }
    expect(other.render.strokeWidth).toBe(DEFAULT_STYLE.tangentLineIdleWidth);
  });
});
