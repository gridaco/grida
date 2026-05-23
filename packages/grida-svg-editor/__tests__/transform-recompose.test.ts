// Headless tests for `transform.recompose`. Pure-function unit tests:
// parsed transform list in, emitted transform string out.

import { describe, it, expect } from "vitest";
import { transform, type TransformOp } from "../src/core/transform";

describe("transform.recompose", () => {
  it("rewrites rotate(θ cx cy) with the new center, preserving angle", () => {
    const ops = transform.parse("rotate(30 90 110)")!;
    expect(transform.recompose(ops, 100, 110)).toBe("rotate(30 100 110)");
  });

  it("subtracts leading translate from the new center (pre-translate local space)", () => {
    // For `translate(tx ty) rotate(θ cx cy)`, the rotate pivot is in
    // post-translate space. Same convention as `apply_rotate`.
    // new center = (100, 110); after subtracting translate (10, 20), the
    // rewritten op should have cx, cy = (90, 90).
    const ops = transform.parse("translate(10 20) rotate(30 80 90)")!;
    expect(transform.recompose(ops, 100, 110)).toBe(
      "translate(10 20) rotate(30 90 90)"
    );
  });

  it("returns input unchanged when there is no rotate op", () => {
    const ops: TransformOp[] = [{ type: "translate", tx: 5, ty: 5 }];
    expect(transform.recompose(ops, 50, 50)).toBe(transform.emit(ops));
  });

  it("is idempotent under identical new-center inputs", () => {
    const ops = transform.parse("rotate(45 10 10)")!;
    const once = transform.recompose(ops, 50, 50);
    const ops2 = transform.parse(once)!;
    const twice = transform.recompose(ops2, 50, 50);
    expect(twice).toBe(once);
  });

  it("preserves angle precision", () => {
    const ops = transform.parse("rotate(45.5 10 10)")!;
    expect(transform.recompose(ops, 20, 30)).toBe("rotate(45.5 20 30)");
  });

  it("sets explicit_pivot: true on the rewritten op (re-parse confirms)", () => {
    const ops = transform.parse("rotate(30 90 110)")!;
    const emitted = transform.recompose(ops, 100, 120);
    const reparsed = transform.parse(emitted)!;
    const rot = reparsed.find((op) => op.type === "rotate")!;
    expect(rot.type === "rotate" && rot.explicit_pivot).toBe(true);
  });
});
