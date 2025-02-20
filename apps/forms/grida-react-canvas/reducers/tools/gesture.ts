import type {
  GestureCurve,
  IDocumentEditorState,
} from "@/grida-react-canvas/state";
import { grida } from "@/grida";
import { cmath } from "@grida/cmath";
import { document } from "@/grida-react-canvas/document-query";

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
    first: cmath.vector2.zero,
    last: cmath.vector2.zero,
    invert,
  };
}
