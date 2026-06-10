// Headless tests for `core/clipboard.ts` — payload extraction
// (selection → standalone SVG document). Contract:
// docs/wg/feat-svg-editor/clipboard.md §The payload, normatively.
//
//   - normalization: ancestor subsumes descendant; document order
//     regardless of selection order; stale ids skipped; empty → null.
//   - closure: the CLOSED carrier list (presentation attrs + inline
//     style; href tag set), recursive, cycle-guarded, forest-excluded,
//     subtree-aware dedup, unresolved-left-as-authored, first-in-doc-
//     order duplicate-id resolution. `<style>` rules / `<a href>` are
//     deliberately NOT walked.
//   - namespaces: borrowed prefixes declared on the shell (nearest
//     ancestor declaration wins; well-known `xlink` repair; unknown
//     prefixes left unbound).
//   - shell: no `<defs>` when the closure is empty; no viewBox / sizing;
//     deterministic bytes; per-subtree trivia byte-preserved.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import { clipboard } from "../src/core/clipboard";
import type { NodeId } from "../src/types";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

function el(doc: SvgDocument, tag: string, nth = 0): NodeId {
  const found = doc.all_elements().filter((id) => doc.tag_of(id) === tag);
  if (nth >= found.length) {
    throw new Error(`no <${tag}>[${nth}] in document`);
  }
  return found[nth];
}

