import type { Draft } from "immer";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import type { ReducerContext } from "..";
import vn from "@grida/vn";
import grida from "@grida/schema";
import cmath from "@grida/cmath";

/**
 * Node types that can be flattened into vector paths.
 */
export const FLATTENABLE_NODE_TYPES = new Set<grida.program.nodes.NodeType>([
  "rectangle",
  "star",
  "polygon",
  "ellipse",
  "line",
]);

export function supportsFlatten(node: grida.program.nodes.Node): boolean {
  return FLATTENABLE_NODE_TYPES.has(node.type as grida.program.nodes.NodeType);
}

/**
 * Converts a primitive shape node into a vector node in-place.
 * Returns the newly created vector node or `null` if the node
 * type is not supported for flattening.
 */
export function self_flattenNode<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  node_id: string,
  context: ReducerContext
): grida.program.nodes.VectorNode | null {
  const node = dq.__getNodeById(draft, node_id);
  if (!node || !supportsFlatten(node)) {
    return null;
  }

  const rect = context.geometry.getNodeAbsoluteBoundingRect(node_id);
  if (!rect) return null;

  const v = toVectorNetwork(node, {
    width: rect.width,
    height: rect.height,
  });
  if (!v) return null;

  const vne = new vn.VectorNetworkEditor(v);
  const bb_b = vne.getBBox();
  const delta: cmath.Vector2 = [bb_b.x, bb_b.y];
  vne.translate(cmath.vector2.invert(delta));
  const vectorNetwork = vne.value;

  const vectornode: grida.program.nodes.VectorNode = {
    ...(node as grida.program.nodes.UnknwonNode),
    type: "vector",
    id: node.id,
    active: node.active,
    cornerRadius: modeCornerRadius(node),
    fillRule: (node as grida.program.nodes.UnknwonNode).fillRule ?? "nonzero",
    vectorNetwork,
    width: bb_b.width,
    height: bb_b.height,
    left: (node as any).left! + delta[0],
    top: (node as any).top! + delta[1],
  } as grida.program.nodes.VectorNode;

  draft.document.nodes[node_id] = vectornode;
  return vectornode;
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
