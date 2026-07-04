// GRIDA-EE: billing — see ee-billing
/**
 * Shared image cost math. Pins the tier-key shape
 * `${quality}/${width}x${height}` (the quality axis was previously
 * hardcoded to `medium` — load-bearing for PerImageTieredPricing),
 * the off-tier fallback to `avg_cost_usd`, and n-multiplication.
 */
import { describe, it, expect } from "vitest";
import type ai from "@/lib/ai";
import { computeImageCostMills } from "./image-cost";

type Card = ai.image.ImageModelCard;

const FLAT = {
  avg_cost_usd: 0.04,
  pricing: { type: "per_image_flat", usd: 0.03 },
} as unknown as Card;

const TIERED = {
  avg_cost_usd: 0.05,
  pricing: {
    type: "per_image_tiered",
    tiers: {
      "low/1024x1024": 0.011,
      "medium/1024x1024": 0.042,
      "high/1024x1024": 0.167,
    },
  },
} as unknown as Card;

const PER_TOKEN = {
  avg_cost_usd: 0.02,
  pricing: { type: "per_token" },
} as unknown as Card;

describe("computeImageCostMills", () => {
  it("flat: usd × n, ceiled to mills", () => {
    expect(computeImageCostMills(FLAT, { n: 1 })).toBe(30);
    expect(computeImageCostMills(FLAT, { n: 3 })).toBe(90);
    expect(computeImageCostMills(FLAT, {})).toBe(30); // n defaults to 1
  });

  it("tiered: quality selects the tier (not hardcoded medium)", () => {
    const size = { width: 1024, height: 1024 };
    expect(computeImageCostMills(TIERED, { ...size, quality: "low" })).toBe(11);
    expect(computeImageCostMills(TIERED, { ...size, quality: "high" })).toBe(
      167
    );
    expect(computeImageCostMills(TIERED, { ...size })).toBe(42); // default medium
    expect(computeImageCostMills(TIERED, { ...size, quality: "auto" })).toBe(
      42
    );
  });

  it("tiered: off-tier sizes and missing sizes fall back to avg_cost_usd", () => {
    expect(computeImageCostMills(TIERED, { width: 640, height: 480 })).toBe(50);
    expect(computeImageCostMills(TIERED, {})).toBe(50);
  });

  it("per_token: bills the card average × n", () => {
    expect(computeImageCostMills(PER_TOKEN, { n: 2 })).toBe(40);
  });
});
