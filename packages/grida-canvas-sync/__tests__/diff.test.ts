import { describe, it, expect } from "vitest";
import {
  computeDiff,
  applyDiff,
  composeDiffs,
  isDiffEmpty,
  jsonEqual,
  type DocumentState,
} from "../src/diff";
import type { DocumentDiff, SerializedNode } from "../src/protocol";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
  id: string,
  props: Record<string, unknown> = {}
): SerializedNode {
  return { type: "rectangle", id, ...props } as SerializedNode;
}

function emptyState(): DocumentState {
  return { nodes: {}, scenes: [] };
}

// ---------------------------------------------------------------------------
// jsonEqual
// ---------------------------------------------------------------------------

describe("jsonEqual", () => {
  it("primitives", () => {
    expect(jsonEqual(1, 1)).toBe(true);
    expect(jsonEqual("a", "a")).toBe(true);
    expect(jsonEqual(true, true)).toBe(true);
    expect(jsonEqual(null, null)).toBe(true);
    expect(jsonEqual(1, 2)).toBe(false);
    expect(jsonEqual("a", "b")).toBe(false);
    expect(jsonEqual(null, 0)).toBe(false);
  });

  it("arrays", () => {
    expect(jsonEqual([1, 2], [1, 2])).toBe(true);
    expect(jsonEqual([1, 2], [1, 3])).toBe(false);
    expect(jsonEqual([1], [1, 2])).toBe(false);
    expect(jsonEqual([], [])).toBe(true);
  });

  it("objects", () => {
    expect(jsonEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jsonEqual({}, {})).toBe(true);
  });

  it("nested", () => {
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeDiff
// ---------------------------------------------------------------------------

describe("computeDiff", () => {
  it("returns null for identical states", () => {
    const state: DocumentState = {
      nodes: { n1: makeNode("n1", { width: 100 }) },
      scenes: ["s1"],
    };
    expect(computeDiff(state, state)).toBeNull();
  });

  it("returns null for deep-equal states", () => {
    const a: DocumentState = {
      nodes: { n1: makeNode("n1", { width: 100, fill: { r: 1, g: 0, b: 0 } }) },
      scenes: ["s1"],
    };
    const b: DocumentState = {
      nodes: { n1: makeNode("n1", { width: 100, fill: { r: 1, g: 0, b: 0 } }) },
      scenes: ["s1"],
    };
    expect(computeDiff(a, b)).toBeNull();
  });

  it("detects added nodes", () => {
    const before = emptyState();
    const after: DocumentState = {
      nodes: { n1: makeNode("n1") },
      scenes: [],
    };
    const diff = computeDiff(before, after)!;
    expect(diff).not.toBeNull();
    expect(diff.nodes!["n1"]).toEqual({ op: "put", node: makeNode("n1") });
  });

  it("detects removed nodes", () => {
    const before: DocumentState = {
      nodes: { n1: makeNode("n1") },
      scenes: [],
    };
    const after = emptyState();
    const diff = computeDiff(before, after)!;
    expect(diff.nodes!["n1"]).toEqual({ op: "remove" });
  });

  it("detects field changes as patch", () => {
    const before: DocumentState = {
      nodes: { n1: makeNode("n1", { width: 100 }) },
      scenes: [],
    };
    const after: DocumentState = {
      nodes: { n1: makeNode("n1", { width: 200 }) },
      scenes: [],
    };
    const diff = computeDiff(before, after)!;
    expect(diff.nodes!["n1"]).toEqual({
      op: "patch",
      fields: { width: { op: "put", value: 200 } },
    });
  });

  it("detects deleted fields", () => {
    const before: DocumentState = {
      nodes: { n1: makeNode("n1", { width: 100, height: 50 }) },
      scenes: [],
    };
    const after: DocumentState = {
      nodes: { n1: makeNode("n1", { width: 100 }) },
      scenes: [],
    };
    const diff = computeDiff(before, after)!;
    expect(diff.nodes!["n1"]).toEqual({
      op: "patch",
      fields: { height: { op: "delete" } },
    });
  });

  it("detects type change as put (full replacement)", () => {
    const before: DocumentState = {
      nodes: { n1: makeNode("n1", { width: 100 }) },
      scenes: [],
    };
    const after: DocumentState = {
      nodes: {
        n1: { type: "ellipse", id: "n1", radius: 50 } as SerializedNode,
      },
      scenes: [],
    };
    const diff = computeDiff(before, after)!;
    expect(diff.nodes!["n1"].op).toBe("put");
  });

  it("detects scene reordering", () => {
    const before: DocumentState = {
      nodes: {},
      scenes: ["s1", "s2"],
    };
    const after: DocumentState = {
      nodes: {},
      scenes: ["s2", "s1"],
    };
    const diff = computeDiff(before, after)!;
    expect(diff.scenes).toEqual([{ op: "reorder", ids: ["s2", "s1"] }]);
  });

  it("detects scene additions", () => {
    const before: DocumentState = { nodes: {}, scenes: ["s1"] };
    const after: DocumentState = { nodes: {}, scenes: ["s1", "s2"] };
    const diff = computeDiff(before, after)!;
    expect(diff.scenes).toContainEqual({ op: "add", id: "s2" });
  });

  it("detects scene removals", () => {
    const before: DocumentState = { nodes: {}, scenes: ["s1", "s2"] };
    const after: DocumentState = { nodes: {}, scenes: ["s1"] };
    const diff = computeDiff(before, after)!;
    expect(diff.scenes).toContainEqual({ op: "remove", id: "s2" });
  });
});

// ---------------------------------------------------------------------------
// applyDiff
// ---------------------------------------------------------------------------

describe("applyDiff", () => {
  it("puts a new node", () => {
    const state = emptyState();
    const node = makeNode("n1", { width: 100 });
    const result = applyDiff(state, { nodes: { n1: { op: "put", node } } });
    expect(result.nodes["n1"]).toEqual(node);
  });

  it("patches an existing node", () => {
    const state: DocumentState = {
      nodes: { n1: makeNode("n1", { width: 100, height: 50 }) },
      scenes: [],
    };
    const result = applyDiff(state, {
      nodes: {
        n1: {
          op: "patch",
          fields: {
            width: { op: "put", value: 200 },
            height: { op: "delete" },
          },
        },
      },
    });
    expect(result.nodes["n1"]).toEqual(makeNode("n1", { width: 200 }));
  });

  it("removes a node", () => {
    const state: DocumentState = {
      nodes: { n1: makeNode("n1") },
      scenes: [],
    };
    const result = applyDiff(state, { nodes: { n1: { op: "remove" } } });
    expect(result.nodes["n1"]).toBeUndefined();
  });

  it("adds a scene", () => {
    const state: DocumentState = { nodes: {}, scenes: ["s1"] };
    const result = applyDiff(state, { scenes: [{ op: "add", id: "s2" }] });
    expect(result.scenes).toEqual(["s1", "s2"]);
  });

  it("removes a scene", () => {
    const state: DocumentState = { nodes: {}, scenes: ["s1", "s2"] };
    const result = applyDiff(state, { scenes: [{ op: "remove", id: "s1" }] });
    expect(result.scenes).toEqual(["s2"]);
  });

  it("reorders scenes", () => {
    const state: DocumentState = { nodes: {}, scenes: ["s1", "s2", "s3"] };
    const result = applyDiff(state, {
      scenes: [{ op: "reorder", ids: ["s3", "s1", "s2"] }],
    });
    expect(result.scenes).toEqual(["s3", "s1", "s2"]);
  });

  it("does not mutate the input state", () => {
    const state: DocumentState = {
      nodes: { n1: makeNode("n1", { width: 100 }) },
      scenes: ["s1"],
    };
    const nodesBefore = state.nodes;
    const scenesBefore = state.scenes;
    applyDiff(state, {
      nodes: {
        n1: { op: "patch", fields: { width: { op: "put", value: 200 } } },
      },
    });
    expect(state.nodes).toBe(nodesBefore);
    expect(state.scenes).toBe(scenesBefore);
    expect(state.nodes["n1"]).toEqual(makeNode("n1", { width: 100 }));
  });

  it("skips patch on non-existent node", () => {
    const state = emptyState();
    const result = applyDiff(state, {
      nodes: {
        n1: { op: "patch", fields: { width: { op: "put", value: 100 } } },
      },
    });
    expect(result.nodes["n1"]).toBeUndefined();
  });

  it("handles add of already-existing scene (no duplicate)", () => {
    const state: DocumentState = { nodes: {}, scenes: ["s1"] };
    const result = applyDiff(state, { scenes: [{ op: "add", id: "s1" }] });
    expect(result.scenes).toEqual(["s1"]);
  });
});

// ---------------------------------------------------------------------------
// computeDiff + applyDiff round-trip
// ---------------------------------------------------------------------------

describe("diff round-trip", () => {
  it("apply(before, computeDiff(before, after)) === after", () => {
    const before: DocumentState = {
      nodes: {
        n1: makeNode("n1", { width: 100, height: 50 }),
        n2: makeNode("n2", { x: 10 }),
      },
      scenes: ["s1", "s2"],
    };
    const after: DocumentState = {
      nodes: {
        n1: makeNode("n1", { width: 200, height: 50 }),
        n3: makeNode("n3", { color: "red" }),
      },
      scenes: ["s2"],
    };
    const diff = computeDiff(before, after)!;
    const result = applyDiff(before, diff);
    expect(result.nodes).toEqual(after.nodes);
    expect(result.scenes).toEqual(after.scenes);
  });
});

// ---------------------------------------------------------------------------
// composeDiffs
// ---------------------------------------------------------------------------

describe("composeDiffs", () => {
  it("composes two patches on the same node", () => {
    const a: DocumentDiff = {
      nodes: {
        n1: { op: "patch", fields: { width: { op: "put", value: 200 } } },
      },
    };
    const b: DocumentDiff = {
      nodes: {
        n1: { op: "patch", fields: { height: { op: "put", value: 100 } } },
      },
    };
    const composed = composeDiffs(a, b);
    expect(composed.nodes!["n1"]).toEqual({
      op: "patch",
      fields: {
        width: { op: "put", value: 200 },
        height: { op: "put", value: 100 },
      },
    });
  });

  it("b's put overrides a's patch", () => {
    const a: DocumentDiff = {
      nodes: {
        n1: { op: "patch", fields: { width: { op: "put", value: 200 } } },
      },
    };
    const b: DocumentDiff = {
      nodes: { n1: { op: "put", node: makeNode("n1", { width: 300 }) } },
    };
    const composed = composeDiffs(a, b);
    expect(composed.nodes!["n1"]).toEqual({
      op: "put",
      node: makeNode("n1", { width: 300 }),
    });
  });

  it("b's remove overrides a's put", () => {
    const a: DocumentDiff = {
      nodes: { n1: { op: "put", node: makeNode("n1") } },
    };
    const b: DocumentDiff = {
      nodes: { n1: { op: "remove" } },
    };
    const composed = composeDiffs(a, b);
    expect(composed.nodes!["n1"]).toEqual({ op: "remove" });
  });

  it("b's patch on a's put merges into the put", () => {
    const a: DocumentDiff = {
      nodes: { n1: { op: "put", node: makeNode("n1", { width: 100 }) } },
    };
    const b: DocumentDiff = {
      nodes: {
        n1: { op: "patch", fields: { width: { op: "put", value: 200 } } },
      },
    };
    const composed = composeDiffs(a, b);
    expect(composed.nodes!["n1"]).toEqual({
      op: "put",
      node: makeNode("n1", { width: 200 }),
    });
  });

  it("composes disjoint node ops", () => {
    const a: DocumentDiff = {
      nodes: { n1: { op: "put", node: makeNode("n1") } },
    };
    const b: DocumentDiff = {
      nodes: { n2: { op: "put", node: makeNode("n2") } },
    };
    const composed = composeDiffs(a, b);
    expect(Object.keys(composed.nodes!)).toEqual(["n1", "n2"]);
  });

  it("concatenates scene ops", () => {
    const a: DocumentDiff = { scenes: [{ op: "add", id: "s1" }] };
    const b: DocumentDiff = { scenes: [{ op: "add", id: "s2" }] };
    const composed = composeDiffs(a, b);
    expect(composed.scenes).toEqual([
      { op: "add", id: "s1" },
      { op: "add", id: "s2" },
    ]);
  });

  it("composes empty diffs", () => {
    const composed = composeDiffs({}, {});
    expect(isDiffEmpty(composed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isDiffEmpty
// ---------------------------------------------------------------------------

describe("isDiffEmpty", () => {
  it("empty object is empty", () => {
    expect(isDiffEmpty({})).toBe(true);
  });

  it("empty nodes is empty", () => {
    expect(isDiffEmpty({ nodes: {} })).toBe(true);
  });

  it("non-empty nodes is not empty", () => {
    expect(isDiffEmpty({ nodes: { n1: { op: "remove" } } })).toBe(false);
  });

  it("empty scenes is empty", () => {
    expect(isDiffEmpty({ scenes: [] })).toBe(true);
  });
});
