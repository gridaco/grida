// Project a local-frame bbox through an element's own `transform=` to the
// doc-space AABB. Pure; no DOM.
//
// `getBBox()` per SVG 2 §4.6.4 reports the bbox in the element's own user
// coordinate system, ignoring the element's `transform=` attribute. To get
// the rect a snap engine / pivot computation actually wants — the
// element's footprint in the parent viewport's space — we have to compose
// the element's transform-list and project the four local corners.
//
// For nested transformed ancestors (`<g transform=...>`) this still only
// considers the element's OWN transform — the flat-doc design target.

import cmath from "@grida/cmath";
import type { Rect } from "../../types";
import { parse_transform_list } from "./parse";
import type { TransformOp } from "./types";

function op_matrix(op: TransformOp): cmath.Transform {
  switch (op.type) {
    case "matrix":
      return [
        [op.a, op.c, op.e],
        [op.b, op.d, op.f],
      ];
    case "translate":
      return [
        [1, 0, op.tx],
        [0, 1, op.ty],
      ];
    case "rotate": {
      // rotate(θ cx cy) ≡ translate(cx, cy) rotate(θ) translate(-cx, -cy)
      // per SVG 1.1 §7.6.
      const t = (op.angle * Math.PI) / 180;
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      return [
        [cos, -sin, op.cx - op.cx * cos + op.cy * sin],
        [sin, cos, op.cy - op.cx * sin - op.cy * cos],
      ];
    }
    case "scale":
      return [
        [op.sx, 0, 0],
        [0, op.sy, 0],
      ];
    case "skewX": {
      const t = (op.angle * Math.PI) / 180;
      return [
        [1, Math.tan(t), 0],
        [0, 1, 0],
      ];
    }
    case "skewY": {
      const t = (op.angle * Math.PI) / 180;
      return [
        [1, 0, 0],
        [Math.tan(t), 1, 0],
      ];
    }
  }
}

/** Compose a transform-list into a single 2×3 affine. Ops compose
 *  source-order = left-to-right multiplication: `transform="A B C"` maps
 *  a column-vector point `p` as `A · B · C · p` (per SVG 1.1 §7.5). */
function compose(ops: ReadonlyArray<TransformOp>): cmath.Transform {
  let m: cmath.Transform = cmath.transform.identity;
  for (const op of ops) m = cmath.transform.multiply(m, op_matrix(op));
  return m;
}

/** Axis-aligned doc-space bounding box of `local` under `transform_str`.
 *  Returns `local` unchanged when the transform is absent / empty /
 *  unparseable (i.e. local-frame ≡ doc-space in those cases). */
export function project_local_bbox(
  local: Rect,
  transform_str: string | null
): Rect {
  if (!transform_str) return local;
  const ops = parse_transform_list(transform_str);
  if (ops === null || ops.length === 0) return local;
  const m = compose(ops);
  const corners: cmath.Vector2[] = [
    [local.x, local.y],
    [local.x + local.width, local.y],
    [local.x + local.width, local.y + local.height],
    [local.x, local.y + local.height],
  ];
  const projected = corners.map((p) => cmath.vector2.transform(p, m));
  return cmath.rect.fromPointsOrZero(projected);
}
