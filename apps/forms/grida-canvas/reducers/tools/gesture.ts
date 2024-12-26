import type { GestureCurve, IDocumentEditorState } from "@/grida-canvas/state";
import { grida } from "@/grida";
import { cmath } from "@/grida-canvas/cmath";
import { document } from "@/grida-canvas/document-query";

export function getInitialCurveGesture(
  state: IDocumentEditorState,
  target: {
    node_id: string;
    segment: number;
    control: "ta" | "tb";
    /**
     * if true, the movement will be applied in the opposite direction
     * (this is used for initial curve gesture with the new point)
     */
    invert: boolean;
  }
): GestureCurve {
  const { node_id, segment: segment_idx, control, invert } = target;

  const node = document.__getNodeById(
    state,
    node_id
  ) as grida.program.nodes.PathNode;

  const segment = node.vectorNetwork.segments[segment_idx];
  const tangent = segment[control];

  return {
    type: "curve",
    node_id: node_id,
    segment: segment_idx,
    initial: tangent,
    control: control,
    movement: cmath.vector2.zero,
    invert,
  };
}