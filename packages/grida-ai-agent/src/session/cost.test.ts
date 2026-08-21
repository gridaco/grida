import { describe, expect, it } from "vitest";
import { baseCostUsdFromMessageUsage, usageTokenTotal } from "./cost";

describe("session cost accounting", () => {
  it("sums all persisted usage buckets into the rollup token total", () => {
    expect(
      usageTokenTotal({
        input: 2,
        output: 3,
        reasoning: 5,
        cache_read: 7,
        cache_write: 11,
      })
    ).toBe(28);
  });

  it("uses the base catalog card, including cache and reasoning rates", () => {
    const cost = baseCostUsdFromMessageUsage(
      {
        provider_id: "openrouter",
        model_id: "anthropic/claude-sonnet-5",
      },
      {
        input: 2_000,
        cache_read: 8_000,
        cache_write: 1_000,
        output: 1_000,
        reasoning: 500,
      }
    );

    // Sonnet 5's rate card, spelled out rather than read from the catalogue:
    // reading it back would assert nothing.
    expect(cost).toBeCloseTo(
      (2_000 * 2 + 8_000 * 0.2 + 1_000 * 2.5 + 1_000 * 10 + 500 * 10) /
        1_000_000
    );
  });

  it("does not apply request-level bands to an aggregate message rollup", () => {
    const cost = baseCostUsdFromMessageUsage(
      {
        provider_id: "openrouter",
        model_id: "openai/gpt-5.6-terra",
      },
      {
        input: 200_001,
        cache_read: 70_000,
        cache_write: 2_000,
        output: 800,
        reasoning: 200,
      }
    );

    expect(cost).toBeCloseTo(
      (200_001 * 2 + 70_000 * 0.2 + 2_000 * 2.5 + 800 * 12 + 200 * 12) /
        1_000_000
    );
  });

  it("returns undefined when no catalog price card is available", () => {
    expect(
      baseCostUsdFromMessageUsage(
        { provider_id: "ollama", model_id: "acme/local-model" },
        { input: 1, output: 1 }
      )
    ).toBeUndefined();
  });
});
