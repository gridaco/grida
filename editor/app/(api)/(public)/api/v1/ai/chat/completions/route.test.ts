// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * CONTRACT tests: the ACTUAL `@ai-sdk/openai-compatible` client (what
 * the desktop sidecar's `grida` provider is built on) drives the ACTUAL
 * route handler through its custom-fetch hook — no HTTP server.
 *
 * Pins: the V3 prompt survives the wire roundtrip verbatim; streamed
 * tool-call argument text reassembles byte-for-byte; usage numbers
 * arrive intact (streamed + non-streamed); the REAL billing middleware
 * runs (gate before upstream, ingest with catalog-consistent mills);
 * 401 for invalid/expired/foreign tokens (a Supabase-style token MUST
 * fail); 402 is a clean pre-stream response; 404 before any provider
 * call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Rate limits are pinned by their own module; route tests must NEVER
// reach the real Upstash instance (vitest loads .env.local).
vi.mock("@/lib/ai/openai-compat/limits", () => ({
  allowAiRequest: async () => ({ success: true }),
}));

import { SignJWT } from "jose";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";

const h = vi.hoisted(() => ({
  generate: null as unknown,
  parts: [] as unknown[],
  lastCallOptions: null as unknown,
}));

vi.mock("@/lib/billing/metronome", () => ({
  getEntitlement: vi.fn<(...args: never[]) => unknown>(),
  ingestUsageEvent: vi.fn<(...args: never[]) => unknown>(),
  refreshBalance: vi.fn<(...args: never[]) => unknown>(),
  BillingMetronomeError: class BillingMetronomeError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status = 500) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createLibraryClient: vi.fn<(...args: never[]) => unknown>(),
}));
vi.mock("@/lib/auth/organization", () => ({
  requireOrganizationId: vi.fn<(...args: never[]) => unknown>(),
}));

// Fake gateway: scripted V3 model behind the REAL billing middleware
// (server.ts wraps whatever `gateway` this module exports).
vi.mock("@/lib/ai/models", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/models")>();
  const fakeLanguageModel = (modelId: string) => ({
    specificationVersion: "v3" as const,
    provider: "fake-gateway",
    modelId,
    supportedUrls: {},
    doGenerate: async (options: unknown) => {
      h.lastCallOptions = options;
      return h.generate;
    },
    doStream: async (options: unknown) => {
      h.lastCallOptions = options;
      const parts = h.parts as never[];
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  });
  return {
    ...real,
    byok: null,
    isByokActive: () => false,
    gateway: {
      languageModel: fakeLanguageModel,
      imageModel: () => {
        throw new Error("unused in this suite");
      },
      textEmbeddingModel: () => {
        throw new Error("unused in this suite");
      },
    },
  };
});

import { POST } from "./route";
import { getEntitlement, ingestUsageEvent } from "@/lib/billing/metronome";
import { costMillsFromTokenUsage } from "@/lib/ai/server";
import { signGgToken, GG_TOKEN_AUDIENCE } from "@/lib/auth/gg-token";

const mockedGetEntitlement = vi.mocked(getEntitlement);
const mockedIngest = vi.mocked(ingestUsageEvent);

const SECRET = "contract-secret-0123456789abcdef0123456789abcdef";
const MODEL = "anthropic/claude-sonnet-5";
const ORG = 7;

const USAGE: LanguageModelV3Usage = {
  inputTokens: {
    total: 100,
    noCache: 90,
    cacheRead: 10,
    cacheWrite: undefined,
  },
  outputTokens: { total: 20, text: 15, reasoning: 5 },
};

const LONG_CONTEXT_USAGE: LanguageModelV3Usage = {
  inputTokens: {
    total: 272_001,
    noCache: 200_001,
    cacheRead: 70_000,
    cacheWrite: 2_000,
  },
  outputTokens: { total: 1_000, text: 800, reasoning: 200 },
};

function clientModel(token: string, modelId = MODEL): LanguageModelV3 {
  const provider = createOpenAICompatible({
    name: "gg",
    baseURL: "http://grida.test/api/v1/ai",
    apiKey: token,
    includeUsage: true,
    fetch: (async (input: string | URL | Request, init?: RequestInit) =>
      POST(new Request(input, init))) as typeof fetch,
  });
  return provider(modelId) as unknown as LanguageModelV3;
}

