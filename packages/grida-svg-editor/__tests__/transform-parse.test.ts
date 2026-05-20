import { describe, it, expect } from "vitest";
import {
  classify,
  emit_transform_list,
  parse_transform_list,
  type TransformOp,
} from "../src/core/transform";

describe("parse_transform_list", () => {
  it("returns [] for null / empty / identity inputs", () => {
    expect(parse_transform_list(null)).toEqual([]);
    expect(parse_transform_list("")).toEqual([]);
    expect(parse_transform_list("   ")).toEqual([]);
    expect(parse_transform_list("none")).toEqual([]);
    expect(parse_transform_list("inherit")).toEqual([]);
  });

  it("parses single translate (1 and 2-arg forms)", () => {
    expect(parse_transform_list("translate(10 20)")).toEqual([
      { type: "translate", tx: 10, ty: 20 },
    ]);
    expect(parse_transform_list("translate(10)")).toEqual([
      { type: "translate", tx: 10, ty: 0 },
    ]);
    expect(parse_transform_list("translate(10, 20)")).toEqual([
      { type: "translate", tx: 10, ty: 20 },
    ]);
    // whitespace variance
    expect(parse_transform_list("translate( 10  20 )")).toEqual([
      { type: "translate", tx: 10, ty: 20 },
    ]);
  });

  it("parses single rotate (1 and 3-arg forms)", () => {
    expect(parse_transform_list("rotate(30)")).toEqual([
      { type: "rotate", angle: 30, cx: 0, cy: 0, explicit_pivot: false },
    ]);
    expect(parse_transform_list("rotate(30 50 50)")).toEqual([
      { type: "rotate", angle: 30, cx: 50, cy: 50, explicit_pivot: true },
    ]);
    expect(parse_transform_list("rotate(0)")).toEqual([
      { type: "rotate", angle: 0, cx: 0, cy: 0, explicit_pivot: false },
    ]);
  });

  it("flags explicit_pivot per source arg count", () => {
    // 1-arg form: pivot defaults to origin, flag false.
    const r1 = parse_transform_list("rotate(30)")!;
    expect((r1[0] as { explicit_pivot: boolean }).explicit_pivot).toBe(false);
    // 3-arg form: flag true even when the pivot is (0, 0) — distinguishes
    // user-authored origin pivot from elided default. P1-load-bearing.
    const r3origin = parse_transform_list("rotate(30 0 0)")!;
    expect((r3origin[0] as { explicit_pivot: boolean }).explicit_pivot).toBe(
      true
    );
    // 3-arg form, non-origin pivot.
    const r3 = parse_transform_list("rotate(45 10 10)")!;
    expect((r3[0] as { explicit_pivot: boolean }).explicit_pivot).toBe(true);
  });

  it("parses scale (1 and 2-arg forms — 1-arg defaults sy=sx)", () => {
    expect(parse_transform_list("scale(2)")).toEqual([
      { type: "scale", sx: 2, sy: 2 },
    ]);
    expect(parse_transform_list("scale(2 3)")).toEqual([
      { type: "scale", sx: 2, sy: 3 },
    ]);
  });

  it("parses matrix (6-arg only)", () => {
    expect(parse_transform_list("matrix(1 0 0 1 5 5)")).toEqual([
      { type: "matrix", a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 },
    ]);
    expect(parse_transform_list("matrix(1 0 0)")).toBeNull();
    expect(parse_transform_list("matrix(1 0 0 1 5)")).toBeNull();
  });

  it("parses skewX / skewY (1-arg only)", () => {
    expect(parse_transform_list("skewX(15)")).toEqual([
      { type: "skewX", angle: 15 },
    ]);
    expect(parse_transform_list("skewY(15)")).toEqual([
      { type: "skewY", angle: 15 },
    ]);
    expect(parse_transform_list("skewX(15 20)")).toBeNull();
  });

  it("parses multi-op lists in source order", () => {
    expect(parse_transform_list("rotate(30) translate(10 20)")).toEqual([
      { type: "rotate", angle: 30, cx: 0, cy: 0, explicit_pivot: false },
      { type: "translate", tx: 10, ty: 20 },
    ]);
    expect(parse_transform_list("translate(10 0) rotate(15)")).toEqual([
      { type: "translate", tx: 10, ty: 0 },
      { type: "rotate", angle: 15, cx: 0, cy: 0, explicit_pivot: false },
    ]);
    expect(parse_transform_list("scale(2) rotate(45 10 10)")).toEqual([
      { type: "scale", sx: 2, sy: 2 },
      { type: "rotate", angle: 45, cx: 10, cy: 10, explicit_pivot: true },
    ]);
  });

  it("returns null on unrecognized function", () => {
    expect(parse_transform_list("foo(1)")).toBeNull();
    expect(parse_transform_list("translate(10 20) bar(0)")).toBeNull();
  });

  it("returns null on wrong arg counts", () => {
    expect(parse_transform_list("translate(10, 20, 30)")).toBeNull();
    expect(parse_transform_list("rotate(10 20)")).toBeNull(); // 2 args
    expect(parse_transform_list("scale(1 2 3)")).toBeNull();
  });

  it("tolerates non-numeric tokens by skipping them (matches svg-parse.ts leniency)", () => {
    // Number regex extracts numeric tokens only; "NaN" / "abc" are ignored.
    // This documents the lenient parse — callers refuse on classifier verdict,
    // not on parse return.
    expect(parse_transform_list("translate(10 NaN)")).toEqual([
      { type: "translate", tx: 10, ty: 0 },
    ]);
  });

  it("handles negative, decimal, and scientific notation numbers", () => {
    expect(parse_transform_list("translate(-1.5e2 .25)")).toEqual([
      { type: "translate", tx: -150, ty: 0.25 },
    ]);
  });
});

