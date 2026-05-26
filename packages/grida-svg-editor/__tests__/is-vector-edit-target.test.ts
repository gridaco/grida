// SvgDocument.is_vector_edit_target — eligibility gate for vector
// (vertex) editing on <path> / <polyline> / <polygon>.
//
// Sibling test file to document-structural-predicates.test.ts; covers
// the v1 vector-edit eligibility surface and the rejection of every
// non-eligible tag (so the "line/rect/circle/ellipse/image/use are
// deferred" stance is locked in code).

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

  // Deferred-tags lock — every tag the v1 plan documents as out of scope.
  // If any of these flip to non-null, the plan's scope has drifted and
  // the doctrine docs (Policy Class Table 2/3) need to land first.
  //
  // `<line>` lives here too: a line has no in-tag vertex-edit gestures
  // (insert-vertex would promote to <polyline>, tangent would promote to
  // <path>), and v1 does not implement promotion — so opening it in
  // vector-edit would advertise capabilities that don't work.
  for (const tag of [
    "line",
    "rect",
    "circle",
    "ellipse",
    "image",
    "use",
  ] as const) {
    it(`rejects <${tag}>`, () => {
      const markup =
        tag === "line"
          ? `<line x1="0" y1="0" x2="10" y2="0"/>`
          : tag === "rect"
            ? `<rect x="0" y="0" width="10" height="10"/>`
            : tag === "circle"
              ? `<circle cx="5" cy="5" r="3"/>`
              : tag === "ellipse"
                ? `<ellipse cx="5" cy="5" rx="3" ry="2"/>`
                : tag === "image"
                  ? `<image x="0" y="0" width="10" height="10"/>`
                  : `<use href="#x" x="0" y="0" width="10" height="10"/>`;
      const d = doc(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`);
      expect(d.is_vector_edit_target(id_of_first(d, tag))).toBeNull();
    });
  }

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
