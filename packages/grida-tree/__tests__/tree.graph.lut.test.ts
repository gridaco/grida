import { tree } from "../src/lib";

describe("tree.graph.Graph generation and LUT caching", () => {
  interface TestNode {
    name: string;
  }

  describe("Generation counter", () => {
    it("should start with generation 0", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      expect(graph.generation).toBe(0);
    });

    it("should increment generation after mv()", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          child: { name: "Child" },
        },
        links: {
          root: [],
          child: undefined,
        },
      });

      const before = graph.generation;
      graph.mv("child", "root");
      const after = graph.generation;

      expect(after).toBeGreaterThan(before);
    });

    it("should increment generation after rm()", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          child: { name: "Child" },
        },
        links: {
          root: ["child"],
          child: undefined,
        },
      });

      const before = graph.generation;
      graph.rm("child");
      const after = graph.generation;

      expect(after).toBeGreaterThan(before);
    });

    it("should increment generation after unlink()", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          child: { name: "Child" },
        },
        links: {
          root: ["child"],
          child: undefined,
        },
      });

      const before = graph.generation;
      graph.unlink("child");
      const after = graph.generation;

      expect(after).toBeGreaterThan(before);
    });

    it("should increment generation after order()", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          a: { name: "A" },
          b: { name: "B" },
        },
        links: {
          root: ["a", "b"],
          a: undefined,
          b: undefined,
        },
      });

      const before = graph.generation;
      graph.order("a", "front");
      const after = graph.generation;

      expect(after).toBeGreaterThan(before);
    });

    it("should increment generation after import()", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: { child: { name: "Child" } },
        links: { child: undefined },
      };

      const before = graph.generation;
      graph.import(subgraph, ["child"], "root");
      const after = graph.generation;

      expect(after).toBeGreaterThan(before);
    });

    it("should not increment generation for failed operations", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const before = graph.generation;

      // Try to move non-existent node
      try {
        graph.mv("nonexistent", "root");
      } catch (e) {
        // Expected to fail
      }

      const after = graph.generation;
      expect(after).toBe(before); // Generation unchanged
    });

    it("should not increment on no-op order()", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          orphan: { name: "Orphan" },
        },
        links: {
          root: [],
          orphan: undefined,
        },
      });

      const before = graph.generation;
      graph.order("orphan", "front"); // No-op (orphan has no parent)
      const after = graph.generation;

      expect(after).toBe(before); // Generation unchanged for no-op
    });
  });

  describe("LUT caching", () => {
    it("should compute LUT on first access", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          child: { name: "Child" },
        },
        links: {
          root: ["child"],
          child: undefined,
        },
      });

      const lut = graph.lut;

      expect(lut.lu_keys).toContain("root");
      expect(lut.lu_keys).toContain("child");
      expect(lut.lu_parent.child).toBe("root");
      expect(lut.lu_parent.root).toBeNull();
      expect(lut.lu_children.root).toEqual(["child"]);
    });

    it("should return cached LUT when generation unchanged", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          child: { name: "Child" },
        },
        links: {
          root: ["child"],
          child: undefined,
        },
      });

      const lut1 = graph.lut;
      const lut2 = graph.lut;

      // Should be same instance (cached)
      expect(lut1).toBe(lut2);
    });

    it("should recompute LUT when generation changes", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          child: { name: "Child" },
        },
        links: {
          root: [],
          child: undefined,
        },
      });

      const lut1 = graph.lut;

      // Mutate graph
      graph.mv("child", "root");

      const lut2 = graph.lut;

      // Should be different instance (recomputed)
      expect(lut1).not.toBe(lut2);

      // Content should reflect new structure
      expect(lut1.lu_parent.child).toBeNull();
      expect(lut2.lu_parent.child).toBe("root");
    });

    it("should reflect correct structure in LUT", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          a: { name: "A" },
          b: { name: "B" },
          c: { name: "C" },
        },
        links: {
          root: ["a", "b"],
          a: ["c"],
          b: undefined,
          c: undefined,
        },
      });

      const lut = graph.lut;

      expect(lut.lu_parent.a).toBe("root");
      expect(lut.lu_parent.b).toBe("root");
      expect(lut.lu_parent.c).toBe("a");
      expect(lut.lu_children.root).toEqual(["a", "b"]);
      expect(lut.lu_children.a).toEqual(["c"]);
      expect(lut.lu_children.b).toEqual([]);
    });

    it("should update LUT after rm()", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          a: { name: "A" },
          b: { name: "B" },
        },
        links: {
          root: ["a", "b"],
          a: undefined,
          b: undefined,
        },
      });

      graph.rm("a");
      const lut = graph.lut;

      expect(lut.lu_keys).not.toContain("a");
      expect(lut.lu_children.root).toEqual(["b"]);
    });

    it("should update LUT after order()", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          a: { name: "A" },
          b: { name: "B" },
          c: { name: "C" },
        },
        links: {
          root: ["a", "b", "c"],
          a: undefined,
          b: undefined,
          c: undefined,
        },
      });

      graph.order("a", "front");
      const lut = graph.lut;

      expect(lut.lu_children.root).toEqual(["b", "c", "a"]);
    });

    it("should update LUT after import()", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          imported: { name: "Imported" },
          child: { name: "Child" },
        },
        links: {
          imported: ["child"],
          child: undefined,
        },
      };

      graph.import(subgraph, ["imported"], "root");
      const lut = graph.lut;

      expect(lut.lu_keys).toContain("imported");
      expect(lut.lu_keys).toContain("child");
      expect(lut.lu_parent.imported).toBe("root");
      expect(lut.lu_parent.child).toBe("imported");
    });
  });

  describe("LUT integration with tree.lut.TreeLUT", () => {
    it("should be usable with TreeLUT class", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          a: { name: "A" },
          b: { name: "B" },
          c: { name: "C" },
        },
        links: {
          root: ["a", "b"],
          a: ["c"],
          b: undefined,
          c: undefined,
        },
      });

      const treeLUT = new tree.lut.TreeLUT(graph.lut);

      expect(treeLUT.depthOf("c")).toBe(2);
      expect(treeLUT.parentOf("c")).toBe("a");
      expect(treeLUT.childrenOf("root")).toEqual(["a", "b"]);
      expect(treeLUT.isAncestorOf("root", "c")).toBe(true);
    });

    it("should update TreeLUT after graph mutations", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          a: { name: "A" },
          b: { name: "B" },
        },
        links: {
          root: ["a"],
          a: ["b"],
          b: undefined,
        },
      });

      let treeLUT = new tree.lut.TreeLUT(graph.lut);
      expect(treeLUT.depthOf("b")).toBe(2);

      // Move b to root
      graph.mv("b", "root");

      // Get new LUT (generation changed)
      treeLUT = new tree.lut.TreeLUT(graph.lut);
      expect(treeLUT.depthOf("b")).toBe(1);
      expect(treeLUT.parentOf("b")).toBe("root");
    });
  });

  describe("Performance - caching effectiveness", () => {
    it("should not recompute LUT on multiple reads", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          ...Object.fromEntries(
            Array.from({ length: 100 }, (_, i) => [
              `node${i}`,
              { name: `Node ${i}` },
            ])
          ),
        },
        links: {
          root: Array.from({ length: 100 }, (_, i) => `node${i}`),
          ...Object.fromEntries(
            Array.from({ length: 100 }, (_, i) => [`node${i}`, undefined])
          ),
        },
      });

      // First access
      const lut1 = graph.lut;
      const gen1 = graph.generation;

      // Multiple accesses without mutation
      const lut2 = graph.lut;
      const lut3 = graph.lut;
      const lut4 = graph.lut;

      // All should be same instance
      expect(lut1).toBe(lut2);
      expect(lut2).toBe(lut3);
      expect(lut3).toBe(lut4);

      // Generation unchanged
      expect(graph.generation).toBe(gen1);
    });

    it("should only recompute after actual mutations", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          a: { name: "A" },
          b: { name: "B" },
        },
        links: {
          root: ["a", "b"],
          a: undefined,
          b: undefined,
        },
      });

      const lut1 = graph.lut;

      // Mutation
      graph.order("a", "front");

      const lut2 = graph.lut;
      expect(lut1).not.toBe(lut2);

      // No mutation
      const lut3 = graph.lut;
      const lut4 = graph.lut;
      expect(lut3).toBe(lut4);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty graph", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {},
        links: {},
      });

      const lut = graph.lut;
      expect(lut.lu_keys).toEqual([]);
      expect(graph.generation).toBe(0);
    });

    it("should handle orphan nodes in LUT", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          orphan1: { name: "Orphan 1" },
          orphan2: { name: "Orphan 2" },
        },
        links: {
          orphan1: undefined,
          orphan2: undefined,
        },
      });

      const lut = graph.lut;
      expect(lut.lu_keys).toContain("orphan1");
      expect(lut.lu_keys).toContain("orphan2");
      expect(lut.lu_parent.orphan1).toBeNull();
      expect(lut.lu_parent.orphan2).toBeNull();
    });

    it("should handle complex mutations and maintain correct LUT", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          a: { name: "A" },
          b: { name: "B" },
          c: { name: "C" },
        },
        links: {
          root: ["a", "b"],
          a: undefined,
          b: ["c"],
          c: undefined,
        },
      });

      // Initial LUT
      let lut = graph.lut;
      expect(lut.lu_parent.c).toBe("b");

      // Move c from b to a
      graph.mv("c", "a");
      lut = graph.lut;
      expect(lut.lu_parent.c).toBe("a");
      expect(lut.lu_children.b).toEqual([]);
      expect(lut.lu_children.a).toEqual(["c"]);

      // Remove a (and c)
      graph.rm("a");
      lut = graph.lut;
      expect(lut.lu_keys).not.toContain("a");
      expect(lut.lu_keys).not.toContain("c");
    });
  });

  describe("Generation behavior notes", () => {
    it("should allow multiple generation increments per operation (rm)", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          parent: { name: "Parent" },
          child1: { name: "Child 1" },
          child2: { name: "Child 2" },
        },
        links: {
          root: ["parent"],
          parent: ["child1", "child2"],
          child1: undefined,
          child2: undefined,
        },
      });

      const before = graph.generation;
      graph.rm("parent"); // Recursive removal
      const after = graph.generation;

      // May increment multiple times (that's fine)
      expect(after).toBeGreaterThan(before);
    });

    it("should track generation across multiple operations", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          a: { name: "A" },
          b: { name: "B" },
        },
        links: {
          root: [],
          a: undefined,
          b: undefined,
        },
      });

      const gens: number[] = [graph.generation];

      graph.mv("a", "root");
      gens.push(graph.generation);

      graph.mv("b", "root");
      gens.push(graph.generation);

      graph.order("a", "front"); // Move a to end (effective operation)
      gens.push(graph.generation);

      graph.unlink("a");
      gens.push(graph.generation);

      // Each operation should increase generation
      for (let i = 1; i < gens.length; i++) {
        expect(gens[i]).toBeGreaterThan(gens[i - 1]);
      }
    });
  });
});
