import { describe, expect, it } from "vitest";
import {
  bucketForScore,
  clampPercentage,
  clampSimilarity,
} from "../src/score.js";

describe("bucketForScore", () => {
  it("S99 covers [0.99, 1.0]", () => {
    expect(bucketForScore(1)).toBe("S99");
    expect(bucketForScore(0.99)).toBe("S99");
    expect(bucketForScore(0.995)).toBe("S99");
  });

  it("S95 covers [0.95, 0.99)", () => {
    expect(bucketForScore(0.98)).toBe("S95");
    expect(bucketForScore(0.95)).toBe("S95");
  });

  it("S90 covers [0.90, 0.95)", () => {
    expect(bucketForScore(0.94)).toBe("S90");
    expect(bucketForScore(0.9)).toBe("S90");
  });

  it("S75 covers [0, 0.90)", () => {
    expect(bucketForScore(0.89)).toBe("S75");
    expect(bucketForScore(0.5)).toBe("S75");
    expect(bucketForScore(0)).toBe("S75");
  });
});

describe("clamp helpers", () => {
  it("clamps similarity to [0, 1]", () => {
    expect(clampSimilarity(-0.5)).toBe(0);
    expect(clampSimilarity(1.5)).toBe(1);
    expect(clampSimilarity(0.5)).toBe(0.5);
    expect(clampSimilarity(Number.NaN)).toBe(0);
  });

  it("clamps percentage to [0, 100]", () => {
    expect(clampPercentage(-1)).toBe(0);
    expect(clampPercentage(150)).toBe(100);
    expect(clampPercentage(42)).toBe(42);
  });
});