describe("emit_transform_list", () => {
  it("round-trips through parse for canonical forms", () => {
    // Emitter is canonical: rotate always writes 3-arg, so the re-parse
    // produces `explicit_pivot: true` regardless of the source. Inputs
    // here are constructed as canonical (already `explicit_pivot: true`).
    const corpus: TransformOp[][] = [
      [],
      [{ type: "translate", tx: 10, ty: 20 }],
      [{ type: "rotate", angle: 30, cx: 50, cy: 50, explicit_pivot: true }],
      [{ type: "scale", sx: 2, sy: 3 }],
      [{ type: "matrix", a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 }],
      [
        { type: "translate", tx: 10, ty: 0 },
        { type: "rotate", angle: 15, cx: 0, cy: 0, explicit_pivot: true },
      ],
    ];
    for (const ops of corpus) {
      expect(parse_transform_list(emit_transform_list(ops))).toEqual(ops);
    }
  });

  it("normalizes parsed-but-elided defaults to verbose emit", () => {
    // `translate(10)` parses to `{tx:10, ty:0}` then emits to
    // `translate(10 0)` — verbose form. Re-parse must agree.
    const ops = parse_transform_list("translate(10)")!;
    const emitted = emit_transform_list(ops);
    expect(emitted).toBe("translate(10 0)");
    expect(parse_transform_list(emitted)).toEqual(ops);
  });

  it("re-emits rotate(θ) as rotate(θ 0 0) — flagged P1 risk if used", () => {
    // The emitter always writes the canonical 3-arg form. Re-emission of
    // a user-authored 1-arg source would canonicalize, which violates P1.
    // The `explicit_pivot` flag is what `is_resizable_node` checks to
    // refuse re-emission of these sources. This test pins the emitter
    // behavior so the gate's refusal logic stays load-bearing.
    const ops = parse_transform_list("rotate(30)")!;
    expect((ops[0] as { explicit_pivot: boolean }).explicit_pivot).toBe(false);
    expect(emit_transform_list(ops)).toBe("rotate(30 0 0)");
  });
});

describe("classify", () => {
  it("returns identity for empty / all-no-op lists", () => {
    expect(classify([])).toBe("identity");
    expect(
      classify([
        { type: "translate", tx: 0, ty: 0 },
        { type: "rotate", angle: 0, cx: 0, cy: 0, explicit_pivot: false },
      ])
    ).toBe("identity");
  });

  it("classifies leading-translate-only", () => {
    expect(classify([{ type: "translate", tx: 10, ty: 20 }])).toBe(
      "leading_translate_only"
    );
  });

  it("classifies single-rotate-only", () => {
    expect(
      classify([
        { type: "rotate", angle: 30, cx: 0, cy: 0, explicit_pivot: false },
      ])
    ).toBe("single_rotate_only");
  });

  it("classifies translate-then-rotate", () => {
    expect(
      classify([
        { type: "translate", tx: 10, ty: 0 },
        { type: "rotate", angle: 15, cx: 0, cy: 0, explicit_pivot: false },
      ])
    ).toBe("leading_translate_then_single_rotate");
  });

  it("classifies mixed for matrix / scale / skew / out-of-order", () => {
    expect(
      classify([{ type: "matrix", a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 }])
    ).toBe("mixed");
    expect(classify([{ type: "scale", sx: 2, sy: 2 }])).toBe("mixed");
    expect(classify([{ type: "skewX", angle: 15 }])).toBe("mixed");
    // rotate-before-translate is mixed (order matters)
    expect(
      classify([
        { type: "rotate", angle: 15, cx: 0, cy: 0, explicit_pivot: false },
        { type: "translate", tx: 10, ty: 0 },
      ])
    ).toBe("mixed");
    // two rotates is mixed
    expect(
      classify([
        { type: "rotate", angle: 15, cx: 0, cy: 0, explicit_pivot: false },
        { type: "rotate", angle: 15, cx: 0, cy: 0, explicit_pivot: false },
      ])
    ).toBe("mixed");
  });
});
