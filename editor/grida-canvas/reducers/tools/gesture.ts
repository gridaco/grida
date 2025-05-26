import grida from "@grida/schema";
import cmath from "@grida/cmath";
import { editor } from "@/grida-canvas";

export function getInitialCurveGesture(
  state: editor.state.IEditorState,
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
): editor.gesture.GestureCurve {
  const { node_id, segment: segment_idx, control, invert } = target;

  const node = editor.dq.__getNodeById(
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