async function mintedToken(): Promise<string> {
  return (await signGgToken("user-1", ORG)).token;
}

beforeEach(() => {
  process.env.GG_TOKEN_SECRET = SECRET;
  h.generate = null;
  h.parts = [];
  h.lastCallOptions = null;
  mockedGetEntitlement.mockReset();
  mockedIngest.mockReset();
  mockedGetEntitlement.mockResolvedValue({
    allowed: true,
    cachedBalanceCents: 500,
    cachedAt: "2026-07-03T00:00:00Z",
  } as never);
  mockedIngest.mockResolvedValue({ transactionId: "tx" } as never);
});

const PROMPT: LanguageModelV3CallOptions["prompt"] = [
  { role: "system", content: "be helpful" },
  { role: "user", content: [{ type: "text", text: "weather in Seoul?" }] },
];

const TOOLS: LanguageModelV3CallOptions["tools"] = [
  {
    type: "function",
    name: "get_weather",
    description: "Get weather",
    inputSchema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
];

describe("POST /api/v1/ai/chat/completions (contract)", () => {
  it("non-stream: roundtrips the prompt, returns content + usage, bills real mills", async () => {
    h.generate = {
      content: [{ type: "text", text: "It is sunny." }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: USAGE,
      warnings: [],
    };
    const model = clientModel(await mintedToken());
    const result = await model.doGenerate({ prompt: PROMPT, tools: TOOLS });

    expect(result.content).toEqual([
      expect.objectContaining({ type: "text", text: "It is sunny." }),
    ]);
    expect(result.finishReason.unified).toBe("stop");
    expect(result.usage.inputTokens.total).toBe(100);
    expect(result.usage.inputTokens.cacheRead).toBe(10);
    expect(result.usage.outputTokens.reasoning).toBe(5);

    // The server-side model saw the SAME V3 prompt the client sent.
    const serverOptions = h.lastCallOptions as LanguageModelV3CallOptions;
    expect(serverOptions.prompt).toEqual(PROMPT);
    expect(serverOptions.tools).toEqual([
      expect.objectContaining({
        type: "function",
        name: "get_weather",
        inputSchema:
          TOOLS![0]!.type === "function" ? TOOLS![0]!.inputSchema : {},
      }),
    ]);
    // Org context came from the token claim, never the request.
    expect(
      (serverOptions.providerOptions as { grida: { organizationId: number } })
        .grida.organizationId
    ).toBe(ORG);

    // REAL billing middleware ran: gate + catalog-consistent ingest.
    expect(mockedGetEntitlement).toHaveBeenCalledWith(ORG);
    expect(mockedIngest).toHaveBeenCalledTimes(1);
    const [orgArg, millsArg] = mockedIngest.mock.calls[0]!;
    expect(orgArg).toBe(ORG);
    expect(millsArg).toBeCloseTo(costMillsFromTokenUsage(MODEL, USAGE), 10);
  });

  it("bills GPT-5.6 long-context usage at the literal request-wide rate", async () => {
    h.generate = {
      content: [{ type: "text", text: "Done." }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: LONG_CONTEXT_USAGE,
      warnings: [],
    };
    const model = clientModel(await mintedToken(), "openai/gpt-5.6-terra");

    await model.doGenerate({ prompt: PROMPT });

    expect(mockedIngest).toHaveBeenCalledTimes(1);
    expect(mockedIngest.mock.calls[0]![0]).toBe(ORG);
    // Terra above 272K: all input buckets ×2, all output ×1.5.
    expect(mockedIngest.mock.calls[0]![1]).toBeCloseTo(1070.005, 10);
  });

  it("stream: tool-call arguments reassemble byte-for-byte; usage arrives; ingest fires", async () => {
    const args = '{"city":"Seoul","units":"metric"}';
    h.parts = [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t0" },
      { type: "text-delta", id: "t0", delta: "Let me check." },
      { type: "text-end", id: "t0" },
      { type: "tool-input-start", id: "call_1", toolName: "get_weather" },
      { type: "tool-input-delta", id: "call_1", delta: args.slice(0, 12) },
      { type: "tool-input-delta", id: "call_1", delta: args.slice(12) },
      { type: "tool-input-end", id: "call_1" },
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "get_weather",
        input: args,
      },
      {
        type: "finish",
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage: USAGE,
      },
    ] satisfies LanguageModelV3StreamPart[];

    const model = clientModel(await mintedToken());
    const { stream } = await model.doStream({ prompt: PROMPT, tools: TOOLS });

    const received: LanguageModelV3StreamPart[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received.push(value);
    }

    const text = received
      .filter((p) => p.type === "text-delta")
      .map((p) => (p as { delta: string }).delta)
      .join("");
    expect(text).toBe("Let me check.");

    const toolCall = received.find((p) => p.type === "tool-call") as {
      toolCallId: string;
      toolName: string;
      input: string;
    };
    expect(toolCall).toBeDefined();
    expect(toolCall.toolCallId).toBe("call_1");
    expect(toolCall.toolName).toBe("get_weather");
    expect(toolCall.input).toBe(args); // byte-for-byte

    const finish = received.find((p) => p.type === "finish") as {
      finishReason: { unified: string };
      usage: LanguageModelV3Usage;
    };
    expect(finish.finishReason.unified).toBe("tool-calls");
    expect(finish.usage.inputTokens.total).toBe(100);
    expect(finish.usage.outputTokens.total).toBe(20);

    // Streaming ingest fires on flush (fire-and-forget) — allow a tick.
    await vi.waitFor(() => expect(mockedIngest).toHaveBeenCalledTimes(1));
    expect(mockedIngest.mock.calls[0]![1]).toBeCloseTo(
      costMillsFromTokenUsage(MODEL, USAGE),
      10
    );
  });

  it("402: a blocked org fails clean, pre-stream, with insufficient_credits", async () => {
    mockedGetEntitlement.mockResolvedValue({
      allowed: false,
      reason: "below_floor",
      cachedBalanceCents: 10,
      cachedAt: null,
    } as never);
    const model = clientModel(await mintedToken());
    await expect(model.doStream({ prompt: PROMPT })).rejects.toSatisfy(
      (err: unknown) => {
        const e = err as { statusCode?: number; responseBody?: string };
        return (
          e.statusCode === 402 &&
          String(e.responseBody).includes("insufficient_credits")
        );
      }
    );
    expect(h.lastCallOptions).toBeNull(); // upstream never opened
    expect(mockedIngest).not.toHaveBeenCalled();
  });

  it("401: garbage, expired, and Supabase-style tokens all fail", async () => {
    const expectStatus = async (token: string, bodyIncludes: string) => {
      await expect(
        clientModel(token).doGenerate({ prompt: PROMPT })
      ).rejects.toSatisfy((err: unknown) => {
        const e = err as { statusCode?: number; responseBody?: string };
        return (
          e.statusCode === 401 && String(e.responseBody).includes(bodyIncludes)
        );
      });
    };
    await expectStatus("garbage", "invalid_token");

    const key = new TextEncoder().encode(SECRET);
    const expired = await new SignJWT({ org: ORG })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setAudience(GG_TOKEN_AUDIENCE)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(key);
    await expectStatus(expired, "token_expired");

    // Supabase-style token: right signature shape, wrong audience —
    // MUST be rejected (GRIDA-SEC-006: only the scoped token works).
    const supabaseLike = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    await expectStatus(supabaseLike, "invalid_token");
    expect(mockedGetEntitlement).not.toHaveBeenCalled();
  });

  it("404: unlisted model fails before any provider or billing call", async () => {
    const model = clientModel(await mintedToken(), "nope/unlisted-model");
    await expect(model.doGenerate({ prompt: PROMPT })).rejects.toSatisfy(
      (err: unknown) => {
        const e = err as { statusCode?: number; responseBody?: string };
        return (
          e.statusCode === 404 &&
          String(e.responseBody).includes("model_not_found")
        );
      }
    );
    expect(h.lastCallOptions).toBeNull();
    expect(mockedGetEntitlement).not.toHaveBeenCalled();
  });

  it("400: malformed body (raw request, empty messages)", async () => {
    const token = await mintedToken();
    const res = await POST(
      new Request("http://grida.test/api/v1/ai/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, messages: [] }),
      })
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("invalid_request_error");
  });
});
