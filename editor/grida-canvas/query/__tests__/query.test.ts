import { dq } from "../index";
import tree from "@grida/tree";

describe("query selectors", () => {
  const doc = {
    nodes: {
      root: { type: "container", id: "root", name: "root" },
      a: { type: "container", id: "a", name: "a" },
      b: { type: "container", id: "b", name: "b" },
      c: { type: "container", id: "c", name: "c" },
      a1: { type: "container", id: "a1", name: "a1" },
      a2: { type: "container", id: "a2", name: "a2" },
      b1: { type: "container", id: "b1", name: "b1" },
    },
    links: {
      root: ["a", "b", "c"],
      a: ["a1", "a2"],
      b: ["b1"],
      c: [],
      a1: [],
      a2: [],
      b1: [],
    },
  } as any;

  const ctx = new tree.graph.Graph(doc).lut;

  describe("sibling selectors", () => {
    test("~+ selects next sibling and loops", () => {
      expect(dq.querySelector(ctx, ["a"], "~+")).toEqual(["b"]);
      expect(dq.querySelector(ctx, ["c"], "~+")).toEqual(["a"]);
    });

    test("~- selects previous sibling and loops", () => {
      expect(dq.querySelector(ctx, ["b"], "~-")).toEqual(["a"]);
      expect(dq.querySelector(ctx, ["a"], "~-")).toEqual(["c"]);
    });

    // FIXME: this is not scoped by the scene - may result unexpected behavior.
    test("~+ on root-level node with null parent loops to itself", () => {
      expect(dq.querySelector(ctx, ["root"], "~+")).toEqual(["root"]);
    });

    test("~- on root-level node with null parent loops to itself", () => {
      expect(dq.querySelector(ctx, ["root"], "~-")).toEqual(["root"]);
    });

    test("~+ works on nested siblings at deeper levels", () => {
      expect(dq.querySelector(ctx, ["a1"], "~+")).toEqual(["a2"]);
      expect(dq.querySelector(ctx, ["a2"], "~+")).toEqual(["a1"]);
    });

    test("~- works on nested siblings at deeper levels", () => {
      expect(dq.querySelector(ctx, ["a1"], "~-")).toEqual(["a2"]);
      expect(dq.querySelector(ctx, ["a2"], "~-")).toEqual(["a1"]);
    });

    test("~ selects all siblings", () => {
      expect(dq.querySelector(ctx, ["a"], "~")).toEqual(["b", "c"]);
      expect(dq.querySelector(ctx, ["b"], "~")).toEqual(["a", "c"]);
      expect(dq.querySelector(ctx, ["c"], "~")).toEqual(["a", "b"]);
    });

    test("~ with multiple selections requires siblings", () => {
      expect(dq.querySelector(ctx, ["a", "b"], "~")).toEqual(["b", "c"]);
      expect(dq.querySelector(ctx, ["a", "c"], "~")).toEqual(["b", "c"]);
      expect(dq.querySelector(ctx, ["a", "a1"], "~")).toEqual([]);
    });

    test("~ with empty selection returns all nodes", () => {
      expect(dq.querySelector(ctx, [], "~")).toEqual(Object.keys(doc.nodes));
    });
  });

  describe("child selectors", () => {
    test("> selects direct children", () => {
      expect(dq.querySelector(ctx, ["a"], ">")).toEqual(["a1", "a2"]);
      expect(dq.querySelector(ctx, ["b"], ">")).toEqual(["b1"]);
      expect(dq.querySelector(ctx, ["c"], ">")).toEqual([]);
    });

    test("> with multiple selections returns all children", () => {
      expect(dq.querySelector(ctx, ["a", "b"], ">")).toEqual([
        "a1",
        "a2",
        "b1",
      ]);
    });

    test("> with empty selection returns empty array", () => {
      expect(dq.querySelector(ctx, [], ">")).toEqual([]);
    });
  });

  describe("parent selector", () => {
    test(".. selects parent", () => {
      expect(dq.querySelector(ctx, ["a1"], "..")).toEqual(["a"]);
      expect(dq.querySelector(ctx, ["b1"], "..")).toEqual(["b"]);
      expect(dq.querySelector(ctx, ["a"], "..")).toEqual(["root"]);
    });

    test(".. with multiple selections returns all parents", () => {
      expect(dq.querySelector(ctx, ["a1", "b1"], "..")).toEqual(["a", "b"]);
    });

    test(".. with root node returns empty array", () => {
      expect(dq.querySelector(ctx, ["root"], "..")).toEqual([]);
    });
  });

  describe("wildcard selector", () => {
    test("* selects all nodes", () => {
      expect(dq.querySelector(ctx, [], "*")).toEqual(Object.keys(doc.nodes));
    });

    test("* ignores selection", () => {
      expect(dq.querySelector(ctx, ["a"], "*")).toEqual(Object.keys(doc.nodes));
    });
  });

  describe("selection selector", () => {
    test("selection returns current selection", () => {
      expect(dq.querySelector(ctx, ["a", "b"], "selection")).toEqual([
        "a",
        "b",
      ]);
    });

    test("selection with empty selection returns empty array", () => {
      expect(dq.querySelector(ctx, [], "selection")).toEqual([]);
    });
  });

  describe("direct node selection", () => {
    test("can select specific nodes by ID array", () => {
      expect(dq.querySelector(ctx, [], ["a", "b"])).toEqual(["a", "b"]);
      expect(dq.querySelector(ctx, [], ["a1", "b1"])).toEqual(["a1", "b1"]);
    });

    test("ignores current selection when using direct node selection", () => {
      expect(dq.querySelector(ctx, ["c"], ["a", "b"])).toEqual(["a", "b"]);
    });
  });

  describe("getTopSceneContentNode", () => {
    test("returns the direct child when node is under scene", () => {
      expect(dq.getTopIdWithinScene(ctx, "a", "root")).toBe("a");
    });

    test("returns highest ancestor that is still under the scene", () => {
      expect(dq.getTopIdWithinScene(ctx, "a1", "root")).toBe("a");
    });

    test("returns null when querying the scene itself", () => {
      expect(dq.getTopIdWithinScene(ctx, "root", "root")).toBeNull();
    });
  });
});
