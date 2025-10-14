import tree from "@grida/tree";
import grida from "@grida/schema";

/**
 * Graph Policy for Grida Editor
 *
 * This policy defines the structural rules and constraints for the editor's node graph.
 * It ensures that:
 * - Scenes are always root-level (never children)
 * - Leaf nodes cannot have children
 * - Container nodes respect their capacity constraints
 * - Parent-child relationships follow the design tool model
 */
export const EDITOR_GRAPH_POLICY: tree.graph.IGraphPolicy<grida.program.nodes.Node> =
  {
    can_be_parent: (node) => {
      // Only container-like nodes can be parents
      return [
        "scene",
        "container",
        "group",
        "boolean",
        "component",
        "instance",
      ].includes(node.type);
    },

    can_be_child: (node) => {
      // Scenes can never be children (always at root)
      return node.type !== "scene";
    },

    max_out_degree: (node) => {
      if (node.type === "scene") {
        // Check scene.constraints.children
        const sceneNode = node as grida.program.nodes.SceneNode;
        return sceneNode.constraints?.children === "single" ? 1 : Infinity;
      }

      // Leaf nodes - cannot have children
      if (
        [
          "text",
          "image",
          "video",
          "iframe",
          "richtext",
          "bitmap",
          "svgpath",
          "vector",
          "line",
          "rectangle",
          "ellipse",
          "polygon",
          "star",
        ].includes(node.type)
      ) {
        return 0;
      }

      // All other container nodes have unlimited children
      return Infinity;
    },
  };
