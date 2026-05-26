// V1 vector-edit on the vertex-chain tags (<polyline>, <polygon>).
//
// `<line>` is intentionally NOT a vector-edit target in v1 (it would
// require promotion to <polyline> on insert-vertex or to <path> on
// tangent), so its eligibility is covered by the deferred-tags lock in
// is-vector-edit-target.test.ts.
//
// Pins:
//   - PathModel.toNativeAttrs round-trip vs. both source kinds.
//   - source_to_session_d → fromSvgPathD → toNativeAttrs is identity
//     (in the all-zero-tangent, canonical-topology case).
//   - apply_session_d writes points= to the document (NOT d) and
//     refuses (returns false) when the model is no longer expressible
//     in the source tag.
//   - Document-level round-trip-if-no-change: parse → enter vector-edit
//     → exit-without-gesture → serialize is byte-identical (the enter
//     is non-mutating).

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import {
  PathModel,
  source_to_session_d,
  apply_session_d,
} from "../src/core/vector-edit";
import vn from "@grida/vn";

function doc(svg: string): SvgDocument {
  return new SvgDocument(svg);
}

function id_of_first(d: SvgDocument, tag: string): string {
  for (const id of d.all_elements()) {
    if (d.tag_of(id) === tag) return id;
  }
  throw new Error(`no <${tag}> in document`);
}

describe("PathModel.toNativeAttrs", () => {
  describe("polyline", () => {
    it("recognises the canonical open chain", () => {
      const net = vn.fromPolyline([
        [0, 0],
        [10, 0],
        [10, 10],
      ]);
      const native = PathModel.fromVectorNetwork(net).toNativeAttrs("polyline");
      expect(native).toEqual({
        kind: "polyline",
        points: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
      });
    });

    it("survives a vertex translate (still expressible)", () => {
      const model = PathModel.fromVectorNetwork(
        vn.fromPolyline([
          [0, 0],
          [10, 0],
          [10, 10],
        ])
      ).translateVertex(1, [5, 0]);
      const native = model.toNativeAttrs("polyline");
      expect(native).toEqual({
        kind: "polyline",
        points: [
          [0, 0],
          [15, 0],
          [10, 10],
        ],
      });
    });

    it("refuses a closed-chain model (would be polygon)", () => {
      const net = vn.fromPolygon([
        [0, 0],
        [10, 0],
        [10, 10],
      ]);
      expect(
        PathModel.fromVectorNetwork(net).toNativeAttrs("polyline")
      ).toBeNull();
    });

    it("refuses when any tangent is non-zero", () => {
      const net: vn.VectorNetwork = {
        vertices: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        segments: [
          { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
          { a: 1, b: 2, ta: [3, 0], tb: [0, 0] },
        ],
      };
      expect(
        PathModel.fromVectorNetwork(net).toNativeAttrs("polyline")
      ).toBeNull();
    });
  });

  describe("polygon", () => {
    it("recognises the canonical closed chain", () => {
      const net = vn.fromPolygon([
        [0, 0],
        [10, 0],
        [10, 10],
      ]);
      const native = PathModel.fromVectorNetwork(net).toNativeAttrs("polygon");
      expect(native).toEqual({
        kind: "polygon",
        points: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
      });
    });

    it("refuses an open chain (would be polyline)", () => {
      const net = vn.fromPolyline([
        [0, 0],
        [10, 0],
        [10, 10],
      ]);
      expect(
        PathModel.fromVectorNetwork(net).toNativeAttrs("polygon")
      ).toBeNull();
    });
  });

  it("path source always returns null (no native fallback)", () => {
    const model = PathModel.fromSvgPathD("M0 0 L10 10");
    expect(model.toNativeAttrs("path")).toBeNull();
  });
});

describe("source_to_session_d → fromSvgPathD → toNativeAttrs", () => {
  it("polyline round-trips through session-d", () => {
    const source = {
      kind: "polyline" as const,
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
      ] as const,
    };
    const d = source_to_session_d(source);
    const reparsed = PathModel.fromSvgPathD(d).toNativeAttrs("polyline");
    expect(reparsed).toEqual(source);
  });

  it("polygon round-trips through session-d", () => {
    const source = {
      kind: "polygon" as const,
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
      ] as const,
    };
    const d = source_to_session_d(source);
    const reparsed = PathModel.fromSvgPathD(d).toNativeAttrs("polygon");
    expect(reparsed).toEqual(source);
  });

  it("path source's session-d is the verbatim authored string", () => {
    const source = { kind: "path" as const, d: "M0 0 L10 10 L10 20" };
    expect(source_to_session_d(source)).toBe("M0 0 L10 10 L10 20");
  });
});

