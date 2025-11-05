import type { SimplifiedNode, SelectionContext } from "./types";
import type { editor } from "@/grida-canvas";

/**
 * Extracts selection context from the editor for AI consumption
 */
export function extractSelectionContext(
  editor: editor.Editor,
  selection: string[]
): SelectionContext | null {
  if (selection.length === 0) {
    return null;
  }

  try {
    const documentJson = editor.getDocumentJson() as any;
    const nodes: SimplifiedNode[] = [];

    // Helper to recursively find and simplify nodes
    const simplifyNode = (node: any): SimplifiedNode | null => {
      if (!node || typeof node !== "object") return null;

      const simplified: SimplifiedNode = {
        id: node.id || "",
        type: node.type || "unknown",
      };

      // Extract position and size
      if (node.x !== undefined) simplified.x = node.x;
      if (node.y !== undefined) simplified.y = node.y;
      if (node.width !== undefined) simplified.width = node.width;
      if (node.height !== undefined) simplified.height = node.height;

      // Extract text content
      if (node.text !== undefined) {
        simplified.text =
          typeof node.text === "string" ? node.text : node.text?.value || "";
      }

      // Extract image source
      if (node.src !== undefined) {
        simplified.src =
          typeof node.src === "string" ? node.src : node.src?.value || "";
      }

      // Recursively process children
      if (Array.isArray(node.children)) {
        simplified.children = node.children
          .map(simplifyNode)
          .filter((n): n is SimplifiedNode => n !== null);
      }

      return simplified;
    };

    // Helper to find a node by ID in the document
    const findNodeById = (doc: any, id: string): any => {
      if (!doc || typeof doc !== "object") return null;
      if (doc.id === id) return doc;

      if (Array.isArray(doc.children)) {
        for (const child of doc.children) {
          const found = findNodeById(child, id);
          if (found) return found;
        }
      }

      if (Array.isArray(doc.scenes)) {
        for (const scene of doc.scenes) {
          const found = findNodeById(scene, id);
          if (found) return found;
        }
      }

      return null;
    };

    // Extract selected nodes
    for (const nodeId of selection) {
      const node = findNodeById(documentJson, nodeId);
      if (node) {
        const simplified = simplifyNode(node);
        if (simplified) {
          nodes.push(simplified);
        }
      }
    }

    // Generate summary
    const summary = generateSummary(nodes);

    return {
      nodes,
      summary,
    };
  } catch (error) {
    console.error("Failed to extract selection context:", error);
    return null;
  }
}

/**
 * Generates a human-readable summary of selected nodes
 */
function generateSummary(nodes: SimplifiedNode[]): string {
  if (nodes.length === 0) return "No selection";

  const types = new Set(nodes.map((n) => n.type));
  const typeCounts: Record<string, number> = {};
  nodes.forEach((n) => {
    typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
  });

  const typeDescriptions = Object.entries(typeCounts)
    .map(([type, count]) => `${count} ${type}${count > 1 ? "s" : ""}`)
    .join(", ");

  return `Selected ${nodes.length} node${nodes.length > 1 ? "s" : ""}: ${typeDescriptions}`;
}

/**
 * Limits context size to avoid token overflow
 */
export function limitContextSize(
  context: SelectionContext,
  maxNodes: number = 10
): SelectionContext {
  if (context.nodes.length <= maxNodes) {
    return context;
  }

  return {
    ...context,
    nodes: context.nodes.slice(0, maxNodes),
    summary: `Showing first ${maxNodes} of ${context.nodes.length} selected nodes`,
  };
}
