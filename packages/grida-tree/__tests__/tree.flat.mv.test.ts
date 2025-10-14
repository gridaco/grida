import { tree as lib } from "../src/lib";

describe("flat_with_children.mv", () => {
  let tree: Record<string, { children: string[] }>;

  beforeEach(() => {
    tree = {
      a: { children: ["b", "c"] },
      b: { children: [] },
      c: { children: ["d"] },
      d: { children: [] },
    };
  });

  test("moves single node under new parent", () => {
    lib.flat_with_children.mv(tree, "b", "c");
    expect(tree).toEqual({
      a: { children: ["c"] },
      b: { children: [] },
      c: { children: ["d", "b"] },
      d: { children: [] },
    });
  });

  test("moves multiple nodes under new parent", () => {
    lib.flat_with_children.mv(tree, ["b", "d"], "a");
    expect(tree).toEqual({
      a: { children: ["c", "b", "d"] },
      b: { children: [] },
      c: { children: [] },
      d: { children: [] },
    });
  });

  test("throws error when source does not exist", () => {
    expect(() => lib.flat_with_children.mv(tree, "x", "a")).toThrow(
      "mv: cannot move 'x': No such node"
    );
  });

  test("throws error when target does not exist", () => {
    expect(() => lib.flat_with_children.mv(tree, "b", "x")).toThrow(
      "mv: cannot move to 'x': No such node"
    );
  });

  test("moving a node to its current parent reorders children", () => {
    // initial a: ['b', 'c']
    lib.flat_with_children.mv(tree, "c", "a");
    expect(tree.a.children).toEqual(["b", "c"]);
    // moving 'b' under the same parent moves it to end
    lib.flat_with_children.mv(tree, "b", "a");
    expect(tree.a.children).toEqual(["c", "b"]);
  });
});

describe("mv:advanced", () => {
  let tree: Record<string, { children: string[] }>;

  beforeEach(() => {
    tree = {
      root: { children: ["a", "b", "c"] },
      a: { children: ["d", "e"] },
      b: { children: [] },
      c: { children: ["f"] },
      d: { children: [] },
      e: { children: [] },
      f: { children: [] },
    };
  });

  test("complex chained moves with indices and bulk sources", () => {
    // move 'd' under 'b' at index 0
    lib.flat_with_children.mv(tree, "d", "b", 0);
    // move 'e' under 'root' at index 1
    lib.flat_with_children.mv(tree, "e", "root", 1);
    // move multiple ['f','a'] under 'b' (append)
    lib.flat_with_children.mv(tree, ["f", "a"], "b");
    expect(tree).toEqual({
      root: { children: ["e", "b", "c"] },
      a: { children: [] },
      b: { children: ["d", "f", "a"] },
      c: { children: [] },
      d: { children: [] },
      e: { children: [] },
      f: { children: [] },
    });
  });

  test("reordering within same parent using index", () => {
    // initial children of 'a' are ['d','e']
    // move 'e' within 'a' to index 0
    lib.flat_with_children.mv(tree, "e", "a", 0);
    expect(tree.a.children).toEqual(["e", "d"]);
    // then move 'd' to index -1 (append) under 'a'
    lib.flat_with_children.mv(tree, "d", "a", -1);
    expect(tree.a.children).toEqual(["e", "d"]);
  });
});

describe("mv:custom-key", () => {
  interface CustomNode {
    items: string[];
  }

  let tree: Record<string, CustomNode>;

  beforeEach(() => {
    tree = {
      a: { items: ["b", "c"] },
      b: { items: [] },
      c: { items: ["d"] },
      d: { items: [] },
    };
  });

  test("moves single node using custom key", () => {
    lib.flat_with_children.mv(tree, "b", "c", -1, "items");
    expect(tree).toEqual({
      a: { items: ["c"] },
      b: { items: [] },
      c: { items: ["d", "b"] },
      d: { items: [] },
    });
  });

  test("moves multiple nodes using custom key", () => {
    lib.flat_with_children.mv(tree, ["b", "d"], "a", -1, "items");
    expect(tree).toEqual({
      a: { items: ["c", "b", "d"] },
      b: { items: [] },
      c: { items: [] },
      d: { items: [] },
    });
  });

  test("moves with index using custom key", () => {
    lib.flat_with_children.mv(tree, "d", "a", 0, "items");
    expect(tree.a.items).toEqual(["d", "b", "c"]);
  });
});
