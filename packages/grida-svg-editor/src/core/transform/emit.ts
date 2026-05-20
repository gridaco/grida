// Transform-attribute emitter. Editor-agnostic, pure.
//
// Emits canonical form: function names lowercased per SVG (camelCase for
// skewX / skewY), single space between args, no comma. Verbose argument
// form (3-arg rotate, 2-arg translate / scale) is always emitted, so
// `parse_transform_list(emit_transform_list(ops))` is fixed-point on the
// editor's own writes — the round-trip invariant the rotate-pipeline
// rests on.
//
// Number formatting uses `String(n)` (JavaScript's shortest-round-trip
// representation), matching the existing `compose_leading_translate`
// emit style in `core/intents.ts`. Adversarial trig drift (e.g.
// `0.999999...`) is the caller's concern (drift policy at gesture
// commit) — not emitted away here.

import type { TransformOp } from "./types";

function n(x: number): string {
  return String(x);
}

export function emit_op(op: TransformOp): string {
  switch (op.type) {
    case "matrix":
      return `matrix(${n(op.a)} ${n(op.b)} ${n(op.c)} ${n(op.d)} ${n(op.e)} ${n(op.f)})`;
    case "translate":
      return `translate(${n(op.tx)} ${n(op.ty)})`;
    case "rotate":
      return `rotate(${n(op.angle)} ${n(op.cx)} ${n(op.cy)})`;
    case "scale":
      return `scale(${n(op.sx)} ${n(op.sy)})`;
    case "skewX":
      return `skewX(${n(op.angle)})`;
    case "skewY":
      return `skewY(${n(op.angle)})`;
  }
}

/** Concatenate ops with single-space separator. Returns `""` for empty
 *  list (identity). Caller decides whether to write `transform=""`,
 *  `transform="none"`, or remove the attribute entirely. */
export function emit_transform_list(ops: ReadonlyArray<TransformOp>): string {
  return ops.map(emit_op).join(" ");
}
