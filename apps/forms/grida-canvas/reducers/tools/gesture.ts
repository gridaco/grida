import type { GestureCurve, IDocumentEditorState } from "@/grida-canvas/state";
import { grida } from "@/grida";
import { vn } from "@/grida/vn";
import { cmath } from "@/grida-canvas/cmath";
import { document } from "@/grida-canvas/document-query";
import assert from "assert";

/**
 * TODO: need documentation
 */
const tangent_point_to_point = {
  ta: "a",
  tb: "b",
} as const;

export function getInitialCurveGesture(
  state: IDocumentEditorState,
  query: {
    node_id: string;
    vertex: number;
    control: "ta" | "tb";
  }
): GestureCurve {
  const { node_id, vertex, control } = query;

  const node = document.__getNodeById(
    state,
    node_id
  ) as grida.program.nodes.PathNode;
  const vne = new vn.VectorNetworkEditor(node.vectorNetwork);
  const segments = vne.findSegments(vertex, tangent_point_to_point[control]);

  assert(segments.length === 1);
  const segment_idx = segments[0];
  const segment = vne.segments[segment_idx];
  const tangent = segment[control];

  return {
    type: "curve",
    node_id: node_id,
    segment: segment_idx,
    initial: tangent,
    control: control,
    movement: cmath.vector2.zero,
  };
}
