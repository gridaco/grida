// Tests for vector chrome's tangent and segment-strip emission.
//
// Covers the chunk A+B+C additions to `buildVectorChrome`:
// - Tangent decorative lines + paired tangent knobs for neighbouring
//   vertices
// - Segment hit-strip emission (VIRTUAL — no render, only hit regions)

import { describe, it, expect } from "vitest";
import { buildVectorChrome } from "../../../classes/vector-path";
import { DEFAULT_STYLE } from "../../../surface/style";
import type { VectorOverlay } from "../../../classes/vector-path";

// A single cubic segment from (0,0) → (10,0) with both tangents pointing
// up by 5 px → produces an arc-shaped curve.
const SEG_OVERLAY: VectorOverlay = {
  vertices: [
    [0, 0],
    [10, 0],
  ],
  segments: [
    {
      a: 0,
      b: 1,
      a_control: [0, -5], // vertex_a + ta
      b_control: [10, -5], // vertex_b + tb
    },
  ],
  neighbours: [0, 1],
};

describe("buildVectorChrome — tangent emission", () => {
  it("emits a decorative line + a paired tangent knob per neighbouring tangent", () => {
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
    const tangent_lines = overlays.filter((o) =>
      o.label.startsWith("tangent_line:")
    );
    const tangent_knobs = overlays.filter(
      (o) =>
        o.label.startsWith("tangent:") && !o.label.startsWith("tangent_line:")
    );
    // Two tangents on the segment → two lines + two knobs.
    expect(tangent_lines.length).toBe(2);
    expect(tangent_knobs.length).toBe(2);
  });

  it("skips tangents whose control == vertex (degenerate)", () => {
    const overlay: VectorOverlay = {
      vertices: [
        [0, 0],
        [10, 0],
      ],
      segments: [
        {
          a: 0,
          b: 1,
          a_control: [0, 0], // degenerate — same as vertex
          b_control: [10, 0], // degenerate
        },
      ],
      neighbours: [0, 1],
    };
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: overlay,
      style: DEFAULT_STYLE,
    });
    expect(overlays.filter((o) => o.label.startsWith("tangent")).length).toBe(
      0
    );
  });

  it("does NOT emit tangent handles when neighbours is empty", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: { ...SEG_OVERLAY, neighbours: [] },
      style: DEFAULT_STYLE,
    });
    expect(overlays.filter((o) => o.label.startsWith("tangent")).length).toBe(
      0
    );
  });

  it("tangent knob action carries the tangent ref + control-point position", () => {
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
    const knob = overlays.find((o) => o.label === "tangent:0:0");
    expect(knob).toBeDefined();
    if (!knob || knob.action.kind !== "tangent_handle") {
      throw new Error("expected tangent_handle action");
    }
    expect(knob.action.tangent).toEqual([0, 0]);
    expect(knob.action.pos).toEqual([0, -5]);
  });

  it("tangent knobs render as a diamond — smaller than vertex knobs", () => {
    // UX rule: tangent knobs render as a 45°-rotated square ("diamond")
    // at ~0.75× the vertex knob size, so the user can tell tangents apart
    // from vertices at a glance. Shape stays "rect" (the renderer rotates
    // it); circle is reserved for vertices.
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
    const knob = overlays.find((o) => o.label === "tangent:0:0");
    const vertex = overlays.find((o) => o.label === "vertex:0");
    if (knob?.render?.kind !== "screen_rect")
      throw new Error("expected tangent knob screen_rect render");
    if (vertex?.render?.kind !== "screen_rect")
      throw new Error("expected vertex knob screen_rect render");
    // Diamond: rect + 45° rotation.
    expect(knob.render.shape).toBe("rect");
    expect(knob.render.angle).toBeCloseTo(Math.PI / 4, 6);
    // Vertex stays circular.
    expect(vertex.render.shape).toBe("circle");
    // Size: tangent strictly smaller than vertex.
    expect(knob.render.width).toBeLessThan(vertex.render.width);
  });

  it("selected tangents render with the highlight fill (handleStroke)", () => {
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
    const knob_selected = overlays.find((o) => o.label === "tangent:0:0");
    const knob_other = overlays.find((o) => o.label === "tangent:1:1");
    if (
      knob_selected?.render?.kind !== "screen_rect" ||
      knob_other?.render?.kind !== "screen_rect"
    ) {
      throw new Error("expected screen_rect renders for both knobs");
    }
    expect(knob_selected.render.fillColor).toBe(DEFAULT_STYLE.handleStroke);
    expect(knob_other.render.fillColor).toBe(DEFAULT_STYLE.handleFill);
  });
});

describe("buildVectorChrome — segment hit-strips", () => {
  // Projection-based refactor: ONE hit region per segment, with a
  // customHitTest that projects the cursor onto the cubic. Action
  // carries the segment's four doc-space control points; `t` is
  // computed on demand by the consumer (`event/state.ts`).
  it("emits exactly one hit overlay per segment", () => {
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
    // `segment:0` is the hit region itself. `segment_outline:0` is the
    // decorative polyline (zero-area hit). We're counting hit regions.
    const hits = overlays.filter(
      (o) =>
        o.label.startsWith("segment:") &&
        !o.label.startsWith("segment_outline:")
    );
    expect(hits.length).toBe(1);
  });

  it("hit overlay carries node_id + segment + four doc-space control points (no `t`)", () => {
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
    const hit = overlays.find((o) => o.label === "segment:0");
    expect(hit).toBeDefined();
    if (hit?.action.kind !== "segment_strip") {
      throw new Error("expected segment_strip");
    }
    expect(hit.action.node_id).toBe("n1");
    expect(hit.action.segment).toBe(0);
    expect(hit.action.a).toEqual([0, 0]);
    expect(hit.action.b).toEqual([10, 0]);
    expect(hit.action.a_control).toEqual([0, -5]);
    expect(hit.action.b_control).toEqual([10, -5]);
  });

  it("hit overlay defines a customHitTest (projection-based refinement)", () => {
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
    const hit = overlays.find((o) => o.label === "segment:0");
    expect(hit?.customHitTest).toBeDefined();
    // A point at one endpoint should accept (cursor exactly on curve).
    expect(hit?.customHitTest?.([0, 0])).toBe(true);
    // A point far above the curve should reject (outside threshold).
    expect(hit?.customHitTest?.([5, -100])).toBe(false);
  });

  it("segment hit overlay carries no render (VIRTUAL family)", () => {
    // The `segment:` overlay (the hit region) has no render. The visual
    // outline is a SEPARATE overlay labelled `segment_outline:` — the
    // taxonomy still holds, just split across two overlays now.
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
    const hit = overlays.find((o) => o.label === "segment:0");
    expect(hit?.render).toBeUndefined();
    expect(hit?.hit).toBeDefined();
  });

  it("priority ladder: tangent (4) < vertex (5) < segment (8)", () => {
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
    const vertex = overlays.find((o) => o.label === "vertex:0");
    const tangent = overlays.find((o) => o.label === "tangent:0:0");
    const segment = overlays.find((o) => o.label === "segment:0");
    expect(tangent?.priority).toBeLessThan(vertex?.priority ?? Infinity);
    expect(vertex?.priority).toBeLessThan(segment?.priority ?? Infinity);
  });
});
