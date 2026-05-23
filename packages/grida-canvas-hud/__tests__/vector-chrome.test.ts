// Tests for vector chrome — vertex knob overlays during path content-edit.
//
// Asserts the four-family taxonomy contract (README §"Two backends"):
// vertex knobs are PAIRED (drawn render shape + padded hit region). The
// hit region strictly contains the render rect on each axis (Fitts').

import { describe, it, expect } from "vitest";
import { buildVectorChrome } from "../surface/vector-chrome";
import { DEFAULT_STYLE } from "../surface/style";
import { MIN_HIT_SIZE } from "../event/overlay";
import type { VectorOverlay } from "../surface/vector-chrome";

function rectFromHit(
  hit: ReturnType<typeof buildVectorChrome>["overlays"][number]["hit"]
): { w: number; h: number } {
  if (hit.kind === "screen_rect_at_doc") return { w: hit.width, h: hit.height };
  if (hit.kind === "screen_aabb")
    return { w: hit.rect.width, h: hit.rect.height };
  return { w: hit.rect.width, h: hit.rect.height };
}

describe("buildVectorChrome", () => {
  const overlay: VectorOverlay = {
    vertices: [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
  };

  it("emits one overlay per vertex", () => {
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
    expect(overlays.length).toBe(3);
  });

  it("hit region is padded to at least MIN_HIT_SIZE", () => {
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
    for (const o of overlays) {
      const { w, h } = rectFromHit(o.hit);
      expect(w).toBeGreaterThanOrEqual(MIN_HIT_SIZE);
      expect(h).toBeGreaterThanOrEqual(MIN_HIT_SIZE);
    }
  });

  it("render rect is strictly smaller than (or equal to) hit AABB", () => {
    // Paired-family invariant: render legibility-sized, hit Fitts'-padded.
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
    for (const o of overlays) {
      expect(o.render).toBeDefined();
      if (!o.render || o.render.kind !== "screen_rect") continue;
      const hit = rectFromHit(o.hit);
      expect(o.render.width).toBeLessThanOrEqual(hit.w);
      expect(o.render.height).toBeLessThanOrEqual(hit.h);
    }
  });

  it("selected vertices have a distinct fill from unselected", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [1],
        segments: [],
        tangents: [],
      },
      vector_overlay: overlay,
      style: DEFAULT_STYLE,
    });
    const renders = overlays.map((o) =>
      o.render && o.render.kind === "screen_rect" ? o.render.fillColor : null
    );
    expect(renders[0]).not.toBe(renders[1]);
    expect(renders[2]).toBe(renders[0]);
  });

  it("action carries node_id, index, and pos in doc-space", () => {
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
    for (let i = 0; i < overlays.length; i++) {
      const a = overlays[i].action;
      expect(a.kind).toBe("vertex_handle");
      if (a.kind !== "vertex_handle") continue;
      expect(a.node_id).toBe("n1");
      expect(a.index).toBe(i);
      expect(a.pos).toEqual(overlay.vertices[i]);
    }
  });

  it("vertex knobs render as circles, hit AABB stays square", () => {
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
    for (const o of overlays) {
      expect(o.render).toBeDefined();
      if (!o.render || o.render.kind !== "screen_rect") continue;
      expect(o.render.shape).toBe("circle");
      // Hit AABB is still a square; width === height (the padded knob box).
      const hit = rectFromHit(o.hit);
      expect(hit.w).toBe(hit.h);
    }
  });

  it("origin offsets vertex positions", () => {
    const { overlays } = buildVectorChrome({
      vector_selection: {
        node_id: "n1",
        vertices: [],
        segments: [],
        tangents: [],
      },
      vector_overlay: { ...overlay, origin: [100, 200] },
      style: DEFAULT_STYLE,
    });
    if (overlays[0].action.kind !== "vertex_handle") throw new Error("kind");
    expect(overlays[0].action.pos).toEqual([100, 200]);
    if (overlays[1].action.kind !== "vertex_handle") throw new Error("kind");
    expect(overlays[1].action.pos).toEqual([110, 200]);
  });
});
