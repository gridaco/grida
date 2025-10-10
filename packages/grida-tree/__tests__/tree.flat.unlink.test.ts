import { tree as lib } from "../src/lib";

describe("unlink", () => {
  it("removes a standalone node", () => {
    const nodes = { a: {} as any, b: {} as any };
    lib.flat_with_children.unlink(nodes, "a");
    expect(nodes).toEqual({ b: {} });
  });

  it("removes reference from parent.children", () => {
    const nodes = {
      parent: { children: ["child"] },
      child: { children: [] },
    };
    lib.flat_with_children.unlink(nodes, "child");
    expect(nodes).toHaveProperty("parent");
    expect(nodes.parent.children).toEqual([]);
    expect(nodes).not.toHaveProperty("child");
  });

  it("throws if id does not exist", () => {
    const nodes = { a: {} as any };
    expect(() => lib.flat_with_children.unlink(nodes, "missing")).toThrow(
      /unlink: cannot unlink 'missing': No such node/
    );
  });

  it("handles nodes without a children array", () => {
    const nodes = {
      x: { foo: "bar" },
      y: { children: ["x"] },
    } as Record<string, any>;
    lib.flat_with_children.unlink(nodes, "x");
    expect(nodes.y.children).toEqual([]);
    expect(nodes).not.toHaveProperty("x");
  });

  it("does not affect unrelated nodes", () => {
    const nodes = {
      a: { children: ["b"] },
      b: {},
      c: { children: ["d"] },
      d: {},
    } as Record<string, any>;
    lib.flat_with_children.unlink(nodes, "b");
    expect(Object.keys(nodes)).toEqual(["a", "c", "d"]);
    expect(nodes.a.children).toEqual([]);
    expect(nodes.c.children).toEqual(["d"]);
  });
});
