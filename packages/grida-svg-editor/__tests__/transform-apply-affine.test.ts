// Headless tests for `transform.apply_affine` — the pure parse→fold→emit
// chokepoint behind `commands.transform`. The host can request an affine
// compose but can never hand us a raw transform string; this helper turns
// a world-space `cmath.Transform` into the new `transform=` attribute
// value. Pure: string + matrix in, string (or null) out. No DOM.
//
// Test names ARE the spec (sdk-design "tests are spec"). The helper folds
// the effective affine onto a single LEADING matrix op, preserves trailing
// tokens, collapses repeated applies, and drops a net-identity leading
// matrix (which is what makes flip-then-flip restore the original).

import { describe, it, expect } from "vitest";
import cmath from "@grida/cmath";
import { transform } from "../src/core/transform";

/** `E = T(pivot) · matrix · T(-pivot)` for an SVG `matrix(a b c d e f)`
 *  tuple — the same re-centering `commands.transform` performs. Kept
 *  local so the test owns the math it asserts against, independent of the
 *  command wiring. */
function effective(
  matrix: readonly [number, number, number, number, number, number],
  pivot: { x: number; y: number }
): cmath.Transform {
  const [a, b, c, d, e, f] = matrix;
  const requested: cmath.Transform = [
    [a, c, e],
    [b, d, f],
  ];
  const t_pivot: cmath.Transform = [
    [1, 0, pivot.x],
    [0, 1, pivot.y],
  ];
  const t_neg: cmath.Transform = [
    [1, 0, -pivot.x],
    [0, 1, -pivot.y],
  ];
  return cmath.transform.multiply(
    cmath.transform.multiply(t_pivot, requested),
    t_neg
  );
}

const FLIP_X = [-1, 0, 0, 1, 0, 0] as const;
const FLIP_Y = [1, 0, 0, -1, 0, 0] as const;
const IDENTITY = [1, 0, 0, 1, 0, 0] as const;

/** Map a point through an emitted `transform=` string. Lets a test assert
 *  on observable geometry rather than on the matrix digits. */
function map_point(transform_str: string, p: cmath.Vector2): cmath.Vector2 {
  return cmath.vector2.transform(p, compose_str(transform_str));
}

/** Compose a transform string into one 2×3 affine (test-local mirror of
 *  the module-private `compose`). Only `matrix` / `rotate` appear in these
 *  tests. */
function compose_str(transform_str: string): cmath.Transform {
  const ops = transform.parse(transform_str)!;
  let m: cmath.Transform = cmath.transform.identity;
  for (const op of ops) {
    let om: cmath.Transform;
    switch (op.type) {
      case "matrix":
        om = [
          [op.a, op.c, op.e],
          [op.b, op.d, op.f],
        ];
        break;
      case "rotate": {
        const t = (op.angle * Math.PI) / 180;
        const cos = Math.cos(t);
        const sin = Math.sin(t);
        om = [
          [cos, -sin, op.cx - op.cx * cos + op.cy * sin],
          [sin, cos, op.cy - op.cx * sin - op.cy * cos],
        ];
        break;
      }
      case "translate":
        om = [
          [1, 0, op.tx],
          [0, 1, op.ty],
        ];
        break;
      default:
        throw new Error(`unexpected op ${op.type}`);
    }
    m = cmath.transform.multiply(m, om);
  }
  return m;
}

