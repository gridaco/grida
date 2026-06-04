// promote-to-path — the lazy primitive→<path> conversion that powers vector
// editing of <rect> / <circle> / <ellipse>.
//
// Core, DOM-free coverage of three contracts from
// docs/wg/feat-svg-editor/promote-to-path.md:
//   - source_to_session_d builds the path-form geometry (cubic conics, a
//     closed rect outline) the overlay/session run on.
//   - retype_to_path re-types the element, consuming its geometry attrs.
//   - revert_retype restores the original primitive byte-for-byte.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import { source_to_session_d, PathModel } from "../src/core/vector-edit";

function doc(svg: string): SvgDocument {
  return new SvgDocument(svg);
}

function id_of_first(d: SvgDocument, tag: string): string {
  for (const id of d.all_elements()) {
    if (d.tag_of(id) === tag) return id;
  }
  throw new Error(`no <${tag}> in document`);
}

function approx(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

describe("source_to_session_d — promotable primitives", () => {
  it("circle → four cubic segments forming a closed loop matching the bbox", () => {
    const d = source_to_session_d({ kind: "circle", cx: 10, cy: 10, r: 5 });
    const m = PathModel.fromSvgPathD(d);
    expect(m.vertexCount()).toBe(4);
    expect(m.segmentCount()).toBe(4);
    // Every segment carries a non-zero tangent → genuine cubic (not lines).
    for (const s of m.snapshot().segments) {
      const curved =
        s.ta[0] !== 0 || s.ta[1] !== 0 || s.tb[0] !== 0 || s.tb[1] !== 0;
      expect(curved).toBe(true);
    }
    const bb = m.bbox();
    expect(approx(bb.x, 5)).toBe(true);
    expect(approx(bb.y, 5)).toBe(true);
    expect(approx(bb.width, 10)).toBe(true);
    expect(approx(bb.height, 10)).toBe(true);
  });

  it("ellipse → four cubic segments matching the bbox", () => {
    const d = source_to_session_d({
      kind: "ellipse",
      cx: 10,
      cy: 20,
      rx: 6,
      ry: 4,
    });
    const m = PathModel.fromSvgPathD(d);
    expect(m.segmentCount()).toBe(4);
    const bb = m.bbox();
    expect(approx(bb.width, 12)).toBe(true);
    expect(approx(bb.height, 8)).toBe(true);
  });

  it("square-cornered rect → four straight segments (no tangents)", () => {
    const d = source_to_session_d({
      kind: "rect",
      x: 1,
      y: 2,
      width: 10,
      height: 8,
      rx: 0,
      ry: 0,
    });
    const m = PathModel.fromSvgPathD(d);
    expect(m.segmentCount()).toBe(4);
    for (const s of m.snapshot().segments) {
      expect(s.ta).toEqual([0, 0]);
      expect(s.tb).toEqual([0, 0]);
    }
    const bb = m.bbox();
    expect(approx(bb.x, 1)).toBe(true);
    expect(approx(bb.y, 2)).toBe(true);
    expect(approx(bb.width, 10)).toBe(true);
    expect(approx(bb.height, 8)).toBe(true);
  });
});

describe("SvgDocument.retype_to_path", () => {
  it("re-types <circle> to <path>, consuming geometry and setting d", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3" fill="red"/></svg>`
    );
    const id = id_of_first(d, "circle");
    const session_d = source_to_session_d({
      kind: "circle",
      cx: 5,
      cy: 5,
      r: 3,
    });
    const token = d.retype_to_path(id, session_d);
    expect(token).not.toBeNull();

    expect(d.tag_of(id)).toBe("path");
    const out = d.serialize();
    expect(out).toContain("<path");
    expect(out).not.toContain("<circle");
    expect(out).toContain('d="');
    // Geometry attrs consumed; non-geometry attr preserved.
    expect(out).not.toMatch(/\bcx=/);
    expect(out).not.toMatch(/\br=/);
    expect(out).toContain('fill="red"');
  });

  it("is idempotent — a second promote on the now-<path> returns null", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3"/></svg>`
    );
    const id = id_of_first(d, "circle");
    expect(d.retype_to_path(id, "M0 0")).not.toBeNull();
    const before = d.serialize();
    expect(d.retype_to_path(id, "M9 9")).toBeNull();
    // No mutation on the no-op call.
    expect(d.serialize()).toBe(before);
  });

  it("returns null for an already-<path> node (nothing to re-type)", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L1 1"/></svg>`
    );
    expect(d.retype_to_path(id_of_first(d, "path"), "M0 0")).toBeNull();
  });

  it("re-types a vertex tag (<polygon>) — its `points` is consumed for `d`", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 1,0 1,1"/></svg>`
    );
    const id = id_of_first(d, "polygon");
    const token = d.retype_to_path(id, "M0 0 C0 0 1 0 1 1 Z");
    expect(token).not.toBeNull();
    expect(d.tag_of(id)).toBe("path");
    const out = d.serialize();
    expect(out).toContain("<path");
    expect(out).not.toMatch(/\bpoints=/);
    d.revert_retype(id, token!);
    expect(d.tag_of(id)).toBe("polygon");
    expect(d.serialize()).toContain('points="0,0 1,0 1,1"');
  });
});

