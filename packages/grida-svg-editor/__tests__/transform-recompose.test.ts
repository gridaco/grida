// Headless tests for `recompose_with_pivot`. Pure-function unit tests:
// parsed transform list in, emitted transform string out.

import { describe, it, expect } from "vitest";
import {
  emit_transform_list,
  parse_transform_list,
  recompose_with_pivot,
  type TransformOp,
} from "../src/core/transform";

describe("recompose_with_pivot", () => {
  it("rewrites rotate(θ cx cy) with the new center, preserving angle", () => {
    const ops = parse_transform_list("rotate(30 90 110)")!;
    expect(recompose_with_pivot(ops, 100, 110)).toBe("rotate(30 100 110)");
  });

  it("subtracts leading translate from the new center (pre-translate local space)", () => {
    // For `translate(tx ty) rotate(θ cx cy)`, the rotate pivot is in
    // post-translate space. Same convention as `apply_rotate`.
    // new center = (100, 110); after subtracting translate (10, 20), the
    // rewritten op should have cx, cy = (90, 90).
    const ops = parse_transform_list("translate(10 20) rotate(30 80 90)")!;
    expect(recompose_with_pivot(ops, 100, 110)).toBe(
      "translate(10 20) rotate(30 90 90)"
    );
  });

  it("returns input unchanged when there is no rotate op", () => {
    const ops: TransformOp[] = [{ type: "translate", tx: 5, ty: 5 }];
    expect(recompose_with_pivot(ops, 50, 50)).toBe(emit_transform_list(ops));
  });

  it("is idempotent under identical new-center inputs", () => {
    const ops = parse_transform_list("rotate(45 10 10)")!;
    const once = recompose_with_pivot(ops, 50, 50);
    const ops2 = parse_transform_list(once)!;
    const twice = recompose_with_pivot(ops2, 50, 50);
    expect(twice).toBe(once);
  });

  it("preserves angle precision", () => {
    const ops = parse_transform_list("rotate(45.5 10 10)")!;
    expect(recompose_with_pivot(ops, 20, 30)).toBe("rotate(45.5 20 30)");
  });

  it("sets explicit_pivot: true on the rewritten op (re-parse confirms)", () => {
    const ops = parse_transform_list("rotate(30 90 110)")!;
    const emitted = recompose_with_pivot(ops, 100, 120);
    const reparsed = parse_transform_list(emitted)!;
    const rot = reparsed.find((op) => op.type === "rotate")!;
    expect(rot.type === "rotate" && rot.explicit_pivot).toBe(true);
  });
});
