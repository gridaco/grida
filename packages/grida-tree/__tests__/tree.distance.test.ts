import { tree } from "../src/lib";

/**
 * Helper to create a tree lookup table from a graph structure
 */
function createLUT(doc: tree.graph.IGraph<any>): tree.lut.ITreeLUT {
  const graph = new tree.graph.Graph(doc);
  return graph.lut;
}

describe("tree.distance", () => {
  // Test tree structure:
  // root
  //   ├── a
  //   │   ├── a1
  //   │   └── a2
  //   ├── b
  //   │   └── b1
  //   │       └── b1a
  //   └── c
  const doc = {
    nodes: {
      root: { type: "container", id: "root" },
      a: { type: "container", id: "a" },
      b: { type: "container", id: "b" },
      c: { type: "container", id: "c" },
      a1: { type: "container", id: "a1" },
      a2: { type: "container", id: "a2" },
      b1: { type: "container", id: "b1" },
      b1a: { type: "container", id: "b1a" },
    },
    links: {
      root: ["a", "b", "c"],
      a: ["a1", "a2"],
      b: ["b1"],
      c: [],
      a1: [],
      a2: [],
      b1: ["b1a"],
      b1a: [],
    },
  } as any;

  const lut = createLUT(doc);

  describe("getLowestCommonAncestor", () => {
    test("returns node itself when both nodes are the same", () => {
      expect(tree.distance.getLowestCommonAncestor(lut, "a", "a")).toBe("a");
      expect(tree.distance.getLowestCommonAncestor(lut, "a1", "a1")).toBe("a1");
    });

    test("returns parent when one node is ancestor of another", () => {
      expect(tree.distance.getLowestCommonAncestor(lut, "root", "a")).toBe(
        "root"
      );
      expect(tree.distance.getLowestCommonAncestor(lut, "a", "a1")).toBe("a");
      expect(tree.distance.getLowestCommonAncestor(lut, "b", "b1a")).toBe("b");
    });

    test("returns common ancestor for sibling nodes", () => {
      expect(tree.distance.getLowestCommonAncestor(lut, "a", "b")).toBe("root");
      expect(tree.distance.getLowestCommonAncestor(lut, "a1", "a2")).toBe("a");
      expect(tree.distance.getLowestCommonAncestor(lut, "a", "c")).toBe("root");
    });

    test("returns root for nodes in different branches", () => {
      expect(tree.distance.getLowestCommonAncestor(lut, "a1", "b1a")).toBe(
        "root"
      );
      expect(tree.distance.getLowestCommonAncestor(lut, "a2", "c")).toBe(
        "root"
      );
    });

    test("handles deep nesting", () => {
      expect(tree.distance.getLowestCommonAncestor(lut, "b1a", "b1")).toBe(
        "b1"
      );
      expect(tree.distance.getLowestCommonAncestor(lut, "b1a", "b")).toBe("b");
    });
  });

  describe("getGraphDistance", () => {
    test("returns 0 for same node", () => {
      expect(tree.distance.getGraphDistance(lut, "a", "a")).toBe(0);
      expect(tree.distance.getGraphDistance(lut, "a1", "a1")).toBe(0);
    });

    test("returns 1 for parent-child relationship", () => {
      expect(tree.distance.getGraphDistance(lut, "root", "a")).toBe(1);
      expect(tree.distance.getGraphDistance(lut, "a", "a1")).toBe(1);
      expect(tree.distance.getGraphDistance(lut, "b1", "b1a")).toBe(1);
    });

    test("returns 2 for grandparent-grandchild relationship", () => {
      expect(tree.distance.getGraphDistance(lut, "root", "a1")).toBe(2);
      expect(tree.distance.getGraphDistance(lut, "b", "b1a")).toBe(2);
    });

    test("returns 2 for sibling nodes", () => {
      expect(tree.distance.getGraphDistance(lut, "a", "b")).toBe(2);
      expect(tree.distance.getGraphDistance(lut, "a1", "a2")).toBe(2);
    });

    test("returns correct distance for cross-branch nodes", () => {
      expect(tree.distance.getGraphDistance(lut, "a1", "b1a")).toBe(5); // a1 -> a -> root -> b -> b1 -> b1a
      expect(tree.distance.getGraphDistance(lut, "a2", "c")).toBe(3); // a2 -> a -> root -> c
    });

    test("returns correct distance for nodes at different depths", () => {
      expect(tree.distance.getGraphDistance(lut, "a1", "b")).toBe(3); // a1 -> a -> root -> b
      expect(tree.distance.getGraphDistance(lut, "b1a", "root")).toBe(3); // b1a -> b1 -> b -> root
    });
  });

  describe("findNearestByGraphDistance", () => {
    test("returns null for empty candidates", () => {
      expect(
        tree.distance.findNearestByGraphDistance(lut, [], ["a"])
      ).toBeNull();
    });

    test("returns null for empty selection", () => {
      expect(
        tree.distance.findNearestByGraphDistance(lut, ["a", "b"], [])
      ).toBeNull();
    });

    test("selects the selected node itself when it's in candidates", () => {
      expect(
        tree.distance.findNearestByGraphDistance(lut, ["a", "b", "c"], ["a"])
      ).toBe("a");
    });

    test("selects sibling when selection is a node and sibling is candidate", () => {
      expect(
        tree.distance.findNearestByGraphDistance(lut, ["a", "b", "c"], ["a"])
      ).toBe("a"); // a is selected, so it's chosen

      // When b is selected, b1 (child, distance 1) is closer than siblings a/c (distance 2)
      const result = tree.distance.findNearestByGraphDistance(
        lut,
        ["a", "c", "a1", "b1"],
        ["b"]
      );
      expect(result).toBe("b1"); // Child has shortest distance

      // When b is selected but b1 is not a candidate, siblings should be preferred
      const result2 = tree.distance.findNearestByGraphDistance(
        lut,
        ["a", "c", "a1"],
        ["b"]
      );
      expect(["a", "c"]).toContain(result2); // Should be a sibling (a or c)
    });

    test("selects child when preferChildren is true and distance is equal", () => {
      // When a is selected and both a1 (child) and b (sibling) are candidates
      // With preferChildren=true, should prefer a1
      const result = tree.distance.findNearestByGraphDistance(
        lut,
        ["a1", "b"],
        ["a"],
        { preferChildren: true }
      );
      expect(result).toBe("a1");
    });

    test("selects nearest node by graph distance", () => {
      // When root is selected, a, b, c are all distance 1
      // Should prefer one of them (shallowest)
      const result = tree.distance.findNearestByGraphDistance(
        lut,
        ["a", "b", "c", "a1", "b1a"],
        ["root"]
      );
      expect(["a", "b", "c"]).toContain(result);
    });

    test("handles multiple selections - uses minimum distance", () => {
      // When both a and b are selected
      // a1 is distance 1 from a, b1 is distance 1 from b
      // Both should be equally preferred
      const result = tree.distance.findNearestByGraphDistance(
        lut,
        ["a1", "b1"],
        ["a", "b"]
      );
      expect(["a1", "b1"]).toContain(result);
    });

    test("prefers siblings when distances are equal", () => {
      // When a is selected
      // a1 (child, distance 1) vs b (sibling, distance 2)
      // Without preferChildren, should prefer a1 (shorter distance)
      const result = tree.distance.findNearestByGraphDistance(
        lut,
        ["a1", "b"],
        ["a"],
        { preferChildren: false }
      );
      expect(result).toBe("a1"); // Shorter distance wins
    });

    test("prefers shallower nodes when distance and relationships are equal", () => {
      // When root is selected, all direct children have same distance
      // Should prefer one of them (all are depth 1)
      const result = tree.distance.findNearestByGraphDistance(
        lut,
        ["a", "b", "c"],
        ["root"]
      );
      expect(["a", "b", "c"]).toContain(result);
    });

    test("handles complex selection scenario", () => {
      // Selection: a1
      // Candidates: a2 (sibling, distance 2), b (cousin, distance 4), root (ancestor, distance 2)
      // Should prefer a2 or root (both distance 2), then prefer sibling via weights
      const result = tree.distance.findNearestByGraphDistance(
        lut,
        ["a2", "b", "root"],
        ["a1"],
        { weights: { sibling: 1.9 } } // Make sibling slightly closer than ancestor (2)
      );
      // a2 is sibling (distance 1.9), root is ancestor (distance 2)
      // Sibling should be preferred
      expect(result).toBe("a2");
    });

    test("handles deep nesting correctly", () => {
      // Selection: b1a (deep node)
      // Candidates: b1 (parent, distance 1), b (grandparent, distance 2), root (great-grandparent, distance 3)
      const result = tree.distance.findNearestByGraphDistance(
        lut,
        ["b1", "b", "root"],
        ["b1a"]
      );
      expect(result).toBe("b1"); // Parent is closest
    });

    test("respects filter option", () => {
      // Filter out "b" from candidates
      const result = tree.distance.findNearestByGraphDistance(
        lut,
        ["a", "b", "c"],
        ["root"],
        {
          filter: (candidate) => candidate !== "b",
        }
      );
      expect(["a", "c"]).toContain(result);
      expect(result).not.toBe("b");
    });

    test("prefers siblings when explicit weights favor them", () => {
      // When root is selected, a and b are siblings (both distance 1 by default)
      // With sibling weight 0.9, siblings become distance 0.9, while parent-child stays 1.0
      const result = tree.distance.findNearestByGraphDistance(
        lut,
        ["a", "b"],
        ["root"],
        { weights: { sibling: 0.9 } }
      );
      // Both are siblings, so either is fine
      expect(["a", "b"]).toContain(result);
    });

    test("weights trump default preferences", () => {
      // When a is selected, a1 (child, distance 1) vs b (sibling, default distance 2)
      // If we make sibling distance 0.5, it should win even over child
      const result = tree.distance.findNearestByGraphDistance(
        lut,
        ["a1", "b"],
        ["a"],
        { weights: { sibling: 0.5 } }
      );
      // Should return b (distance 0.5), not a1 (distance 1)
      expect(result).toBe("b");
    });

    test("useWeightedDistance makes siblings preferred over parents for measurement", () => {
      // Tree: root -> a -> [a1, a2]
      // When a1 is selected, candidates: a2 (sibling) and a (parent)
      // Parent distance = 1.0
      // Sibling weight = 0.9
      // Sibling (0.9) < Parent (1.0), so sibling wins without tie-breaker
      const siblingParentDoc = {
        nodes: {
          root: { id: "root" },
          a: { id: "a" },
          a1: { id: "a1" },
          a2: { id: "a2" },
        },
        links: {
          root: ["a"],
          a: ["a1", "a2"],
          a1: [],
          a2: [],
        },
      } as any;
      const siblingParentLUT = createLUT(siblingParentDoc);

      const result = tree.distance.findNearestByGraphDistance(
        siblingParentLUT,
        ["a2", "a"], // sibling and parent
        ["a1"], // selected
        {
          weights: { sibling: 0.9 }, // Sibling closer than parent
        }
      );
      // Should return a2 (sibling), not a (parent)
      expect(result).toBe("a2");
    });
  });

  describe("getWeightedGraphDistance", () => {
    test("returns 0 for same node", () => {
      expect(tree.distance.getWeightedGraphDistance(lut, "a", "a")).toBe(0);
      expect(tree.distance.getWeightedGraphDistance(lut, "a1", "a1")).toBe(0);
    });

    test("returns customized weight for siblings", () => {
      // With sibling weight 1
      expect(
        tree.distance.getWeightedGraphDistance(lut, "a1", "a2", { sibling: 1 })
      ).toBe(1);

      // With sibling weight 0.5
      expect(
        tree.distance.getWeightedGraphDistance(lut, "a1", "a2", {
          sibling: 0.5,
        })
      ).toBe(0.5);

      // Without custom weight (defaults to standard graph distance: 2 * parentChild)
      expect(tree.distance.getWeightedGraphDistance(lut, "a1", "a2", {})).toBe(
        2
      );
    });

    test("returns weighted distance for parent-child", () => {
      // Default parentChild weight is 1
      expect(tree.distance.getWeightedGraphDistance(lut, "root", "a")).toBe(1);

      // Custom parentChild weight
      expect(
        tree.distance.getWeightedGraphDistance(lut, "root", "a", {
          parentChild: 2,
        })
      ).toBe(2);
    });

    test("returns standard weighted distance for non-sibling relationships", () => {
      // Grandparent-grandchild: distance 2 * parentChild weight 1 = 2
      expect(
        tree.distance.getWeightedGraphDistance(lut, "root", "a1", {
          sibling: 1,
        })
      ).toBe(2);

      // Cross-branch: standard distance 3 * parentChild weight 1 = 3
      expect(
        tree.distance.getWeightedGraphDistance(lut, "a1", "b", { sibling: 1 })
      ).toBe(3);
    });

    test("handles nodes that are not siblings", () => {
      // a1 and b are not siblings (different parents: a vs root)
      // Should use standard graph distance
      expect(
        tree.distance.getWeightedGraphDistance(lut, "a1", "b", { sibling: 1 })
      ).toBe(3);
    });
  });

  describe("edge cases", () => {
    test("handles single node tree", () => {
      const singleNodeDoc = {
        nodes: { root: { type: "container", id: "root" } },
        links: { root: [] },
      } as any;
      const singleLUT = createLUT(singleNodeDoc);

      expect(tree.distance.getGraphDistance(singleLUT, "root", "root")).toBe(0);
      expect(
        tree.distance.findNearestByGraphDistance(singleLUT, ["root"], ["root"])
      ).toBe("root");
    });

    test("handles linear tree (no branching)", () => {
      const linearDoc = {
        nodes: {
          a: { id: "a" },
          b: { id: "b" },
          c: { id: "c" },
        },
        links: {
          a: ["b"],
          b: ["c"],
          c: [],
        },
      } as any;
      const linearLUT = createLUT(linearDoc);

      expect(tree.distance.getGraphDistance(linearLUT, "a", "c")).toBe(2);
      expect(
        tree.distance.findNearestByGraphDistance(linearLUT, ["b", "c"], ["a"])
      ).toBe("b"); // b is closer (distance 1) than c (distance 2)
    });
  });
});
