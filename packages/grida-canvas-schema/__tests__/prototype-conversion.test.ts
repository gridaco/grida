import { grida } from "../grida";

describe("create_packed_scene_document_from_prototype", () => {
  describe("single node without children", () => {
    it("should create a document with single text node", () => {
      const prototype: grida.program.nodes.TextNodePrototype = {
        type: "tspan",
        text: "Hello World",
      };

      const result =
        grida.program.nodes.factory.create_packed_scene_document_from_prototype(
          prototype,
          (_, depth) => `node-${depth}`
        );

      // Should have exactly one node
      expect(Object.keys(result.nodes)).toHaveLength(1);
      expect(result.nodes["node-0"]).toMatchObject({
        type: "tspan",
        text: "Hello World",
        id: "node-0",
      });

      // Links should be empty or have only empty entry
      expect(result.links["node-0"]).toBeUndefined();

      // Scene should reference the root node
      expect(result.scene.children_refs).toEqual(["node-0"]);
    });

    it("should create a document with single rectangle node", () => {
      const prototype: grida.program.nodes.RectangleNodePrototype = {
        type: "rectangle",
        layout_target_width: 100,
        layout_target_height: 100,
      };

      const result =
        grida.program.nodes.factory.create_packed_scene_document_from_prototype(
          prototype,
          (_, depth) => `rect-${depth}`
        );

      expect(result.nodes["rect-0"]).toMatchObject({
        type: "rectangle",
        layout_target_width: 100,
        layout_target_height: 100,
        id: "rect-0",
      } satisfies Partial<grida.program.nodes.RectangleNode>);

      expect(result.scene.children_refs).toEqual(["rect-0"]);
    });
  });

  describe("container with flat children", () => {
    it("should convert container with 2 text children", () => {
      const prototype: grida.program.nodes.ContainerNodePrototype = {
        type: "container",
        layout_target_width: 200,
        layout_target_height: 100,
        children: [
          { type: "tspan", text: "Hello" },
          { type: "tspan", text: "World" },
        ],
      };

      let counter = 0;
      const result =
        grida.program.nodes.factory.create_packed_scene_document_from_prototype(
          prototype,
          () => `id-${counter++}`
        );

      // Check nodes created
      expect(Object.keys(result.nodes)).toHaveLength(3);
      expect(result.nodes["id-0"]).toMatchObject({
        type: "container",
        layout_target_width: 200,
        layout_target_height: 100,
      } satisfies Partial<grida.program.nodes.ContainerNode>);
      expect(result.nodes["id-1"]).toMatchObject({
        type: "tspan",
        text: "Hello",
      } satisfies Partial<grida.program.nodes.TextSpanNode>);
      expect(result.nodes["id-2"]).toMatchObject({
        type: "tspan",
        text: "World",
      } satisfies Partial<grida.program.nodes.TextSpanNode>);

      // Check links structure
      expect(result.links["id-0"]).toEqual(["id-1", "id-2"]);
      expect(result.links["id-1"]).toBeUndefined();
      expect(result.links["id-2"]).toBeUndefined();

      // Check scene references root
      expect(result.scene.children_refs).toEqual(["id-0"]);
    });

    it("should convert group with mixed children types", () => {
      const prototype: grida.program.nodes.GroupNodePrototype = {
        type: "group",
        children: [
          { type: "tspan", text: "Title" },
          {
            type: "rectangle",
            layout_target_width: 50,
            layout_target_height: 50,
          },
          {
            type: "ellipse",
            layout_target_width: 40,
            layout_target_height: 40,
          },
        ],
      };

      let counter = 0;
      const result =
        grida.program.nodes.factory.create_packed_scene_document_from_prototype(
          prototype,
          () => `n${counter++}`
        );

      expect(Object.keys(result.nodes)).toHaveLength(4);
      expect(result.nodes["n0"].type).toBe("group");
      expect(result.nodes["n1"].type).toBe("tspan");
      expect(result.nodes["n2"].type).toBe("rectangle");
      expect(result.nodes["n3"].type).toBe("ellipse");

      expect(result.links["n0"]).toEqual(["n1", "n2", "n3"]);
    });
  });

  describe("deeply nested structure", () => {
    it("should handle 3-level nesting", () => {
      const prototype: grida.program.nodes.ContainerNodePrototype = {
        type: "container",
        layout_target_width: 300,
        layout_target_height: 200,
        children: [
          {
            type: "container",
            layout_target_width: 250,
            layout_target_height: 150,
            children: [
              {
                type: "container",
                layout_target_width: 200,
                layout_target_height: 100,
                children: [{ type: "tspan", text: "Deeply nested" }],
              },
            ],
          },
        ],
      };

      let counter = 0;
      const result =
        grida.program.nodes.factory.create_packed_scene_document_from_prototype(
          prototype,
          () => `deep-${counter++}`
        );

      // Should have 4 nodes total
      expect(Object.keys(result.nodes)).toHaveLength(4);

      // Check hierarchy in links
      expect(result.links["deep-0"]).toEqual(["deep-1"]);
      expect(result.links["deep-1"]).toEqual(["deep-2"]);
      expect(result.links["deep-2"]).toEqual(["deep-3"]);
      expect(result.links["deep-3"]).toBeUndefined();

      // Check the deepest text node
      expect(result.nodes["deep-3"]).toMatchObject({
        type: "tspan",
        text: "Deeply nested",
      });
    });

    it("should handle complex tree with multiple branches", () => {
      const prototype: grida.program.nodes.ContainerNodePrototype = {
        type: "container",
        layout_target_width: 500,
        layout_target_height: 400,
        children: [
          {
            type: "container",
            layout_target_width: 200,
            layout_target_height: 100,
            children: [
              { type: "tspan", text: "Branch 1.1" },
              { type: "tspan", text: "Branch 1.2" },
            ],
          },
          {
            type: "group",
            children: [
              {
                type: "rectangle",
                layout_target_width: 50,
                layout_target_height: 50,
              },
              {
                type: "container",
                layout_target_width: 100,
                layout_target_height: 100,
                children: [
                  {
                    type: "ellipse",
                    layout_target_width: 30,
                    layout_target_height: 30,
                  },
                ],
              },
            ],
          },
          { type: "tspan", text: "Sibling" },
        ],
      };

      let counter = 0;
      const result =
        grida.program.nodes.factory.create_packed_scene_document_from_prototype(
          prototype,
          () => `tree-${counter++}`
        );

      // Should have 9 nodes
      expect(Object.keys(result.nodes)).toHaveLength(9);

      // Check root has 3 children
      expect(result.links["tree-0"]).toHaveLength(3);

      // Check first branch
      expect(result.links["tree-1"]).toEqual(["tree-2", "tree-3"]);

      // Check second branch
      expect(result.links["tree-4"]).toEqual(["tree-5", "tree-6"]);
      expect(result.links["tree-6"]).toEqual(["tree-7"]);

      // Leaf node should have no links
      expect(result.links["tree-8"]).toBeUndefined();
    });
  });

  describe("reserved IDs with _$id", () => {
    it("should respect _$id for custom node IDs", () => {
      const prototype: grida.program.nodes.ContainerNodePrototype = {
        _$id: "custom-root",
        type: "container",
        layout_target_width: 100,
        layout_target_height: 100,
        children: [
          {
            _$id: "custom-child",
            type: "tspan",
            text: "Fixed ID",
          },
        ],
      };

      let counter = 0;
      const result =
        grida.program.nodes.factory.create_packed_scene_document_from_prototype(
          prototype,
          (data) => {
            // Generator should be bypassed for nodes with _$id
            return `auto-${counter++}`;
          }
        );

      // Should use the custom IDs
      expect(result.nodes["custom-root"]).toBeDefined();
      expect(result.nodes["custom-child"]).toBeDefined();

      expect(result.links["custom-root"]).toEqual(["custom-child"]);
      expect(result.scene.children_refs).toEqual(["custom-root"]);
    });
  });

  describe("type safety with hasChildren", () => {
    it("should only process children for nodes with children property", () => {
      // This test verifies that type guard works correctly
      const containerPrototype: grida.program.nodes.ContainerNodePrototype = {
        type: "container",
        layout_target_width: 100,
        layout_target_height: 100,
        children: [{ type: "tspan", text: "Child" }],
      };

      const textPrototype: grida.program.nodes.TextNodePrototype = {
        type: "tspan",
        text: "No children",
      };

      // Both should work without errors
      const containerResult =
        grida.program.nodes.factory.create_packed_scene_document_from_prototype(
          containerPrototype,
          (_, d) => `c${d}`
        );

      const textResult =
        grida.program.nodes.factory.create_packed_scene_document_from_prototype(
          textPrototype,
          (_, d) => `t${d}`
        );

      expect(containerResult.links["c0"]).toEqual(["c1"]);
      expect(textResult.links["t0"]).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle empty children array", () => {
      const prototype: grida.program.nodes.ContainerNodePrototype = {
        type: "container",
        layout_target_width: 100,
        layout_target_height: 100,
        children: [],
      };

      const result =
        grida.program.nodes.factory.create_packed_scene_document_from_prototype(
          prototype,
          () => "empty"
        );

      // Should create the container with empty links
      expect(result.nodes["empty"]).toBeDefined();
      expect(result.links["empty"]).toEqual([]);
    });

    it("should preserve node properties while processing children", () => {
      const prototype: grida.program.nodes.ContainerNodePrototype = {
        type: "container",
        name: "MyContainer",
        layout_target_width: 200,
        layout_target_height: 150,
        left: 10,
        top: 20,
        children: [
          {
            type: "tspan",
            name: "MyText",
            text: "Hello",
            left: 5,
            top: 5,
          },
        ],
      };

      let counter = 0;
      const result =
        grida.program.nodes.factory.create_packed_scene_document_from_prototype(
          prototype,
          () => `prop-${counter++}`
        );

      const container = result.nodes[
        "prop-0"
      ] as Partial<grida.program.nodes.ContainerNode>;
      expect(container.name).toBe("MyContainer");
      expect(container.layout_target_width).toBe(200);
      expect(container.layout_target_height).toBe(150);
      expect(container.left).toBe(10);
      expect(container.top).toBe(20);

      const text = result.nodes["prop-1"] as any;
      expect(text.name).toBe("MyText");
      expect(text.text).toBe("Hello");
      expect(text.left).toBe(5);
      expect(text.top).toBe(5);

      // Critical: nodes should NOT have children property
      expect("children" in container).toBe(false);
      expect("children" in text).toBe(false);
    });
  });

  describe("integration with createPrototypeFromSnapshot", () => {
    it("should round-trip: document → prototype → document", () => {
      // Create a document structure using the new schema
      const originalDoc: grida.program.document.IDocumentDefinition = {
        nodes: {
          root: {
            id: "root",
            type: "container",
            name: "Root",
            active: true,
            locked: false,
            layout_target_width: 300,
            layout_target_height: 200,
            position: "absolute",
            left: 0,
            top: 0,
          } satisfies Partial<grida.program.nodes.ContainerNode> as any,
          child1: {
            id: "child1",
            type: "tspan",
            name: "Child1",
            active: true,
            locked: false,
            text: "First",
            position: "absolute",
            left: 10,
            top: 10,
          } satisfies Partial<grida.program.nodes.TextSpanNode> as any,
          child2: {
            id: "child2",
            type: "tspan",
            name: "Child2",
            active: true,
            locked: false,
            text: "Second",
            position: "absolute",
            left: 10,
            top: 40,
          } satisfies Partial<grida.program.nodes.TextSpanNode> as any,
        },
        links: {
          root: ["child1", "child2"],
          child1: [],
          child2: [],
        },
        images: {},
        bitmaps: {},
        properties: {},
      };

      // Step 1: Document → Prototype
      const prototype = grida.program.nodes.factory.createPrototypeFromSnapshot(
        originalDoc,
        "root"
      );

      // Verify prototype has nested children
      expect(grida.program.nodes.hasChildren(prototype)).toBe(true);
      if (grida.program.nodes.hasChildren(prototype)) {
        expect(prototype.children).toHaveLength(2);
      }

      // Step 2: Prototype → Document
      let idCounter = 0;
      const newDoc =
        grida.program.nodes.factory.create_packed_scene_document_from_prototype(
          prototype,
          () => `new-${idCounter++}`
        );

      // Verify structure is preserved
      expect(Object.keys(newDoc.nodes)).toHaveLength(3);
      expect(newDoc.links["new-0"]).toHaveLength(2);

      // Verify content is preserved
      const newRoot = newDoc.nodes[
        "new-0"
      ] as Partial<grida.program.nodes.ContainerNode>;
      expect(newRoot.type).toBe("container");
      expect(newRoot.layout_target_width).toBe(300);
      expect(newRoot.layout_target_height).toBe(200);

      const newChild1 = newDoc.nodes[
        "new-1"
      ] as Partial<grida.program.nodes.TextSpanNode>;
      expect(newChild1.type).toBe("tspan");
      expect(newChild1.text).toBe("First");

      const newChild2 = newDoc.nodes[
        "new-2"
      ] as Partial<grida.program.nodes.TextSpanNode>;
      expect(newChild2.type).toBe("tspan");
      expect(newChild2.text).toBe("Second");
    });
  });
});
