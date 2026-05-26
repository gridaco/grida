// Public-surface contract for `PathModel`.
//
// `PathModel` is re-exported from the package's top-level entry as a
// Layer-A geometry primitive for callers that want canonical SVG path
// geometry without mounting an editor. These tests lock the externally-
// observable contract of that re-export — independent of any caller —
// so that internal refactors that would silently break the public
// surface fail here first.
//
// The import path is the package's PUBLIC entry (`src/index`), NOT the
// internal module. These tests would not catch a regression if they
// reached for `src/core/...` directly — the whole point of the contract
// is that the symbols are visible at the top-level barrel.

import { describe, expect, it } from "vitest";
import { PathModel } from "../src/index";
import type { PathSnapshot, SegmentId, Verb, VertexId } from "../src/index";

describe("PathModel — public re-export from package entry", () => {
  it("is a constructible class with a static `fromSvgPathD` factory", () => {
    expect(typeof PathModel).toBe("function");
    expect(typeof PathModel.fromSvgPathD).toBe("function");
  });

  it("fromSvgPathD parses a closed polyline path; counts match the d-string", () => {
    const m = PathModel.fromSvgPathD("M 10 10 L 100 10 L 100 100 L 10 100 Z");
    expect(m.vertexCount()).toBe(4);
    expect(m.segmentCount()).toBe(4);
  });

  it("is constructible without any document, editor, or surface context", () => {
    // The constructor path must not require any host-side state. The
    // call below runs in a plain Node test process with no DOM, no
    // editor, no document — if construction reaches for any of those,
    // this throws and the test fails.
    expect(() => PathModel.fromSvgPathD("M 0 0 L 10 10")).not.toThrow();

    const m = PathModel.fromSvgPathD("M 0 0 L 10 10");
    expect(m).toBeInstanceOf(PathModel);
  });

  it("snapshot() returns a POJO with vertices and segments arrays", () => {
    const m = PathModel.fromSvgPathD("M 0 0 L 10 10 L 20 0");
    const snap: PathSnapshot = m.snapshot();
    expect(Array.isArray(snap.vertices)).toBe(true);
    expect(Array.isArray(snap.segments)).toBe(true);
    expect(snap.vertices.length).toBe(m.vertexCount());
    expect(snap.segments.length).toBe(m.segmentCount());
    // Every segment exposes vertex-index endpoints plus tangent control
    // tuples — the canonical vector-network shape.
    for (const seg of snap.segments) {
      expect(typeof seg.a).toBe("number");
      expect(typeof seg.b).toBe("number");
      expect(seg.ta.length).toBe(2);
      expect(seg.tb.length).toBe(2);
    }
  });

  it("bbox() returns a numeric rectangle for a non-degenerate path", () => {
    const m = PathModel.fromSvgPathD("M 0 0 L 100 0 L 100 50 L 0 50 Z");
    const box = m.bbox();
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(100);
    expect(box.height).toBe(50);
  });

  it("toSvgPathD round-trips structurally through fromSvgPathD", () => {
    // Exact byte-equality of the d-string is NOT part of the contract —
    // the emitter is allowed to normalize spacing/encoding. What IS
    // contractually stable is that parsing the re-emitted d-string
    // yields a model with the same structural counts.
    const original = "M 0 0 C 10 0 20 10 20 20";
    const m = PathModel.fromSvgPathD(original);
    const re = PathModel.fromSvgPathD(m.toSvgPathD());
    expect(re.vertexCount()).toBe(m.vertexCount());
    expect(re.segmentCount()).toBe(m.segmentCount());
  });

  it("the publicly-named types resolve and are usable as type annotations", () => {
    // This test exists to keep the re-exported type names load-bearing.
    // If any of `PathSnapshot`, `Verb`, `VertexId`, `SegmentId` is
    // dropped from the public surface, this file fails to typecheck.
    const m = PathModel.fromSvgPathD("M 0 0 L 5 5");
    const snap: PathSnapshot = m.snapshot();
    const v: VertexId = snap.segments[0].a;
    const s: SegmentId = 0;
    const maybe_verb: Verb | undefined = snap.segments[0].source_verb;
    expect(typeof v).toBe("number");
    expect(typeof s).toBe("number");
    // `source_verb` is optional; both branches are allowed.
    expect(maybe_verb === undefined || typeof maybe_verb === "string").toBe(
      true
    );
  });
});
