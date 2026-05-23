// Table 1 — Element → Policy Class.
//
// Tests that the `policy_class_of` lookup matches Table 1 of
// docs/wg/feat-svg-editor/glossary/policy-class.md row-for-row.
//
// If this file fails, either the doc or the code is wrong. Fix the one
// that drifted; do not paper over by changing the test.

import { describe, expect, it } from "vitest";
import { policy_class, type PolicyClass } from "../../src/core/policy-class";

// The expected partition, transcribed from the doc's Table 1.
// Each entry: [tag, expected_class].
const TABLE_1: ReadonlyArray<readonly [string, PolicyClass]> = [
  // VertexChain
  ["line", "vertex-chain"],
  ["polyline", "vertex-chain"],
  ["polygon", "vertex-chain"],
  // VertexBox
  ["rect", "vertex-box"],
  ["image", "vertex-box"],
  ["use", "vertex-box"],
  // Circle
  ["circle", "circle"],
  // Ellipse
  ["ellipse", "ellipse"],
  // Path
  ["path", "path"],
  // Text (deferred)
  ["text", "text"],
  ["tspan", "text"],
  // Group (deferred)
  ["g", "group"],
  // None (sentinel)
  ["defs", "none"],
  ["svg", "none"],
  ["symbol", "none"],
  ["marker", "none"],
  ["clipPath", "none"],
  ["mask", "none"],
  ["pattern", "none"],
  ["linearGradient", "none"],
  ["radialGradient", "none"],
  ["filter", "none"],
];

describe("policy_class.of — Table 1", () => {
  for (const [tag, expected] of TABLE_1) {
    it(`<${tag}> belongs to '${expected}'`, () => {
      expect(policy_class.of(tag)).toBe(expected);
    });
  }

  it("unknown tags fall through to 'none'", () => {
    expect(policy_class.of("nonsense-tag")).toBe("none");
    expect(policy_class.of("")).toBe("none");
  });

  // The membership of each active class — checked once more in
  // aggregate to catch the "I forgot to add `<image>` to VertexBox"
  // kind of regression.
  it("VertexChain membership is exactly {line, polyline, polygon}", () => {
    const members = TABLE_1.filter(([, c]) => c === "vertex-chain").map(
      ([t]) => t
    );
    expect(members.sort()).toEqual(["line", "polygon", "polyline"]);
  });

  it("VertexBox membership is exactly {rect, image, use}", () => {
    const members = TABLE_1.filter(([, c]) => c === "vertex-box").map(
      ([t]) => t
    );
    expect(members.sort()).toEqual(["image", "rect", "use"]);
  });
});
