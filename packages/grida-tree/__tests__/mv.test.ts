import { mv, type TreeMap } from "../src/lib";

describe("mv", () => {
  let tree: TreeMap;

  beforeEach(() => {
    tree = {
      a: ["b", "c"],
      b: [],
      c: ["d"],
      d: [],
    };
  });

  test("moves single node under new parent", () => {
    mv(tree, "b", "c");
    expect(tree).toEqual({
      a: ["c"],
      b: [],
      c: ["d", "b"],
      d: [],
    });
  });

  test("moves multiple nodes under new parent", () => {
    mv(tree, ["b", "d"], "a");
    expect(tree).toEqual({
      a: ["c", "b", "d"],
      b: [],
      c: [],
      d: [],
    });
  });

  test("throws error when source does not exist", () => {
    expect(() => mv(tree, "x", "a")).toThrow(
      "mv: cannot move 'x': No such node"
    );
  });

  test("throws error when target does not exist", () => {
    expect(() => mv(tree, "b", "x")).toThrow(
      "mv: cannot move to 'x': No such node"
    );
  });

  test("moving a node to its current parent reorders children", () => {
    // initial a: ['b', 'c']
    mv(tree, "c", "a");
    expect(tree.a).toEqual(["b", "c"]);
    // moving 'b' under the same parent moves it to end
    mv(tree, "b", "a");
    expect(tree.a).toEqual(["c", "b"]);
  });
});

describe("mv:advanced", () => {
  let tree: TreeMap;

  beforeEach(() => {
    tree = {
      root: ["a", "b", "c"],
      a: ["d", "e"],
      b: [],
      c: ["f"],
      d: [],
      e: [],
      f: [],
    };
  });

  test("complex chained moves with indices and bulk sources", () => {
    // move 'd' under 'b' at index 0
    mv(tree, "d", "b", 0);
    // move 'e' under 'root' at index 1
    mv(tree, "e", "root", 1);
    // move multiple ['f','a'] under 'b' (append)
    mv(tree, ["f", "a"], "b");
    expect(tree).toEqual({
      root: ["e", "b", "c"],
      a: [],
      b: ["d", "f", "a"],
      c: [],
      d: [],
      e: [],
      f: [],
    });
  });

  test("reordering within same parent using index", () => {
    // initial children of 'a' are ['d','e']
    // move 'e' within 'a' to index 0
    mv(tree, "e", "a", 0);
    expect(tree.a).toEqual(["e", "d"]);
    // then move 'd' to index -1 (append) under 'a'
    mv(tree, "d", "a", -1);
    expect(tree.a).toEqual(["e", "d"]);
  });
});
