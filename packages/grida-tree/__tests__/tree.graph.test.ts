import { tree } from "../src/lib";

/**
 * Tests for tree.graph - Graph-based tree structure with explicit node and link separation
 *
 * These tests document the expected behavior of the tree.graph system, which provides
 * a clean interface for managing large tree data structures by separating:
 * - nodes: the actual data
 * - links: the hierarchical relationships
 *
 * This design serves as a single source of truth without needing to re-map or re-wrap data.
 */

interface TestNode {
  name: string;
  value: number;
}

describe("tree.graph", () => {
  describe("IGraph interface", () => {
    it("should represent a graph with separate nodes and links", () => {
      const graph: tree.graph.IGraph<TestNode> = {
        nodes: {
          root: { name: "Root", value: 0 },
          child1: { name: "Child 1", value: 1 },
          child2: { name: "Child 2", value: 2 },
        },
        links: {
          root: ["child1", "child2"],
          child1: undefined,
          child2: undefined,
        },
      };

      expect(graph.nodes).toBeDefined();
      expect(graph.links).toBeDefined();
      expect(Object.keys(graph.nodes)).toHaveLength(3);
      expect(graph.links.root).toEqual(["child1", "child2"]);
    });

    it("should allow nodes without modifying their structure", () => {
      // The actual node data doesn't need any tree-specific properties
      const node: TestNode = { name: "Pure Data", value: 42 };

      const graph: tree.graph.IGraph<TestNode> = {
        nodes: {
          pureNode: node,
        },
        links: {
          pureNode: undefined,
        },
      };

      // Node remains unchanged
      expect(graph.nodes.pureNode).toEqual({ name: "Pure Data", value: 42 });
      expect("children" in graph.nodes.pureNode).toBe(false);
      expect("parent" in graph.nodes.pureNode).toBe(false);
    });
  });

  describe("Graph.snapshot()", () => {
    it("should create a shallow copy of the graph", () => {
      const original: tree.graph.IGraph<TestNode> = {
        nodes: {
          a: { name: "A", value: 1 },
        },
        links: {
          a: undefined,
        },
      };

      const graph = new tree.graph.Graph(original);
      const snapshot = graph.snapshot();

      expect(snapshot).toEqual(original);
      expect(snapshot).not.toBe(original); // Different object
      expect(snapshot.nodes).not.toBe(original.nodes); // Different record
      expect(snapshot.links).not.toBe(original.links); // Different record
    });

    it("should be useful for undo/redo functionality", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          child: { name: "Child", value: 1 },
        },
        links: {
          root: ["child"],
          child: undefined,
        },
      });

      const before = graph.snapshot();
      // After modifications, before can be used to restore state
      expect(before.links.root).toEqual(["child"]);
    });
  });

  describe("Graph.mv() - move nodes", () => {
    it("should move a single node to a new parent", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          parent1: { name: "Parent 1", value: 1 },
          parent2: { name: "Parent 2", value: 2 },
          child: { name: "Child", value: 3 },
        },
        links: {
          root: ["parent1", "parent2"],
          parent1: ["child"],
          parent2: undefined,
          child: undefined,
        },
      });

      // Move child from parent1 to parent2
      graph.mv("child", "parent2");

      const result = graph.snapshot();
      expect(result.links.parent1).toEqual([]);
      expect(result.links.parent2).toEqual(["child"]);
    });

    it("should move multiple nodes at once", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
        },
        links: {
          root: ["a", "b"],
          a: undefined,
          b: undefined,
          c: undefined,
        },
      });

      // Move both a and b under c
      graph.mv(["a", "b"], "c");

      const result = graph.snapshot();
      expect(result.links.root).toEqual([]);
      expect(result.links.c).toEqual(["a", "b"]);
    });

    it("should insert at a specific index", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
        },
        links: {
          root: ["a", "b"],
          a: undefined,
          b: undefined,
          c: undefined,
        },
      });

      // Insert c at index 1 (between a and b)
      graph.mv("c", "root", 1);

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["a", "c", "b"]);
    });

    it("should append when index is -1", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
        },
        links: {
          root: ["a"],
          a: undefined,
          b: undefined,
        },
      });

      // Default index of -1 should append
      graph.mv("b", "root");

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["a", "b"]);
    });

    it("should insert at index 0 (beginning)", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
        },
        links: {
          root: ["a", "b"],
          a: undefined,
          b: undefined,
          c: undefined,
        },
      });

      graph.mv("c", "root", 0);

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["c", "a", "b"]);
    });

    it("should handle moving orphaned node", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          orphan: { name: "Orphan", value: 1 },
        },
        links: {
          root: [],
          orphan: undefined,
        },
      });

      // Move orphaned node to root
      graph.mv("orphan", "root");

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["orphan"]);
    });

    it("should reposition node within same parent", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
        },
        links: {
          root: ["a", "b", "c"],
          a: undefined,
          b: undefined,
          c: undefined,
        },
      });

      // Move 'a' to position 2 (after b and c)
      graph.mv("a", "root", 2);

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["b", "c", "a"]);
    });

    it("should maintain order when moving multiple nodes", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          target: { name: "Target", value: 1 },
          a: { name: "A", value: 2 },
          b: { name: "B", value: 3 },
          c: { name: "C", value: 4 },
        },
        links: {
          root: ["a", "b", "c"],
          target: [],
          a: undefined,
          b: undefined,
          c: undefined,
        },
      });

      // Move a and c to target at index 0
      graph.mv(["a", "c"], "target", 0);

      const result = graph.snapshot();
      expect(result.links.target).toEqual(["a", "c"]);
      expect(result.links.root).toEqual(["b"]);
    });

    it("should clamp index when exceeding children length", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
        },
        links: {
          root: ["a"],
          a: undefined,
          b: undefined,
        },
      });

      // Index 999 should clamp to end
      graph.mv("b", "root", 999);

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["a", "b"]);
    });

    it("should throw error when moving non-existent node", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
        },
        links: {
          root: undefined,
        },
      });

      expect(() => graph.mv("nonexistent", "root")).toThrow(
        "mv: cannot move 'nonexistent': No such node"
      );
    });

    it("should throw error when moving to non-existent target", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          child: { name: "Child", value: 1 },
        },
        links: {
          root: ["child"],
          child: undefined,
        },
      });

      expect(() => graph.mv("child", "nonexistent")).toThrow(
        "mv: cannot move to 'nonexistent': No such node"
      );
    });

    it("should handle target with undefined links", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          target: { name: "Target", value: 1 },
          child: { name: "Child", value: 2 },
        },
        links: {
          root: ["child"],
          target: undefined, // Target has undefined links (allowed in graph)
          child: undefined,
        },
      });

      // In graph, undefined links are allowed and will be initialized
      graph.mv("child", "target");

      const result = graph.snapshot();
      expect(result.links.target).toEqual(["child"]);
      expect(result.links.root).toEqual([]);
    });

    it("should handle target with no links entry at all", () => {
      const graphData: tree.graph.IGraph<TestNode> = {
        nodes: {
          root: { name: "Root", value: 0 },
          target: { name: "Target", value: 1 },
          child: { name: "Child", value: 2 },
        },
        links: {
          root: ["child"],
          child: undefined,
          // target is missing entirely from links
        },
      };

      const graph = new tree.graph.Graph(graphData);

      // In graph, missing link entries are allowed and will be initialized
      graph.mv("child", "target");

      const result = graph.snapshot();
      expect(result.links.target).toEqual(["child"]);
      expect(result.links.root).toEqual([]);
    });

    it("should handle complex tree restructuring", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
          d: { name: "D", value: 4 },
        },
        links: {
          root: ["a", "b"],
          a: ["c"],
          b: ["d"],
          c: undefined,
          d: undefined,
        },
      });

      // Tree: root -> [a -> [c], b -> [d]]
      // Move c and d to root
      graph.mv("c", "root", 1); // Insert c at index 1 (between a and b)
      graph.mv("d", "root", 0); // Insert d at beginning

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["d", "a", "c", "b"]);
      expect(result.links.a).toEqual([]);
      expect(result.links.b).toEqual([]);
    });

    describe("Mathematical correctness - edge cases", () => {
      it("should correctly move node to end when already at end", () => {
        const graph = new tree.graph.Graph<TestNode>({
          nodes: {
            root: { name: "Root", value: 0 },
            a: { name: "A", value: 1 },
            b: { name: "B", value: 2 },
            c: { name: "C", value: 3 },
          },
          links: {
            root: ["a", "b", "c"],
            a: undefined,
            b: undefined,
            c: undefined,
          },
        });

        // c is at index 2, move to index 2 (or append)
        graph.mv("c", "root");

        const result = graph.snapshot();
        expect(result.links.root).toEqual(["a", "b", "c"]);
      });

      it("should correctly handle moving first element to second position", () => {
        const graph = new tree.graph.Graph<TestNode>({
          nodes: {
            root: { name: "Root", value: 0 },
            a: { name: "A", value: 1 },
            b: { name: "B", value: 2 },
            c: { name: "C", value: 3 },
          },
          links: {
            root: ["a", "b", "c"],
            a: undefined,
            b: undefined,
            c: undefined,
          },
        });

        // Move 'a' from index 0 to index 1
        graph.mv("a", "root", 1);

        const result = graph.snapshot();
        // After detach: [b, c]
        // Insert at 1: [b, a, c]
        expect(result.links.root).toEqual(["b", "a", "c"]);
      });

      it("should correctly handle moving last element forward", () => {
        const graph = new tree.graph.Graph<TestNode>({
          nodes: {
            root: { name: "Root", value: 0 },
            a: { name: "A", value: 1 },
            b: { name: "B", value: 2 },
            c: { name: "C", value: 3 },
            d: { name: "D", value: 4 },
          },
          links: {
            root: ["a", "b", "c", "d"],
            a: undefined,
            b: undefined,
            c: undefined,
            d: undefined,
          },
        });

        // Move 'd' from index 3 to index 1
        graph.mv("d", "root", 1);

        const result = graph.snapshot();
        // After detach: [a, b, c]
        // Insert at 1: [a, d, b, c]
        expect(result.links.root).toEqual(["a", "d", "b", "c"]);
      });

      it("should correctly handle moving middle element to beginning", () => {
        const graph = new tree.graph.Graph<TestNode>({
          nodes: {
            root: { name: "Root", value: 0 },
            a: { name: "A", value: 1 },
            b: { name: "B", value: 2 },
            c: { name: "C", value: 3 },
            d: { name: "D", value: 4 },
          },
          links: {
            root: ["a", "b", "c", "d"],
            a: undefined,
            b: undefined,
            c: undefined,
            d: undefined,
          },
        });

        // Move 'c' from index 2 to index 0
        graph.mv("c", "root", 0);

        const result = graph.snapshot();
        // After detach: [a, b, d]
        // Insert at 0: [c, a, b, d]
        expect(result.links.root).toEqual(["c", "a", "b", "d"]);
      });

      it("should maintain relative order when moving multiple non-contiguous nodes", () => {
        const graph = new tree.graph.Graph<TestNode>({
          nodes: {
            root: { name: "Root", value: 0 },
            a: { name: "A", value: 1 },
            b: { name: "B", value: 2 },
            c: { name: "C", value: 3 },
            d: { name: "D", value: 4 },
            e: { name: "E", value: 5 },
          },
          links: {
            root: ["a", "b", "c", "d", "e"],
            a: undefined,
            b: undefined,
            c: undefined,
            d: undefined,
            e: undefined,
          },
        });

        // Move [a, c, e] to beginning
        graph.mv(["a", "c", "e"], "root", 0);

        const result = graph.snapshot();
        // First: detach a: [b, c, d, e], insert at 0: [a, b, c, d, e], pos=1
        // Second: detach c: [a, b, d, e], insert at 1: [a, c, b, d, e], pos=2
        // Third: detach e: [a, c, b, d], insert at 2: [a, c, e, b, d]
        expect(result.links.root).toEqual(["a", "c", "e", "b", "d"]);
      });

      it("should handle moving consecutive nodes together", () => {
        const graph = new tree.graph.Graph<TestNode>({
          nodes: {
            root: { name: "Root", value: 0 },
            a: { name: "A", value: 1 },
            b: { name: "B", value: 2 },
            c: { name: "C", value: 3 },
            d: { name: "D", value: 4 },
            e: { name: "E", value: 5 },
          },
          links: {
            root: ["a", "b", "c", "d", "e"],
            a: undefined,
            b: undefined,
            c: undefined,
            d: undefined,
            e: undefined,
          },
        });

        // Move [b, c] to the end
        graph.mv(["b", "c"], "root");

        const result = graph.snapshot();
        // First: detach b: [a, c, d, e], insert at end: [a, c, d, e, b]
        // Second: detach c: [a, d, e, b], insert at end: [a, d, e, b, c]
        expect(result.links.root).toEqual(["a", "d", "e", "b", "c"]);
      });

      it("should handle moving all children to reorder them", () => {
        const graph = new tree.graph.Graph<TestNode>({
          nodes: {
            root: { name: "Root", value: 0 },
            a: { name: "A", value: 1 },
            b: { name: "B", value: 2 },
            c: { name: "C", value: 3 },
          },
          links: {
            root: ["a", "b", "c"],
            a: undefined,
            b: undefined,
            c: undefined,
          },
        });

        // Reverse order by moving [c, b, a] to beginning
        graph.mv(["c", "b", "a"], "root", 0);

        const result = graph.snapshot();
        // First: detach c: [a, b], insert at 0: [c, a, b], pos=1
        // Second: detach b: [c, a], insert at 1: [c, b, a], pos=2
        // Third: detach a: [c, b], insert at 2: [c, b, a]
        expect(result.links.root).toEqual(["c", "b", "a"]);
      });

      it("should handle index beyond array length correctly", () => {
        const graph = new tree.graph.Graph<TestNode>({
          nodes: {
            root: { name: "Root", value: 0 },
            a: { name: "A", value: 1 },
            b: { name: "B", value: 2 },
          },
          links: {
            root: ["a"],
            a: undefined,
            b: undefined,
          },
        });

        // Try to insert at index 100 (should clamp to end)
        graph.mv("b", "root", 100);

        const result = graph.snapshot();
        expect(result.links.root).toEqual(["a", "b"]);
      });

      it("should handle moving to current position within same parent", () => {
        const graph = new tree.graph.Graph<TestNode>({
          nodes: {
            root: { name: "Root", value: 0 },
            a: { name: "A", value: 1 },
            b: { name: "B", value: 2 },
            c: { name: "C", value: 3 },
          },
          links: {
            root: ["a", "b", "c"],
            a: undefined,
            b: undefined,
            c: undefined,
          },
        });

        // Move 'b' to its current position (index 1)
        graph.mv("b", "root", 1);

        const result = graph.snapshot();
        // After detach: [a, c]
        // Insert at 1: [a, b, c]
        expect(result.links.root).toEqual(["a", "b", "c"]);
      });
    });
  });

  describe("Graph.rm() - remove nodes recursively", () => {
    it("should remove a node and its subtree", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
        },
        links: {
          root: ["a"],
          a: ["b", "c"],
          b: undefined,
          c: undefined,
        },
      });

      // Remove 'a' and its children
      const removed = graph.rm("a");

      expect(removed).toEqual(["b", "c", "a"]); // Children first, then parent
      const result = graph.snapshot();
      expect(result.links.root).toEqual([]);
      expect(result.nodes.a).toBeUndefined();
      expect(result.nodes.b).toBeUndefined();
      expect(result.nodes.c).toBeUndefined();
    });

    it("should return removed node IDs for undo functionality", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          child: { name: "Child", value: 1 },
        },
        links: {
          root: ["child"],
          child: undefined,
        },
      });

      const removed = graph.rm("child");
      expect(removed).toEqual(["child"]);
    });

    it("should throw error when trying to remove non-existent node", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
        },
        links: {
          root: undefined,
        },
      });

      expect(() => graph.rm("nonexistent")).toThrow(
        "rm: cannot remove 'nonexistent': No such node"
      );
    });
  });

  describe("Graph.unlink() - remove single node", () => {
    it("should remove only the specified node", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
        },
        links: {
          root: ["a"],
          a: ["b"],
          b: undefined,
        },
      });

      // Remove 'a' but keep 'b' (it becomes orphaned)
      graph.unlink("a");

      const result = graph.snapshot();
      expect(result.nodes.a).toBeUndefined();
      expect(result.nodes.b).toBeDefined(); // b still exists
      expect(result.links.root).toEqual([]);
      expect("b" in result.links).toBe(true); // b's links entry still exists
      expect(result.links.a).toBeUndefined(); // a's links are removed
    });

    it("should allow re-attaching orphaned nodes", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
        },
        links: {
          root: ["a"],
          a: ["b"],
          b: undefined,
        },
      });

      graph.unlink("a");
      // b is now orphaned, re-attach it to root
      graph.mv("b", "root");

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["b"]);
    });

    it("should throw error when trying to unlink non-existent node", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
        },
        links: {
          root: undefined,
        },
      });

      expect(() => graph.unlink("nonexistent")).toThrow(
        "unlink: cannot unlink 'nonexistent': No such node"
      );
    });
  });

  describe("Graph.order() - reorder within parent", () => {
    it("should move node to front", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
        },
        links: {
          root: ["a", "b", "c"],
          a: undefined,
          b: undefined,
          c: undefined,
        },
      });

      graph.order("a", "front");

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["b", "c", "a"]);
    });

    it("should move node to back", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
        },
        links: {
          root: ["a", "b", "c"],
          a: undefined,
          b: undefined,
          c: undefined,
        },
      });

      graph.order("c", "back");

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["c", "a", "b"]);
    });

    it("should move node forward one position", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
        },
        links: {
          root: ["a", "b", "c"],
          a: undefined,
          b: undefined,
          c: undefined,
        },
      });

      graph.order("a", "forward");

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["b", "a", "c"]);
    });

    it("should move node backward one position", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
        },
        links: {
          root: ["a", "b", "c"],
          a: undefined,
          b: undefined,
          c: undefined,
        },
      });

      graph.order("c", "backward");

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["a", "c", "b"]);
    });

    it("should move node to specific index", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
          d: { name: "D", value: 4 },
        },
        links: {
          root: ["a", "b", "c", "d"],
          a: undefined,
          b: undefined,
          c: undefined,
          d: undefined,
        },
      });

      graph.order("d", 1);

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["a", "d", "b", "c"]);
    });

    it("should do nothing for orphan nodes", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          orphan: { name: "Orphan", value: 0 },
        },
        links: {
          orphan: undefined,
        },
      });

      // Should not throw, just no-op
      graph.order("orphan", "front");

      const result = graph.snapshot();
      expect(result.links.orphan).toBeUndefined();
    });

    it("should do nothing when moving backward from first position", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
        },
        links: {
          root: ["a", "b"],
          a: undefined,
          b: undefined,
        },
      });

      graph.order("a", "backward");

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["a", "b"]);
    });

    it("should do nothing when moving forward from last position", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
        },
        links: {
          root: ["a", "b"],
          a: undefined,
          b: undefined,
        },
      });

      graph.order("b", "forward");

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["a", "b"]);
    });

    it("should clamp negative index to 0", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
        },
        links: {
          root: ["a", "b", "c"],
          a: undefined,
          b: undefined,
          c: undefined,
        },
      });

      graph.order("c", -999);

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["c", "a", "b"]);
    });

    it("should clamp index beyond length to end", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          a: { name: "A", value: 1 },
          b: { name: "B", value: 2 },
          c: { name: "C", value: 3 },
        },
        links: {
          root: ["a", "b", "c"],
          a: undefined,
          b: undefined,
          c: undefined,
        },
      });

      graph.order("a", 999);

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["b", "c", "a"]);
    });

    it("should throw error for non-existent node", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
        },
        links: {
          root: undefined,
        },
      });

      expect(() => graph.order("nonexistent", "front")).toThrow(
        "order: cannot reorder 'nonexistent': No such node"
      );
    });
  });

  describe("Mutability Pattern", () => {
    it("should modify constructor data directly (in-place mutation)", () => {
      const graphData: tree.graph.IGraph<TestNode> = {
        nodes: {
          root: { name: "Root", value: 0 },
          child: { name: "Child", value: 1 },
        },
        links: {
          root: ["child"],
          child: undefined,
        },
      };

      const graph = new tree.graph.Graph(graphData);

      // Verify initial state
      expect(graphData.nodes.child).toBeDefined();
      expect(graphData.links.root).toEqual(["child"]);

      // Mutate via graph
      graph.rm("child");

      // The original graphData is modified directly
      expect(graphData.nodes.child).toBeUndefined();
      expect(graphData.links.root).toEqual([]);
      expect(graphData.links.child).toBeUndefined();
    });

    it("should work with Immer-like draft pattern", () => {
      // Simulate Immer's draft pattern
      const originalState = {
        document: {
          nodes: {
            root: { name: "Root", value: 0 },
            a: { name: "A", value: 1 },
            b: { name: "B", value: 2 },
          },
          links: {
            root: ["a", "b"],
            a: undefined,
            b: undefined,
          },
        },
      };

      // Create a draft (in real usage, Immer's produce would do this)
      const draft = JSON.parse(JSON.stringify(originalState));

      // Pass draft to Graph - mutations apply to draft
      const graph = new tree.graph.Graph(draft.document);
      graph.rm("a");

      // Original is unchanged
      expect(originalState.document.nodes.a).toBeDefined();

      // Draft is modified
      expect(draft.document.nodes.a).toBeUndefined();
      expect(draft.document.links.root).toEqual(["b"]);
    });

    it("should allow manual snapshots for undo functionality", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          child: { name: "Child", value: 1 },
        },
        links: {
          root: ["child"],
          child: undefined,
        },
      });

      // Create backup before mutation
      const backup = graph.snapshot();

      // Mutate
      graph.rm("child");
      expect(graph.snapshot().nodes.child).toBeUndefined();

      // Can restore from backup
      expect(backup.nodes.child).toBeDefined();
      expect(backup.links.root).toEqual(["child"]);
    });
  });

  describe("Design Philosophy", () => {
    it("should keep data and structure separate", () => {
      // Your domain objects remain pure
      interface PureNode {
        id: string;
        content: string;
      }

      const myData: PureNode = {
        id: "test",
        content: "Hello World",
      };

      // No need to add parent/children properties to the data
      const graph: tree.graph.IGraph<PureNode> = {
        nodes: {
          test: myData,
        },
        links: {
          test: undefined,
        },
      };

      // Data stays pure - no tree properties added
      expect(graph.nodes.test).toEqual(myData);
      expect("children" in graph.nodes.test).toBe(false);
      expect("parent" in graph.nodes.test).toBe(false);
    });

    it("should serve as single source of truth", () => {
      // The graph is your primary data structure
      // No need for separate flat + nested representations
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root", value: 0 },
          child: { name: "Child", value: 1 },
        },
        links: {
          root: ["child"],
          child: undefined,
        },
      });

      // You can get the current state anytime
      const state = graph.snapshot();

      // State contains everything you need
      expect(state.nodes).toBeDefined(); // Your data
      expect(state.links).toBeDefined(); // Your structure
    });

    it("should avoid re-mapping and re-wrapping", () => {
      // Traditional approach: wrap data in tree nodes
      // interface TreeNode<T> {
      //   data: T;
      //   parent?: TreeNode<T>;
      //   children: TreeNode<T>[];
      // }

      // Graph approach: keep data as-is
      const rawData = { name: "My Data", value: 123 };

      const graph: tree.graph.IGraph<typeof rawData> = {
        nodes: {
          item: rawData, // Direct reference, no wrapping
        },
        links: {
          item: undefined,
        },
      };

      // Access your data directly without unwrapping
      expect(graph.nodes.item.name).toBe("My Data");
      expect(graph.nodes.item.value).toBe(123);
    });
  });
});