describe("clipboard.extract_payload / normalization", () => {
  it("ancestor subsumes a selected descendant — the subtree is emitted once", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><g id="grp"><rect id="r" width="10" height="10"/></g></svg>`
    );
    const payload = clipboard.extract_payload(doc, [
      el(doc, "rect"),
      el(doc, "g"),
    ]);
    expect(payload).toBe(
      `<svg xmlns="${SVG_NS}"><g id="grp"><rect id="r" width="10" height="10"/></g></svg>`
    );
  });

  it("roots are emitted in DOCUMENT order regardless of selection order", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><rect id="a"/><rect id="b"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [
      el(doc, "rect", 1),
      el(doc, "rect", 0),
    ]);
    expect(payload).toBe(
      `<svg xmlns="${SVG_NS}"><rect id="a"/><rect id="b"/></svg>`
    );
  });

  it("stale / unknown ids are skipped, not thrown (copy has no refusal path)", () => {
    const doc = new SvgDocument(`<svg xmlns="${SVG_NS}"><rect id="a"/></svg>`);
    const payload = clipboard.extract_payload(doc, [
      "zzz-not-a-node" as NodeId,
      el(doc, "rect"),
    ]);
    expect(payload).toBe(`<svg xmlns="${SVG_NS}"><rect id="a"/></svg>`);
  });

  it("returns null on empty selection and on all-stale selection", () => {
    const doc = new SvgDocument(`<svg xmlns="${SVG_NS}"><rect/></svg>`);
    expect(clipboard.extract_payload(doc, [])).toBeNull();
    expect(clipboard.extract_payload(doc, ["nope" as NodeId])).toBeNull();
  });
});

describe("clipboard.extract_payload / reference closure", () => {
  it("carries a fill url(#…) target (presentation attribute)", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><defs><linearGradient id="g1"/></defs><rect id="r" fill="url(#g1)"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")]);
    expect(payload).toBe(
      `<svg xmlns="${SVG_NS}"><defs><linearGradient id="g1"/></defs><rect id="r" fill="url(#g1)"/></svg>`
    );
  });

  it("carries targets from DUPLICATE inline declarations — the CSS winner included", () => {
    // Last declaration wins in CSS; scanning only one declaration would
    // risk carrying the loser and dropping the resource that renders.
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><defs><linearGradient id="old"/><linearGradient id="new"/></defs>` +
        `<rect style="fill: url(#old); fill: url(#new)"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")])!;
    expect(payload).toContain(`id="new"`);
    expect(payload).toContain(`id="old"`);
  });

  it("carries an inline-style url(#…) target", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><defs><linearGradient id="g1"/></defs><rect style="fill: url(#g1)"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")]);
    expect(payload).toContain(`<defs><linearGradient id="g1"/></defs>`);
  });

  it("carries marker-* and the marker shorthand", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><defs><marker id="m1"/><marker id="m2"/></defs>` +
        `<line x2="5" marker-end="url(#m1)"/><path d="M0 0" marker="url(#m2)"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [
      el(doc, "line"),
      el(doc, "path"),
    ]);
    expect(payload).toContain(`<marker id="m1"/>`);
    expect(payload).toContain(`<marker id="m2"/>`);
  });

  it("collects MULTIPLE url(#…) references from one value", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><defs><filter id="f1"/><filter id="f2"/></defs>` +
        `<rect style="filter: url(#f1) url(#f2)"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")]);
    expect(payload).toContain(`<filter id="f1"/>`);
    expect(payload).toContain(`<filter id="f2"/>`);
  });

  it("walks recursively — a gradient href chain comes along whole", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><defs>` +
        `<linearGradient id="g1" href="#g2"/><linearGradient id="g2" href="#g3"/><linearGradient id="g3"/>` +
        `</defs><rect fill="url(#g1)"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")]);
    expect(payload).toContain(`id="g1"`);
    expect(payload).toContain(`id="g2"`);
    expect(payload).toContain(`id="g3"`);
  });

  it("terminates on a reference cycle, each member emitted once", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><defs>` +
        `<linearGradient id="g1" href="#g2"/><linearGradient id="g2" href="#g1"/>` +
        `</defs><rect fill="url(#g1)"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")])!;
    expect(payload.match(/id="g1"/g)).toHaveLength(1);
    expect(payload.match(/id="g2"/g)).toHaveLength(1);
  });

  it("a definition shared by two copied roots is emitted once", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><defs><linearGradient id="g1"/></defs>` +
        `<rect fill="url(#g1)"/><circle r="1" fill="url(#g1)"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [
      el(doc, "rect"),
      el(doc, "circle"),
    ])!;
    // Self-closing — exactly one serialization of the shared gradient.
    expect(payload.match(/<linearGradient/g)).toHaveLength(1);
  });

  it("a collected element nested inside another collected element is not double-emitted", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><defs>` +
        `<pattern id="p"><linearGradient id="g1"/></pattern>` +
        `</defs><rect fill="url(#p)" stroke="url(#g1)"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")])!;
    // g1 rides inside p — exactly one serialization of it.
    expect(payload.match(/id="g1"/g)).toHaveLength(1);
    expect(payload).toContain(
      `<defs><pattern id="p"><linearGradient id="g1"/></pattern></defs>`
    );
  });

  it("excludes targets inside the copied forest (use → copied sibling)", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><rect id="shape"/><use href="#shape"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [
      el(doc, "rect"),
      el(doc, "use"),
    ]);
    // Both roots are content; nothing to carry — no <defs>.
    expect(payload).toBe(
      `<svg xmlns="${SVG_NS}"><rect id="shape"/><use href="#shape"/></svg>`
    );
  });

  it("leaves unresolved references as authored — no defs, no error", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><rect fill="url(#nope)"/></svg>`
    );
    expect(clipboard.extract_payload(doc, [el(doc, "rect")])).toBe(
      `<svg xmlns="${SVG_NS}"><rect fill="url(#nope)"/></svg>`
    );
  });

  it("does NOT walk <style> element rules (documented v1 degradation)", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><style>.a { fill: url(#g1); }</style>` +
        `<defs><linearGradient id="g1"/></defs><rect class="a"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")]);
    expect(payload).toBe(`<svg xmlns="${SVG_NS}"><rect class="a"/></svg>`);
  });

  it("does NOT walk <a href> (navigation, not a resource reference)", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><rect id="target"/><a href="#target"><circle r="1"/></a></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "a")]);
    expect(payload).toBe(
      `<svg xmlns="${SVG_NS}"><a href="#target"><circle r="1"/></a></svg>`
    );
  });

  it("duplicate source ids resolve to the FIRST in document order", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><defs>` +
        `<linearGradient id="g1" data-which="first"/><linearGradient id="g1" data-which="second"/>` +
        `</defs><rect fill="url(#g1)"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")])!;
    expect(payload).toContain(`data-which="first"`);
    expect(payload).not.toContain(`data-which="second"`);
  });

  it("collect_reference_closure returns closure ids in document order", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><defs><filter id="f"/><linearGradient id="g"/></defs>` +
        `<rect fill="url(#g)" style="filter: url(#f)"/></svg>`
    );
    const closure = clipboard.collect_reference_closure(doc, [el(doc, "rect")]);
    expect(closure.map((id) => doc.tag_of(id))).toEqual([
      "filter",
      "linearGradient",
    ]);
  });
});

