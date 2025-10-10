import { tree } from "../src/lib";

describe("TreeLUT", () => {
  let lut: tree.ITreeLUT;
  let treeLUT: tree.TreeLUT;

  beforeEach(() => {
    // Tree structure:
    // root
    // ├── a
    // │   └── c
    // └── b
    lut = {
      lu_keys: ["root", "a", "b", "c"],
      lu_parent: { root: null, a: "root", b: "root", c: "a" },
      lu_children: { root: ["a", "b"], a: ["c"], b: [], c: [] },
    };
    treeLUT = new tree.TreeLUT(lut);
  });

  describe("from", () => {
    test("creates TreeLUT from flat tree structure with default key", () => {
      const nodes = {
        root: { children: ["a", "b"] },
        a: { children: ["c"] },
        b: { children: [] },
        c: { children: [] },
      };

      const treeLUT = tree.TreeLUT.from(nodes);

      expect(treeLUT.lut.lu_keys).toContain("root");
      expect(treeLUT.lut.lu_keys).toContain("a");
      expect(treeLUT.lut.lu_keys).toContain("b");
      expect(treeLUT.lut.lu_keys).toContain("c");

      expect(treeLUT.parentOf("a")).toBe("root");
      expect(treeLUT.parentOf("b")).toBe("root");
      expect(treeLUT.parentOf("c")).toBe("a");
      expect(treeLUT.parentOf("root")).toBeNull();

      expect(treeLUT.childrenOf("root")).toEqual(["a", "b"]);
      expect(treeLUT.childrenOf("a")).toEqual(["c"]);
      expect(treeLUT.childrenOf("b")).toEqual([]);
      expect(treeLUT.childrenOf("c")).toEqual([]);
    });

    test("creates TreeLUT from flat tree structure with custom key", () => {
      const nodes = {
        root: { items: ["a", "b"] },
        a: { items: ["c"] },
        b: { items: [] },
        c: { items: [] },
      };

      const treeLUT = tree.TreeLUT.from(nodes, "items");

      expect(treeLUT.parentOf("a")).toBe("root");
      expect(treeLUT.parentOf("b")).toBe("root");
      expect(treeLUT.parentOf("c")).toBe("a");
      expect(treeLUT.childrenOf("root")).toEqual(["a", "b"]);
      expect(treeLUT.childrenOf("a")).toEqual(["c"]);
    });

    test("handles nodes with additional properties", () => {
      const nodes = {
        root: { children: ["a"], name: "Root Node", value: 1 },
        a: { children: ["b"], name: "A Node", value: 2 },
        b: { children: [], name: "B Node", value: 3 },
      };

      const treeLUT = tree.TreeLUT.from(nodes);

      expect(treeLUT.depthOf("root")).toBe(0);
      expect(treeLUT.depthOf("a")).toBe(1);
      expect(treeLUT.depthOf("b")).toBe(2);
    });

    test("handles nodes without children arrays", () => {
      const nodes = {
        root: { children: ["a", "b"] },
        a: {},
        b: {},
      };

      const treeLUT = tree.TreeLUT.from(nodes);

      expect(treeLUT.childrenOf("a")).toEqual([]);
      expect(treeLUT.childrenOf("b")).toEqual([]);
      expect(treeLUT.parentOf("a")).toBe("root");
    });

    test("handles multiple root nodes", () => {
      const nodes = {
        root1: { children: ["a"] },
        root2: { children: ["b"] },
        a: { children: [] },
        b: { children: [] },
      };

      const treeLUT = tree.TreeLUT.from(nodes);

      expect(treeLUT.parentOf("root1")).toBeNull();
      expect(treeLUT.parentOf("root2")).toBeNull();
      expect(treeLUT.siblingsOf("root1")).toEqual(["root2"]);
      expect(treeLUT.parentOf("a")).toBe("root1");
      expect(treeLUT.parentOf("b")).toBe("root2");
    });
  });

  describe("snapshot", () => {
    test("creates independent copy of the lookup table", () => {
      const snapshot = treeLUT.snapshot();

      // Verify it's a copy
      expect(snapshot).not.toBe(lut);
      expect(snapshot.lu_keys).not.toBe(lut.lu_keys);
      expect(snapshot.lu_parent).not.toBe(lut.lu_parent);
      expect(snapshot.lu_children).not.toBe(lut.lu_children);

      // Verify deep copy of children arrays
      expect(snapshot.lu_children.root).not.toBe(lut.lu_children.root);

      // Verify content is equal
      expect(snapshot).toEqual(lut);

      // Verify mutations don't affect original
      snapshot.lu_keys.push("new");
      snapshot.lu_parent["new"] = "root";
      snapshot.lu_children.root.push("new");

      expect(lut.lu_keys).not.toContain("new");
      expect(lut.lu_parent["new"]).toBeUndefined();
      expect(lut.lu_children.root).not.toContain("new");
    });
  });

  describe("depthOf", () => {
    test("returns 0 for root node", () => {
      expect(treeLUT.depthOf("root")).toBe(0);
    });

    test("returns 1 for direct children", () => {
      expect(treeLUT.depthOf("a")).toBe(1);
      expect(treeLUT.depthOf("b")).toBe(1);
    });

    test("returns 2 for grandchildren", () => {
      expect(treeLUT.depthOf("c")).toBe(2);
    });
  });

  describe("ancestorsOf", () => {
    test("returns empty array for root node", () => {
      expect(Array.from(treeLUT.ancestorsOf("root"))).toEqual([]);
    });

    test("returns ancestors in root-first order", () => {
      expect(Array.from(treeLUT.ancestorsOf("c"))).toEqual(["root", "a"]);
    });

    test("returns single ancestor for direct children", () => {
      expect(Array.from(treeLUT.ancestorsOf("a"))).toEqual(["root"]);
      expect(Array.from(treeLUT.ancestorsOf("b"))).toEqual(["root"]);
    });
  });

  describe("parentOf", () => {
    test("returns null for root node", () => {
      expect(treeLUT.parentOf("root")).toBeNull();
    });

    test("returns parent ID for child nodes", () => {
      expect(treeLUT.parentOf("a")).toBe("root");
      expect(treeLUT.parentOf("b")).toBe("root");
      expect(treeLUT.parentOf("c")).toBe("a");
    });

    test("returns null for non-existent node", () => {
      expect(treeLUT.parentOf("nonexistent")).toBeNull();
    });
  });

  describe("topmostOf", () => {
    test("returns self for root node", () => {
      expect(treeLUT.topmostOf("root")).toBe("root");
    });

    test("returns root for all descendants", () => {
      expect(treeLUT.topmostOf("a")).toBe("root");
      expect(treeLUT.topmostOf("b")).toBe("root");
      expect(treeLUT.topmostOf("c")).toBe("root");
    });

    test("returns null for non-existent node", () => {
      expect(treeLUT.topmostOf("nonexistent")).toBeNull();
    });
  });

  describe("siblingsOf", () => {
    test("returns siblings of a node", () => {
      expect(treeLUT.siblingsOf("a")).toEqual(["b"]);
      expect(treeLUT.siblingsOf("b")).toEqual(["a"]);
    });

    test("returns empty array for only child", () => {
      expect(treeLUT.siblingsOf("c")).toEqual([]);
    });

    test("returns empty array for root node with no other roots", () => {
      expect(treeLUT.siblingsOf("root")).toEqual([]);
    });

    test("handles multiple root nodes", () => {
      const multiRootLUT = new tree.TreeLUT({
        lu_keys: ["root1", "root2", "a"],
        lu_parent: { root1: null, root2: null, a: "root1" },
        lu_children: { root1: ["a"], root2: [], a: [] },
      });

      expect(multiRootLUT.siblingsOf("root1")).toEqual(["root2"]);
      expect(multiRootLUT.siblingsOf("root2")).toEqual(["root1"]);
    });
  });

  describe("childrenOf", () => {
    test("returns children array for parent nodes", () => {
      expect(treeLUT.childrenOf("root")).toEqual(["a", "b"]);
      expect(treeLUT.childrenOf("a")).toEqual(["c"]);
    });

    test("returns empty array for leaf nodes", () => {
      expect(treeLUT.childrenOf("b")).toEqual([]);
      expect(treeLUT.childrenOf("c")).toEqual([]);
    });

    test("returns empty array for non-existent node", () => {
      expect(treeLUT.childrenOf("nonexistent")).toEqual([]);
    });
  });

  describe("isAncestorOf", () => {
    test("returns true for direct parent", () => {
      expect(treeLUT.isAncestorOf("root", "a")).toBe(true);
      expect(treeLUT.isAncestorOf("a", "c")).toBe(true);
    });

    test("returns true for distant ancestor", () => {
      expect(treeLUT.isAncestorOf("root", "c")).toBe(true);
    });

    test("returns false for non-ancestor", () => {
      expect(treeLUT.isAncestorOf("b", "c")).toBe(false);
      expect(treeLUT.isAncestorOf("a", "b")).toBe(false);
    });

    test("returns false for reverse relationship", () => {
      expect(treeLUT.isAncestorOf("c", "a")).toBe(false);
      expect(treeLUT.isAncestorOf("a", "root")).toBe(false);
    });

    test("returns false for same node", () => {
      expect(treeLUT.isAncestorOf("a", "a")).toBe(false);
    });

    test("returns false for sibling", () => {
      expect(treeLUT.isAncestorOf("a", "b")).toBe(false);
    });
  });
});
