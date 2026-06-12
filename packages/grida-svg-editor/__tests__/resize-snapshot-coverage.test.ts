// The raw-snapshot coverage contract: every attribute a resize gesture
// can write — via the per-tag Policy Class handler (`dispatch_resize`),
// commit-phase pivot renormalization, or the group-translate arm of
// editor.ts `commit_resize` — must be listed in `baseline.raw`, or
// `intent.restore` (undo / Escape-cancel) silently misses it on revert.
//
// `RESIZE_WRITE_ATTRS` is the handlers' write surface as data; this
// suite cross-checks it against the LIVE write paths by diffing real
// documents before/after, so a handler that starts writing a new
// attribute fails here instead of shipping broken undo.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import { resize_pipeline } from "../src/core/resize-pipeline";
import { translate_pipeline } from "../src/core/translate-pipeline";
import { RESIZE_WRITE_ATTRS } from "../src/core/policy-class/handlers/resize";
import { first_tag } from "./_helpers";

/** One representative element per resizable tag, every writable attr
 *  present with a non-default value. */
const FIXTURES: Record<string, string> = {
  rect: `<rect x="10" y="20" width="100" height="50"/>`,
  image: `<image x="1" y="2" width="30" height="40"/>`,
  use: `<use x="3" y="4" width="20" height="10"/>`,
  circle: `<circle cx="50" cy="60" r="25"/>`,
  ellipse: `<ellipse cx="40" cy="30" rx="20" ry="10"/>`,
  line: `<line x1="0" y1="0" x2="50" y2="40"/>`,
  polyline: `<polyline points="0,0 10,5 20,0"/>`,
  polygon: `<polygon points="0,0 10,0 5,8"/>`,
  path: `<path d="M 0 0 L 10 10 C 20 20 30 10 40 0 Z"/>`,
  text: `<text x="5" y="15" font-size="12">hi</text>`,
};

const BBOX = { x: 0, y: 0, width: 100, height: 50 };

function make_doc(
  tag: string,
  transform?: string
): {
  doc: SvgDocument;
  id: string;
} {
  const el = transform
    ? FIXTURES[tag].replace("/>", ` transform="${transform}"/>`)
    : FIXTURES[tag];
  const doc = new SvgDocument(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${el}</svg>`
  );
  return { doc, id: first_tag(doc, tag) };
}

function attr_map(doc: SvgDocument, id: string): Map<string, string> {
  return new Map(doc.attributes_of(id).map((a) => [a.name, a.value]));
}

/** Names added, removed, or value-changed between two snapshots. */
function changed_attrs(
  before: Map<string, string>,
  after: Map<string, string>
): string[] {
  const names = new Set([...before.keys(), ...after.keys()]);
  return [...names].filter((n) => before.get(n) !== after.get(n));
}

function raw_names(
  baseline: ReturnType<typeof resize_pipeline.intent.capture_baseline>
): Set<string> {
  return new Set(baseline.raw.map((a) => a.name));
}

describe("RESIZE_WRITE_ATTRS table completeness", () => {
  it("covers exactly the is_resizable tag set", () => {
    // Bidirectional: a table entry without a fixture would silently
    // skip that tag's per-tag coverage cases below, and vice versa.
    for (const tag of Object.keys(RESIZE_WRITE_ATTRS)) {
      expect(resize_pipeline.intent.is_resizable(tag)).toBe(true);
      expect(FIXTURES[tag]).toBeDefined();
    }
    for (const tag of Object.keys(FIXTURES)) {
      expect(RESIZE_WRITE_ATTRS[tag]).toBeDefined();
    }
  });
});

describe("resize-commit writes ⊆ baseline.raw", () => {
  for (const tag of Object.keys(FIXTURES)) {
    it(`${tag}`, () => {
      const { doc, id } = make_doc(tag);
      const baseline = resize_pipeline.intent.capture_baseline(doc, id, BBOX);
      const before = attr_map(doc, id);
      resize_pipeline.intent.apply(
        doc,
        id,
        baseline,
        2,
        3,
        { x: 0, y: 0 },
        "commit"
      );
      const written = changed_attrs(before, attr_map(doc, id));
      expect(written.length).toBeGreaterThan(0);
      const covered = raw_names(baseline);
      for (const name of written) expect(covered).toContain(name);
    });
  }

  it("rotated rect (explicit pivot): pivot renormalization's transform write is covered", () => {
    const { doc, id } = make_doc("rect", "rotate(30 60 45)");
    const baseline = resize_pipeline.intent.capture_baseline(doc, id, BBOX);
    const before = attr_map(doc, id);
    resize_pipeline.intent.apply(
      doc,
      id,
      baseline,
      2,
      3,
      { x: 0, y: 0 },
      "commit"
    );
    const written = changed_attrs(before, attr_map(doc, id));
    expect(written).toContain("transform");
    const covered = raw_names(baseline);
    for (const name of written) expect(covered).toContain(name);
  });
});

// editor.ts `commit_resize` reverts the WHOLE step (scale + group
// translate) through resize's snapshot alone — so translate's write
// surface must also be covered, for plain and transform-positioned
// elements alike.
describe("translate writes ⊆ baseline.raw (commit_resize group-translate arm)", () => {
  for (const tag of Object.keys(FIXTURES)) {
    it(`${tag}`, () => {
      const { doc, id } = make_doc(tag);
      const baseline = resize_pipeline.intent.capture_baseline(doc, id, BBOX);
      const before = attr_map(doc, id);
      const tb = translate_pipeline.intent.capture_baseline(doc, id);
      translate_pipeline.intent.apply(doc, id, tb, 7, 11);
      const written = changed_attrs(before, attr_map(doc, id));
      expect(written.length).toBeGreaterThan(0);
      const covered = raw_names(baseline);
      for (const name of written) expect(covered).toContain(name);
    });
  }

  it("transformed rect: viaTransform's transform write is covered", () => {
    const { doc, id } = make_doc("rect", "translate(3 4)");
    const baseline = resize_pipeline.intent.capture_baseline(doc, id, BBOX);
    const before = attr_map(doc, id);
    const tb = translate_pipeline.intent.capture_baseline(doc, id);
    translate_pipeline.intent.apply(doc, id, tb, 7, 11);
    const written = changed_attrs(before, attr_map(doc, id));
    expect(written).toContain("transform");
    const covered = raw_names(baseline);
    for (const name of written) expect(covered).toContain(name);
  });
});
