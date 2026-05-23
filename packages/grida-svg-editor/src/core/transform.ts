// SVG `transform=""` attribute — parse, emit, classify, project, recompose.
//
// Defaults from SVG 1.1 §7.6 are normalized into the parsed op (e.g.
// `translate(10)` → `{ tx: 10, ty: 0 }`); `emit` re-applies the verbose
// form so the round-trip is parse-stable even when the source elided
// defaults.
//
// `classify` keys the refuse-and-surface policy (the rotate intent's
// `is_rotatable` and the hit-shape backend both switch on the verdict to
// decide whether they can compose into the existing transform cleanly or
// must refuse / fall back).

import cmath from "@grida/cmath";
import type { Rect } from "../types";

export type TransformOp =
  | {
      type: "matrix";
      a: number;
      b: number;
      c: number;
      d: number;
      e: number;
      f: number;
    }
  | { type: "translate"; tx: number; ty: number }
  | {
      type: "rotate";
      angle: number;
      cx: number;
      cy: number;
      /** True iff parsed from `rotate(θ cx cy)`. False iff from `rotate(θ)`
       *  (origin pivot). Parser-set; emitter-ignored. */
      explicit_pivot: boolean;
    }
  | { type: "scale"; sx: number; sy: number }
  | { type: "skewX"; angle: number }
  | { type: "skewY"; angle: number };

export type TransformClassification =
  | "identity"
  | "single_rotate_only"
  | "leading_translate_only"
  | "leading_translate_then_single_rotate"
  | "mixed";

export namespace transform {
  // ---------------------------------------------------------------------
  // parse
  // ---------------------------------------------------------------------
  //
  // Recognized functions per SVG 1.1 §7.6: `matrix`, `translate`, `rotate`,
  // `scale`, `skewX`, `skewY`. Anything else (or any malformed argument
  // list) causes the whole parse to return `null` — callers use this to
  // drive the refuse-and-surface policy.
  //
  // SVG 2 CSS-syntax keywords (`none`, `inherit`, `unset`, `initial`) are
  // recognized as identity inputs and parse to an empty op list.

  /** SVG `<number>` production (spec-aligned subset). */
  const SVG_NUMBER_SRC = "[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?";

