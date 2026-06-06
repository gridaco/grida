import { describe, expect, it } from "vitest";

import {
  computeContextUsage,
  estimateContextBreakdown,
  estimateTokens,
  lastAssistantUsage,
  usageTokenTotal,
} from "./context-usage";

// The ring % is REAL (provider usage / context window); the role breakdown
// is an ESTIMATE (chars/4) with `other` as the residual. These tests pin
// both halves of that contract — see the module header.

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

  it("buckets user / assistant(text+reasoning) / tools and folds the rest into other", () => {
    // accounted = 10 + (20 + 4) + 3 = 37; other = 150 - 37 = 113
    expect(estimateContextBreakdown(messages, 150)).toEqual({
      user: 10,
      assistant: 24,
      tools: 3,
      other: 113,
    });
  });

  it("clamps other to 0 when estimates exceed the real used total", () => {
    const b = estimateContextBreakdown(messages, 10);
    expect(b.other).toBe(0);
    expect(b.user + b.assistant + b.tools).toBeGreaterThan(10);
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

  it("computes a real % from usage / contextWindow", () => {
    const u = computeContextUsage(messages, 1000);
    expect(u.usedTokens).toBe(150);
    expect(u.maxTokens).toBe(1000);
    expect(u.percent).toBeCloseTo(0.15);
    expect(u.breakdown).toEqual({
      user: 10,
      assistant: 20,
      tools: 0,
      other: 120,
    });
  });

  it("yields percent 0 and used 0 when the window or usage is unknown", () => {
    expect(computeContextUsage(messages, undefined).percent).toBe(0);
    expect(
      computeContextUsage(
        [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        1000
      ).usedTokens
    ).toBe(0);
  });
});
