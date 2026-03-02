import type { Draft } from "immer";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import type { ReducerContext } from "..";
import vn from "@grida/vn";
import grida from "@grida/schema";
import cmath from "@grida/cmath";
import { normalizeVectorNodeBBox } from "./vector";

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

  // attempt to resolve vector network via wasm backend when available.
  // The result includes an optional corner_radius: when present, the VN has
  // straight segments and corner radius is a rendering effect to preserve.
  let flattenResult: vn.FlattenResult | null = null;
  try {
    flattenResult = context.vector?.toVectorNetwork(node_id) ?? null;
  } catch {}
  if (!flattenResult) {
    const fallback = toVectorNetworkFallback(node, {
      width: rect.width,
      height: rect.height,
    });
    if (fallback) {
      flattenResult = fallback;
    }
  }
  if (!flattenResult) return null;

  // Extract corner_radius from rust-side result (if curves are NOT baked in).
  // When corner_radius is present, the vector node should keep it as a
  // rendering effect. When absent, geometry is baked — clear corner_radius.
  const { corner_radius: resultCornerRadius, ...vectorNetwork } = flattenResult;

  const vectornode: grida.program.nodes.VectorNode = {
    ...(node as grida.program.nodes.UnknownNode),
    type: "vector",
    id: node.id,
    active: node.active,
    corner_radius: resultCornerRadius ?? undefined,
    fill_rule: (node as grida.program.nodes.UnknownNode).fill_rule ?? "nonzero",
    vector_network: vectorNetwork,
    layout_target_width: rect.width,
    layout_target_height: rect.height,
    layout_inset_left: (node as grida.program.nodes.UnknownNode)
      .layout_inset_left!,
    layout_inset_top: (node as grida.program.nodes.UnknownNode)
      .layout_inset_top!,
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

  // star / polygon
  delete (node as any).point_count;
  delete (node as any).inner_radius;

  // rectangle (per-corner radius & per-side stroke width)
  delete (node as any).rectangular_corner_radius_top_left;
  delete (node as any).rectangular_corner_radius_top_right;
  delete (node as any).rectangular_corner_radius_bottom_left;
  delete (node as any).rectangular_corner_radius_bottom_right;
  delete (node as any).corner_smoothing;
  delete (node as any).rectangular_stroke_width_top;
  delete (node as any).rectangular_stroke_width_right;
  delete (node as any).rectangular_stroke_width_bottom;
  delete (node as any).rectangular_stroke_width_left;

  // ellipse (arc data)
  delete (node as any).angle;
  delete (node as any).angle_offset;

  // text
  delete (node as any).text;
}

function toVectorNetworkFallback(
  node: grida.program.nodes.Node,
  size: { width: number; height: number }
): vn.FlattenResult | null {
  switch (node.type) {
    case "rectangle": {
      // Rectangle does NOT carry corner_radius here. Native rrect uses
      // conic arcs while corner_path uses quadratic Bézier — different
      // curves. The Rust backend bakes rrect geometry; this fallback
      // produces a sharp rect (acceptable degradation when WASM is absent).
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
      // Polygon/star use corner_path PathEffect for rendering, so
      // corner_radius is a rendering effect — preserve it on the result.
      // (Mirrors what the Rust backend returns for these shapes.)
      const cr = node.corner_radius;
      return {
        ...vn.fromRegularPolygon({
          x: 0,
          y: 0,
          width: size.width,
          height: size.height,
          points: node.point_count ?? 3,
        }),
        ...(cr && cr > 0 ? { corner_radius: cr } : {}),
      };
    }
    case "star": {
      const cr = node.corner_radius;
      return {
        ...vn.fromRegularStarPolygon({
          x: 0,
          y: 0,
          width: size.width,
          height: size.height,
          points: node.point_count ?? 5,
          innerRadius: node.inner_radius ?? 0.5,
        }),
        ...(cr && cr > 0 ? { corner_radius: cr } : {}),
      };
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
