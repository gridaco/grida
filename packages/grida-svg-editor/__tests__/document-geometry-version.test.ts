// Asserts the `_geometry_version` bump policy on `SvgDocument`:
// geometry-affecting writes bump; presentation writes don't; namespaced
// reference writes don't.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import { XLINK_NS } from "@grida/svg/parser";
import { first_rect } from "./_helpers";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/></svg>`;

describe("SvgDocument.geometry_version", () => {
  it("starts at 0", () => {
    const doc = new SvgDocument(SVG);
    expect(doc.geometry_version).toBe(0);
  });

  it("bumps on geometry attribute writes (x/y/width/d/transform/font-size)", () => {
    const doc = new SvgDocument(SVG);
    const rect = first_rect(doc);
    const before = doc.geometry_version;
    doc.set_attr(rect, "x", "5");
    const after_x = doc.geometry_version;
    expect(after_x).toBeGreaterThan(before);
    doc.set_attr(rect, "width", "20");
    expect(doc.geometry_version).toBeGreaterThan(after_x);
    doc.set_attr(rect, "transform", "translate(1,2)");
    expect(doc.geometry_version).toBeGreaterThan(after_x + 1);
  });

  it("does NOT bump on presentation writes (fill/stroke/opacity)", () => {
    const doc = new SvgDocument(SVG);
    const rect = first_rect(doc);
    const before = doc.geometry_version;
    doc.set_attr(rect, "fill", "red");
    doc.set_attr(rect, "stroke", "blue");
    doc.set_attr(rect, "opacity", "0.5");
    expect(doc.geometry_version).toBe(before);
  });

  it("does NOT bump on `id` writes (structural only, not geometry)", () => {
    const doc = new SvgDocument(SVG);
    const rect = first_rect(doc);
    const before_geometry = doc.geometry_version;
    const before_structure = doc.structure_version;
    doc.set_attr(rect, "id", "sun");
    expect(doc.structure_version).toBeGreaterThan(before_structure);
    expect(doc.geometry_version).toBe(before_geometry);
  });

  it("does NOT bump on namespaced (xlink:href) writes", () => {
    // <use> exists in a typical doc; we add a synthetic href on the rect
    // to assert the namespace check, which is the property under test.
    const doc = new SvgDocument(SVG);
    const rect = first_rect(doc);
    const before = doc.geometry_version;
    doc.set_attr(rect, "href", "#foo", XLINK_NS);
    expect(doc.geometry_version).toBe(before);
  });

  it("bumps on set_text", () => {
    const text_svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="0" y="10">a</text></svg>`;
    const doc = new SvgDocument(text_svg);
    let text_id: string | null = null;
    for (const id of doc.all_elements()) {
      if (doc.tag_of(id) === "text") {
        text_id = id;
        break;
      }
    }
    expect(text_id).not.toBeNull();
    const before = doc.geometry_version;
    doc.set_text(text_id!, "hello");
    expect(doc.geometry_version).toBeGreaterThan(before);
  });

  it("bumps on insert / remove", () => {
    const doc = new SvgDocument(SVG);
    const before = doc.geometry_version;
    const id = doc.create_element("circle");
    doc.insert(id, doc.root, null);
    const after_insert = doc.geometry_version;
    expect(after_insert).toBeGreaterThan(before);
    doc.remove(id);
    expect(doc.geometry_version).toBeGreaterThan(after_insert);
  });

  it("bumps on load() and reset_to_original()", () => {
    const doc = new SvgDocument(SVG);
    const before = doc.geometry_version;
    doc.load(SVG);
    const after_load = doc.geometry_version;
    expect(after_load).toBeGreaterThan(before);
    doc.reset_to_original();
    expect(doc.geometry_version).toBeGreaterThan(after_load);
  });

  it("bumps even on same-value writes (pessimistic invalidation, v1)", () => {
    const doc = new SvgDocument(SVG);
    const rect = first_rect(doc);
    doc.set_attr(rect, "x", "0"); // same value as authored
    const v = doc.geometry_version;
    doc.set_attr(rect, "x", "0");
    expect(doc.geometry_version).toBeGreaterThan(v);
  });
});
