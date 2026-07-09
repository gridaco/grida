import { describe, expect, it } from "vitest";
import { costUsdFromMessageUsage, usageTokenTotal } from "./cost";

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

  it("uses the catalog card, including cache and reasoning rates", () => {
    const cost = costUsdFromMessageUsage(
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

    expect(cost).toBeCloseTo(
      (2_000 * 3 + 8_000 * 0.3 + 1_000 * 3.75 + 1_000 * 15 + 500 * 15) /
        1_000_000
    );
  });

  it("returns undefined when no catalog price card is available", () => {
    expect(
      costUsdFromMessageUsage(
        { provider_id: "ollama", model_id: "acme/local-model" },
        { input: 1, output: 1 }
      )
    ).toBeUndefined();
  });
});
