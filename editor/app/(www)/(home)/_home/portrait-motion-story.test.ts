import { describe, expect, it } from "vitest";
import { PortraitMotionStory } from "./portrait-motion-story";

describe("PortraitMotionStory.progress", () => {
  it("maps the pinned track directly to current scroll geometry", () => {
    expect(PortraitMotionStory.progress(0, 2340, 900)).toBe(0);
    expect(PortraitMotionStory.progress(-720, 2340, 900)).toBe(0.5);
    expect(PortraitMotionStory.progress(-1440, 2340, 900)).toBe(1);
    expect(PortraitMotionStory.progress(300, 2340, 900)).toBe(0);
    expect(PortraitMotionStory.progress(-4000, 2340, 900)).toBe(1);
    expect(PortraitMotionStory.progress(-720, 2400, 1200)).toBe(0.6);
  });

  it.each([
    [0, 0, 900],
    [0, 900, 900],
    [0, 600, 900],
    [0, 2340, 0],
    [Number.NaN, 2340, 900],
    [0, Number.POSITIVE_INFINITY, 900],
  ])("rejects unusable geometry (%s, %s, %s)", (top, track, viewport) => {
    expect(PortraitMotionStory.progress(top, track, viewport)).toBe(0);
  });
});

describe("PortraitMotionStory.evaluate", () => {
  it("begins with the source and ends with the fully assembled portrait", () => {
    expect(PortraitMotionStory.evaluate(0)).toEqual({
      phase: "source",
      workspaceReveal: 0,
      statesReveal: 0,
      branchesSpread: 0,
      assemble: 0,
      guideOpacity: 1,
      resultOpacity: 0,
      originalOpacity: 1,
    });
    expect(PortraitMotionStory.evaluate(1)).toEqual({
      phase: "portrait",
      workspaceReveal: 1,
      statesReveal: 1,
      branchesSpread: 0,
      assemble: 1,
      guideOpacity: 0,
      resultOpacity: 1,
      originalOpacity: 0,
    });
  });

  it("holds the generated states apart, then brings them back to the portrait", () => {
    expect(PortraitMotionStory.evaluate(0.42).branchesSpread).toBe(1);
    expect(PortraitMotionStory.evaluate(0.54).branchesSpread).toBe(1);
    expect(PortraitMotionStory.evaluate(0.63).branchesSpread).toBeCloseTo(0.5);
    expect(PortraitMotionStory.evaluate(0.72).branchesSpread).toBe(0);
    expect(PortraitMotionStory.evaluate(0.76).assemble).toBe(1);
    expect(PortraitMotionStory.evaluate(0.76).resultOpacity).toBe(0);
    expect(PortraitMotionStory.evaluate(0.84).resultOpacity).toBe(1);
  });

  it("reverses without retaining a previous scroll position", () => {
    const positions = [0.02, 0.16, 0.48, 0.9];
    const forward = positions.map((position) =>
      PortraitMotionStory.evaluate(position)
    );
    const backward = [...positions]
      .reverse()
      .map((position) => PortraitMotionStory.evaluate(position));
    expect(forward.map((state) => state.phase)).toEqual([
      "source",
      "workspace",
      "states",
      "portrait",
    ]);
    expect(backward).toEqual([...forward].reverse());
  });

  it("keeps all timeline values finite and bounded, including invalid input", () => {
    for (const position of [
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      -20,
      ...Array.from({ length: 101 }, (_, index) => index / 100),
      20,
      Number.POSITIVE_INFINITY,
    ]) {
      const { phase: _phase, ...values } =
        PortraitMotionStory.evaluate(position);
      for (const value of Object.values(values)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
    expect(PortraitMotionStory.evaluate(Number.NaN)).toEqual(
      PortraitMotionStory.evaluate(0)
    );
    expect(PortraitMotionStory.evaluate(Number.POSITIVE_INFINITY)).toEqual(
      PortraitMotionStory.evaluate(1)
    );
  });

  it("has no transform jumps at phase and composition boundaries", () => {
    for (const position of [
      0.08, 0.22, 0.24, 0.4, 0.42, 0.54, 0.64, 0.68, 0.72, 0.76, 0.78, 0.8,
      0.84,
    ]) {
      const before = PortraitMotionStory.evaluate(position - 0.0001);
      const after = PortraitMotionStory.evaluate(position + 0.0001);
      for (const key of Object.keys(before) as Array<keyof typeof before>) {
        if (key === "phase") continue;
        expect(Math.abs(after[key] - before[key])).toBeLessThan(0.005);
      }
    }
  });
});

describe("PortraitMotionStory.expressionAt", () => {
  it("finishes a blink at its own pace using the prepared eye states", () => {
    for (const [elapsed, eye] of [
      [-1, "open"],
      [0, "half"],
      [55, "closed"],
      [155, "half"],
      [220, "open"],
      [4000, "open"],
    ] as const) {
      expect(PortraitMotionStory.expressionAt("blink", elapsed)).toEqual({
        eyeLeft: eye,
        eyeRight: eye,
      });
    }
  });

  it("winks one eye while leaving the other unchanged", () => {
    expect(PortraitMotionStory.expressionAt("wink", 80)).toEqual({
      eyeLeft: "closed",
      eyeRight: "open",
    });
    expect(PortraitMotionStory.expressionAt("wink", 220)).toEqual({
      eyeLeft: "open",
      eyeRight: "open",
    });
  });

  it("uses the resting expression when elapsed time is unusable", () => {
    for (const elapsed of [Number.NaN, Infinity, -Infinity]) {
      expect(PortraitMotionStory.expressionAt("blink", elapsed)).toEqual({
        eyeLeft: "open",
        eyeRight: "open",
      });
    }
  });
});
