// Transform-list classifier — keys the refuse-and-surface policy.
//
// The rotate intent's `is_rotatable` and the hit-shape backend both
// switch on this verdict to decide whether they can compose into the
// existing transform cleanly or must refuse / fall back.
//
// Verdicts (in order of strictness):
//   - "identity"                                 → no transform; treat as none
//   - "single_rotate_only"                       → `rotate(θ ...)`
//   - "leading_translate_only"                   → `translate(tx ty)`
//   - "leading_translate_then_single_rotate"     → `translate(...) rotate(...)`
//   - "mixed"                                    → anything else
//
// Identity rotates (angle === 0) collapse to "leading_translate_only" /
// "identity". Identity translates ((0,0)) collapse the same way.

import type { TransformOp } from "./types";

export type TransformClassification =
  | "identity"
  | "single_rotate_only"
  | "leading_translate_only"
  | "leading_translate_then_single_rotate"
  | "mixed";

function is_identity_translate(op: TransformOp): boolean {
  return op.type === "translate" && op.tx === 0 && op.ty === 0;
}

function is_identity_rotate(op: TransformOp): boolean {
  return op.type === "rotate" && op.angle === 0;
}

export function classify(
  ops: ReadonlyArray<TransformOp>
): TransformClassification {
  // Strip identity ops at the boundaries — they're observationally null
  // and shouldn't push a classification into "mixed".
  const trimmed = ops.filter(
    (op) => !is_identity_translate(op) && !is_identity_rotate(op)
  );

  if (trimmed.length === 0) return "identity";

  if (trimmed.length === 1) {
    if (trimmed[0].type === "translate") return "leading_translate_only";
    if (trimmed[0].type === "rotate") return "single_rotate_only";
    return "mixed";
  }

  if (
    trimmed.length === 2 &&
    trimmed[0].type === "translate" &&
    trimmed[1].type === "rotate"
  ) {
    return "leading_translate_then_single_rotate";
  }

  return "mixed";
}
