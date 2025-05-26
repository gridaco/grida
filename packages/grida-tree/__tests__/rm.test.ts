import { rm } from "../src/lib";

describe("rm", () => {
  it("removes a standalone node", () => {
    const nodes = { a: {} as any, b: {} as any };
    const removed = rm(nodes, "a");
    expect(removed).toEqual(["a"]);
    expect(nodes).toEqual({ b: {} });
  });

  it("recursively removes children", () => {
    const nodes = {
      a: { children: ["b"] },
      b: { children: ["c"] },
      c: {},
      d: {},
    } as Record<string, any>;
    const removed = rm(nodes, "a");
    expect(removed).toEqual(["c", "b", "a"]);
    expect(nodes).toEqual({ d: {} });
  });

  it("removes subtree and unlinks from parent", () => {
    const nodes = {
      root: { children: ["x", "y"] },
      x: { children: ["z"] },
      y: {},
      z: {},
    } as Record<string, any>;
    const removed = rm(nodes, "x");
    expect(removed).toEqual(["z", "x"]);
    expect(nodes.root.children).toEqual(["y"]);
    expect(nodes).not.toHaveProperty("x");
    expect(nodes).not.toHaveProperty("z");
    expect(nodes).toHaveProperty("y");
  });

  it("throws if id does not exist", () => {
    const nodes = { a: {} as any };
    expect(() => rm(nodes, "missing")).toThrow(
      /rm: cannot remove 'missing': No such node/
    );
  });

  it("handles node without children field", () => {
    const nodes = {
      a: {},
      b: { foo: "bar" },
    } as Record<string, any>;
    const removed = rm(nodes, "a");
    expect(removed).toEqual(["a"]);
    expect(nodes).toEqual({ b: { foo: "bar" } });
  });

  it("does not affect unrelated branches", () => {
    const nodes = {
      a: { children: ["b"] },
      b: { children: [] },
      c: { children: ["d"] },
      d: {},
    } as Record<string, any>;
    const removed = rm(nodes, "b");
    expect(removed).toEqual(["b"]);
    expect(Object.keys(nodes).sort()).toEqual(["a", "c", "d"]);
    expect(nodes.a.children).toEqual([]);
    expect(nodes.c.children).toEqual(["d"]);
  });
});

describe("rm:advanced", () => {
  it("handles multiple removals on a nested tree", () => {
    const nodes = {
      root: { children: ["a", "b", "c"] },
      a: { children: ["a1", "a2"] },
      a1: { children: ["a1a"] },
      a1a: {},
      a2: {},
      b: { children: ["b1", "b2"] },
      b1: {},
      b2: { children: ["b2a", "b2b"] },
      b2a: {},
      b2b: {},
      c: {},
    } as Record<string, any>;

    let removed = rm(nodes, "a2");
    expect(removed).toEqual(["a2"]);
    expect(nodes.root.children).toEqual(["a", "b", "c"]);
    expect(nodes.a.children).toEqual(["a1"]);
    expect(nodes).not.toHaveProperty("a2");

    removed = rm(nodes, "b2");
    expect(removed).toEqual(["b2a", "b2b", "b2"]);
    expect(nodes.b.children).toEqual(["b1"]);
    expect(nodes).not.toHaveProperty("b2");
    expect(nodes).not.toHaveProperty("b2a");
    expect(nodes).not.toHaveProperty("b2b");

    removed = rm(nodes, "a");
    expect(removed).toEqual(["a1a", "a1", "a"]);
    expect(nodes.root.children).toEqual(["b", "c"]);
    expect(nodes).not.toHaveProperty("a");
    expect(nodes).not.toHaveProperty("a1");
    expect(nodes).not.toHaveProperty("a1a");

    expect(nodes).toHaveProperty("c");
    expect(nodes.root.children).toContain("c");
  });
});
