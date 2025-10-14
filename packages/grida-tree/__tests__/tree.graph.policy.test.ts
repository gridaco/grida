import { tree } from "../src/lib";

/**
 * Tests for tree.graph with IGraphPolicy integration
 *
 * These tests follow TDD approach - documenting expected behavior before implementation.
 * The policy system provides flexible, extensible constraints for tree operations.
 *
 * This test suite models a real-world design tool with the following node types:
 * - scene: Top-level container (like a page/artboard, cannot be nested)
 * - frame: Container that can hold other elements
 * - group: Lightweight container for organizing elements
 * - text: Leaf node with text content
 * - image: Leaf node with image content
 */

interface DesignNode {
  id: string;
  type: "scene" | "frame" | "text" | "image" | "group";
  name: string;
  maxChildren?: number;
}

/**
 * Real-world design tool policy
 * Models type-based constraints similar to Figma, Sketch, or other design tools
 */
const DESIGN_TOOL_POLICY: tree.graph.IGraphPolicy<DesignNode> = {
  max_out_degree: (node) => {
    // Leaf nodes cannot have children
    if (node.type === "text" || node.type === "image") return 0;
    // Containers have unlimited children
    return Infinity;
  },

  can_be_parent: (node) => {
    // Only container types can have children
    return ["scene", "frame", "group"].includes(node.type);
  },

  can_be_child: (node) => {
    // Scenes are top-level and cannot be nested
    return node.type !== "scene";
  },

  can_link: (parent, parent_id, child, child_id) => {
    // Prevent self-parenting
    if (parent_id === child_id) return false;
    // Groups cannot be nested inside other groups (simplified rule)
    if (parent.type === "group" && child.type === "group") return false;
    return true;
  },
};

