import { describe, it, expect } from "vitest";
import { transform, type TransformOp } from "../src/core/transform";

describe("transform.parse", () => {
  it("returns [] for null / empty / identity inputs", () => {
    expect(transform.parse(null)).toEqual([]);
    expect(transform.parse("")).toEqual([]);
    expect(transform.parse("   ")).toEqual([]);
    expect(transform.parse("none")).toEqual([]);
    expect(transform.parse("inherit")).toEqual([]);
  });

  it("parses single translate (1 and 2-arg forms)", () => {
    expect(transform.parse("translate(10 20)")).toEqual([
      { type: "translate", tx: 10, ty: 20 },
    ]);
    expect(transform.parse("translate(10)")).toEqual([
      { type: "translate", tx: 10, ty: 0 },
    ]);
    expect(transform.parse("translate(10, 20)")).toEqual([
      { type: "translate", tx: 10, ty: 20 },
    ]);
    // whitespace variance
    expect(transform.parse("translate( 10  20 )")).toEqual([
      { type: "translate", tx: 10, ty: 20 },
    ]);
  });

  it("parses single rotate (1 and 3-arg forms)", () => {
    expect(transform.parse("rotate(30)")).toEqual([
      { type: "rotate", angle: 30, cx: 0, cy: 0, explicit_pivot: false },
    ]);
    expect(transform.parse("rotate(30 50 50)")).toEqual([
      { type: "rotate", angle: 30, cx: 50, cy: 50, explicit_pivot: true },
    ]);
    expect(transform.parse("rotate(0)")).toEqual([
      { type: "rotate", angle: 0, cx: 0, cy: 0, explicit_pivot: false },
    ]);
  });

  it("flags explicit_pivot per source arg count", () => {
    // 1-arg form: pivot defaults to origin, flag false.
    const r1 = transform.parse("rotate(30)")!;
    expect((r1[0] as { explicit_pivot: boolean }).explicit_pivot).toBe(false);
    // 3-arg form: flag true even when the pivot is (0, 0) — distinguishes
    // user-authored origin pivot from elided default. P1-load-bearing.
    const r3origin = transform.parse("rotate(30 0 0)")!;
    expect((r3origin[0] as { explicit_pivot: boolean }).explicit_pivot).toBe(
      true
    );
    // 3-arg form, non-origin pivot.
    const r3 = transform.parse("rotate(45 10 10)")!;
    expect((r3[0] as { explicit_pivot: boolean }).explicit_pivot).toBe(true);
  });

  it("parses scale (1 and 2-arg forms — 1-arg defaults sy=sx)", () => {
    expect(transform.parse("scale(2)")).toEqual([
      { type: "scale", sx: 2, sy: 2 },
    ]);
    expect(transform.parse("scale(2 3)")).toEqual([
      { type: "scale", sx: 2, sy: 3 },
    ]);
  });

  it("parses matrix (6-arg only)", () => {
    expect(transform.parse("matrix(1 0 0 1 5 5)")).toEqual([
      { type: "matrix", a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 },
    ]);
    expect(transform.parse("matrix(1 0 0)")).toBeNull();
    expect(transform.parse("matrix(1 0 0 1 5)")).toBeNull();
  });

  it("parses skewX / skewY (1-arg only)", () => {
    expect(transform.parse("skewX(15)")).toEqual([
      { type: "skewX", angle: 15 },
    ]);
    expect(transform.parse("skewY(15)")).toEqual([
      { type: "skewY", angle: 15 },
    ]);
    expect(transform.parse("skewX(15 20)")).toBeNull();
  });

  it("parses multi-op lists in source order", () => {
    expect(transform.parse("rotate(30) translate(10 20)")).toEqual([
      { type: "rotate", angle: 30, cx: 0, cy: 0, explicit_pivot: false },
      { type: "translate", tx: 10, ty: 20 },
    ]);
    expect(transform.parse("translate(10 0) rotate(15)")).toEqual([
      { type: "translate", tx: 10, ty: 0 },
      { type: "rotate", angle: 15, cx: 0, cy: 0, explicit_pivot: false },
    ]);
    expect(transform.parse("scale(2) rotate(45 10 10)")).toEqual([
      { type: "scale", sx: 2, sy: 2 },
      { type: "rotate", angle: 45, cx: 10, cy: 10, explicit_pivot: true },
    ]);
  });

  it("returns null on unrecognized function", () => {
    expect(transform.parse("foo(1)")).toBeNull();
    expect(transform.parse("translate(10 20) bar(0)")).toBeNull();
  });

  it("returns null on wrong arg counts", () => {
    expect(transform.parse("translate(10, 20, 30)")).toBeNull();
    expect(transform.parse("rotate(10 20)")).toBeNull(); // 2 args
    expect(transform.parse("scale(1 2 3)")).toBeNull();
  });

  it("tolerates non-numeric tokens by skipping them (matches svg-parse.ts leniency)", () => {
    // Number regex extracts numeric tokens only; "NaN" / "abc" are ignored.
    // This documents the lenient parse — callers refuse on classifier verdict,
    // not on parse return.
    expect(transform.parse("translate(10 NaN)")).toEqual([
      { type: "translate", tx: 10, ty: 0 },
    ]);
  });

  it("handles negative, decimal, and scientific notation numbers", () => {
    expect(transform.parse("translate(-1.5e2 .25)")).toEqual([
      { type: "translate", tx: -150, ty: 0.25 },
    ]);
  });
});

