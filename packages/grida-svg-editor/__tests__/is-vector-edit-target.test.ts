// SvgDocument.is_vector_edit_target — eligibility gate for vector
// (vertex) editing on <path> / <polyline> / <polygon> and the promotable
// primitives <rect> / <circle> / <ellipse> (which re-type to <path> on the
// first edit; see docs/wg/feat-svg-editor/promote-to-path.md).
//
// Sibling test file to document-structural-predicates.test.ts; covers the
// eligibility surface and the rejection of every non-eligible tag (so the
// "line/image/use are deferred" stance is locked in code).

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";

function doc(svg: string): SvgDocument {
  return new SvgDocument(svg);
}

function id_of_first(d: SvgDocument, tag: string): string {
  for (const id of d.all_elements()) {
    if (d.tag_of(id) === tag) return id;
  }
  throw new Error(`no <${tag}> in document`);
}

describe("SvgDocument.is_vector_edit_target — accepts", () => {
  it("accepts <path> with a non-empty d", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10"/></svg>`
    );
    const src = d.is_vector_edit_target(id_of_first(d, "path"));
    expect(src).toMatchObject({ kind: "path", d: "M0 0 L10 10" });
  });

  it("accepts <polyline> with ≥ 2 points and emits [x,y] tuples", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0,0 10,0 10,10"/></svg>`
    );
    const src = d.is_vector_edit_target(id_of_first(d, "polyline"));
    expect(src).toEqual({
      kind: "polyline",
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
    });
  });

  it("accepts <line> and carries its two endpoints", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="2" x2="3" y2="4"/></svg>`
    );
    expect(d.is_vector_edit_target(id_of_first(d, "line"))).toEqual({
      kind: "line",
      x1: 1,
      y1: 2,
      x2: 3,
      y2: 4,
    });
  });

  it("accepts <polygon> with ≥ 2 points", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 10,0 5,8"/></svg>`
    );
    const src = d.is_vector_edit_target(id_of_first(d, "polygon"));
    expect(src).toEqual({
      kind: "polygon",
      points: [
        [0, 0],
        [10, 0],
        [5, 8],
      ],
    });
  });

  it("parses points robustly through mixed whitespace and commas", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0 0, 10 0  10,10"/></svg>`
    );
    const src = d.is_vector_edit_target(id_of_first(d, "polyline"));
    expect(src).toEqual({
      kind: "polyline",
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
    });
  });

  // Promotable primitives — eligible from the promote-to-path slice. They
  // enter vector-edit and re-type to <path> on the first committed gesture
  // (see docs/wg/feat-svg-editor/promote-to-path.md). The source carries
  // native geometry in local space.
  it("accepts <circle> and carries cx/cy/r", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="6" r="3"/></svg>`
    );
    expect(d.is_vector_edit_target(id_of_first(d, "circle"))).toEqual({
      kind: "circle",
      cx: 5,
      cy: 6,
      r: 3,
    });
  });

  it("accepts <ellipse> and carries cx/cy/rx/ry", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><ellipse cx="5" cy="6" rx="3" ry="2"/></svg>`
    );
    expect(d.is_vector_edit_target(id_of_first(d, "ellipse"))).toEqual({
      kind: "ellipse",
      cx: 5,
      cy: 6,
      rx: 3,
      ry: 2,
    });
  });

  it("accepts <rect> with square corners (rx/ry default to 0)", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect x="1" y="2" width="10" height="8"/></svg>`
    );
    expect(d.is_vector_edit_target(id_of_first(d, "rect"))).toEqual({
      kind: "rect",
      x: 1,
      y: 2,
      width: 10,
      height: 8,
      rx: 0,
      ry: 0,
    });
  });

  it("accepts plain-number geometry in exponent, leading-dot, and signed forms", () => {
    // `1e2` = 100, `.5`, and `+3` are valid SVG user-unit numbers.
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="+3" cy=".5" r="1e2"/></svg>`
    );
    expect(d.is_vector_edit_target(id_of_first(d, "circle"))).toEqual({
      kind: "circle",
      cx: 3,
      cy: 0.5,
      r: 100,
    });
  });

  it("accepts a rounded <rect>, mirroring a single rx onto ry and clamping to half-extent", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="8" rx="3"/></svg>`
    );
    // rx given, ry absent → ry mirrors rx. Both within half-extent here.
    expect(d.is_vector_edit_target(id_of_first(d, "rect"))).toEqual({
      kind: "rect",
      x: 0,
      y: 0,
      width: 10,
      height: 8,
      rx: 3,
      ry: 3,
    });

    const clamped = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="8" rx="999" ry="999"/></svg>`
    );
    // Over-large radii clamp to width/2 (5) and height/2 (4) respectively.
    expect(clamped.is_vector_edit_target(id_of_first(clamped, "rect"))).toEqual(
      {
        kind: "rect",
        x: 0,
        y: 0,
        width: 10,
        height: 8,
        rx: 5,
        ry: 4,
      }
    );
  });
});

