import { tree } from "../src/lib";

describe("tree.graph.Graph.import()", () => {
  interface TestNode {
    name: string;
  }

  describe("Basic import operations", () => {
    it("should import a simple subgraph with single root", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          page: { name: "Page" },
        },
        links: {
          page: [],
        },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          header: { name: "Header" },
          logo: { name: "Logo" },
          title: { name: "Title" },
        },
        links: {
          header: ["logo", "title"],
          logo: undefined,
          title: undefined,
        },
      };

      graph.import(subgraph, ["header"], "page");

      const result = graph.snapshot();
      expect(result.nodes.page).toEqual({ name: "Page" });
      expect(result.nodes.header).toEqual({ name: "Header" });
      expect(result.nodes.logo).toEqual({ name: "Logo" });
      expect(result.nodes.title).toEqual({ name: "Title" });
      expect(result.links.page).toEqual(["header"]);
      expect(result.links.header).toEqual(["logo", "title"]);
    });

    it("should import multiple root nodes", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          container: { name: "Container" },
        },
        links: {
          container: [],
        },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          box1: { name: "Box 1" },
          box2: { name: "Box 2" },
          text1: { name: "Text 1" },
        },
        links: {
          box1: undefined,
          box2: undefined,
          text1: undefined,
        },
      };

      graph.import(subgraph, ["box1", "box2", "text1"], "container");

      const result = graph.snapshot();
      expect(result.links.container).toEqual(["box1", "box2", "text1"]);
    });

    it("should preserve internal links within imported subgraph", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          parent: { name: "Parent" },
          child1: { name: "Child 1" },
          child2: { name: "Child 2" },
          grandchild: { name: "Grandchild" },
        },
        links: {
          parent: ["child1", "child2"],
          child1: ["grandchild"],
          child2: undefined,
          grandchild: undefined,
        },
      };

      graph.import(subgraph, ["parent"], "root");

      const result = graph.snapshot();
      expect(result.links.parent).toEqual(["child1", "child2"]);
      expect(result.links.child1).toEqual(["grandchild"]);
      expect(result.links.child2).toBeUndefined();
    });

    it("should import at specific index", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          container: { name: "Container" },
          existing1: { name: "Existing 1" },
          existing2: { name: "Existing 2" },
        },
        links: {
          container: ["existing1", "existing2"],
          existing1: undefined,
          existing2: undefined,
        },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          newNode: { name: "New Node" },
        },
        links: {
          newNode: undefined,
        },
      };

      graph.import(subgraph, ["newNode"], "container", 1);

      const result = graph.snapshot();
      expect(result.links.container).toEqual([
        "existing1",
        "newNode",
        "existing2",
      ]);
    });

    it("should append when index is -1 (default)", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          parent: { name: "Parent" },
          child1: { name: "Child 1" },
        },
        links: {
          parent: ["child1"],
          child1: undefined,
        },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          child2: { name: "Child 2" },
        },
        links: {
          child2: undefined,
        },
      };

      graph.import(subgraph, ["child2"], "parent", -1);

      const result = graph.snapshot();
      expect(result.links.parent).toEqual(["child1", "child2"]);
    });

    it("should preserve order of multiple roots", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          a: { name: "A" },
          b: { name: "B" },
          c: { name: "C" },
        },
        links: {
          a: undefined,
          b: undefined,
          c: undefined,
        },
      };

      graph.import(subgraph, ["a", "b", "c"], "root");

      const result = graph.snapshot();
      expect(result.links.root).toEqual(["a", "b", "c"]);
    });
  });

  describe("Orphan node handling", () => {
    it("should add all nodes from subgraph, even orphans", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          attached: { name: "Attached" },
          orphan: { name: "Orphan" },
        },
        links: {
          attached: undefined,
          orphan: undefined,
        },
      };

      graph.import(subgraph, ["attached"], "root");

      const result = graph.snapshot();
      expect(result.nodes.attached).toEqual({ name: "Attached" });
      expect(result.nodes.orphan).toEqual({ name: "Orphan" });
      expect(result.links.root).toEqual(["attached"]);
      expect(result.links.orphan).toBeUndefined();
    });

    it("should preserve orphan nodes with their subtrees", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          main: { name: "Main" },
          orphanParent: { name: "Orphan Parent" },
          orphanChild: { name: "Orphan Child" },
        },
        links: {
          main: undefined,
          orphanParent: ["orphanChild"],
          orphanChild: undefined,
        },
      };

      graph.import(subgraph, ["main"], "root");

      const result = graph.snapshot();
      expect(result.nodes.orphanParent).toEqual({ name: "Orphan Parent" });
      expect(result.nodes.orphanChild).toEqual({ name: "Orphan Child" });
      expect(result.links.orphanParent).toEqual(["orphanChild"]);
      expect(result.links.root).toEqual(["main"]);
    });
  });

  describe("Error handling - ID conflicts", () => {
    it("should throw on node ID conflicts", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          existing: { name: "Existing Node" },
        },
        links: {
          root: ["existing"],
          existing: undefined,
        },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          existing: { name: "Conflicting Node" },
          newNode: { name: "New Node" },
        },
        links: {
          existing: ["newNode"],
          newNode: undefined,
        },
      };

      expect(() => graph.import(subgraph, ["existing"], "root")).toThrow(
        "import: node ID conflict - 'existing' already exists"
      );
    });

    it("should check all IDs before any mutation (atomic)", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          conflict: { name: "Conflict" },
        },
        links: {
          root: [],
          conflict: undefined,
        },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          good1: { name: "Good 1" },
          conflict: { name: "Bad" },
          good2: { name: "Good 2" },
        },
        links: {
          good1: undefined,
          conflict: undefined,
          good2: undefined,
        },
      };

      expect(() =>
        graph.import(subgraph, ["good1", "good2"], "root")
      ).toThrow();

      // Verify nothing was added (atomic failure)
      const result = graph.snapshot();
      expect(result.nodes.good1).toBeUndefined();
      expect(result.nodes.good2).toBeUndefined();
      expect(result.links.root).toEqual([]);
    });
  });

  describe("Error handling - validation", () => {
    it("should throw if parent doesn't exist", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: { child: { name: "Child" } },
        links: { child: undefined },
      };

      expect(() => graph.import(subgraph, ["child"], "nonexistent")).toThrow(
        "import: cannot import to 'nonexistent': No such node"
      );
    });

    it("should throw if root ID doesn't exist in subgraph", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: { child: { name: "Child" } },
        links: { child: undefined },
      };

      expect(() => graph.import(subgraph, ["nonexistent"], "root")).toThrow(
        "import: root 'nonexistent' not found in subgraph"
      );
    });

    it("should validate all roots before import", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          child1: { name: "Child 1" },
          child2: { name: "Child 2" },
        },
        links: {
          child1: undefined,
          child2: undefined,
        },
      };

      expect(() =>
        graph.import(subgraph, ["child1", "missing", "child2"], "root")
      ).toThrow("import: root 'missing' not found in subgraph");

      // Nothing should be imported (atomic)
      const result = graph.snapshot();
      expect(result.nodes.child1).toBeUndefined();
      expect(result.nodes.child2).toBeUndefined();
    });
  });

  describe("Policy integration", () => {
    interface DesignNode {
      type: "scene" | "frame" | "text" | "image";
      name: string;
    }

    const DESIGN_POLICY: tree.graph.IGraphPolicy<DesignNode> = {
      max_out_degree: (node: DesignNode) => {
        if (node.type === "text" || node.type === "image") return 0;
        return Infinity;
      },
      can_be_parent: (node: DesignNode) => {
        return ["scene", "frame"].includes(node.type);
      },
      can_be_child: (node: DesignNode) => {
        return node.type !== "scene";
      },
    };

    it("should enforce policy during root attachment", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            page: { type: "scene", name: "Page" },
            text: { type: "text", name: "Text" },
          },
          links: {
            page: ["text"],
            text: undefined,
          },
        },
        DESIGN_POLICY
      );

      const subgraph: tree.graph.IGraph<DesignNode> = {
        nodes: {
          frame: { type: "frame", name: "Frame" },
        },
        links: {
          frame: undefined,
        },
      };

      // Try to import under text node (violates can_be_parent)
      expect(() => graph.import(subgraph, ["frame"], "text")).toThrow(
        "mv: cannot move to 'text': Node cannot be a parent"
      );
    });

    it("should enforce can_be_child policy on imported roots", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            page: { type: "scene", name: "Page" },
            container: { type: "frame", name: "Container" },
          },
          links: {
            page: ["container"],
            container: undefined,
          },
        },
        DESIGN_POLICY
      );

      const subgraph: tree.graph.IGraph<DesignNode> = {
        nodes: {
          anotherScene: { type: "scene", name: "Another Scene" },
        },
        links: {
          anotherScene: undefined,
        },
      };

      // Scenes cannot be children (policy violation)
      expect(() =>
        graph.import(subgraph, ["anotherScene"], "container")
      ).toThrow("mv: cannot move 'anotherScene': Node cannot be a child");
    });

    it("should succeed when policy allows import", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            page: { type: "scene", name: "Page" },
          },
          links: {
            page: [],
          },
        },
        DESIGN_POLICY
      );

      const subgraph: tree.graph.IGraph<DesignNode> = {
        nodes: {
          header: { type: "frame", name: "Header" },
          logo: { type: "image", name: "Logo" },
        },
        links: {
          header: ["logo"],
          logo: undefined,
        },
      };

      expect(() => graph.import(subgraph, ["header"], "page")).not.toThrow();

      const result = graph.snapshot();
      expect(result.links.page).toEqual(["header"]);
      expect(result.links.header).toEqual(["logo"]);
    });
  });

  describe("Complex scenarios", () => {
    it("should import into existing non-empty parent", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          existing1: { name: "Existing 1" },
          existing2: { name: "Existing 2" },
        },
        links: {
          root: ["existing1", "existing2"],
          existing1: undefined,
          existing2: undefined,
        },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          new1: { name: "New 1" },
          new2: { name: "New 2" },
        },
        links: {
          new1: undefined,
          new2: undefined,
        },
      };

      graph.import(subgraph, ["new1", "new2"], "root");

      const result = graph.snapshot();
      expect(result.links.root).toEqual([
        "existing1",
        "existing2",
        "new1",
        "new2",
      ]);
    });

    it("should handle import at start (index 0)", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          parent: { name: "Parent" },
          child1: { name: "Child 1" },
          child2: { name: "Child 2" },
        },
        links: {
          parent: ["child1", "child2"],
          child1: undefined,
          child2: undefined,
        },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          newFirst: { name: "New First" },
        },
        links: {
          newFirst: undefined,
        },
      };

      graph.import(subgraph, ["newFirst"], "parent", 0);

      const result = graph.snapshot();
      expect(result.links.parent).toEqual(["newFirst", "child1", "child2"]);
    });

    it("should handle deep hierarchy import", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          l1: { name: "Level 1" },
          l2: { name: "Level 2" },
          l3: { name: "Level 3" },
          l4: { name: "Level 4" },
        },
        links: {
          l1: ["l2"],
          l2: ["l3"],
          l3: ["l4"],
          l4: undefined,
        },
      };

      graph.import(subgraph, ["l1"], "root");

      const result = graph.snapshot();
      expect(result.links.l1).toEqual(["l2"]);
      expect(result.links.l2).toEqual(["l3"]);
      expect(result.links.l3).toEqual(["l4"]);
    });

    it("should handle importing empty subgraph (no roots)", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          orphan: { name: "Orphan" },
        },
        links: {
          orphan: undefined,
        },
      };

      // Empty roots array - just adds nodes without linking
      graph.import(subgraph, [], "root");

      const result = graph.snapshot();
      expect(result.nodes.orphan).toEqual({ name: "Orphan" });
      expect(result.links.root).toEqual([]);
    });
  });

  describe("Mathematical correctness", () => {
    it("should handle index clamping", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          parent: { name: "Parent" },
          child: { name: "Child" },
        },
        links: {
          parent: ["child"],
          child: undefined,
        },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: { newNode: { name: "New" } },
        links: { newNode: undefined },
      };

      // Index way out of bounds should append
      graph.import(subgraph, ["newNode"], "parent", 999);

      const result = graph.snapshot();
      expect(result.links.parent).toEqual(["child", "newNode"]);
    });

    it("should maintain relative order when inserting multiple roots at index", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          parent: { name: "Parent" },
          a: { name: "A" },
          z: { name: "Z" },
        },
        links: {
          parent: ["a", "z"],
          a: undefined,
          z: undefined,
        },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          x: { name: "X" },
          y: { name: "Y" },
        },
        links: {
          x: undefined,
          y: undefined,
        },
      };

      graph.import(subgraph, ["x", "y"], "parent", 1);

      const result = graph.snapshot();
      expect(result.links.parent).toEqual(["a", "x", "y", "z"]);
    });

    it("should not affect existing links unrelated to import", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          branch1: { name: "Branch 1" },
          branch2: { name: "Branch 2" },
          leaf1: { name: "Leaf 1" },
        },
        links: {
          root: ["branch1", "branch2"],
          branch1: ["leaf1"],
          branch2: undefined,
          leaf1: undefined,
        },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: { newBranch: { name: "New Branch" } },
        links: { newBranch: undefined },
      };

      graph.import(subgraph, ["newBranch"], "root");

      const result = graph.snapshot();
      // Existing links should be unchanged
      expect(result.links.branch1).toEqual(["leaf1"]);
      expect(result.links.branch2).toBeUndefined();
      // Only root link is affected
      expect(result.links.root).toEqual(["branch1", "branch2", "newBranch"]);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty subgraph nodes", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {},
        links: {},
      };

      expect(() => graph.import(subgraph, [], "root")).not.toThrow();

      const result = graph.snapshot();
      expect(Object.keys(result.nodes)).toEqual(["root"]);
    });

    it("should handle subgraph with only orphans (empty roots)", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: { root: { name: "Root" } },
        links: { root: [] },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: {
          orphan1: { name: "Orphan 1" },
          orphan2: { name: "Orphan 2" },
        },
        links: {
          orphan1: undefined,
          orphan2: undefined,
        },
      };

      graph.import(subgraph, [], "root");

      const result = graph.snapshot();
      expect(result.nodes.orphan1).toEqual({ name: "Orphan 1" });
      expect(result.nodes.orphan2).toEqual({ name: "Orphan 2" });
      expect(result.links.root).toEqual([]);
    });

    it("should handle importing to node with undefined links", () => {
      const graph = new tree.graph.Graph<TestNode>({
        nodes: {
          root: { name: "Root" },
          leaf: { name: "Leaf" },
        },
        links: {
          root: ["leaf"],
          leaf: undefined, // No children array
        },
      });

      const subgraph: tree.graph.IGraph<TestNode> = {
        nodes: { child: { name: "Child" } },
        links: { child: undefined },
      };

      // Import into leaf (undefined links should auto-initialize)
      graph.import(subgraph, ["child"], "leaf");

      const result = graph.snapshot();
      expect(result.links.leaf).toEqual(["child"]);
    });
  });

  describe("Real-world scenarios", () => {
    interface ComponentNode {
      type: "component" | "frame" | "text";
      name: string;
    }

    it("should handle component insertion", () => {
      const graph = new tree.graph.Graph<ComponentNode>({
        nodes: {
          page: { type: "frame", name: "Page" },
          header: { type: "frame", name: "Header" },
        },
        links: {
          page: ["header"],
          header: [],
        },
      });

      // Component with internal structure
      const component: tree.graph.IGraph<ComponentNode> = {
        nodes: {
          button: { type: "component", name: "Button" },
          label: { type: "text", name: "Label" },
          icon: { type: "frame", name: "Icon" },
        },
        links: {
          button: ["label", "icon"],
          label: undefined,
          icon: undefined,
        },
      };

      graph.import(component, ["button"], "header", 0);

      const result = graph.snapshot();
      expect(result.links.header).toEqual(["button"]);
      expect(result.links.button).toEqual(["label", "icon"]);
    });

    it("should handle paste operation (clipboard with multiple items)", () => {
      const graph = new tree.graph.Graph<ComponentNode>({
        nodes: {
          canvas: { type: "frame", name: "Canvas" },
          existing: { type: "frame", name: "Existing" },
        },
        links: {
          canvas: ["existing"],
          existing: [],
        },
      });

      // Clipboard contains multiple items
      const clipboard: tree.graph.IGraph<ComponentNode> = {
        nodes: {
          copied1: { type: "frame", name: "Copied 1" },
          copied2: { type: "text", name: "Copied 2" },
          copied3: { type: "frame", name: "Copied 3" },
        },
        links: {
          copied1: [],
          copied2: undefined,
          copied3: [],
        },
      };

      graph.import(clipboard, ["copied1", "copied2", "copied3"], "canvas");

      const result = graph.snapshot();
      expect(result.links.canvas).toEqual([
        "existing",
        "copied1",
        "copied2",
        "copied3",
      ]);
    });

    it("should handle template instantiation", () => {
      const graph = new tree.graph.Graph<ComponentNode>({
        nodes: {
          page: { type: "frame", name: "Page" },
        },
        links: {
          page: [],
        },
      });

      // Template with complex hierarchy
      const template: tree.graph.IGraph<ComponentNode> = {
        nodes: {
          card: { type: "frame", name: "Card" },
          cardHeader: { type: "frame", name: "Card Header" },
          cardBody: { type: "frame", name: "Card Body" },
          cardTitle: { type: "text", name: "Title" },
          cardText: { type: "text", name: "Text" },
        },
        links: {
          card: ["cardHeader", "cardBody"],
          cardHeader: ["cardTitle"],
          cardBody: ["cardText"],
          cardTitle: undefined,
          cardText: undefined,
        },
      };

      graph.import(template, ["card"], "page");

      const result = graph.snapshot();
      expect(result.links.page).toEqual(["card"]);
      expect(result.links.card).toEqual(["cardHeader", "cardBody"]);
      expect(result.links.cardHeader).toEqual(["cardTitle"]);
      expect(result.links.cardBody).toEqual(["cardText"]);
    });
  });

  describe("Atomicity guarantees", () => {
    it("should rollback on policy failure (no partial imports)", () => {
      interface TypedNode {
        type: "container" | "leaf";
        name: string;
      }

      const policy: tree.graph.IGraphPolicy<TypedNode> = {
        max_out_degree: (node: TypedNode) =>
          node.type === "leaf" ? 0 : Infinity,
      };

      const graph = new tree.graph.Graph<TypedNode>(
        {
          nodes: {
            root: { type: "container", name: "Root" },
            leaf: { type: "leaf", name: "Leaf" },
          },
          links: {
            root: ["leaf"],
            leaf: undefined,
          },
        },
        policy
      );

      const subgraph: tree.graph.IGraph<TypedNode> = {
        nodes: {
          valid: { type: "container", name: "Valid" },
          invalid: { type: "container", name: "Invalid" },
        },
        links: {
          valid: undefined,
          invalid: undefined,
        },
      };

      // First root is valid, second would violate policy (parent is leaf)
      expect(() => graph.import(subgraph, ["invalid"], "leaf")).toThrow();

      const result = graph.snapshot();
      // Nothing from subgraph should be added
      expect(result.nodes.valid).toBeUndefined();
      expect(result.nodes.invalid).toBeUndefined();
    });
  });
});
