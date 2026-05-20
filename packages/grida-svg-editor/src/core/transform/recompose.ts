// `(new_cx, new_cy)` is in post-translate local space (the same space
// `apply_rotate` reads its pivot from). The rotate op's (cx, cy) is
// pre-translate space per SVG 1.1 §7.6, so we subtract the leading
// translate before writing.

import type { TransformOp } from "./types";
import { emit_transform_list } from "./emit";

export function recompose_with_pivot(
  ops: ReadonlyArray<TransformOp>,
  new_cx: number,
  new_cy: number
): string {
  const tx_op = ops.find((op) => op.type === "translate");
  const tx = tx_op?.type === "translate" ? tx_op.tx : 0;
  const ty = tx_op?.type === "translate" ? tx_op.ty : 0;
  const rewritten = ops.map((op) =>
    op.type === "rotate"
      ? {
          type: "rotate" as const,
          angle: op.angle,
          cx: new_cx - tx,
          cy: new_cy - ty,
          explicit_pivot: true,
        }
      : op
  );
  return emit_transform_list(rewritten);
}