describe("apply_session_d writes native attrs for vertex-chain sources", () => {
  it("polyline: writes points= (NOT d)", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0,0 10,0 10,10"/></svg>`
    );
    const id = id_of_first(d, "polyline");
    const source = d.is_vector_edit_target(id);
    expect(source).not.toBeNull();

    // Mutate one vertex via PathModel, emit, write back.
    const model = PathModel.fromVectorNetwork(
      vn.fromPolyline([
        [0, 0],
        [10, 0],
        [10, 10],
      ])
    ).translateVertex(1, [5, 0]);
    const new_d = model.toSvgPathD();

    const ok = apply_session_d(d, id, source!, new_d);
    expect(ok).toBe(true);
    // points= updated to the translated geometry (structural compare —
    // a substring match would let a wrong payload pass).
    expect(d.is_vector_edit_target(id)).toEqual({
      kind: "polyline",
      points: [
        [0, 0],
        [15, 0],
        [10, 10],
      ],
    });
    // No `d` attribute ever appears on a <polyline>.
    expect(d.get_attr(id, "d")).toBeNull();
  });

  it("polyline + tangent edit → returns false (v1 refuses, no promotion)", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0,0 10,0 10,10"/></svg>`
    );
    const id = id_of_first(d, "polyline");
    const source = d.is_vector_edit_target(id);

    // A non-zero tangent makes the model un-expressible in <polyline>.
    // setTangent takes a TangentRef `[vertex_idx, 0|1]` where 0 = ta on
    // the segment whose `a === vertex_idx` (i.e. the outgoing tangent
    // from this vertex). abs_pos is the new control-point world position.
    const bent = PathModel.fromVectorNetwork(
      vn.fromPolyline([
        [0, 0],
        [10, 0],
        [10, 10],
      ])
    ).setTangent([1, 0], [13, 3]);
    const new_d = bent.toSvgPathD();

    const before_points = d.get_attr(id, "points");
    const ok = apply_session_d(d, id, source!, new_d);
    expect(ok).toBe(false);
    // Document untouched on refusal.
    expect(d.get_attr(id, "points")).toBe(before_points);
    expect(d.get_attr(id, "d")).toBeNull();
  });

  it("path source: writes d through unchanged", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10"/></svg>`
    );
    const id = id_of_first(d, "path");
    const source = d.is_vector_edit_target(id);

    const ok = apply_session_d(d, id, source!, "M0 0 L20 20");
    expect(ok).toBe(true);
    expect(d.get_attr(id, "d")).toBe("M0 0 L20 20");
  });
});

describe("round-trip-if-no-change at the document level", () => {
  // The session's enter is non-mutating — building source_to_session_d
  // does not call doc.set_attr. So an enter followed by a no-edit exit
  // must leave the serialised output byte-identical, including comments,
  // attribute order, namespace prefixes, and any preserved trivia.
  //
  // We exercise this directly on the document (no DomSurface involved)
  // by parsing, simulating the enter (read source + build session-d),
  // and serialising. If the enter ever writes, this test catches it.
  for (const fixture of [
    `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0,0 10,0 10,10"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 10,0 5,8"/></svg>`,
    // Preserved trivia: attribute order, mixed separators, comments.
    `<svg xmlns="http://www.w3.org/2000/svg"><!-- keep --><polyline class="a" points="0 0, 10 10"/></svg>`,
    // <line> is not a vector-edit target in v1, but the byte-equal
    // invariant still holds — the enter pass simply skips it.
    `<svg xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="2" x2="3" y2="4"/></svg>`,
  ]) {
    it(`byte-equal: ${fixture.slice(0, 60)}…`, () => {
      const d = doc(fixture);
      // The "enter" side-effects we care about: predicate + session-d.
      // Both must be non-mutating.
      for (const id of d.all_elements()) {
        const source = d.is_vector_edit_target(id);
        if (source !== null) {
          void source_to_session_d(source);
        }
      }
      expect(d.serialize()).toBe(fixture);
    });
  }
});
