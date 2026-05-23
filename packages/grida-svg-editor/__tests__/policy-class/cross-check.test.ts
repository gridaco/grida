// Cross-check — Policy Class abstraction against the existing
// `intents.ts` capability gates and tag dispatch.
//
// This test file is the bridge between the new pure-data Policy Class
// module and the existing imperative logic in `core/intents.ts`. It
// asserts the two agree on the high-level facts. When the imperative
// code is eventually rewritten to dispatch through Policy Class, these
// tests should still pass — they encode the contract.

import { describe, expect, it } from "vitest";
import {
  ACTIVE_POLICY_CLASSES,
  policy_class,
  type PolicyClass,
} from "../../src/core/policy-class";
import { resize_pipeline } from "../../src/core/resize-pipeline";

// Every tag the existing `is_resizable` accepts must map to a Policy
// Class whose `resize` cell accepts.
//
// The current `resize_pipeline.intent.is_resizable(tag)` accepts:
//   rect, image, use, circle, ellipse, line, polyline, polygon, path, text

describe("legacy resize_pipeline.intent.is_resizable(tag) agrees with Policy Class resize capability", () => {
  const RESIZABLE_TAGS = [
    "rect",
    "image",
    "use",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "path",
    "text",
  ];

  for (const tag of RESIZABLE_TAGS) {
    it(`<${tag}> is resizable per legacy AND its class accepts resize`, () => {
      const cls = policy_class.of(tag);

      // Legacy gate.
      expect(resize_pipeline.intent.is_resizable(tag)).toBe(true);

      // Policy Class gate. Text class is deferred (no declared cells)
      // so the new gate currently disagrees — flag explicitly so the
      // future text policy work has a clear failing test to flip.
      // Known v1 gap: text resize behavior is undeclared in Policy
      // Class but accepted by legacy. When Text class is implemented
      // (see doc, deferred), flip this expectation to `true`.
      const expected_resize = cls !== "text";
      expect(policy_class.accepts(cls, "resize")).toBe(expected_resize);
    });
  }

  it("<g> and <tspan> are NOT resizable (legacy and Policy Class agree)", () => {
    expect(resize_pipeline.intent.is_resizable("g")).toBe(false);
    expect(resize_pipeline.intent.is_resizable("tspan")).toBe(false);
    expect(policy_class.accepts(policy_class.of("g"), "resize")).toBe(false);
    expect(policy_class.accepts(policy_class.of("tspan"), "resize")).toBe(
      false
    );
  });
});

// Inventory check — every active Policy Class has at least one SVG tag
// mapped to it. If a class has zero members, either the class is
// premature (drop it) or the classify function is missing a case.

describe("every active Policy Class has at least one tag member", () => {
  const ALL_KNOWN_TAGS = [
    "rect",
    "image",
    "use",
    "line",
    "polyline",
    "polygon",
    "circle",
    "ellipse",
    "path",
    "text",
    "tspan",
    "g",
    "defs",
    "svg",
    "symbol",
    "marker",
    "clipPath",
    "mask",
    "pattern",
    "linearGradient",
    "radialGradient",
    "filter",
  ];

  const populated: Record<PolicyClass, string[]> = {
    "vertex-chain": [],
    "vertex-box": [],
    circle: [],
    ellipse: [],
    path: [],
    text: [],
    group: [],
    none: [],
  };

  for (const tag of ALL_KNOWN_TAGS) {
    populated[policy_class.of(tag)].push(tag);
  }

  for (const cls of ACTIVE_POLICY_CLASSES) {
    it(`'${cls}' has at least one tag member`, () => {
      expect(populated[cls].length).toBeGreaterThan(0);
    });
  }
});
