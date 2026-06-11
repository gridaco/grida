// subtree.clone_plan — the in-document SUBTREE CLONE operation (the
// clipboard FRD's second extraction operation; gridaco/grida#817).
// Pins the contract the spec states: verbatim subtree bytes, verbatim
// authored ids (collisions included), NO defs closure, next-sibling
// placement, shared selection normalization, and the refusal table
// (root / nested-<svg> / stale members → skipped, never thrown).

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import { subtree } from "../src/core/subtree";
import type { NodeId } from "../src/types";

const SVG_NS = `xmlns="http://www.w3.org/2000/svg"`;

function find_by_element_id(doc: SvgDocument, id: string): NodeId {
  for (const el of doc.all_elements()) {
    if (doc.get_attr(el, "id") === id) return el;
  }
  throw new Error(`no element with id "${id}"`);
}

/** The consumer side of "plan, don't insert" — the namespace's own
 *  attach helper, used the way `commands.duplicate` and the clone-drag
 *  session use it. */
const insert_plan = subtree.insert_plan;

describe("subtree.clone_plan — verbatim clone", () => {
  it("clone subtree serializes byte-equal to its origin (trivia preserved)", () => {
    // Deliberately messy trivia: attribute order, single quotes, inner
    // comment, irregular spacing, self-closing child.
    const doc = new SvgDocument(
      `<svg ${SVG_NS}><g id="t"  fill='red' ><rect width="3" x="1" /><!-- keep --><circle r='5'/></g></svg>`
    );
    const origin = find_by_element_id(doc, "t");
    const plan = subtree.clone_plan(doc, [origin]);
    expect(plan).toHaveLength(1);
    insert_plan(doc, plan);
    expect(doc.serialize_node(plan[0].clone)).toBe(doc.serialize_node(origin));
  });

  it("authored ids are cloned verbatim — the document gains colliding ids", () => {
    const doc = new SvgDocument(
      `<svg ${SVG_NS}><rect id="a" x="1" width="2" height="2"/></svg>`
    );
    const plan = subtree.clone_plan(doc, [find_by_element_id(doc, "a")]);
    insert_plan(doc, plan);
    expect(doc.serialize().match(/id="a"/g)).toHaveLength(2);
  });

  it("carries NO reference closure — a url(#…) consumer clones without its gradient", () => {
    const doc = new SvgDocument(
      `<svg ${SVG_NS}><defs><linearGradient id="g1"/></defs><rect id="r" fill="url(#g1)" width="2" height="2"/></svg>`
    );
    const plan = subtree.clone_plan(doc, [find_by_element_id(doc, "r")]);
    insert_plan(doc, plan);
    const out = doc.serialize();
    // One gradient, two references resolving against it.
    expect(out.match(/<linearGradient/g)).toHaveLength(1);
    expect(out.match(/url\(#g1\)/g)).toHaveLength(2);
  });

  it("a self-referencing subtree keeps its reference untouched (resolves to the ORIGINAL)", () => {
    const doc = new SvgDocument(
      `<svg ${SVG_NS}><g id="a"><use href="#a"/></g></svg>`
    );
    const plan = subtree.clone_plan(doc, [find_by_element_id(doc, "a")]);
    insert_plan(doc, plan);
    const out = doc.serialize();
    expect(out.match(/id="a"/g)).toHaveLength(2);
    expect(out.match(/href="#a"/g)).toHaveLength(2);
  });

  it("<use href='#x'> and #x cloned together → hrefs untouched", () => {
    const doc = new SvgDocument(
      `<svg ${SVG_NS}><rect id="x" width="2" height="2"/><use id="u" href="#x"/></svg>`
    );
    const ids = [find_by_element_id(doc, "x"), find_by_element_id(doc, "u")];
    const plan = subtree.clone_plan(doc, ids);
    expect(plan).toHaveLength(2);
    insert_plan(doc, plan);
    expect(doc.serialize().match(/href="#x"/g)).toHaveLength(2);
  });
});

describe("subtree.clone_plan — placement", () => {
  it("each clone lands immediately after its origin (paints above it)", () => {
    const doc = new SvgDocument(
      `<svg ${SVG_NS}><rect id="a" x="1"/><rect id="b" x="2"/></svg>`
    );
    const a = find_by_element_id(doc, "a");
    const plan = subtree.clone_plan(doc, [a]);
    insert_plan(doc, plan);
    const order = doc
      .element_children_of(doc.root)
      .map((id) => doc.get_attr(id, "x"));
    // a, a′, b — the clone sits between its origin and the next sibling.
    expect(order).toEqual(["1", "1", "2"]);
    expect(doc.next_sibling_of(a)).toBe(plan[0].clone);
  });

  it("multi-selection interleaves: A, A′, B, B′", () => {
    const doc = new SvgDocument(
      `<svg ${SVG_NS}><rect id="a"/><rect id="b"/></svg>`
    );
    const a = find_by_element_id(doc, "a");
    const b = find_by_element_id(doc, "b");
    const plan = subtree.clone_plan(doc, [a, b]);
    insert_plan(doc, plan);
    const ids = doc
      .element_children_of(doc.root)
      .map((id) => doc.get_attr(id, "id"));
    expect(ids).toEqual(["a", "a", "b", "b"]);
  });
});

describe("subtree.clone_plan — normalization (shared with payload extraction)", () => {
  it("plan follows document order regardless of selection order, deduped", () => {
    const doc = new SvgDocument(
      `<svg ${SVG_NS}><rect id="a"/><rect id="b"/></svg>`
    );
    const a = find_by_element_id(doc, "a");
    const b = find_by_element_id(doc, "b");
    const plan = subtree.clone_plan(doc, [b, a, b]);
    expect(plan.map((p) => p.origin)).toEqual([a, b]);
  });

  it("an ancestor subsumes its selected descendant", () => {
    const doc = new SvgDocument(
      `<svg ${SVG_NS}><g id="g"><rect id="a"/></g></svg>`
    );
    const g = find_by_element_id(doc, "g");
    const a = find_by_element_id(doc, "a");
    const plan = subtree.clone_plan(doc, [g, a]);
    expect(plan.map((p) => p.origin)).toEqual([g]);
  });

  it("stale / unknown ids are skipped, never thrown", () => {
    const doc = new SvgDocument(`<svg ${SVG_NS}><rect id="a"/></svg>`);
    const a = find_by_element_id(doc, "a");
    const plan = subtree.clone_plan(doc, ["nope", a]);
    expect(plan.map((p) => p.origin)).toEqual([a]);
  });
});

describe("subtree.insert_plan / remove_plan", () => {
  it("insert → remove round-trips the document byte-equal", () => {
    const doc = new SvgDocument(
      `<svg ${SVG_NS}><rect id="a" x="1"/><rect id="b" x="2"/></svg>`
    );
    const baseline = doc.serialize();
    const a = find_by_element_id(doc, "a");
    const b = find_by_element_id(doc, "b");
    const plan = subtree.clone_plan(doc, [a, b]);
    subtree.insert_plan(doc, plan);
    expect(doc.serialize()).not.toBe(baseline);
    subtree.remove_plan(doc, plan);
    expect(doc.serialize()).toBe(baseline);
    // Removed clones stay in the id map — a later insert_plan restores
    // them (the history-redo contract).
    subtree.insert_plan(doc, plan);
    const ids = doc
      .element_children_of(doc.root)
      .map((id) => doc.get_attr(id, "id"));
    expect(ids).toEqual(["a", "a", "b", "b"]);
  });
});

describe("subtree.clone_plan — refusals", () => {
  it("empty selection → empty plan", () => {
    const doc = new SvgDocument(`<svg ${SVG_NS}><rect/></svg>`);
    expect(subtree.clone_plan(doc, [])).toHaveLength(0);
  });

  it("document root is skipped (no sibling slot)", () => {
    const doc = new SvgDocument(`<svg ${SVG_NS}><rect/></svg>`);
    expect(subtree.clone_plan(doc, [doc.root])).toHaveLength(0);
  });

  it("nested <svg> is refused (create_fragment's shell-unwrap hazard)", () => {
    const doc = new SvgDocument(
      `<svg ${SVG_NS}><svg id="inner" x="5"><rect/></svg><rect id="a"/></svg>`
    );
    const inner = find_by_element_id(doc, "inner");
    const a = find_by_element_id(doc, "a");
    const plan = subtree.clone_plan(doc, [inner, a]);
    // The cloneable member still clones — refusal is per-member.
    expect(plan.map((p) => p.origin)).toEqual([a]);
  });
});

// The repeating-offset witness (gridaco/grida#825; spec: subtree-clone.md
// §Repeating offset). Pure: stub bounds tables, no editor. `null` always
// means "no repeat — duplicate in place"; nothing in this matrix throws.
describe("subtree.repeat_delta — the repeating-offset witness (#825)", () => {
  const r = (x: number, y: number, w = 20, h = 20) => ({
    x,
    y,
    width: w,
    height: h,
  });
  const bounds =
    (table: Record<string, ReturnType<typeof r>>) => (id: NodeId) =>
      table[id] ?? null;

  it("a rigid translate of the previous clones yields the exact delta", () => {
    const record = { origins: ["a"], clones: ["a1"] };
    const delta = subtree.repeat_delta(
      record,
      ["a1"],
      bounds({ a: r(10, 10), a1: r(40, 15) })
    );
    expect(delta).toEqual({ x: 30, y: 5 });
  });

  it("multi-member: the delta is the UNION bbox offset", () => {
    const record = { origins: ["a", "b"], clones: ["a1", "b1"] };
    const delta = subtree.repeat_delta(
      record,
      ["a1", "b1"],
      bounds({ a: r(0, 0), b: r(50, 50), a1: r(5, 7), b1: r(55, 57) })
    );
    expect(delta).toEqual({ x: 5, y: 7 });
  });

  it("no record → null", () => {
    expect(subtree.repeat_delta(null, ["a"], bounds({ a: r(0, 0) }))).toBe(
      null
    );
  });

  it("targets must BE the previous clones, in the same order", () => {
    const table = bounds({ a: r(10, 10), a1: r(40, 10), b1: r(70, 10) });
    const record = { origins: ["a"], clones: ["a1"] };
    // different node
    expect(subtree.repeat_delta(record, ["b1"], table)).toBe(null);
    // count mismatch
    expect(subtree.repeat_delta(record, ["a1", "b1"], table)).toBe(null);
    // reorder of a multi-member record
    const multi = { origins: ["a", "b"], clones: ["a1", "b1"] };
    expect(
      subtree.repeat_delta(
        multi,
        ["b1", "a1"],
        bounds({ a: r(0, 0), b: r(50, 0), a1: r(5, 0), b1: r(55, 0) })
      )
    ).toBe(null);
  });

  it("one unmeasurable member (detached, no provider, measureless tag) → null", () => {
    const record = { origins: ["a"], clones: ["a1"] };
    expect(
      subtree.repeat_delta(record, ["a1"], bounds({ a1: r(40, 10) }))
    ).toBe(null);
    expect(subtree.repeat_delta(record, ["a1"], () => null)).toBe(null);
  });

  it("a resized copy → null", () => {
    const record = { origins: ["a"], clones: ["a1"] };
    expect(
      subtree.repeat_delta(
        record,
        ["a1"],
        bounds({ a: r(10, 10, 20, 20), a1: r(40, 10, 30, 20) })
      )
    ).toBe(null);
  });

  it("rigidity is per member, not per envelope — an inner copy moved while the union survives → null", () => {
    // a and c define the union corners; b is interior. Every clone of
    // a/c shifts by (5, 5) so the union shifts rigidly — but b's clone
    // wandered. An envelope-only check would pass; the witness must not.
    const record = { origins: ["a", "b", "c"], clones: ["a1", "b1", "c1"] };
    expect(
      subtree.repeat_delta(
        record,
        ["a1", "b1", "c1"],
        bounds({
          a: r(0, 0, 10, 10),
          b: r(20, 20, 10, 10),
          c: r(50, 50, 10, 10),
          a1: r(5, 5, 10, 10),
          b1: r(30, 40, 10, 10), // not (25, 25) — non-rigid inner move
          c1: r(55, 55, 10, 10),
        })
      )
    ).toBe(null);
  });

  it("a malformed record (unpaired arrays) → null", () => {
    const record = { origins: ["a", "b"], clones: ["a1"] };
    expect(
      subtree.repeat_delta(
        record,
        ["a1"],
        bounds({ a: r(0, 0), b: r(50, 0), a1: r(5, 0) })
      )
    ).toBe(null);
  });

  it("zero delta (the copy never moved) → null", () => {
    const record = { origins: ["a"], clones: ["a1"] };
    expect(
      subtree.repeat_delta(
        record,
        ["a1"],
        bounds({ a: r(10, 10), a1: r(10, 10) })
      )
    ).toBe(null);
  });
});
