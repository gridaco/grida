// Group snap policy regression net.
//
// Phase 2 (Figma-shaped descent): `<g>` exposes its own bbox AND each
// rendered descendant leaf as snap candidates, on both sides.
// Group-to-group bbox alignment is preserved (the group's own id stays
// in the candidate set alongside its leaves). See
// `src/core/snap/GROUPS.md` for the ADR.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import {
  compute_neighborhood,
  DEFAULT_SNAP_OPTIONS,
  snap_descent,
  SnapSession,
  type SnapOptions,
} from "../src/core/snap";
import { rect } from "./_helpers";

function ids_by_tag(doc: SvgDocument, tag: string): string[] {
  const out: string[] = [];
  for (const id of doc.all_elements()) {
    if (doc.tag_of(id) === tag) out.push(id);
  }
  return out;
}

const opts_on: SnapOptions = { ...DEFAULT_SNAP_OPTIONS, threshold_px: 10 };

describe("group snap — neighborhood descent", () => {
  it("a sibling <g> contributes its own id AND its rendered descendants", () => {
    // svg root contains: one rect "a" + one <g> containing rect "x".
    // Drag rect "a" → neighborhood includes the <g> (group bbox stays
    // as a snap target — group-to-group alignment preserved) AND the
    // inner rect "x" (inner-edge snap reachable without ungrouping).
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<rect x="0" y="0" width="10" height="10"/>` +
        `<g><rect x="50" y="50" width="10" height="10"/></g>` +
        `</svg>`
    );
    const [a, x] = ids_by_tag(doc, "rect");
    const [g] = ids_by_tag(doc, "g");
    const result = new Set(compute_neighborhood(doc, [a]));
    expect(result.has(g)).toBe(true);
    expect(result.has(x)).toBe(true);
  });

  it("dragging a <g> excludes its full subtree from neighbors (no self-snap)", () => {
    // svg root contains: one <g outer> containing rect "inner" + one
    // sibling rect "sib". Drag outer → agent set expands to {outer,
    // inner}, neighbors must exclude both. Result: parent + sib only.
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<g><rect x="0" y="0" width="10" height="10"/></g>` +
        `<rect x="50" y="0" width="10" height="10"/>` +
        `</svg>`
    );
    const [inner, sib] = ids_by_tag(doc, "rect");
    const [outer] = ids_by_tag(doc, "g");
    const result = new Set(compute_neighborhood(doc, [outer]));
    expect(result.has(sib)).toBe(true);
    expect(result.has(inner)).toBe(false);
    expect(result.has(outer)).toBe(false);
  });

  it("nested <g>: descent recurses through inner groups", () => {
    // svg root contains: rect "a" + <g outer><g inner><rect "x"/></g></g>.
    // Drag rect "a" → descent on the sibling outer produces outer + inner
    // + x (every rendered structural descendant, including nested group
    // bboxes themselves).
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<rect x="0" y="0" width="10" height="10"/>` +
        `<g><g><rect x="50" y="50" width="10" height="10"/></g></g>` +
        `</svg>`
    );
    const [a, x] = ids_by_tag(doc, "rect");
    const groups = ids_by_tag(doc, "g");
    const outer = groups[0];
    const inner = groups[1];
    const result = new Set(compute_neighborhood(doc, [a]));
    expect(result.has(outer)).toBe(true);
    expect(result.has(inner)).toBe(true);
    expect(result.has(x)).toBe(true);
  });

  it("group-to-group alignment is preserved (both group bboxes published)", () => {
    // Two sibling groups, each with one child. Drag rect "z" outside.
    // Both groups + both inner rects should appear — group bboxes are
    // still snap candidates (the Figma-shaped hybrid).
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">` +
        `<g><rect x="0" y="0" width="10" height="10"/></g>` +
        `<g><rect x="50" y="0" width="10" height="10"/></g>` +
        `<rect id="z" x="100" y="0" width="10" height="10"/>` +
        `</svg>`
    );
    const rects = ids_by_tag(doc, "rect");
    const groups = ids_by_tag(doc, "g");
    const z = rects[2];
    const result = new Set(compute_neighborhood(doc, [z]));
    expect(result.has(groups[0])).toBe(true);
    expect(result.has(groups[1])).toBe(true);
    expect(result.has(rects[0])).toBe(true);
    expect(result.has(rects[1])).toBe(true);
  });
});

describe("snap_descent", () => {
  it("returns [id] for non-group elements", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<rect x="0" y="0" width="10" height="10"/>` +
        `</svg>`
    );
    const [r] = ids_by_tag(doc, "rect");
    expect(snap_descent(doc, r)).toEqual([r]);
  });

  it("returns group + rendered descendants for <g>", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<g>` +
        `<rect x="0" y="0" width="10" height="10"/>` +
        `<circle cx="20" cy="0" r="5"/>` +
        `</g>` +
        `</svg>`
    );
    const [g] = ids_by_tag(doc, "g");
    const [r] = ids_by_tag(doc, "rect");
    const [c] = ids_by_tag(doc, "circle");
    const result = new Set(snap_descent(doc, g));
    expect(result).toEqual(new Set([g, r, c]));
  });

  it("returns [] for a group filtered out by is_self_rendered", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<g display="none"><rect x="0" y="0" width="10" height="10"/></g>` +
        `</svg>`
    );
    const [g] = ids_by_tag(doc, "g");
    expect(snap_descent(doc, g)).toEqual([]);
  });
});

describe("group snap — SnapSession zero-area filter", () => {
  it("filters a 0-area agent (empty group as agent → identity)", () => {
    // Empty <g> has getBBox() = {0,0,0,0}. Without the filter the engine
    // would align (0,0) edges to the neighbor and emit a spurious
    // corrected delta — the visible "jerk to origin" bug.
    const s = new SnapSession({
      agents: [rect(0, 0, 0, 0)],
      neighbors: [rect(50, 0)],
    });
    const r = s.snap({ x: 0, y: 0 }, opts_on);
    expect(r.delta).toEqual({ x: 0, y: 0 });
    expect(r.guide).toBeUndefined();
  });

  it("filters a 0-area neighbor (empty group as target contributes no anchor)", () => {
    // Symmetric to the agent case: an empty group sibling must not act
    // as a snap target at the origin.
    const s = new SnapSession({
      agents: [rect(40, 0)],
      neighbors: [rect(0, 0, 0, 0)],
    });
    const r = s.snap({ x: 0, y: 0 }, opts_on);
    expect(r.delta).toEqual({ x: 0, y: 0 });
    expect(r.guide).toBeUndefined();
  });

  it("keeps a degenerate-line rect (height=0) as a valid anchor", () => {
    // A horizontal <line> has height=0 but is a real snap target on its
    // y edge. The filter must not drop it. Agent's bottom edge at y=10
    // should snap to the line's y=12 (distance 2, inside threshold 10).
    const s = new SnapSession({
      agents: [rect(0, 0, 10, 10)],
      neighbors: [{ x: 0, y: 12, width: 30, height: 0 }],
    });
    const r = s.snap({ x: 0, y: 0 }, opts_on);
    expect(r.delta.y).toBe(2);
    expect(r.guide).toBeDefined();
  });
});
