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
