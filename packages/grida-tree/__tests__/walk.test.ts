import { walk } from "../src/walk";

type Node = { id: string; children?: Node[] };

const tree: Node = {
  id: "root",
  children: [
    {
      id: "a",
      children: [
        { id: "c" },
        { id: "d" },
      ],
    },
    { id: "b" },
  ],
};

describe("walk", () => {
  test("traverses nodes in preorder", () => {
    const order: string[] = [];
    walk(tree, {
      enter(node) {
        order.push(node.id);
      },
    });
    expect(order).toEqual(["root", "a", "c", "d", "b"]);
  });

  test("can skip subtree when enter returns false", () => {
    const order: string[] = [];
    walk(tree, {
      enter(node) {
        order.push(node.id);
        if (node.id === "a") return false;
      },
    });
    expect(order).toEqual(["root", "a", "b"]);
  });

  test("invokes exit after children", () => {
    const enter: string[] = [];
    const exit: string[] = [];
    walk(tree, {
      enter(node) {
        enter.push(node.id);
      },
      exit(node) {
        exit.push(node.id);
      },
    });
    expect(enter).toEqual(["root", "a", "c", "d", "b"]);
    expect(exit).toEqual(["c", "d", "a", "b", "root"]);
  });

  test("terminates traversal early", () => {
    const enter: string[] = [];
    const exit: string[] = [];
    walk(tree, {
      enter(node, _parent, _ctx, terminate) {
        enter.push(node.id);
        if (node.id === "a") terminate();
      },
      exit(node) {
        exit.push(node.id);
      },
    });
    expect(enter).toEqual(["root", "a"]);
    expect(exit).toEqual([]);
  });
});
