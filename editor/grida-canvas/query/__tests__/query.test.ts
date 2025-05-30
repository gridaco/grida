import { dq } from "../index";

describe("query selectors", () => {
  const doc = {
    root_id: "root",
    nodes: {
      root: { type: "container", children: ["a", "b", "c"] },
      a: { type: "container", children: ["a1", "a2"] },
      b: { type: "container", children: ["b1"] },
      c: { type: "container", children: [] },
      a1: { type: "container", children: [] },
      a2: { type: "container", children: [] },
      b1: { type: "container", children: [] },
    },
  } as any;

  const ctx = dq.Context.from(doc).snapshot();

  describe("sibling selectors", () => {
    test("~+ selects next sibling and loops", () => {
      expect(dq.querySelector(ctx, ["a"], "~+")).toEqual([]);
      expect(dq.querySelector(ctx, ["c"], "~+")).toEqual([]);
    });

    test("~- selects previous sibling and loops", () => {
      expect(dq.querySelector(ctx, ["b"], "~-")).toEqual([]);
      expect(dq.querySelector(ctx, ["a"], "~-")).toEqual([]);
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
});