describe("transform.apply_affine", () => {
  it("horizontal flip about center on an untransformed element writes a single matrix that mirrors x", () => {
    // Untransformed element (null transform), flip horizontally about the
    // bbox center (50, 50). The result is one leading matrix and nothing
    // else; mapping a point through it mirrors x about 50 and leaves y.
    const E = effective(FLIP_X, { x: 50, y: 50 });
    const out = transform.apply_affine(null, E)!;
    expect(out.startsWith("matrix(")).toBe(true);
    // A single matrix token — no other ops folded in.
    const ops = transform.parse(out)!;
    expect(ops.length).toBe(1);
    expect(ops[0].type).toBe("matrix");
    // (60, 30) sits 10 right of center → mirrors to (40, 30).
    const mapped = map_point(out, [60, 30]);
    expect(mapped[0]).toBeCloseTo(40, 9);
    expect(mapped[1]).toBeCloseTo(30, 9);
  });

  it("applying the same flip twice restores the original transform attribute", () => {
    // null in → flip → flip → null out. The net leading matrix collapses
    // to identity and is dropped, so the attribute is removed entirely.
    const E = effective(FLIP_X, { x: 50, y: 50 });
    const once = transform.apply_affine(null, E);
    expect(once).not.toBeNull();
    const twice = transform.apply_affine(once, E);
    expect(twice).toBeNull();
  });

  it("applying the same flip twice restores a pre-existing transform string byte-equal", () => {
    // With a pre-existing rotate token, flip-then-flip must leave the
    // rotate untouched: the two flips fold into an identity leading matrix
    // that is dropped, leaving exactly the original tokens.
    const E = effective(FLIP_X, { x: 50, y: 50 });
    const original = "rotate(30 10 10)";
    const once = transform.apply_affine(original, E)!;
    const twice = transform.apply_affine(once, E)!;
    expect(twice).toBe(original);
  });

  it("a flip composes as a leading matrix and preserves an existing rotate token", () => {
    // The fold prepends a matrix; the original rotate(30 ...) survives
    // unchanged after it.
    const E = effective(FLIP_X, { x: 50, y: 50 });
    const out = transform.apply_affine("rotate(30 10 10)", E)!;
    expect(out.startsWith("matrix(")).toBe(true);
    expect(out).toContain("rotate(30 10 10)");
    const ops = transform.parse(out)!;
    expect(ops[0].type).toBe("matrix");
    expect(ops[ops.length - 1].type).toBe("rotate");
  });

  it("an identity affine is a no-op (no leading matrix added)", () => {
    // E = identity. A string with tokens is returned unchanged; a null
    // input stays null.
    const E = effective(IDENTITY, { x: 50, y: 50 });
    expect(transform.apply_affine("rotate(30 10 10)", E)).toBe(
      "rotate(30 10 10)"
    );
    expect(transform.apply_affine(null, E)).toBeNull();
  });

  it("repeated applies collapse into a single leading matrix (no token pile-up)", () => {
    // Two different flips fold into ONE matrix op, not two — the leading
    // matrix is replaced, never stacked.
    const EX = effective(FLIP_X, { x: 50, y: 50 });
    const EY = effective(FLIP_Y, { x: 50, y: 50 });
    const once = transform.apply_affine(null, EX);
    const twice = transform.apply_affine(once, EY)!;
    const ops = transform.parse(twice)!;
    expect(ops.length).toBe(1);
    expect(ops[0].type).toBe("matrix");
    // flipX then flipY about (50,50) = 180° rotation about (50,50):
    // (60, 30) → (40, 70).
    const mapped = map_point(twice, [60, 30]);
    expect(mapped[0]).toBeCloseTo(40, 9);
    expect(mapped[1]).toBeCloseTo(70, 9);
  });

  it("folds onto an existing leading matrix instead of stacking a second one", () => {
    // Pre-existing `matrix(2 0 0 2 0 0)` (uniform 2× scale). A flip-x about
    // origin replaces it with `effective · existing`, still one matrix.
    const E = effective(FLIP_X, { x: 0, y: 0 }); // pure mirror about origin
    const out = transform.apply_affine("matrix(2 0 0 2 0 0)", E)!;
    const ops = transform.parse(out)!;
    expect(ops.length).toBe(1);
    expect(ops[0].type).toBe("matrix");
    // effective = [[-1,0,0],[0,1,0]]; existing = [[2,0,0],[0,2,0]];
    // product = [[-2,0,0],[0,2,0]] → matrix(-2 0 0 2 0 0).
    expect(out).toBe("matrix(-2 0 0 2 0 0)");
  });

  it("returns an unparseable transform string unchanged (defensive identity)", () => {
    // The command gate refuses these before they reach the helper; the
    // pure function does not invent a transform on garbage input.
    const E = effective(FLIP_X, { x: 50, y: 50 });
    expect(transform.apply_affine("not a transform", E)).toBe(
      "not a transform"
    );
  });
});
