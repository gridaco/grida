// vector_apply / vector_revert — the session-aware commit chokepoint that
// promotes a primitive source to <path> on the first edit and demotes it on
// undo. Exercised here at the core (session + document) level, exactly as
// the DOM gesture handlers call it, with no DOM — proving the shell is thin.

import { describe, expect, it } from "vitest";
import { SvgDocument } from "../src/core/document";
import {
  VectorEditSession,
  source_to_session_d,
  vector_apply,
  vector_revert,
} from "../src/core/vector-edit";

function doc(svg: string): SvgDocument {
  return new SvgDocument(svg);
}

function id_of_first(d: SvgDocument, tag: string): string {
  for (const id of d.all_elements()) {
    if (d.tag_of(id) === tag) return id;
  }
  throw new Error(`no <${tag}> in document`);
}

function session_for(d: SvgDocument, id: string): VectorEditSession {
  const source = d.is_vector_edit_target(id);
  if (!source) throw new Error("not a vector-edit target");
  return new VectorEditSession(id, source, source_to_session_d(source));
}

describe("first vector edit promotes a primitive to <path>", () => {
  it("circle: vector_apply re-types the doc and flips the session source", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3" fill="red"/></svg>`
    );
    const id = id_of_first(d, "circle");
    const session = session_for(d, id);
    expect(session.source.kind).toBe("circle");

    const edited_d = "M8 5 C8 7 6 8 5 8 C4 8 2 7 2 5 Z";
    const token = vector_apply(d, session, edited_d);

    expect(token).not.toBeNull();
    expect(d.tag_of(id)).toBe("path");
    expect(session.source.kind).toBe("path");
    expect(d.serialize()).toContain('d="M8 5');
    expect(d.serialize()).toContain('fill="red"');
  });

  it("vector_revert demotes the doc and restores the session source", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3" fill="red"/></svg>`;
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "circle");
    const session = session_for(d, id);
    const baseline_d = session.current_d;

    const token = vector_apply(d, session, "M8 5 C8 7 6 8 5 8 Z");
    expect(d.tag_of(id)).toBe("path");

    vector_revert(d, session, baseline_d, token);

    expect(d.tag_of(id)).toBe("circle");
    expect(session.source.kind).toBe("circle");
    expect(d.serialize()).toBe(original);
  });

  it("a second edit after promotion writes d without re-promoting", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3"/></svg>`
    );
    const id = id_of_first(d, "circle");
    const session = session_for(d, id);

    const first = vector_apply(d, session, "M8 5 C8 7 6 8 5 8 Z");
    expect(first).not.toBeNull();
    const second = vector_apply(d, session, "M9 5 C9 7 6 9 5 9 Z");
    expect(second).toBeNull(); // already a <path>; no new promotion
    expect(d.tag_of(id)).toBe("path");
    expect(d.serialize()).toContain('d="M9 5');
  });

  it("a polygon source is unaffected — it writes native points, never promotes", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 10,0 10,10"/></svg>`
    );
    const id = id_of_first(d, "polygon");
    const session = session_for(d, id);
    // A vertex move keeps the canonical closed chain → writes back to points.
    const token = vector_apply(d, session, "M0 0 L12 0 L10 10 Z");
    expect(token).toBeNull();
    expect(d.tag_of(id)).toBe("polygon");
    expect(d.serialize()).toContain("points=");
  });

  it("rect and ellipse promote + revert through vector_apply/vector_revert", () => {
    for (const markup of [
      `<rect x="0" y="0" width="10" height="8" rx="2" fill="green"/>`,
      `<ellipse cx="5" cy="6" rx="3" ry="2" fill="green"/>`,
    ]) {
      const d = doc(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`);
      const original = d.serialize();
      const id = d.all_elements().find((n) => d.tag_of(n) !== "svg")!;
      const session = session_for(d, id);
      const baseline_d = session.current_d;

      const token = vector_apply(d, session, "M1 1 C2 2 3 3 4 4 Z");
      expect(token).not.toBeNull();
      expect(d.tag_of(id)).toBe("path");
      expect(session.source.kind).toBe("path");

      vector_revert(d, session, baseline_d, token);
      expect(d.tag_of(id)).not.toBe("path");
      expect(session.source.kind).not.toBe("path");
      expect(d.serialize()).toBe(original);
    }
  });

  it("vector_revert with a null token on an unpromoted primitive is a no-op", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3"/></svg>`;
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "circle");
    const session = session_for(d, id);
    // No vector_apply ran (the user entered edit but never committed a gesture).
    vector_revert(d, session, session.current_d, null);
    expect(d.serialize()).toBe(original);
    expect(session.source.kind).toBe("circle");
  });
});

