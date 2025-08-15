import type { Draft } from "immer";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import type { ReducerContext } from "..";
import vn from "@grida/vn";
import grida from "@grida/schema";
import cmath from "@grida/cmath";
import { normalizeVectorNodeBBox } from "./vector";
import * as modeProperties from "@/grida-canvas/utils/properties";

/**
 * Node types that can be flattened into vector paths.
 * Includes primitive shapes and vector nodes.
 */
export const FLATTENABLE_NODE_TYPES = new Set<grida.program.nodes.NodeType>([
  "rectangle",
  "star",
  "polygon",
  "ellipse",
  "line",
  "vector",
]);

export function supportsFlatten(node: {
  type: grida.program.nodes.NodeType;
}): boolean {
  return FLATTENABLE_NODE_TYPES.has(node.type as grida.program.nodes.NodeType);
}

/**
 * Converts a primitive shape node into a vector node in-place and normalizes
 * it to its real bounding box.
 *
 * @returns The vector node and the offset applied to align the network.
 */
export function self_flattenNode<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  node_id: string,
  context: ReducerContext
): { node: grida.program.nodes.VectorNode; delta: cmath.Vector2 } | null {
  const node = dq.__getNodeById(draft, node_id);
  if (!node || !supportsFlatten(node)) {
    return null;
  }

  if (node.type === "vector") {
    normalizeVectorNodeBBox(node as grida.program.nodes.VectorNode);
    return {
      node: node as grida.program.nodes.VectorNode,
      delta: [0, 0] as cmath.Vector2,
    };
  }

  const rect = context.geometry.getNodeAbsoluteBoundingRect(node_id);
  if (!rect) return null;

  const v = toVectorNetwork(node, { width: rect.width, height: rect.height });
  if (!v) return null;

  const vectornode: grida.program.nodes.VectorNode = {
    ...(node as grida.program.nodes.UnknwonNode),
    type: "vector",
    id: node.id,
    active: node.active,
    cornerRadius: modeProperties.cornerRadius(node),
    fillRule: (node as grida.program.nodes.UnknwonNode).fillRule ?? "nonzero",
    vectorNetwork: v,
    width: rect.width,
    height: rect.height,
    left: (node as any).left!,
    top: (node as any).top!,
  } as grida.program.nodes.VectorNode;

  const delta = normalizeVectorNodeBBox(vectornode);

  draft.document.nodes[node_id] = vectornode;
  return { node: vectornode, delta };
}

function modeCornerRadius(node: grida.program.nodes.Node): number | undefined {
  if ("cornerRadius" in node) {
    return node.cornerRadius;
  }

  if ("cornerRadiusTopLeft" in node) {
    const values: number[] = [
      node.cornerRadiusTopLeft,
      node.cornerRadiusTopRight,
      node.cornerRadiusBottomLeft,
      node.cornerRadiusBottomRight,
    ].filter((it) => it !== undefined);

    return cmath.mode(values);
  }
}

function toVectorNetwork(
  node: grida.program.nodes.Node,
  size: { width: number; height: number }
): vn.VectorNetwork | null {
  switch (node.type) {
    case "rectangle": {
      return vn.fromRect({
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
      });
    }
    case "ellipse": {
      // TODO: check if ellipse is arc, if so, rely on wasm backend.
      return vn.fromEllipse({
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
      });
    }
    case "polygon": {
      return vn.fromRegularPolygon({
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
        points: node.pointCount ?? 3,
      });
    }
    case "star": {
      return vn.fromRegularStarPolygon({
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
        points: node.pointCount ?? 5,
        innerRadius: node.innerRadius ?? 0.5,
      });
    }
    case "line": {
      // return vn.fromLine({
      //   x1: 0,
      //   y1: 0,
      //   x2: size.width,
      //   y2: size.height,
      // });
    }
    default: {
      return null;
    }
  }
}
