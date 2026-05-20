// `compute_neighborhood` policy: direct parent + parent's children,
// minus the dragged set, filtered by STRUCTURAL_GRAPHICS_SET. Headless.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import { compute_neighborhood } from "../src/core/snap";

function ids_by_tag(doc: SvgDocument, tag: string): string[] {
  const out: string[] = [];
  for (const id of doc.all_elements()) {
    if (doc.tag_of(id) === tag) out.push(id);
  }
  return out;
}

describe("compute_neighborhood", () => {
  it("returns parent + sibling rects, excluding the dragged one", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10"/><rect id="b" x="20" y="0" width="10" height="10"/><rect id="c" x="40" y="0" width="10" height="10"/></svg>`
    );
    const [a, b, c] = ids_by_tag(doc, "rect");
    const result = compute_neighborhood(doc, [b]);
    expect(new Set(result)).toEqual(new Set([doc.root, a, c]));
  });

  it("excludes all dragged siblings", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10"/><rect id="b" x="20" y="0" width="10" height="10"/><rect id="c" x="40" y="0" width="10" height="10"/></svg>`
    );
    const [a, b, c] = ids_by_tag(doc, "rect");
    const result = compute_neighborhood(doc, [a, b]);
    expect(new Set(result)).toEqual(new Set([doc.root, c]));
  });

  it("dedupes the shared parent when multiple dragged share it", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></svg>`
    );
    const [a, b] = ids_by_tag(doc, "rect");
    const result = compute_neighborhood(doc, [a, b]);
    expect(result).toContain(doc.root);
    // root appears at most once
    expect(result.filter((id) => id === doc.root).length).toBe(1);
  });

  it("unions across different parents", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g><rect x="0" y="0" width="10" height="10"/><circle cx="20" cy="0" r="5"/></g><g><rect x="40" y="0" width="10" height="10"/><circle cx="60" cy="0" r="5"/></g></svg>`
    );
    const rects = ids_by_tag(doc, "rect");
    const circles = ids_by_tag(doc, "circle");
    const groups = ids_by_tag(doc, "g");
    // drag rect_0 (in group_0) and rect_1 (in group_1) — neighborhood
    // is each group + its remaining children
    const result = compute_neighborhood(doc, [rects[0], rects[1]]);
    expect(new Set(result)).toEqual(
      new Set([groups[0], groups[1], circles[0], circles[1]])
    );
  });

  it("returns empty when the dragged node is the document root", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/></svg>`
    );
    const result = compute_neighborhood(doc, [doc.root]);
    expect(result).toEqual([]);
  });

  it("returns empty for empty input", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect/></svg>`
    );
    expect(compute_neighborhood(doc, [])).toEqual([]);
  });

  it("filters out non-structural siblings (style, gradient stops, defs)", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g"><stop offset="0"/><stop offset="1"/></linearGradient></defs><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></svg>`
    );
    const rects = ids_by_tag(doc, "rect");
    const defs = ids_by_tag(doc, "defs");
    // dragging rect_0 at root level — its parent is the svg root.
    // Phase 2's rendering filter drops `<defs>` (and other non-rendered
    // resource containers like `<symbol>`, `<clipPath>`, `<mask>`,
    // gradients, etc.) — their contents are never drawn, so they
    // must not surface as snap targets. The gradient/stops live
    // inside defs and aren't siblings either way.
    const result = compute_neighborhood(doc, [rects[0]]);
    expect(result).toContain(rects[1]);
    expect(result).not.toContain(defs[0]);
    for (const id of result) {
      const tag = doc.tag_of(id);
      expect(tag).not.toBe("linearGradient");
      expect(tag).not.toBe("stop");
      expect(tag).not.toBe("defs");
    }
  });
});
