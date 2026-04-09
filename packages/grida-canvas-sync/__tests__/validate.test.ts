import { describe, it, expect } from "vitest";
import { validateDiff } from "../src/validate";
import type { DocumentState } from "../src/diff";
import type { DocumentDiff, SerializedNode } from "../src/protocol";

function makeNode(
  id: string,
  type = "rectangle",
  props: Record<string, unknown> = {}
): SerializedNode {
  return { type, id, ...props } as SerializedNode;
}

function stateWith(
  nodes: Record<string, SerializedNode>,
  scenes: string[] = []
): DocumentState {
  return { nodes, scenes };
}

describe("validateDiff", () => {
  it("valid put passes", () => {
    const state = stateWith({});
    const diff: DocumentDiff = {
      nodes: { n1: { op: "put", node: makeNode("n1") } },
    };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("valid patch on existing node passes", () => {
    const state = stateWith({ n1: makeNode("n1") });
    const diff: DocumentDiff = {
      nodes: {
        n1: { op: "patch", fields: { width: { op: "put", value: 100 } } },
      },
    };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(true);
  });

  it("valid remove of existing node passes", () => {
    const state = stateWith({ n1: makeNode("n1") });
    const diff: DocumentDiff = { nodes: { n1: { op: "remove" } } };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(true);
  });

  it("patch on non-existent node fails", () => {
    const state = stateWith({});
    const diff: DocumentDiff = {
      nodes: {
        n1: { op: "patch", fields: { width: { op: "put", value: 100 } } },
      },
    };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("PATCH_MISSING_NODE");
  });

  it("remove of non-existent node fails", () => {
    const state = stateWith({});
    const diff: DocumentDiff = { nodes: { n1: { op: "remove" } } };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("REMOVE_MISSING_NODE");
  });

  it("put without type fails", () => {
    const state = stateWith({});
    const diff: DocumentDiff = {
      nodes: {
        n1: { op: "put", node: { id: "n1" } as SerializedNode },
      },
    };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("PUT_MISSING_TYPE");
  });

  it("put without id fails", () => {
    const state = stateWith({});
    const diff: DocumentDiff = {
      nodes: {
        n1: { op: "put", node: { type: "rectangle" } as SerializedNode },
      },
    };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("PUT_MISSING_ID");
  });

  it("put with mismatched id fails", () => {
    const state = stateWith({});
    const diff: DocumentDiff = {
      nodes: {
        n1: { op: "put", node: makeNode("n2") },
      },
    };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("PUT_ID_MISMATCH");
  });

  it("patching immutable field 'id' fails", () => {
    const state = stateWith({ n1: makeNode("n1") });
    const diff: DocumentDiff = {
      nodes: {
        n1: { op: "patch", fields: { id: { op: "put", value: "n2" } } },
      },
    };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("PATCH_IMMUTABLE_FIELD");
  });

  it("patching immutable field 'type' fails", () => {
    const state = stateWith({ n1: makeNode("n1") });
    const diff: DocumentDiff = {
      nodes: {
        n1: { op: "patch", fields: { type: { op: "put", value: "ellipse" } } },
      },
    };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("PATCH_IMMUTABLE_FIELD");
  });

  it("scene add for non-existent node fails", () => {
    const state = stateWith({}, []);
    const diff: DocumentDiff = { scenes: [{ op: "add", id: "s1" }] };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("SCENE_ADD_MISSING_NODE");
  });

  it("scene add for node created in same diff passes", () => {
    const state = stateWith({}, []);
    const diff: DocumentDiff = {
      nodes: { s1: { op: "put", node: makeNode("s1", "scene") } },
      scenes: [{ op: "add", id: "s1" }],
    };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(true);
  });

  it("scene add for non-scene node type fails", () => {
    const state = stateWith({ r1: makeNode("r1") }); // type is "rectangle"
    const diff: DocumentDiff = { scenes: [{ op: "add", id: "r1" }] };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("SCENE_ADD_NOT_SCENE");
  });

  it("scene remove for non-existent scene fails", () => {
    const state = stateWith({}, ["s1"]);
    const diff: DocumentDiff = { scenes: [{ op: "remove", id: "s2" }] };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("SCENE_REMOVE_MISSING");
  });

  it("collects multiple errors", () => {
    const state = stateWith({});
    const diff: DocumentDiff = {
      nodes: {
        n1: { op: "patch", fields: { width: { op: "put", value: 100 } } },
        n2: { op: "remove" },
      },
    };
    const result = validateDiff(state, diff);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });
});