describe("revert_retype — byte-equal round-trip", () => {
  // The headline P1 invariant: promote then revert leaves the document
  // identical to its input — trivia, attribute order, quote styles, comments,
  // and unknown-namespace attributes all intact.
  it("restores the original primitive verbatim, including trivia", () => {
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg">`,
      `  <!-- a circle -->`,
      `  <circle fill='red' cx="5"  cy='6'   r="3" inkscape:label="dot" class="brand"/>`,
      `</svg>`,
    ].join("\n");
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "circle");

    const token = d.retype_to_path(id, "M8 5 C8 6 6 8 5 8 C4 8 2 6 2 5 Z");
    expect(token).not.toBeNull();
    expect(d.serialize()).not.toBe(original); // really mutated
    expect(d.tag_of(id)).toBe("path");

    d.revert_retype(id, token!);
    expect(d.serialize()).toBe(original);
    expect(d.tag_of(id)).toBe("circle");
  });

  it("round-trips a rect with mixed geometry-attr ordering", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" x="1" height="8" y="2" rx="2" data-id="r1"/></svg>`;
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "rect");
    const token = d.retype_to_path(id, "M3 2 L11 2 L11 10 L1 10 Z");
    expect(token).not.toBeNull();
    d.revert_retype(id, token!);
    expect(d.serialize()).toBe(original);
  });

  it("round-trips an <ellipse> (directional rx/ry geometry)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><ellipse cx="5" cy="6" rx="3" ry="2" stroke="blue"/></svg>`;
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "ellipse");
    const token = d.retype_to_path(id, "M8 6 C8 7 6 8 5 8 Z");
    expect(token).not.toBeNull();
    expect(d.serialize()).not.toBe(original);
    d.revert_retype(id, token!);
    expect(d.serialize()).toBe(original);
  });

  it("preserves a namespace prefix (<svg:circle> ↔ <svg:path>) and round-trips", () => {
    const svg = `<svg:svg xmlns:svg="http://www.w3.org/2000/svg"><svg:circle cx="5" cy="5" r="3"/></svg:svg>`;
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "circle");
    const token = d.retype_to_path(id, "M8 5 C8 6 6 8 5 8 Z");
    expect(token).not.toBeNull();
    // Re-types to the prefixed path, not a bare <path>.
    expect(d.serialize()).toContain("<svg:path");
    expect(d.serialize()).not.toContain("<svg:circle");
    d.revert_retype(id, token!);
    expect(d.serialize()).toBe(original);
  });

  it("round-trips a non-self-closing primitive (<circle></circle>)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3"></circle></svg>`;
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "circle");
    const token = d.retype_to_path(id, "M8 5 C8 6 6 8 5 8 Z");
    expect(token).not.toBeNull();
    d.revert_retype(id, token!);
    expect(d.serialize()).toBe(original);
  });

  it("carries transform / style / unknown-namespace attrs across promotion", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3" transform="rotate(10 5 5)" style="fill:blue" sketch:type="oval"/></svg>`;
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "circle");
    const token = d.retype_to_path(id, "M8 5 C8 6 6 8 5 8 Z");
    expect(token).not.toBeNull();
    const out = d.serialize();
    expect(out).toContain('transform="rotate(10 5 5)"');
    expect(out).toContain('style="fill:blue"');
    expect(out).toContain('sketch:type="oval"');
    expect(out).not.toMatch(/\bcx=/);
    d.revert_retype(id, token!);
    expect(d.serialize()).toBe(original);
  });

  it("rounded-rect session-d uses arcs that round-trip through PathModel", () => {
    const session_d = source_to_session_d({
      kind: "rect",
      x: 0,
      y: 0,
      width: 10,
      height: 8,
      rx: 3,
      ry: 2,
    });
    // PathModel parses the arc-based d without throwing and the outline's
    // bbox matches the rect bounds.
    const m = PathModel.fromSvgPathD(session_d);
    expect(m.segmentCount()).toBeGreaterThan(0);
    const bb = m.bbox();
    expect(Math.abs(bb.x - 0)).toBeLessThan(1e-6);
    expect(Math.abs(bb.y - 0)).toBeLessThan(1e-6);
    expect(Math.abs(bb.width - 10)).toBeLessThan(1e-6);
    expect(Math.abs(bb.height - 8)).toBeLessThan(1e-6);
  });
});