describe("transform.emit", () => {
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
      expect(transform.parse(transform.emit(ops))).toEqual(ops);
    }
  });

  it("normalizes parsed-but-elided defaults to verbose emit", () => {
    // `translate(10)` parses to `{tx:10, ty:0}` then emits to
    // `translate(10 0)` — verbose form. Re-parse must agree.
    const ops = transform.parse("translate(10)")!;
    const emitted = transform.emit(ops);
    expect(emitted).toBe("translate(10 0)");
    expect(transform.parse(emitted)).toEqual(ops);
  });

  it("re-emits rotate(θ) as rotate(θ 0 0) — flagged P1 risk if used", () => {
    // The emitter always writes the canonical 3-arg form. Re-emission of
    // a user-authored 1-arg source would canonicalize, which violates P1.
    // The `explicit_pivot` flag is what `is_resizable_node` checks to
    // refuse re-emission of these sources. This test pins the emitter
    // behavior so the gate's refusal logic stays load-bearing.
    const ops = transform.parse("rotate(30)")!;
    expect((ops[0] as { explicit_pivot: boolean }).explicit_pivot).toBe(false);
    expect(transform.emit(ops)).toBe("rotate(30 0 0)");
  });
});

describe("classify", () => {
  it("returns identity for empty / all-no-op lists", () => {
    expect(transform.classify([])).toBe("identity");
    expect(
      transform.classify([
        { type: "translate", tx: 0, ty: 0 },
        { type: "rotate", angle: 0, cx: 0, cy: 0, explicit_pivot: false },
      ])
    ).toBe("identity");
  });

  it("classifies leading-translate-only", () => {
    expect(transform.classify([{ type: "translate", tx: 10, ty: 20 }])).toBe(
      "leading_translate_only"
    );
  });

  it("classifies single-rotate-only", () => {
    expect(
      transform.classify([
        { type: "rotate", angle: 30, cx: 0, cy: 0, explicit_pivot: false },
      ])
    ).toBe("single_rotate_only");
  });

  it("classifies translate-then-rotate", () => {
    expect(
      transform.classify([
        { type: "translate", tx: 10, ty: 0 },
        { type: "rotate", angle: 15, cx: 0, cy: 0, explicit_pivot: false },
      ])
    ).toBe("leading_translate_then_single_rotate");
  });

  it("classifies mixed for matrix / scale / skew / out-of-order", () => {
    expect(
      transform.classify([
        { type: "matrix", a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 },
      ])
    ).toBe("mixed");
    expect(transform.classify([{ type: "scale", sx: 2, sy: 2 }])).toBe("mixed");
    expect(transform.classify([{ type: "skewX", angle: 15 }])).toBe("mixed");
    // rotate-before-translate is mixed (order matters)
    expect(
      transform.classify([
        { type: "rotate", angle: 15, cx: 0, cy: 0, explicit_pivot: false },
        { type: "translate", tx: 10, ty: 0 },
      ])
    ).toBe("mixed");
    // two rotates is mixed
    expect(
      transform.classify([
        { type: "rotate", angle: 15, cx: 0, cy: 0, explicit_pivot: false },
        { type: "rotate", angle: 15, cx: 0, cy: 0, explicit_pivot: false },
      ])
    ).toBe("mixed");
  });
});