describe("SvgDocument.is_vector_edit_target — rejects", () => {
  it("rejects <path> with empty d", () => {
    const d = doc(`<svg xmlns="http://www.w3.org/2000/svg"><path d=""/></svg>`);
    expect(d.is_vector_edit_target(id_of_first(d, "path"))).toBeNull();
  });

  it("rejects <path> with whitespace-only d", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="   "/></svg>`
    );
    expect(d.is_vector_edit_target(id_of_first(d, "path"))).toBeNull();
  });

  it("rejects <path> with missing d", () => {
    const d = doc(`<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>`);
    expect(d.is_vector_edit_target(id_of_first(d, "path"))).toBeNull();
  });

  it("rejects <polyline> with < 2 points", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="5,5"/></svg>`
    );
    expect(d.is_vector_edit_target(id_of_first(d, "polyline"))).toBeNull();
  });

  it("rejects <polyline> with empty points", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polyline points=""/></svg>`
    );
    expect(d.is_vector_edit_target(id_of_first(d, "polyline"))).toBeNull();
  });

  it("rejects <polygon> with < 2 points", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polygon points=""/></svg>`
    );
    expect(d.is_vector_edit_target(id_of_first(d, "polygon"))).toBeNull();
  });

  // Deferred-tags lock — tags still out of scope. `<image>` / `<use>` are
  // raster / reference boxes with no editable outline. If either flips to
  // non-null, scope has drifted and the doctrine docs need to land first.
  for (const tag of ["image", "use"] as const) {
    it(`rejects <${tag}>`, () => {
      const markup =
        tag === "image"
          ? `<image x="0" y="0" width="10" height="10"/>`
          : `<use href="#x" x="0" y="0" width="10" height="10"/>`;
      const d = doc(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`);
      expect(d.is_vector_edit_target(id_of_first(d, tag))).toBeNull();
    });
  }

  it("rejects a degenerate (zero-length) <line>", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><line x1="5" y1="5" x2="5" y2="5"/></svg>`
    );
    expect(d.is_vector_edit_target(id_of_first(d, "line"))).toBeNull();
  });

  // Degenerate / non-promotable primitive geometry.
  it("rejects <circle> with non-positive or missing r", () => {
    for (const markup of [
      `<circle cx="5" cy="5" r="0"/>`,
      `<circle cx="5" cy="5" r="-3"/>`,
      `<circle cx="5" cy="5"/>`,
    ]) {
      const d = doc(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`);
      expect(d.is_vector_edit_target(id_of_first(d, "circle"))).toBeNull();
    }
  });

  it("rejects <rect> with zero/missing width or height", () => {
    for (const markup of [
      `<rect x="0" y="0" width="0" height="8"/>`,
      `<rect x="0" y="0" height="8"/>`,
      `<rect x="0" y="0" width="10"/>`,
    ]) {
      const d = doc(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`);
      expect(d.is_vector_edit_target(id_of_first(d, "rect"))).toBeNull();
    }
  });

  // Unit / percentage geometry is an out-of-scope gap — the editor refuses
  // a promotion it cannot perform faithfully rather than mis-converting.
  it("rejects primitives whose geometry is not a plain user-unit number", () => {
    const pct = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="50%"/></svg>`
    );
    expect(pct.is_vector_edit_target(id_of_first(pct, "circle"))).toBeNull();

    const px = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10px" height="8"/></svg>`
    );
    expect(px.is_vector_edit_target(id_of_first(px, "rect"))).toBeNull();

    const em = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><ellipse cx="5" cy="5" rx="3em" ry="2"/></svg>`
    );
    expect(em.is_vector_edit_target(id_of_first(em, "ellipse"))).toBeNull();
  });

  // The *optional* position coords (line x1/y1/x2/y2, rect x/y, circle /
  // ellipse cx/cy) default to 0 when absent, but a present-but-unparseable
  // value (unit / percent) must still disqualify — otherwise `?? 0` would
  // silently coerce an authored `x1="5px"` to 0 and overwrite it on the
  // first native writeback.
  it("rejects shapes whose present optional coord is unit-bearing", () => {
    for (const markup of [
      `<line x1="5px" y1="0" x2="10" y2="0"/>`,
      `<line x1="0" y1="0" x2="10" y2="5%"/>`,
      `<rect x="2em" y="0" width="10" height="8"/>`,
      `<rect x="0" y="3px" width="10" height="8"/>`,
      `<circle cx="50%" cy="5" r="3"/>`,
      `<ellipse cx="5" cy="2em" rx="3" ry="2"/>`,
      `<rect x="0" y="0" width="10" height="8" rx="2px"/>`,
    ]) {
      const d = doc(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`);
      const tag = markup.slice(1, markup.indexOf(" "));
      expect(d.is_vector_edit_target(id_of_first(d, tag))).toBeNull();
    }
  });

  // Absent optional coords legitimately default to 0 — the shape stays
  // eligible (this is the case the unit guard must NOT over-reject).
  it("accepts shapes that omit optional coords (SVG-default 0)", () => {
    const c = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle r="3"/></svg>`
    );
    const cs = c.is_vector_edit_target(id_of_first(c, "circle"));
    expect(cs).toEqual({ kind: "circle", cx: 0, cy: 0, r: 3 });

    const r = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="8"/></svg>`
    );
    expect(r.is_vector_edit_target(id_of_first(r, "rect"))).toEqual({
      kind: "rect",
      x: 0,
      y: 0,
      width: 10,
      height: 8,
      rx: 0,
      ry: 0,
    });
  });

  it("rejects containers and non-geometric tags", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><g><text>hi</text></g></svg>`
    );
    expect(d.is_vector_edit_target(id_of_first(d, "g"))).toBeNull();
    expect(d.is_vector_edit_target(id_of_first(d, "text"))).toBeNull();
  });
});

describe("path-only narrowing via is_vector_edit_target", () => {
  // The narrow predicate `is_vector_edit_target` was deleted because the
  // single-line substitute below is honest and avoids a second method
  // whose only purpose was to be re-checked here. This test pins the
  // substitute as the canonical path-only check.
  it("polyline is vector-editable but does NOT narrow to path", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0,0 10,10"/></svg>`
    );
    const id = id_of_first(d, "polyline");
    const src = d.is_vector_edit_target(id);
    expect(src).not.toBeNull();
    expect(src?.kind).not.toBe("path");
  });

  it("path narrows correctly", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10"/></svg>`
    );
    const id = id_of_first(d, "path");
    expect(d.is_vector_edit_target(id)?.kind).toBe("path");
  });
});
