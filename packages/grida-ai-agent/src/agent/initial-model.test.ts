import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { createAgent, type ModelFactory } from "./index";
import { runAgent } from "../runtime/run-agent";
import { createDaemonFixture } from "../test/daemon-fixture";
import { AGENT_DEFAULT_TIER } from "../tiers";

function mockModel() {
  return new MockLanguageModelV3({
    provider: "gg",
    modelId: "fixture/current-text",
    doStream: {
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "text" },
          { type: "text-delta", id: "text", delta: "selected-model-ok" },
          { type: "text-end", id: "text" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 1, text: 1, reasoning: undefined },
            },
          },
        ],
      }),
    },
  });
}

describe("agent constructor honors the actual requested model", () => {
  it("does not eagerly resolve an unavailable default when an explicit current GG model was selected", () => {
    const factory = vi.fn<ModelFactory>((tier, id) => {
      if (tier !== "max" || id !== "fixture/current-text")
        throw new Error("default is not served");
      return mockModel();
    });
    expect(() =>
      createAgent({
        model_factory: factory,
        initial_model: { tier: "max", model_id: "fixture/current-text" },
      })
    ).not.toThrow();
    expect(factory).toHaveBeenCalledExactlyOnceWith(
      "max",
      "fixture/current-text"
    );
  });
  it("retains the default constructor behavior for callers without an initial selection", () => {
    const factory = vi.fn<ModelFactory>(() => mockModel());
    createAgent({ model_factory: factory });
    expect(factory).toHaveBeenCalledExactlyOnceWith(AGENT_DEFAULT_TIER);
  });
  it("threads a new GG model from runAgent through construction and the actual streamed call", async () => {
    const factory = vi.fn<ModelFactory>((tier, id) => {
      if (tier !== "max" || id !== "fixture/current-text")
        throw new Error("unselected model was requested");
      return mockModel();
    });
    const fixture = await createDaemonFixture("grida-initial-model-");
    try {
      const response = await runAgent(
        { kind: "gg", provider_id: "gg", model_factory: factory },
        {
          tier: "max",
          model_id: "fixture/current-text",
          signal: new AbortController().signal,
          messages: [
            {
              id: "user",
              role: "user",
              parts: [{ type: "text", text: "Hello" }],
            },
          ],
        },
        { workspace_registry: fixture.registry }
      );
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("selected-model-ok");
      expect(body).not.toContain('"type":"error"');
      expect(factory.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(
        factory.mock.calls.every(
          ([tier, id]) => tier === "max" && id === "fixture/current-text"
        )
      ).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });
});
