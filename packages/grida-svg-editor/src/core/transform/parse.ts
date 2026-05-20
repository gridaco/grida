// Transform-attribute parser. Editor-agnostic, pure.
//
// Recognized functions per SVG 1.1 §7.6: `matrix`, `translate`, `rotate`,
// `scale`, `skewX`, `skewY`. Anything else (or any malformed argument list)
// causes the whole parse to return `null` — callers use this to drive the
// refuse-and-surface policy (the editor refuses to rotate / write an
// element whose transform list it can't fully understand).
//
// SVG 2 CSS-syntax keywords (`none`, `inherit`, `unset`, `initial`) are
// recognized as identity inputs and parse to an empty op list.

import type { TransformOp } from "./types";

/** SVG `<number>` production (spec-aligned subset). */
const SVG_NUMBER_SRC = "[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?";

/** Recognized function names. Names are case-sensitive per SVG 1.1 §7.6. */
const FUNCTION_RE = /\s*([A-Za-z]+)\s*\(([^)]*)\)\s*/y;

/** Number tokens, comma- or whitespace-separated, inside a single call. */
const NUMBER_GLOBAL_RE = new RegExp(SVG_NUMBER_SRC, "g");

/** Identity / no-op string forms. SVG 2 §11.6.1 lets `transform="none"`
 *  mean the identity transform. CSS-wide keywords are normalized at
 *  parse time per SVG 2 cascade. */
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
 *   parse_transform_list(null)               => []
 *   parse_transform_list("")                 => []
 *   parse_transform_list("none")             => []
 *   parse_transform_list("translate(10 20)") => [{type:"translate",tx:10,ty:20}]
 *   parse_transform_list("rotate(30 50 50)") => [{type:"rotate",angle:30,cx:50,cy:50}]
 *   parse_transform_list("foo(1)")           => null   // unknown function
 *   parse_transform_list("matrix(1 0 0)")    => null   // wrong arg count
 */
export function parse_transform_list(
  input: string | null
): TransformOp[] | null {
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
    // Skip trailing whitespace / comma between ops.
    while (pos < input.length && /[\s,]/.test(input[pos])) pos++;
  }
  return ops;
}
