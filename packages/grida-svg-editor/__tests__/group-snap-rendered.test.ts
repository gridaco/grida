// Visibility filter on group descent.
//
// Phase 2 `snap_descent` skips children that are not "self-rendered":
//
//  - `display="none"` on the child itself
//  - `visibility="hidden"` on the child itself
//  - tags whose subtree is never drawn (`defs`, `symbol`, `clipPath`,
//    `mask`, `pattern`, `marker`, `filter`, gradients)
//
// Ancestor visibility is NOT walked from each descendant — descent
// runs from a known-rendered root, so any reachable descendant has a
// rendered ancestor chain by construction. Comprehensive SVG rendering
// visibility (conditional processing, `requiredFeatures`,
// `systemLanguage`) is out of scope.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import { compute_neighborhood, snap_descent } from "../src/core/snap";

function ids_by_tag(doc: SvgDocument, tag: string): string[] {
  const out: string[] = [];
  for (const id of doc.all_elements()) {
    if (doc.tag_of(id) === tag) out.push(id);
  }
  return out;
}

describe("snap_descent — visibility filter", () => {
  it('drops a child rect with display="none"', () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<g>` +
        `<rect x="0" y="0" width="10" height="10"/>` +
        `<rect x="20" y="0" width="10" height="10" display="none"/>` +
        `</g>` +
        `</svg>`
    );
    const [g] = ids_by_tag(doc, "g");
    const rects = ids_by_tag(doc, "rect");
    const visible = rects[0];
    const hidden = rects[1];
    const result = new Set(snap_descent(doc, g));
    expect(result.has(g)).toBe(true);
    expect(result.has(visible)).toBe(true);
    expect(result.has(hidden)).toBe(false);
  });

  it('drops a child with visibility="hidden"', () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<g>` +
        `<rect x="0" y="0" width="10" height="10"/>` +
        `<rect x="20" y="0" width="10" height="10" visibility="hidden"/>` +
        `</g>` +
        `</svg>`
    );
    const [g] = ids_by_tag(doc, "g");
    const rects = ids_by_tag(doc, "rect");
    const result = new Set(snap_descent(doc, g));
    expect(result.has(rects[0])).toBe(true);
    expect(result.has(rects[1])).toBe(false);
  });

  it("drops a hidden nested <g> and everything inside it", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<g>` +
        `<rect x="0" y="0" width="10" height="10"/>` +
        `<g display="none">` +
        `<rect x="20" y="0" width="10" height="10"/>` +
        `<circle cx="40" cy="0" r="5"/>` +
        `</g>` +
        `</g>` +
        `</svg>`
    );
    const groups = ids_by_tag(doc, "g");
    const outer = groups[0];
    const hidden_inner = groups[1];
    const rects = ids_by_tag(doc, "rect");
    const [c] = ids_by_tag(doc, "circle");
    const result = new Set(snap_descent(doc, outer));
    expect(result.has(outer)).toBe(true);
    expect(result.has(rects[0])).toBe(true);
    expect(result.has(hidden_inner)).toBe(false);
    expect(result.has(rects[1])).toBe(false);
    expect(result.has(c)).toBe(false);
  });

  it("drops a <defs> child even though it's in STRUCTURAL_GRAPHICS_SET", () => {
    // `<defs>` is allowed inside `<g>` per the SVG content model, but
    // its subtree is never drawn — it must not be a snap target.
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<g>` +
        `<defs><rect x="0" y="0" width="10" height="10"/></defs>` +
        `<rect x="20" y="0" width="10" height="10"/>` +
        `</g>` +
        `</svg>`
    );
    const [g] = ids_by_tag(doc, "g");
    const [defs] = ids_by_tag(doc, "defs");
    const rects = ids_by_tag(doc, "rect");
    const inside_defs = rects[0];
    const visible = rects[1];
    const result = new Set(snap_descent(doc, g));
    expect(result.has(g)).toBe(true);
    expect(result.has(visible)).toBe(true);
    expect(result.has(defs)).toBe(false);
    expect(result.has(inside_defs)).toBe(false);
  });
});

describe("compute_neighborhood — hidden subtree handling", () => {
  it("a sibling <g> with a hidden child surfaces the group but not the hidden child", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">` +
        `<rect id="a" x="0" y="0" width="10" height="10"/>` +
        `<g>` +
        `<rect id="visible" x="50" y="0" width="10" height="10"/>` +
        `<rect id="hidden" x="80" y="0" width="10" height="10" display="none"/>` +
        `</g>` +
        `</svg>`
    );
    const rects = ids_by_tag(doc, "rect");
    const [a, visible, hidden] = rects;
    const [g] = ids_by_tag(doc, "g");
    const result = new Set(compute_neighborhood(doc, [a]));
    expect(result.has(g)).toBe(true);
    expect(result.has(visible)).toBe(true);
    expect(result.has(hidden)).toBe(false);
  });

  it("a non-rendered parent (e.g., <defs>) does not surface as a neighbor", () => {
    // Dragging a rect inside <defs> — the parent <defs> passes
    // STRUCTURAL_GRAPHICS_SET (it's a valid child of <g>) but is a
    // resource container whose subtree is not drawn. It must not
    // appear as a snap neighbor of its own dragged child.
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<defs>` +
        `<rect id="r" x="0" y="0" width="10" height="10"/>` +
        `</defs>` +
        `</svg>`
    );
    const [r] = ids_by_tag(doc, "rect");
    const [defs] = ids_by_tag(doc, "defs");
    const result = new Set(compute_neighborhood(doc, [r]));
    expect(result.has(defs)).toBe(false);
  });
});
