// Producer contract for `SvgDocument.serialize_node` — the selection→source
// bridge accepted from #775.
//
// serialize_node emits ONE element's subtree as a fragment, reusing the
// trivia-preserving serializer. It is deliberately weaker than `serialize()`
// (sdk-design D3): a fragment is NOT a standalone round-trippable document.
// These tests pin both the fidelity it DOES guarantee and the guarantee it
// deliberately does NOT make (ancestor xmlns declarations are not inlined).
//
// Producer-only: no editor mounted, no consumer named.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import { createSvgEditor } from "../src/index";
import { first_rect } from "./_helpers";

function first_of_tag(doc: SvgDocument, tag: string): string {
  for (const id of doc.all_elements()) {
    if (doc.tag_of(id) === tag) return id;
  }
  throw new Error(`no <${tag}> in document`);
}

describe("SvgDocument.serialize_node", () => {
  it("emits the node's subtree byte-for-byte as authored", () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg"><g id="layer"><rect width="50" height="40" x="10" y="10" fill="red"/></g></svg>`;
    const doc = new SvgDocument(src);
    const g = first_of_tag(doc, "g");
    expect(doc.serialize_node(g)).toBe(
      `<g id="layer"><rect width="50" height="40" x="10" y="10" fill="red"/></g>`
    );
  });

  it("preserves comments and whitespace inside the subtree", () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg"><g>\n  <!-- keep me -->\n  <rect width="10" height="10"/>\n</g></svg>`;
    const doc = new SvgDocument(src);
    const g = first_of_tag(doc, "g");
    expect(doc.serialize_node(g)).toBe(
      `<g>\n  <!-- keep me -->\n  <rect width="10" height="10"/>\n</g>`
    );
  });

  it("matches what serialize() emits for that node, in place", () => {
    // The fragment a node serializes to must be a substring of the full
    // document serialization — same bytes, just scoped.
    const src = `<svg xmlns="http://www.w3.org/2000/svg"><rect x="1" y="2" width="3" height="4"/></svg>`;
    const doc = new SvgDocument(src);
    const rect = first_of_tag(doc, "rect");
    expect(doc.serialize()).toContain(doc.serialize_node(rect));
  });

  it("on a node using xlink:href does NOT inline xmlns:xlink (fragment, not document)", () => {
    // The xmlns:xlink declaration lives on the ancestor <svg>. A fragment is
    // the element's markup as authored; it does NOT carry ancestor namespace
    // declarations. This is the intended fragment≠document asymmetry, locked
    // here so a future "make it round-trip" change is a conscious choice.
    const src = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a"/></svg>`;
    const doc = new SvgDocument(src);
    const use = first_of_tag(doc, "use");
    const fragment = doc.serialize_node(use);
    expect(fragment).toBe(`<use xlink:href="#a"/>`);
    expect(fragment).not.toContain("xmlns:xlink");
  });

  it("throws on an unknown id", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`
    );
    expect(() => doc.serialize_node("does-not-exist")).toThrow(
      /unknown node id/
    );
  });

  it("throws on a non-element node", () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg"><text>hello</text></svg>`;
    const doc = new SvgDocument(src);
    const text = first_of_tag(doc, "text");
    // The <text> element's child is a text node; reach it via the IR.
    const textChild = doc.children_of(text)[0];
    expect(() => doc.serialize_node(textChild)).toThrow(/not an element/);
  });
});

describe("editor.serialize_node (public surface)", () => {
  it("exposes the document fragment serializer on the editor", () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg"><rect x="1" y="2" width="3" height="4" fill="blue"/></svg>`;
    const editor = createSvgEditor({ svg: src });
    const rect = first_rect(editor);
    expect(editor.serialize_node(rect)).toBe(
      `<rect x="1" y="2" width="3" height="4" fill="blue"/>`
    );
  });
});
