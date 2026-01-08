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
  // TODO: only supported by wasm backend, need backend check or seperate api (e.g. vector.textToVectorNetwork())
  "tspan",
  "vector",
  "boolean",
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

  // attempt to resolve vector network via wasm backend when available
  let v: vn.VectorNetwork | null = null;
  try {
    v = context.vector?.toVectorNetwork(node_id) ?? null;
  } catch {}
  if (!v) {
    v = toVectorNetworkFallback(node, {
      width: rect.width,
      height: rect.height,
    });
  }
  if (!v) return null;

  const vectornode: grida.program.nodes.VectorNode = {
    ...(node as grida.program.nodes.UnknownNode),
    type: "vector",
    id: node.id,
    active: node.active,
    corner_radius: modeProperties.cornerRadius(node),
    fill_rule: (node as grida.program.nodes.UnknownNode).fill_rule ?? "nonzero",
    vector_network: v,
    layout_target_width: rect.width,
    layout_target_height: rect.height,
    left: (node as any).left!,
    top: (node as any).top!,
  } as grida.program.nodes.VectorNode;

  __dangerously_delete_non_vector_properties(vectornode);

  const delta = normalizeVectorNodeBBox(vectornode);

  draft.document.nodes[node_id] = vectornode;
  return { node: vectornode, delta };
}

/**
 * FIXME: the safe and correct way is to "recreate" rather then reusing the existing one.
 */
function __dangerously_delete_non_vector_properties(
  node: grida.program.nodes.Node
) {
  // Remove primitive-only properties that should not persist on vector nodes.
  // star
  delete (node as any).pointCount;
  delete (node as any).innerRadius;

  // text
  delete (node as any).text;
}

function modeCornerRadius(node: grida.program.nodes.Node): number | undefined {
  if ("corner_radius" in node) {
    return node.corner_radius;
  }

  if ("rectangular_corner_radius_top_left" in node) {
    const values: number[] = [
      node.rectangular_corner_radius_top_left,
      node.rectangular_corner_radius_top_right,
      node.rectangular_corner_radius_bottom_left,
      node.rectangular_corner_radius_bottom_right,
    ].filter((it) => it !== undefined);

    return cmath.mode(values);
  }
}

function toVectorNetworkFallback(
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
        points: node.point_count ?? 3,
      });
    }
    case "star": {
      return vn.fromRegularStarPolygon({
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
        points: node.point_count ?? 5,
        innerRadius: node.inner_radius ?? 0.5,
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
    // TODO:
    case "boolean":
    default: {
      return null;
    }
  }
}