describe("retype_to_path — <line> fill fidelity", () => {
  // A <line> has no fill region, so its fill never paints. A <path> fills
  // (open paths close implicitly for fill), so a naive re-type would make a
  // curved line suddenly show the default black fill. The re-type pins
  // fill="none" to preserve the line's stroke-only appearance.
  it('adds fill="none" when the line declares no fill, and revert removes it', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><line x1="40" y1="270" x2="120" y2="190" stroke="#06b6d4" stroke-width="7"/></svg>`;
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "line");

    const token = d.retype_to_path(id, "M40 270 C60 240 100 220 120 190");
    expect(token).not.toBeNull();
    const out = d.serialize();
    expect(out).toContain("<path");
    expect(out).toContain('fill="none"');
    expect(out).toContain('stroke="#06b6d4"'); // stroke carried over

    d.revert_retype(id, token!);
    expect(d.serialize()).toBe(original); // fill="none" removed → byte-equal
    expect(d.tag_of(id)).toBe("line");
  });

  it("respects an explicit fill on the line (does not add a second fill)", () => {
    // Explicit fill on a line is meaningless (invisible) but authored; keep it.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="10" y2="10" fill="red" stroke="blue"/></svg>`;
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "line");

    const token = d.retype_to_path(id, "M0 0 C1 1 2 2 10 10");
    expect(token).not.toBeNull();
    const out = d.serialize();
    expect(out).toContain('fill="red"');
    expect(out).not.toContain('fill="none"');

    d.revert_retype(id, token!);
    expect(d.serialize()).toBe(original);
  });

  it('respects a fill declared via inline style (no synthetic fill="none")', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="10" y2="10" style="fill:red" stroke="blue"/></svg>`;
    const d = doc(svg);
    const id = id_of_first(d, "line");
    const token = d.retype_to_path(id, "M0 0 C1 1 2 2 10 10");
    expect(token).not.toBeNull();
    expect(d.serialize()).not.toContain('fill="none"');
  });

  it("only <line> gets the fill guard — a <polyline> never does", () => {
    // Polyline fills consistently with path (open, implicit close), so no
    // synthetic fill is needed; its appearance is preserved by default.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0,0 10,0 10,10"/></svg>`;
    const d = doc(svg);
    const id = id_of_first(d, "polyline");
    const token = d.retype_to_path(id, "M0 0 C2 2 8 0 10 0 L10 10");
    expect(token).not.toBeNull();
    expect(d.serialize()).not.toContain('fill="none"');
  });
});

describe("is_vector_edit_target — malformed primitive carrying a d", () => {
  // A primitive with a pre-authored unprefixed `d` is malformed SVG; promoting
  // it would append a second `d`. Refuse at the gate so the edit session never
  // operates on a duplicate-`d` element.
  it("refuses <circle>/<rect>/<ellipse> that already carry an unprefixed d", () => {
    const c = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3" d="M0 0"/></svg>`
    );
    expect(c.is_vector_edit_target(id_of_first(c, "circle"))).toBeNull();
    const r = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="8" d="M0 0"/></svg>`
    );
    expect(r.is_vector_edit_target(id_of_first(r, "rect"))).toBeNull();
    const e = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><ellipse cx="5" cy="5" rx="3" ry="2" d="M0 0"/></svg>`
    );
    expect(e.is_vector_edit_target(id_of_first(e, "ellipse"))).toBeNull();
  });

  // The vertex tags re-type to <path> on a curve edit, and the re-type only
  // strips the tag's own geometry attrs (`points` / `x1,y1,…`) — not a stray
  // `d`. A pre-authored `d` would therefore survive into a duplicate-`d`
  // <path>, so they must be refused at the gate too (same hazard as the
  // promotable primitives above).
  it("refuses <line>/<polyline>/<polygon> that already carry an unprefixed d", () => {
    const l = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="10" y2="10" d="M0 0"/></svg>`
    );
    expect(l.is_vector_edit_target(id_of_first(l, "line"))).toBeNull();
    const pl = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0,0 10,10" d="M0 0"/></svg>`
    );
    expect(pl.is_vector_edit_target(id_of_first(pl, "polyline"))).toBeNull();
    const pg = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 10,10 5,15" d="M0 0"/></svg>`
    );
    expect(pg.is_vector_edit_target(id_of_first(pg, "polygon"))).toBeNull();
  });

  // A prefixed `d` (e.g. `custom:d`) is NOT the path geometry attr — the
  // gate keys on unprefixed `d` only, so such an element stays eligible.
  it("still accepts a primitive whose only d is namespace-prefixed", () => {
    const c = doc(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="urn:x"><circle cx="5" cy="5" r="3" x:d="M0 0"/></svg>`
    );
    expect(c.is_vector_edit_target(id_of_first(c, "circle"))).not.toBeNull();
  });
});