describe("vertex tags: native edits stay native, curves re-type to <path>", () => {
  it("polyline: a straight vertex move stays a <polyline> (writes points, no re-type)", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0,0 10,0 10,10"/></svg>`
    );
    const id = id_of_first(d, "polyline");
    const session = session_for(d, id);
    // Straight, canonical open chain with one vertex moved.
    const token = vector_apply(d, session, "M0 0 L12 0 L10 10");
    expect(token).toBeNull();
    expect(d.tag_of(id)).toBe("polyline");
    expect(session.source.kind).toBe("polyline");
    expect(d.get_attr(id, "points")).toBe("0,0 12,0 10,10");
    expect(d.get_attr(id, "d")).toBeNull();
  });

  it("polyline: introducing a curve re-types to <path>, and revert restores the polyline", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0,0 10,0 10,10" stroke="red"/></svg>`;
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "polyline");
    const session = session_for(d, id);
    const baseline_d = session.current_d;

    // A non-zero tangent on the first segment → not expressible as polyline.
    const token = vector_apply(d, session, "M0 0 C2 2 8 0 10 0 L10 10");
    expect(token).not.toBeNull();
    expect(d.tag_of(id)).toBe("path");
    expect(session.source.kind).toBe("path");
    expect(d.get_attr(id, "points")).toBeNull();
    expect(d.serialize()).toContain('stroke="red"');

    vector_revert(d, session, baseline_d, token);
    expect(d.tag_of(id)).toBe("polyline");
    expect(session.source.kind).toBe("polyline");
    expect(d.serialize()).toBe(original);
  });

  it("polygon: a curve re-types to <path>; revert restores the polygon", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 10,0 5,8"/></svg>`;
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "polygon");
    const session = session_for(d, id);
    const baseline_d = session.current_d;

    const token = vector_apply(d, session, "M0 0 C2 2 8 0 10 0 L5 8 Z");
    expect(token).not.toBeNull();
    expect(d.tag_of(id)).toBe("path");

    vector_revert(d, session, baseline_d, token);
    expect(d.tag_of(id)).toBe("polygon");
    expect(d.serialize()).toBe(original);
  });

  it("line: dragging an endpoint stays a <line> (writes x1/y1/x2/y2, no re-type)", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="2" x2="3" y2="4"/></svg>`
    );
    const id = id_of_first(d, "line");
    const session = session_for(d, id);
    const token = vector_apply(d, session, "M1 2 L9 8");
    expect(token).toBeNull();
    expect(d.tag_of(id)).toBe("line");
    expect(d.get_attr(id, "x2")).toBe("9");
    expect(d.get_attr(id, "y2")).toBe("8");
    expect(d.get_attr(id, "d")).toBeNull();
  });

  it("line: curving re-types to <path>; revert restores the line", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="2" x2="3" y2="4"/></svg>`;
    const d = doc(svg);
    const original = d.serialize();
    const id = id_of_first(d, "line");
    const session = session_for(d, id);
    const baseline_d = session.current_d;

    const token = vector_apply(d, session, "M1 2 C2 2 3 3 3 4");
    expect(token).not.toBeNull();
    expect(d.tag_of(id)).toBe("path");

    vector_revert(d, session, baseline_d, token);
    expect(d.tag_of(id)).toBe("line");
    expect(d.serialize()).toBe(original);
  });

  it("line: adding a vertex (3 points) escapes the native form → <path>", () => {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="10" y2="0"/></svg>`
    );
    const id = id_of_first(d, "line");
    const session = session_for(d, id);
    // A third vertex → no longer a 2-point line → re-type to path.
    const token = vector_apply(d, session, "M0 0 L5 0 L10 0");
    expect(token).not.toBeNull();
    expect(d.tag_of(id)).toBe("path");
  });
});

describe("VectorEditSession source flip (promote_source_to_path / restore_source)", () => {
  function circle_session(): VectorEditSession {
    const d = doc(
      `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3"/></svg>`
    );
    return session_for(d, id_of_first(d, "circle"));
  }

  it("flips primitive→path once, and is idempotent on a second flip", () => {
    const s = circle_session();
    expect(s.source.kind).toBe("circle");
    s.promote_source_to_path();
    expect(s.source.kind).toBe("path");
    // Second flip must not clobber the captured pre-promotion source.
    s.promote_source_to_path();
    expect(s.source.kind).toBe("path");
    s.restore_source();
    expect(s.source).toEqual({ kind: "circle", cx: 5, cy: 5, r: 3 });
  });

  it("restore_source is a no-op when never promoted", () => {
    const s = circle_session();
    s.restore_source();
    expect(s.source.kind).toBe("circle");
  });
});