  /** Recognized function names. Names are case-sensitive per SVG 1.1 §7.6. */
  const FUNCTION_RE = /\s*([A-Za-z]+)\s*\(([^)]*)\)\s*/y;

  const NUMBER_GLOBAL_RE = new RegExp(SVG_NUMBER_SRC, "g");

  /** SVG 2 §11.6.1: `transform="none"` ≡ identity. CSS-wide keywords are
   *  normalized at parse time per SVG 2 cascade. */
  const IDENTITY_RE =
    /^\s*(?:none|inherit|unset|initial|revert|revert-layer)?\s*$/;

  function parse_args(args: string): number[] | null {
    const tokens = args.match(NUMBER_GLOBAL_RE);
    if (!tokens) return [];
    const out: number[] = [];
    for (const t of tokens) {
      const n = parseFloat(t);
      if (!Number.isFinite(n)) return null;
      out.push(n);
    }
    return out;
  }

  function build_op(name: string, a: number[]): TransformOp | null {
    switch (name) {
      case "matrix":
        if (a.length !== 6) return null;
        return {
          type: "matrix",
          a: a[0],
          b: a[1],
          c: a[2],
          d: a[3],
          e: a[4],
          f: a[5],
        };
      case "translate":
        if (a.length !== 1 && a.length !== 2) return null;
        return { type: "translate", tx: a[0], ty: a.length === 2 ? a[1] : 0 };
      case "rotate":
        if (a.length !== 1 && a.length !== 3) return null;
        return {
          type: "rotate",
          angle: a[0],
          cx: a.length === 3 ? a[1] : 0,
          cy: a.length === 3 ? a[2] : 0,
          explicit_pivot: a.length === 3,
        };
      case "scale":
        if (a.length !== 1 && a.length !== 2) return null;
        return { type: "scale", sx: a[0], sy: a.length === 2 ? a[1] : a[0] };
      case "skewX":
        if (a.length !== 1) return null;
        return { type: "skewX", angle: a[0] };
      case "skewY":
        if (a.length !== 1) return null;
        return { type: "skewY", angle: a[0] };
      default:
        return null;
    }
  }

  /**
   * Parse a `transform=""` attribute string into a list of typed ops.
   *
   *   parse(null)               => []
   *   parse("")                 => []
   *   parse("none")             => []
   *   parse("translate(10 20)") => [{type:"translate",tx:10,ty:20}]
   *   parse("rotate(30 50 50)") => [{type:"rotate",angle:30,cx:50,cy:50}]
   *   parse("foo(1)")           => null   // unknown function
   *   parse("matrix(1 0 0)")    => null   // wrong arg count
   */
  export function parse(input: string | null): TransformOp[] | null {
    if (input === null) return [];
    if (IDENTITY_RE.test(input)) return [];

    const ops: TransformOp[] = [];
    FUNCTION_RE.lastIndex = 0;
    let pos = 0;
    while (pos < input.length) {
      FUNCTION_RE.lastIndex = pos;
      const m = FUNCTION_RE.exec(input);
      if (!m || m.index !== pos) return null;
      const name = m[1];
      const args = parse_args(m[2]);
      if (args === null) return null;
      const op = build_op(name, args);
      if (!op) return null;
      ops.push(op);
      pos = FUNCTION_RE.lastIndex;
      while (pos < input.length && /[\s,]/.test(input[pos])) pos++;
    }
    return ops;
  }

  // ---------------------------------------------------------------------
  // emit
  // ---------------------------------------------------------------------
  //
  // Emits canonical form: function names lowercased per SVG (camelCase for
  // skewX / skewY), single space between args, no comma. Verbose argument
  // form (3-arg rotate, 2-arg translate / scale) is always emitted, so
  // `parse(emit(ops))` is fixed-point on the editor's own writes — the
  // round-trip invariant the rotate-pipeline rests on.
  //
  // Number formatting uses `String(n)` (JavaScript's shortest-round-trip
  // representation). Adversarial trig drift (e.g. `0.999999...`) is the
  // caller's concern (drift policy at gesture commit) — not emitted away
  // here.

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
  export function emit(ops: ReadonlyArray<TransformOp>): string {
    return ops.map(emit_op).join(" ");
  }

  // ---------------------------------------------------------------------
  // classify
  // ---------------------------------------------------------------------
  //
  // Verdicts (in order of strictness):
  //   - "identity"
  //   - "single_rotate_only"                       → `rotate(θ ...)`
  //   - "leading_translate_only"                   → `translate(tx ty)`
  //   - "leading_translate_then_single_rotate"     → `translate(...) rotate(...)`
  //   - "mixed"
  //
  // Identity rotates (angle === 0) collapse to "leading_translate_only" /
  // "identity". Identity translates ((0,0)) collapse the same way.

  function is_identity_translate(op: TransformOp): boolean {
    return op.type === "translate" && op.tx === 0 && op.ty === 0;
  }

  function is_identity_rotate(op: TransformOp): boolean {
    return op.type === "rotate" && op.angle === 0;
  }

  export function classify(
    ops: ReadonlyArray<TransformOp>
  ): TransformClassification {
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

  // ---------------------------------------------------------------------
  // project
  // ---------------------------------------------------------------------
  //
  // Project a local-frame bbox through an element's own `transform=` to
  // the doc-space AABB. Pure; no DOM.
  //
  // `getBBox()` per SVG 2 §4.6.4 reports the bbox in the element's own
  // user coordinate system, ignoring the element's `transform=` attribute.
  // To get the rect a snap engine / pivot computation actually wants —
  // the element's footprint in the parent viewport's space — we have to
  // compose the element's transform-list and project the four local
  // corners.
  //
  // For nested transformed ancestors (`<g transform=...>`) this still
  // only considers the element's OWN transform — the flat-doc design
  // target.

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
   *  source-order = left-to-right multiplication: `transform="A B C"`
   *  maps a column-vector point `p` as `A · B · C · p` (per SVG 1.1
   *  §7.5). */
  function compose(ops: ReadonlyArray<TransformOp>): cmath.Transform {
    let m: cmath.Transform = cmath.transform.identity;
    for (const op of ops) m = cmath.transform.multiply(m, op_matrix(op));
    return m;
  }

  /** Axis-aligned doc-space bounding box of `local` under `transform_str`.
   *  Returns `local` unchanged when the transform is absent / empty /
   *  unparseable (i.e. local-frame ≡ doc-space in those cases). */
  export function project(local: Rect, transform_str: string | null): Rect {
    if (!transform_str) return local;
    const ops = parse(transform_str);
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

  // ---------------------------------------------------------------------
  // recompose
  // ---------------------------------------------------------------------
  //
  // `(new_cx, new_cy)` is in post-translate local space (the same space
  // `apply_rotate` reads its pivot from). The rotate op's (cx, cy) is
  // pre-translate space per SVG 1.1 §7.6, so we subtract the leading
  // translate before writing.

  export function recompose(
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
    return emit(rewritten);
  }
}
