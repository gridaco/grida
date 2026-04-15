/**
 * Reusable document fixtures for tests.
 */
import type grida from "@grida/schema";
import { sceneNode, rectNode, textNode } from "./factories";

/**
 * Minimal valid document with one empty scene.
 */
export const MINIMAL_DOCUMENT: grida.program.document.Document = {
  scenes_ref: ["scene"],
  links: {
    scene: [],
  },
  nodes: {
    scene: sceneNode("scene", "Scene"),
  },
  entry_scene_id: "scene",
  images: {},
  bitmaps: {},
  properties: {},
};

/**
 * Document with a scene and two rectangle nodes.
 */
export function createDocumentWithRects(
  count: number = 2
): grida.program.document.Document {
  const rects: string[] = [];
  const nodes: Record<string, grida.program.nodes.Node> = {
    scene: sceneNode("scene", "Scene"),
  };

  for (let i = 0; i < count; i++) {
    const id = `rect-${i}`;
    rects.push(id);
    nodes[id] = rectNode(id, {
      name: `Rectangle ${i}`,
      x: i * 120,
      y: 0,
    });
  }

  return {
    scenes_ref: ["scene"],
    links: { scene: rects },
    nodes,
    entry_scene_id: "scene",
    images: {},
    bitmaps: {},
    properties: {},
  };
}

/**
 * Document with a scene and one text node.
 */
export function createDocumentWithTextNode(
  text?: string
): grida.program.document.Document {
  return {
    scenes_ref: ["scene"],
    links: { scene: ["text-1"] },
    nodes: {
      scene: sceneNode("scene", "Scene"),
      "text-1": textNode("text-1", text),
    },
    entry_scene_id: "scene",
    images: {},
    bitmaps: {},
    properties: {},
  };
}
