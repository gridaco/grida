import { describe, expect, it } from "vitest";

import {
  computeContextUsage,
  estimateContextBreakdown,
  estimateTokens,
  lastAssistantUsage,
  usageTokenTotal,
} from "./context-usage";

// The ring % is an estimate from visible transcript parts. Provider usage is
// exposed separately as last-turn usage because tool loops can consume far more
// cumulative tokens than the final transcript occupies.

describe("estimateTokens", () => {
  it("is chars/4, rounded up, and 0 for empty", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2); // ceil(5/4)
  });
});

describe("usageTokenTotal", () => {
  it("sums all five buckets (input already excludes cache reads)", () => {
    expect(
      usageTokenTotal({
        input: 100,
        output: 50,
        reasoning: 10,
        cache_read: 200,
        cache_write: 5,
      })
    ).toBe(365);
  });

  it("treats missing buckets as 0", () => {
    expect(usageTokenTotal({ input: 7 })).toBe(7);
    expect(usageTokenTotal({})).toBe(0);
  });
});

describe("lastAssistantUsage", () => {
  it("returns the most recent assistant usage that is non-zero", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "hi" }] },
      { role: "assistant", metadata: { usage: { input: 5, output: 3 } } },
      { role: "user", parts: [{ type: "text", text: "more" }] },
      { role: "assistant", metadata: { usage: { input: 40, output: 12 } } },
    ];
    expect(lastAssistantUsage(messages)).toEqual({ input: 40, output: 12 });
  });

  it("skips a trailing assistant whose usage is all-zero / absent", () => {
    const messages = [
      { role: "assistant", metadata: { usage: { input: 9 } } },
      { role: "assistant", metadata: { usage: {} } }, // not settled yet
      { role: "assistant" }, // no metadata
    ];
    expect(lastAssistantUsage(messages)).toEqual({ input: 9 });
  });

  it("returns undefined when there is no assistant usage", () => {
    expect(
      lastAssistantUsage([
        { role: "user", parts: [{ type: "text", text: "x" }] },
      ])
    ).toBeUndefined();
  });
});

describe("estimateContextBreakdown", () => {
  const messages = [
    // 40 chars → 10 tokens (user)
    { role: "user", parts: [{ type: "text", text: "x".repeat(40) }] },
    {
      role: "assistant",
      parts: [
        // 80 chars → 20 tokens (assistant)
        { type: "text", text: "y".repeat(80) },
        // reasoning counts as assistant: 16 chars → 4 tokens
        { type: "reasoning", text: "z".repeat(16) },
        // tool: input '{"a":1}' (7) + output 'zzzz' (4, strings pass through
        // unquoted) = 11 chars → 3 tokens (tools)
        { type: "tool-foo", input: { a: 1 }, output: "zzzz" },
      ],
      metadata: { usage: { input: 100, output: 50 } },
    },
  ];

  it("buckets visible user / assistant(text+reasoning) / tools", () => {
    expect(estimateContextBreakdown(messages)).toEqual({
      user: 10,
      assistant: 24,
      tools: 3,
      other: 0,
    });
  });

  it("puts visible unclassified roles in other", () => {
    expect(
      estimateContextBreakdown([
        { role: "system", parts: [{ type: "text", text: "s".repeat(12) }] },
      ])
    ).toEqual({
      user: 0,
      assistant: 0,
      tools: 0,
      other: 3,
    });
  });
});

describe("computeContextUsage", () => {
  const messages = [
    { role: "user", parts: [{ type: "text", text: "x".repeat(40) }] },
    {
      role: "assistant",
      parts: [{ type: "text", text: "y".repeat(80) }],
      metadata: { usage: { input: 100, output: 50 } },
    },
  ];

  it("computes context % from visible transcript estimates", () => {
    const u = computeContextUsage(messages, 1000);
    expect(u.usedTokens).toBe(30);
    expect(u.maxTokens).toBe(1000);
    expect(u.percent).toBeCloseTo(0.03);
    expect(u.breakdown).toEqual({
      user: 10,
      assistant: 20,
      tools: 0,
      other: 0,
    });
    expect(u.turnUsageTokens).toBe(150);
    expect(u.usage).toEqual({ input: 100, output: 50 });
  });

  it("yields percent 0 when the window is unknown", () => {
    expect(computeContextUsage(messages, undefined).percent).toBe(0);
    expect(computeContextUsage(messages, undefined).usedTokens).toBe(30);
  });

  it("does not use provider turn usage as context occupancy", () => {
    const u = computeContextUsage(
      [
        { role: "user", parts: [{ type: "text", text: "fix this" }] },
        {
          role: "assistant",
          parts: [{ type: "text", text: "done" }],
          metadata: { usage: { input: 191031, output: 2708 } },
        },
      ],
      1_000_000
    );
    expect(u.turnUsageTokens).toBe(193739);
    expect(u.usedTokens).toBe(3);
    expect(u.percent).toBeCloseTo(0.000003);
  });

  it("clamps percent to 1 when the visible estimate exceeds the window", () => {
    const over = [
      {
        role: "assistant",
        parts: [{ type: "text", text: "y".repeat(4004) }],
        metadata: { usage: { input: 900, output: 400 } },
      },
    ];
    const u = computeContextUsage(over, 1000);
    expect(u.usedTokens).toBe(1001);
    expect(u.percent).toBe(1);
    expect(u.turnUsageTokens).toBe(1300);
  });
});
