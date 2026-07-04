// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * BYOK-env variant (GRIDA-SEC-003 carve-out) of the hosted chat route:
 * with a `BYOK_*` provider active the text path is UNBILLED (no gate,
 * no ingest) but authentication is NEVER bypassed — the scoped token
 * is still required. Separate file because `byok` is resolved at
 * module load of the seam.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Rate limits are pinned by their own module; route tests must NEVER
// reach the real Upstash instance (vitest loads .env.local).
vi.mock("@/lib/ai/openai-compat/limits", () => ({
  allowAiRequest: async () => ({ success: true }),
}));

import type { LanguageModelV3, LanguageModelV3Usage } from "@ai-sdk/provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const h = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/lib/billing/metronome", () => ({
  getEntitlement: vi.fn<(...args: never[]) => unknown>(),
  ingestUsageEvent: vi.fn<(...args: never[]) => unknown>(),
  refreshBalance: vi.fn<(...args: never[]) => unknown>(),
  BillingMetronomeError: class BillingMetronomeError extends Error {
    code = "internal";
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createLibraryClient: vi.fn<(...args: never[]) => unknown>(),
}));
vi.mock("@/lib/auth/organization", () => ({
  requireOrganizationId: vi.fn<(...args: never[]) => unknown>(),
}));

const USAGE: LanguageModelV3Usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

vi.mock("@/lib/ai/models", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/models")>();
  const bareModel = (modelId: string) => ({
    specificationVersion: "v3" as const,
    provider: "byok-bare",
    modelId,
    supportedUrls: {},
    doGenerate: async () => {
      h.calls += 1;
      return {
        content: [{ type: "text", text: "byok reply" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: USAGE,
        warnings: [],
      };
    },
    doStream: async () => {
      throw new Error("unused");
    },
  });
  return {
    ...real,
    // BYOK active: the seam's language provider is the BARE provider.
    byok: { languageModel: bareModel },
    isByokActive: () => true,
    gateway: {
      languageModel: () => {
        throw new Error("gateway must not be used under BYOK text path");
      },
      imageModel: () => {
        throw new Error("unused");
      },
      textEmbeddingModel: () => {
        throw new Error("unused");
      },
    },
  };
});

import { POST } from "./route";
import { getEntitlement, ingestUsageEvent } from "@/lib/billing/metronome";
import { signGgToken } from "@/lib/auth/gg-token";

const SECRET = "byok-secret-0123456789abcdef0123456789abcdef00";
const MODEL = "anthropic/claude-sonnet-5";

function clientModel(token: string): LanguageModelV3 {
  const provider = createOpenAICompatible({
    name: "gg",
    baseURL: "http://grida.test/api/v1/ai",
    apiKey: token,
    fetch: (async (input: string | URL | Request, init?: RequestInit) =>
      POST(new Request(input, init))) as typeof fetch,
  });
  return provider(MODEL) as unknown as LanguageModelV3;
}

beforeEach(() => {
  process.env.GG_TOKEN_SECRET = SECRET;
  h.calls = 0;
  vi.mocked(getEntitlement).mockReset();
  vi.mocked(ingestUsageEvent).mockReset();
});

describe("BYOK carve-out on /api/v1/ai/chat/completions", () => {
  it("serves unbilled text (no gate, no ingest) but auth still runs", async () => {
    const { token } = await signGgToken("user-1", 7);
    const result = await clientModel(token).doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    });
    expect(result.content).toEqual([
      expect.objectContaining({ type: "text", text: "byok reply" }),
    ]);
    expect(h.calls).toBe(1);
    expect(getEntitlement).not.toHaveBeenCalled();
    expect(ingestUsageEvent).not.toHaveBeenCalled();
  });

  it("still rejects a missing token with 401", async () => {
    await expect(
      clientModel("not-a-token").doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      })
    ).rejects.toSatisfy(
      (err: unknown) => (err as { statusCode?: number }).statusCode === 401
    );
    expect(h.calls).toBe(0);
  });
});