describe("clipboard.extract_payload / namespaces", () => {
  it("declares a prefix the content borrows from the source root", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}"><rect id="r"/><use xlink:href="#r"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "use")]);
    // The use's target rides as closure; the borrowed xlink prefix lands
    // on the shell.
    expect(payload).toBe(
      `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}"><defs><rect id="r"/></defs><use xlink:href="#r"/></svg>`
    );
  });

  it("a closure member's borrowed prefix alone triggers the shell declaration", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}"><defs>` +
        `<linearGradient id="g1" xlink:href="#g2"/><linearGradient id="g2"/>` +
        `</defs><rect fill="url(#g1)"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")])!;
    expect(
      payload.startsWith(`<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}">`)
    ).toBe(true);
  });

  it("nearest ancestor declaration wins for a custom prefix", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}" xmlns:custom="uri-outer">` +
        `<g xmlns:custom="uri-inner"><rect custom:flag="1"/></g></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")])!;
    expect(payload).toContain(`xmlns:custom="uri-inner"`);
    expect(payload).not.toContain(`uri-outer`);
  });

  it("a prefix the copied subtree declares itself is not re-declared on the shell", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><g xmlns:foo="uri-foo" foo:flag="1"><rect/></g></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "g")]);
    expect(payload).toBe(
      `<svg xmlns="${SVG_NS}"><g xmlns:foo="uri-foo" foo:flag="1"><rect/></g></svg>`
    );
  });

  it("repairs an undeclared xlink from the well-known table (payload must be well-formed)", () => {
    // Source never declares xlink — broken source, parser tolerates it.
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><use xlink:href="#nope"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "use")]);
    expect(payload).toBe(
      `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}"><use xlink:href="#nope"/></svg>`
    );
  });

  it("escapes special characters in a resolved namespace URI on the shell", () => {
    // The resolved URI is the PARSED value (entities decoded) — the shell
    // must re-escape it like any serialized attribute, or a quote-bearing
    // URI breaks the payload's well-formedness.
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}" xmlns:weird="urn:&quot;x&amp;y">` +
        `<g><rect weird:flag="1"/></g></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")])!;
    expect(payload).toContain(`xmlns:weird="urn:&quot;x&amp;y"`);
    // Round-trip: the payload parses, and from the payload root the
    // shell's declaration covers every prefix the content uses.
    const reparsed = new SvgDocument(payload);
    expect(reparsed.undeclared_ns_prefixes(reparsed.root).size).toBe(0);
  });

  it("leaves an unknown undeclared prefix unbound — the source was equally unbound", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><rect weird:flag="1"/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")]);
    expect(payload).toBe(`<svg xmlns="${SVG_NS}"><rect weird:flag="1"/></svg>`);
  });
});

describe("clipboard.extract_payload / shell", () => {
  it("emits no <defs> when the closure is empty, and no viewBox / sizing ever", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}" viewBox="0 0 100 100" width="100" height="100"><rect/></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "rect")]);
    expect(payload).toBe(`<svg xmlns="${SVG_NS}"><rect/></svg>`);
  });

  it("is deterministic — same (document, selection) → identical bytes", () => {
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><defs><linearGradient id="g1"/></defs><rect fill="url(#g1)"/></svg>`
    );
    const a = clipboard.extract_payload(doc, [el(doc, "rect")]);
    const b = clipboard.extract_payload(doc, [el(doc, "rect")]);
    expect(a).toBe(b);
  });

  it("preserves trivia WITHIN each copied subtree byte-exact", () => {
    // Attribute spacing, quote styles, name-side `=` trivia, comments —
    // everything the parser models survives. (Space AFTER `=` is a known
    // parser-level round-trip gap, present in `serialize()` too — not a
    // clipboard concern.)
    const doc = new SvgDocument(
      `<svg xmlns="${SVG_NS}"><g><!-- keep --><rect   id='r' fill ="red"/></g></svg>`
    );
    const payload = clipboard.extract_payload(doc, [el(doc, "g")]);
    expect(payload).toBe(
      `<svg xmlns="${SVG_NS}"><g><!-- keep --><rect   id='r' fill ="red"/></g></svg>`
    );
  });
});
