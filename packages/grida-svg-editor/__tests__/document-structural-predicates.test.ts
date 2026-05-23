// Structural-fact predicates on SvgDocument.
//
// These are the atomic predicates that compose into intent-level
// verdicts (most notably `is_rotatable` in `intents.ts`). They belong
// to the SVG Document layer: pure structural reads of the authored
// SVG, no intent-awareness, no policy.
//
// See docs/wg/feat-svg-editor/glossary/policy-class.md (the "Layering"
// section) for the layer contract.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";

function doc(svg: string): SvgDocument {
  return new SvgDocument(svg);
}

function id_of_first(doc: SvgDocument, tag: string): string {
  for (const id of doc.all_elements()) {
    if (doc.tag_of(id) === tag) return id;
  }
  throw new Error(`no <${tag}> in document`);
}

describe("SvgDocument.has_glyph_rotate", () => {
  it("returns true for <text rotate='10 20 30'>", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><text rotate="10 20 30">hi</text></svg>`
    );
    expect(d.has_glyph_rotate(id_of_first(d, "text"))).toBe(true);
  });

  it("returns true for <tspan rotate='45'>", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><text><tspan rotate="45">hi</tspan></text></svg>`
    );
    expect(d.has_glyph_rotate(id_of_first(d, "tspan"))).toBe(true);
  });

  it("returns false for <text> without rotate attribute", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>`
    );
    expect(d.has_glyph_rotate(id_of_first(d, "text"))).toBe(false);
  });

  it("returns false for <text rotate=''> (empty after trim)", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><text rotate="   ">hi</text></svg>`
    );
    expect(d.has_glyph_rotate(id_of_first(d, "text"))).toBe(false);
  });

  it("returns false for non-text elements even with a 'rotate' attribute", () => {
    // <rect rotate="..."> isn't spec-meaningful but make sure the
    // predicate gates on tag, not just attribute presence.
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect rotate="45" width="10" height="10"/></svg>`
    );
    expect(d.has_glyph_rotate(id_of_first(d, "rect"))).toBe(false);
  });
});

describe("SvgDocument.has_inline_css_transform", () => {
  it("returns true for style='transform: rotate(30deg)'", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect style="transform: rotate(30deg)" width="10" height="10"/></svg>`
    );
    expect(d.has_inline_css_transform(id_of_first(d, "rect"))).toBe(true);
  });

  it("returns true when 'transform:' follows another declaration", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill: red; transform: scale(2)" width="10" height="10"/></svg>`
    );
    expect(d.has_inline_css_transform(id_of_first(d, "rect"))).toBe(true);
  });

  it("returns true for 'Transform:' (case-insensitive)", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect style="Transform: rotate(0)" width="10" height="10"/></svg>`
    );
    expect(d.has_inline_css_transform(id_of_first(d, "rect"))).toBe(true);
  });

  it("returns false when style is absent", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`
    );
    expect(d.has_inline_css_transform(id_of_first(d, "rect"))).toBe(false);
  });

  it("returns false when style has no transform property", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill: red; stroke: black" width="10" height="10"/></svg>`
    );
    expect(d.has_inline_css_transform(id_of_first(d, "rect"))).toBe(false);
  });

  it("returns false when 'transform' appears only as part of a value", () => {
    // Defensive: a property value containing the word "transform" but
    // not as a property name should not match. The regex is anchored
    // to the start of the declaration list or after a `;`.
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect style="content: 'transform of x'" width="10" height="10"/></svg>`
    );
    expect(d.has_inline_css_transform(id_of_first(d, "rect"))).toBe(false);
  });
});

describe("SvgDocument.has_animate_transform_child", () => {
  it("returns true when an <animateTransform> is a direct child", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2s"/></rect></svg>`
    );
    expect(d.has_animate_transform_child(id_of_first(d, "rect"))).toBe(true);
  });

  it("returns false when no <animateTransform> child is present", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`
    );
    expect(d.has_animate_transform_child(id_of_first(d, "rect"))).toBe(false);
  });

  it("returns false when <animateTransform> is a descendant but not a direct child", () => {
    // SMIL animateTransform attaches to its parent element. A
    // grandchild's animateTransform does not animate the grandparent.
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="10" height="10"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2s"/></rect></g></svg>`
    );
    expect(d.has_animate_transform_child(id_of_first(d, "g"))).toBe(false);
  });

  it("ignores non-element children (text, comments)", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><g><!-- nothing --></g></svg>`
    );
    expect(d.has_animate_transform_child(id_of_first(d, "g"))).toBe(false);
  });
});