describe("tree.graph with IGraphPolicy", () => {
  describe("Constructor with policy", () => {
    it("should accept a policy as second argument", () => {
      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        max_out_degree: () => Infinity,
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page 1", type: "scene" },
          },
          links: {
            scene: undefined,
          },
        },
        policy
      );

      expect(graph).toBeDefined();
    });

    it("should use DEFAULT_POLICY_INFINITE when no policy provided", () => {
      const graph = new tree.graph.Graph<DesignNode>({
        nodes: {
          scene: { id: "scene", name: "Page 1", type: "scene" },
          frame: { id: "frame", name: "Frame", type: "frame" },
        },
        links: {
          scene: undefined,
          frame: undefined,
        },
      });

      // With default policy, all operations should be allowed (even scene as child)
      expect(() => graph.mv("frame", "scene")).not.toThrow();
    });
  });

  describe("Scene type - root-level only constraint", () => {
    it("should prevent scene from being nested under any node", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene1: { id: "scene1", name: "Page 1", type: "scene" },
            scene2: { id: "scene2", name: "Page 2", type: "scene" },
            frame: { id: "frame", name: "Container", type: "frame" },
          },
          links: {
            scene1: ["frame"],
            scene2: undefined,
            frame: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Scene cannot be moved to another scene
      expect(() => graph.mv("scene2", "scene1")).toThrow(
        "mv: cannot move 'scene2': Node cannot be a child"
      );

      // Scene cannot be moved to a frame
      expect(() => graph.mv("scene2", "frame")).toThrow(
        "mv: cannot move 'scene2': Node cannot be a child"
      );

      // Frame can be moved to scene (valid)
      const sceneCopy = {
        id: "scene2",
        name: "Page 2",
        type: "scene" as const,
      };
      const graph2 = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: sceneCopy,
            frame: { id: "frame", name: "Container", type: "frame" },
          },
          links: {
            scene: undefined,
            frame: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      expect(() => graph2.mv("frame", "scene")).not.toThrow();
    });

    it("should allow scene as parent (scenes can contain elements)", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page 1", type: "scene" },
            frame: { id: "frame", name: "Frame", type: "frame" },
            text: { id: "text", name: "Title", type: "text" },
          },
          links: {
            scene: undefined,
            frame: undefined,
            text: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Scene can accept children
      expect(() => graph.mv("frame", "scene")).not.toThrow();
      expect(() => graph.mv("text", "scene")).not.toThrow();

      const result = graph.snapshot();
      expect(result.links.scene).toEqual(["frame", "text"]);
    });
  });

  describe("max_out_degree constraint", () => {
    it("should enforce leaf nodes (text and image cannot have children)", () => {
      // Use policy with ONLY max_out_degree to isolate this check
      const leafPolicy: tree.graph.IGraphPolicy<DesignNode> = {
        max_out_degree: (node) => {
          if (node.type === "text" || node.type === "image") return 0;
          return Infinity;
        },
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page 1", type: "scene" },
            text: { id: "text", name: "Hello", type: "text" },
            image: { id: "image", name: "Logo", type: "image" },
            frame: { id: "frame", name: "Container", type: "frame" },
          },
          links: {
            scene: ["text", "image"],
            text: undefined,
            image: undefined,
            frame: undefined,
          },
        },
        leafPolicy
      );

      // Should fail - text max_out_degree is 0
      expect(() => graph.mv("frame", "text")).toThrow(
        "mv: cannot move to 'text': Node cannot have children (max_out_degree = 0)"
      );

      // Should fail - image max_out_degree is 0
      expect(() => graph.mv("frame", "image")).toThrow(
        "mv: cannot move to 'image': Node cannot have children (max_out_degree = 0)"
      );

      // Should succeed - scene can have children
      expect(() => graph.mv("frame", "scene")).not.toThrow();
    });

    it("should enforce custom capacity limits per node", () => {
      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        max_out_degree: (node) => node.maxChildren ?? Infinity,
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page 1", type: "scene" },
            limitedFrame: {
              id: "limitedFrame",
              name: "Card (max 2)",
              type: "frame",
              maxChildren: 2,
            },
            icon: { id: "icon", name: "Icon", type: "image" },
            title: { id: "title", name: "Title", type: "text" },
            subtitle: { id: "subtitle", name: "Subtitle", type: "text" },
          },
          links: {
            scene: ["limitedFrame"],
            limitedFrame: ["icon", "title"], // Already has 2 children
            icon: undefined,
            title: undefined,
            subtitle: undefined,
          },
        },
        policy
      );

      // Should fail - limited frame already at max capacity (2/2)
      expect(() => graph.mv("subtitle", "limitedFrame")).toThrow(
        "mv: cannot move to 'limitedFrame': Parent at max capacity (2/2 children)"
      );
    });

    it("should allow move when under capacity", () => {
      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        max_out_degree: (node) => node.maxChildren ?? Infinity,
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page", type: "scene" },
            container: {
              id: "container",
              name: "List (max 5)",
              type: "frame",
              maxChildren: 5,
            },
            item1: { id: "item1", name: "Item 1", type: "frame" },
            item2: { id: "item2", name: "Item 2", type: "frame" },
          },
          links: {
            scene: ["container"],
            container: ["item1"], // Has 1 child, max is 5
            item1: undefined,
            item2: undefined,
          },
        },
        policy
      );

      // Should succeed - under capacity (1/5)
      expect(() => graph.mv("item2", "container")).not.toThrow();

      const result = graph.snapshot();
      expect(result.links.container).toEqual(["item1", "item2"]);
    });
  });

  describe("can_be_parent constraint", () => {
    it("should prevent leaf nodes from being parents", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page 1", type: "scene" },
            text: { id: "text", name: "Hello World", type: "text" },
            image: { id: "image", name: "Avatar", type: "image" },
            frame: { id: "frame", name: "Button", type: "frame" },
          },
          links: {
            scene: ["text", "image"],
            text: undefined,
            image: undefined,
            frame: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Should fail - text cannot be parent (only containers can)
      expect(() => graph.mv("frame", "text")).toThrow(
        "mv: cannot move to 'text': Node cannot be a parent"
      );

      // Should fail - image cannot be parent
      expect(() => graph.mv("frame", "image")).toThrow(
        "mv: cannot move to 'image': Node cannot be a parent"
      );

      // Should succeed - scene is a container
      expect(() => graph.mv("frame", "scene")).not.toThrow();
    });

    it("should check can_be_parent before max_out_degree", () => {
      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        can_be_parent: (node) => node.type !== "text",
        max_out_degree: () => 0, // Even more restrictive, but should not be reached for text
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            text: { id: "text", name: "Label", type: "text" },
            button: { id: "button", name: "Button", type: "frame" },
          },
          links: {
            text: undefined,
            button: undefined,
          },
        },
        policy
      );

      // Should fail with can_be_parent error (checked first, before max_out_degree)
      expect(() => graph.mv("button", "text")).toThrow(
        "mv: cannot move to 'text': Node cannot be a parent"
      );
    });
  });

  describe("can_be_child constraint", () => {
    it("should prevent scenes from being moved (type-based)", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            homePage: { id: "homePage", name: "Home Page", type: "scene" },
            aboutPage: { id: "aboutPage", name: "About Page", type: "scene" },
            header: { id: "header", name: "Header", type: "frame" },
            content: { id: "content", name: "Content", type: "frame" },
          },
          links: {
            homePage: ["header", "content"],
            aboutPage: undefined,
            header: undefined,
            content: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Should fail - scenes cannot become children
      expect(() => graph.mv("aboutPage", "content")).toThrow(
        "mv: cannot move 'aboutPage': Node cannot be a child"
      );

      // Should fail - even moving to another scene
      expect(() => graph.mv("aboutPage", "homePage")).toThrow(
        "mv: cannot move 'aboutPage': Node cannot be a child"
      );

      // Should succeed - frames can be moved
      expect(() => graph.mv("header", "content")).not.toThrow();
    });

    it("should allow all non-scene types as children", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page", type: "scene" },
            frame: { id: "frame", name: "Container", type: "frame" },
            group: { id: "group", name: "Group", type: "group" },
            text: { id: "text", name: "Title", type: "text" },
            image: { id: "image", name: "Logo", type: "image" },
          },
          links: {
            scene: undefined,
            frame: undefined,
            group: undefined,
            text: undefined,
            image: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // All non-scene types can be children
      expect(() => graph.mv("frame", "scene")).not.toThrow();
      expect(() => graph.mv("group", "scene")).not.toThrow();
      expect(() => graph.mv("text", "scene")).not.toThrow();
      expect(() => graph.mv("image", "scene")).not.toThrow();

      const result = graph.snapshot();
      expect(result.links.scene).toEqual(["frame", "group", "text", "image"]);
    });
  });

  describe("can_link constraint", () => {
    it("should prevent group nesting (business rule)", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page 1", type: "scene" },
            group1: { id: "group1", name: "Group 1", type: "group" },
            group2: { id: "group2", name: "Group 2", type: "group" },
            frame: { id: "frame", name: "Frame", type: "frame" },
          },
          links: {
            scene: ["group1"],
            group1: undefined,
            group2: undefined,
            frame: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Should fail - groups cannot be nested inside other groups
      expect(() => graph.mv("group2", "group1")).toThrow(
        "mv: cannot link 'group1' -> 'group2': Link not allowed by policy"
      );

      // Should succeed - frame can go inside group
      expect(() => graph.mv("frame", "group1")).not.toThrow();

      // Should succeed - group can go inside frame
      expect(() => graph.mv("group2", "frame")).not.toThrow();
    });

    it("should prevent self-parenting", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page 1", type: "scene" },
            frame: { id: "frame", name: "Container", type: "frame" },
          },
          links: {
            scene: ["frame"],
            frame: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Should fail - cannot be parent of itself
      expect(() => graph.mv("frame", "frame")).toThrow(
        "mv: cannot link 'frame' -> 'frame': Link not allowed by policy"
      );
    });
  });

  describe("Policy check order", () => {
    it("should check can_be_child before can_be_parent", () => {
      const checks: string[] = [];

      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        can_be_child: (node) => {
          checks.push("can_be_child");
          return false; // Will fail here
        },
        can_be_parent: (node) => {
          checks.push("can_be_parent");
          return true;
        },
        can_link: () => {
          checks.push("can_link");
          return true;
        },
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            parent: { id: "parent", name: "Parent", type: "frame" },
            child: { id: "child", name: "Child", type: "frame" },
          },
          links: {
            parent: undefined,
            child: undefined,
          },
        },
        policy
      );

      expect(() => graph.mv("child", "parent")).toThrow();
      // Should only check can_be_child, not reach can_be_parent or can_link
      expect(checks).toEqual(["can_be_child"]);
    });

    it("should check can_be_parent before can_link", () => {
      const checks: string[] = [];

      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        can_be_child: (node) => {
          checks.push("can_be_child");
          return true;
        },
        can_be_parent: (node) => {
          checks.push("can_be_parent");
          return false; // Will fail here
        },
        can_link: () => {
          checks.push("can_link");
          return true;
        },
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            parent: { id: "parent", name: "Parent", type: "frame" },
            child: { id: "child", name: "Child", type: "frame" },
          },
          links: {
            parent: undefined,
            child: undefined,
          },
        },
        policy
      );

      expect(() => graph.mv("child", "parent")).toThrow();
      expect(checks).toEqual(["can_be_child", "can_be_parent"]);
    });

    it("should check max_out_degree before can_link", () => {
      const checks: string[] = [];

      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        can_be_child: (node) => {
          checks.push("can_be_child");
          return true;
        },
        can_be_parent: (node) => {
          checks.push("can_be_parent");
          return true;
        },
        max_out_degree: (node) => {
          checks.push("max_out_degree");
          return 0; // Will fail here
        },
        can_link: () => {
          checks.push("can_link");
          return true;
        },
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            parent: { id: "parent", name: "Parent", type: "frame" },
            child: { id: "child", name: "Child", type: "frame" },
          },
          links: {
            parent: undefined,
            child: undefined,
          },
        },
        policy
      );

      expect(() => graph.mv("child", "parent")).toThrow();
      expect(checks).toEqual([
        "can_be_child",
        "can_be_parent",
        "max_out_degree",
      ]);
    });

    it("should check can_link last", () => {
      const checks: string[] = [];

      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        can_be_child: (node) => {
          checks.push("can_be_child");
          return true;
        },
        can_be_parent: (node) => {
          checks.push("can_be_parent");
          return true;
        },
        max_out_degree: (node) => {
          checks.push("max_out_degree");
          return Infinity;
        },
        can_link: () => {
          checks.push("can_link");
          return false; // Will fail here
        },
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            parent: { id: "parent", name: "Parent", type: "frame" },
            child: { id: "child", name: "Child", type: "frame" },
          },
          links: {
            parent: undefined,
            child: undefined,
          },
        },
        policy
      );

      expect(() => graph.mv("child", "parent")).toThrow();
      expect(checks).toEqual([
        "can_be_child",
        "can_be_parent",
        "max_out_degree",
        "can_link",
      ]);
    });

    it("should check all policies in correct order for successful operation", () => {
      const checks: string[] = [];

      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        can_be_child: (node) => {
          checks.push("can_be_child");
          return true;
        },
        can_be_parent: (node) => {
          checks.push("can_be_parent");
          return true;
        },
        max_out_degree: (node) => {
          checks.push("max_out_degree");
          return Infinity;
        },
        can_link: () => {
          checks.push("can_link");
          return true;
        },
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            parent: { id: "parent", name: "Parent", type: "frame" },
            child: { id: "child", name: "Child", type: "frame" },
          },
          links: {
            parent: undefined,
            child: undefined,
          },
        },
        policy
      );

      expect(() => graph.mv("child", "parent")).not.toThrow();
      expect(checks).toEqual([
        "can_be_child",
        "can_be_parent",
        "max_out_degree",
        "can_link",
      ]);
    });
  });

  describe("Multiple nodes with policy", () => {
    it("should check policy for each node in batch operation", () => {
      /**
       * Moving multiple elements, including a scene (invalid)
       */
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            rootScene: { id: "rootScene", name: "Root", type: "scene" },
            container: { id: "container", name: "Container", type: "frame" },
            frame1: { id: "frame1", name: "Card 1", type: "frame" },
            nestedScene: {
              id: "nestedScene",
              name: "Nested Page",
              type: "scene",
            },
          },
          links: {
            rootScene: ["frame1"],
            container: undefined,
            frame1: undefined,
            nestedScene: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Should fail - nestedScene cannot be a child
      expect(() => graph.mv(["frame1", "nestedScene"], "container")).toThrow(
        "mv: cannot move 'nestedScene': Node cannot be a child"
      );

      // Graph should remain unchanged (atomic - no partial updates)
      const result = graph.snapshot();
      expect(result.links.container).toBeUndefined();
      expect(result.links.rootScene).toEqual(["frame1"]);
    });

    it("should validate all nodes before making any changes (atomic)", () => {
      /**
       * Organizing elements - trying to move multiple items including a scene
       */
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page 1", type: "scene" },
            toolbar: { id: "toolbar", name: "Toolbar", type: "frame" },
            homeIcon: { id: "homeIcon", name: "Home", type: "image" },
            page2: { id: "page2", name: "Page 2", type: "scene" },
            profileIcon: { id: "profileIcon", name: "Profile", type: "image" },
          },
          links: {
            scene: ["homeIcon", "profileIcon"],
            toolbar: undefined,
            homeIcon: undefined,
            page2: undefined,
            profileIcon: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Try to move icons and a scene - page2 is a scene (cannot be child)
      expect(() =>
        graph.mv(["homeIcon", "page2", "profileIcon"], "toolbar")
      ).toThrow("mv: cannot move 'page2': Node cannot be a child");

      // No elements should have moved (atomic operation)
      const result = graph.snapshot();
      expect(result.links.toolbar).toBeUndefined();
      expect(result.links.scene).toEqual(["homeIcon", "profileIcon"]);
    });
  });

  describe("Order operation (no policy checks)", () => {
    it("should not check policies for order operations", () => {
      const checks: string[] = [];

      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        can_be_child: (node) => {
          checks.push("can_be_child");
          return true;
        },
        can_be_parent: (node) => {
          checks.push("can_be_parent");
          return true;
        },
        can_link: () => {
          checks.push("can_link");
          return true;
        },
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            toolbar: { id: "toolbar", name: "Toolbar", type: "frame" },
            home: { id: "home", name: "Home", type: "image" },
            profile: { id: "profile", name: "Profile", type: "image" },
          },
          links: {
            toolbar: ["home", "profile"],
            home: undefined,
            profile: undefined,
          },
        },
        policy
      );

      // Order should not trigger policy checks (internal reordering)
      graph.order("home", "front");

      expect(checks).toEqual([]); // No policy checks
      expect(graph.snapshot().links.toolbar).toEqual(["profile", "home"]);
    });
  });

  describe("Remove operations (no policy checks)", () => {
    it("should not check policies for rm operations", () => {
      const checks: string[] = [];

      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        can_be_child: (node) => {
          checks.push("can_be_child");
          return true;
        },
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page", type: "scene" },
            oldSection: {
              id: "oldSection",
              name: "Old Section",
              type: "frame",
            },
          },
          links: {
            scene: ["oldSection"],
            oldSection: undefined,
          },
        },
        policy
      );

      // rm should not trigger policy checks (removal always allowed)
      graph.rm("oldSection");

      expect(checks).toEqual([]); // No policy checks
    });

    it("should not check policies for unlink operations", () => {
      const checks: string[] = [];

      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        can_be_child: (node) => {
          checks.push("can_be_child");
          return true;
        },
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page", type: "scene" },
            tempElement: { id: "tempElement", name: "Temp", type: "frame" },
          },
          links: {
            scene: ["tempElement"],
            tempElement: undefined,
          },
        },
        policy
      );

      // unlink should not trigger policy checks (removal always allowed)
      graph.unlink("tempElement");

      expect(checks).toEqual([]); // No policy checks
    });
  });

  describe("Real-world design tool scenarios", () => {
    it("should model a complete page structure with all constraints", () => {
      /**
       * Structure:
       * Page 1 (scene)
       *   ├─ Header (frame)
       *   │  └─ Logo (image)
       *   ├─ Content (frame)
       *   │  ├─ Title (text)
       *   │  └─ Body (text)
       *   └─ Footer (group)
       */
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            page: { id: "page", name: "Page 1", type: "scene" },
            header: { id: "header", name: "Header", type: "frame" },
            logo: { id: "logo", name: "Logo", type: "image" },
            content: { id: "content", name: "Content", type: "frame" },
            title: { id: "title", name: "Title", type: "text" },
            body: { id: "body", name: "Body", type: "text" },
            footer: { id: "footer", name: "Footer", type: "group" },
          },
          links: {
            page: ["header", "content", "footer"],
            header: ["logo"],
            logo: undefined,
            content: ["title", "body"],
            title: undefined,
            body: undefined,
            footer: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // ✅ Valid: Move body from content to footer
      expect(() => graph.mv("body", "footer")).not.toThrow();

      // ✅ Valid: Reorganize structure - move header
      expect(() => graph.mv("header", "content")).not.toThrow();

      // ❌ Invalid: Cannot move page (scene cannot be nested)
      expect(() => graph.mv("page", "content")).toThrow(
        "mv: cannot move 'page': Node cannot be a child"
      );

      // ❌ Invalid: Cannot add children to text (leaf node)
      expect(() => graph.mv("logo", "title")).toThrow(
        "mv: cannot move to 'title': Node cannot be a parent"
      );

      // Verify reorganized structure
      const result = graph.snapshot();
      expect(result.links.footer).toContain("body");
      expect(result.links.content).toContain("header");
    });

    it("should handle multi-layer component composition", () => {
      /**
       * Building a button component:
       * Button (frame)
       *   ├─ Icon (image)
       *   └─ Label (text)
       */
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Components", type: "scene" },
            button: { id: "button", name: "Button", type: "frame" },
            icon: { id: "icon", name: "Icon", type: "image" },
            label: { id: "label", name: "Label", type: "text" },
          },
          links: {
            scene: ["button"],
            button: undefined,
            icon: undefined,
            label: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Build the button
      graph.mv("icon", "button", 0);
      graph.mv("label", "button", 1);

      const result = graph.snapshot();
      expect(result.links.button).toEqual(["icon", "label"]);

      // ❌ Invalid: Cannot make label a container
      expect(() => graph.mv("icon", "label")).toThrow(
        "mv: cannot move to 'label': Node cannot be a parent"
      );
    });

    it("should handle tab group with capacity limits", () => {
      /**
       * Tab container with max 8 tabs
       */
      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        max_out_degree: (node) => node.maxChildren ?? Infinity,
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "App", type: "scene" },
            tabGroup: {
              id: "tabGroup",
              name: "Tab Group (max 8)",
              type: "frame",
              maxChildren: 8,
            },
            tab1: { id: "tab1", name: "Home", type: "frame" },
            tab2: { id: "tab2", name: "Profile", type: "frame" },
            tab3: { id: "tab3", name: "Settings", type: "frame" },
          },
          links: {
            scene: ["tabGroup"],
            tabGroup: ["tab1", "tab2"], // 2/8 capacity used
            tab1: undefined,
            tab2: undefined,
            tab3: undefined,
          },
        },
        policy
      );

      // Should succeed - 2/8, can add more
      expect(() => graph.mv("tab3", "tabGroup")).not.toThrow();

      const result = graph.snapshot();
      expect(result.links.tabGroup).toHaveLength(3);
      expect(result.links.tabGroup).toContain("tab3");
    });
  });

  describe("Policy with default values", () => {
    it("should use default policy when not provided (permissive)", () => {
      const graph = new tree.graph.Graph<DesignNode>({
        nodes: {
          scene: { id: "scene", name: "Page", type: "scene" },
          text: { id: "text", name: "Title", type: "text" },
        },
        links: {
          scene: undefined,
          text: undefined,
        },
      });

      // With default policy, even invalid operations are allowed
      expect(() => graph.mv("text", "scene")).not.toThrow();
      // Even text as parent (normally invalid)
      expect(() => graph.mv("scene", "text")).not.toThrow();
    });

    it("should allow partial policy (only some methods defined)", () => {
      /**
       * Only enforce leaf nodes, everything else permissive
       */
      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        // Only define max_out_degree, others use defaults
        max_out_degree: (node) => (node.type === "text" ? 0 : Infinity),
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page", type: "scene" },
            frame: { id: "frame", name: "Container", type: "frame" },
            text: { id: "text", name: "Label", type: "text" },
          },
          links: {
            scene: ["text"],
            frame: undefined,
            text: undefined,
          },
        },
        policy
      );

      // Should succeed - frame can have children
      expect(() => graph.mv("frame", "scene")).not.toThrow();

      // Should fail - text max_out_degree is 0
      expect(() => graph.mv("frame", "text")).toThrow(
        "mv: cannot move to 'text': Node cannot have children (max_out_degree = 0)"
      );

      // Scene can be moved (no can_be_child constraint)
      expect(() => graph.mv("scene", "frame")).not.toThrow();
    });
  });

  describe("Policy error messages", () => {
    it("should provide descriptive error for scene nesting attempt", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            homePage: { id: "homePage", name: "Home Page", type: "scene" },
            aboutPage: { id: "aboutPage", name: "About Page", type: "scene" },
          },
          links: {
            homePage: undefined,
            aboutPage: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Scenes cannot be nested (type-based constraint)
      expect(() => graph.mv("aboutPage", "homePage")).toThrow(
        "mv: cannot move 'aboutPage': Node cannot be a child"
      );
    });

    it("should provide descriptive error for leaf node parent attempt", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page", type: "scene" },
            heading: { id: "heading", name: "Main Title", type: "text" },
            icon: { id: "icon", name: "Arrow", type: "image" },
          },
          links: {
            scene: ["heading"],
            heading: undefined,
            icon: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Text cannot have children
      expect(() => graph.mv("icon", "heading")).toThrow(
        "mv: cannot move to 'heading': Node cannot be a parent"
      );
    });

    it("should provide descriptive error for capacity violation", () => {
      const policy: tree.graph.IGraphPolicy<DesignNode> = {
        max_out_degree: (node) => node.maxChildren ?? Infinity,
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page", type: "scene" },
            carousel: {
              id: "carousel",
              name: "Carousel (max 5)",
              type: "frame",
              maxChildren: 5,
            },
            slide1: { id: "slide1", name: "Slide 1", type: "frame" },
            slide2: { id: "slide2", name: "Slide 2", type: "frame" },
            slide3: { id: "slide3", name: "Slide 3", type: "frame" },
            slide4: { id: "slide4", name: "Slide 4", type: "frame" },
            slide5: { id: "slide5", name: "Slide 5", type: "frame" },
            slide6: { id: "slide6", name: "Slide 6", type: "frame" },
          },
          links: {
            scene: ["carousel"],
            carousel: ["slide1", "slide2", "slide3", "slide4", "slide5"],
            slide1: undefined,
            slide2: undefined,
            slide3: undefined,
            slide4: undefined,
            slide5: undefined,
            slide6: undefined,
          },
        },
        policy
      );

      // Already at max (5/5)
      expect(() => graph.mv("slide6", "carousel")).toThrow(
        "mv: cannot move to 'carousel': Parent at max capacity (5/5 children)"
      );
    });

    it("should provide descriptive error for group nesting", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page", type: "scene" },
            layerGroup: {
              id: "layerGroup",
              name: "Layer Group",
              type: "group",
            },
            nestedGroup: {
              id: "nestedGroup",
              name: "Nested Group",
              type: "group",
            },
          },
          links: {
            scene: ["layerGroup"],
            layerGroup: undefined,
            nestedGroup: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      expect(() => graph.mv("nestedGroup", "layerGroup")).toThrow(
        "mv: cannot link 'layerGroup' -> 'nestedGroup': Link not allowed by policy"
      );
    });
  });

  describe("Policy integration with existing operations", () => {
    it("should work with repositioning within same parent", () => {
      /**
       * Reordering navigation items
       */
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page", type: "scene" },
            nav: { id: "nav", name: "Navigation", type: "frame" },
            homeLink: { id: "homeLink", name: "Home", type: "text" },
            aboutLink: { id: "aboutLink", name: "About", type: "text" },
          },
          links: {
            scene: ["nav"],
            nav: ["homeLink", "aboutLink"],
            homeLink: undefined,
            aboutLink: undefined,
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Repositioning within same parent (text nodes CAN be children)
      expect(() => graph.mv("homeLink", "nav", 1)).not.toThrow();

      const result = graph.snapshot();
      expect(result.links.nav).toEqual(["aboutLink", "homeLink"]);
    });

    it("should allow moving orphaned elements back into tree", () => {
      /**
       * Restoring elements that were temporarily removed
       */
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page", type: "scene" },
            sidebar: { id: "sidebar", name: "Sidebar", type: "frame" },
            orphanWidget: {
              id: "orphanWidget",
              name: "Widget (orphan)",
              type: "frame",
            },
          },
          links: {
            scene: ["sidebar"],
            sidebar: undefined,
            orphanWidget: undefined, // Orphaned element
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Orphan frame can be moved (policy allows)
      expect(() => graph.mv("orphanWidget", "sidebar")).not.toThrow();

      const result = graph.snapshot();
      expect(result.links.sidebar).toContain("orphanWidget");
    });

    it("should prevent moving orphaned scene back into tree", () => {
      /**
       * Scene that got orphaned should still not be movable
       */
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            mainScene: { id: "mainScene", name: "Main Page", type: "scene" },
            container: { id: "container", name: "Container", type: "frame" },
            orphanedScene: {
              id: "orphanedScene",
              name: "Orphaned Page",
              type: "scene",
            },
          },
          links: {
            mainScene: ["container"],
            container: undefined,
            orphanedScene: undefined, // Orphaned scene
          },
        },
        DESIGN_TOOL_POLICY
      );

      // Even orphaned scenes cannot become children
      expect(() => graph.mv("orphanedScene", "container")).toThrow(
        "mv: cannot move 'orphanedScene': Node cannot be a child"
      );
    });
  });

  describe("DEFAULT_POLICY_INFINITE", () => {
    it("should allow all operations (even invalid ones)", () => {
      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page", type: "scene" },
            text: { id: "text", name: "Label", type: "text" },
            image: { id: "image", name: "Photo", type: "image" },
            frame: { id: "frame", name: "Container", type: "frame" },
          },
          links: {
            scene: undefined,
            text: undefined,
            image: undefined,
            frame: undefined,
          },
        },
        tree.graph.DEFAULT_POLICY_INFINITE
      );

      // All operations succeed with default policy (no constraints)
      expect(() => graph.mv("frame", "text")).not.toThrow(); // Text as parent
      expect(() => graph.mv("scene", "image")).not.toThrow(); // Scene as child
      expect(() => graph.mv("text", "scene")).not.toThrow(); // Scene as parent is OK
    });

    it("should be composable for extending with minimal constraints", () => {
      /**
       * Start with permissive policy, only restrict leaf nodes
       */
      const minimalPolicy: tree.graph.IGraphPolicy<DesignNode> = {
        ...tree.graph.DEFAULT_POLICY_INFINITE,
        // Override only leaf node constraint
        max_out_degree: (node) => {
          if (node.type === "text" || node.type === "image") return 0;
          return Infinity;
        },
      };

      const graph = new tree.graph.Graph<DesignNode>(
        {
          nodes: {
            scene: { id: "scene", name: "Page", type: "scene" },
            text: { id: "text", name: "Title", type: "text" },
            frame: { id: "frame", name: "Card", type: "frame" },
          },
          links: {
            scene: ["text"],
            text: undefined,
            frame: undefined,
          },
        },
        minimalPolicy
      );

      // Text cannot have children (our override)
      expect(() => graph.mv("frame", "text")).toThrow(
        "mv: cannot move to 'text': Node cannot have children (max_out_degree = 0)"
      );

      // Scene can have children (inherited from default)
      expect(() => graph.mv("frame", "scene")).not.toThrow();

      // Scene can be moved (no can_be_child in minimal policy)
      expect(() => graph.mv("scene", "frame")).not.toThrow();
    });
  });
});
