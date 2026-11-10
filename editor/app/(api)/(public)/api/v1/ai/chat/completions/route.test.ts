// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * CONTRACT tests: the ACTUAL `@ai-sdk/openai-compatible` client (what
 * the desktop sidecar's `grida` provider is built on) drives the ACTUAL
 * route handler through its custom-fetch hook — no HTTP server.
 *
 * Pins: the V3 prompt survives the wire roundtrip verbatim; streamed
 * tool-call argument text reassembles byte-for-byte; usage numbers
 * arrive intact (streamed + non-streamed); the trusted GG adapter
 * owns the charge, so no native receipt is admitted or completed;
 * 401 for invalid/expired/foreign tokens (a Supabase-style token MUST
 * fail); 402 is a clean pre-stream response; 404 before any provider
 * call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ProductBilling } from "@/lib/platform/product-billing";

// Rate limits are pinned by their own module; route tests must NEVER
// reach the real Upstash instance (vitest loads .env.local).
vi.mock("@/lib/ai/openai-compat/hosted-models", () => ({
  isHostedTextModel: async (id: string) =>
    id.startsWith("openai/") ||
    id.startsWith("anthropic/") ||
    id.startsWith("google/"),
}));

vi.mock("@/lib/ai/openai-compat/limits", () => ({
  allowAiRequest: async () =>
    h.retryAfter === null
      ? { success: true }
      : { success: false, retryAfterSeconds: h.retryAfter },
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
  begin: vi.fn<ProductBilling["begin"]>(),
  complete: vi.fn<ProductBilling["complete"]>(),
  entitlement: vi.fn<ProductBilling["entitlement"]>(),
  generate: null as unknown,
  parts: [] as unknown[],
  lastCallOptions: null as unknown,
  denied: false,
  retryAfter: null as number | null,
  downstreamLimit: false,
  upstreamRequestId: null as string | null,
  useRealGateway: false,
}));

vi.mock("@/lib/platform/product-consumer", () => ({
  platformProductBilling: () => h,
}));
vi.mock("@/lib/supabase/server", () => ({
  service_role: {
    workspace: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "platform_source_work_begin")
          return { data: { created: true, id: args.work_id }, error: null };
        if (
          name === "platform_source_work_capture" ||
          name === "platform_source_work_finish"
        )
          return { data: { accepted: true }, error: null };
        throw new Error("unexpected source RPC: " + name);
      },
    },
  },
  createLibraryClient: vi.fn<(...args: never[]) => unknown>(),
}));
vi.mock("@/lib/auth/organization", () => ({
  requireOrganizationId: vi.fn<(...args: never[]) => unknown>(),
}));

// Scripted GG model: test the unchanged native codec and authentication.
// The real SDK/HTTP/financial boundary is covered separately.
vi.mock("@/lib/ai/gateway-product", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/gateway-product")>();
  const fakeLanguageModel = (modelId: string) => ({
    specificationVersion: "v3" as const,
    provider: "gg",
    modelId,
    supportedUrls: {},
    doGenerate: async (options: unknown) => {
      if (h.denied) throw new ProductBillingError("blocked");
      h.lastCallOptions = options;
      return h.generate;
    },
    doStream: async (options: unknown) => {
      if (h.denied) throw new ProductBillingError("blocked");
      h.lastCallOptions = options;
      if (h.downstreamLimit)
        throw new real.GatewayProductError(429, "fixture_rate_limit");
      const parts = h.parts as never[];
      return {
        response: h.upstreamRequestId
          ? { headers: { "x-request-id": h.upstreamRequestId } }
          : undefined,
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
    gatewayLanguageModel: (modelId: string) =>
      h.useRealGateway
        ? real.gatewayLanguageModel(modelId)
        : fakeLanguageModel(modelId),
    vercelAiGateway: {
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

vi.mock("@/lib/ai/models", async (original) => ({
  ...(await original<typeof import("@/lib/ai/models")>()),
  byok: null,
  isByokActive: () => false,
}));

import { POST } from "./route";
import { ProductBillingError } from "@/lib/platform/product-billing";
import { signGgToken, GG_TOKEN_AUDIENCE } from "@/lib/auth/gg-token";

const mockedAdmission = h.begin;
const mockedCompletion = h.complete;

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
  vi.stubEnv("GG_TOKEN_SECRET", SECRET);
  h.generate = null;
  h.parts = [];
  h.lastCallOptions = null;
  h.denied = false;
  h.retryAfter = null;
  h.downstreamLimit = false;
  h.upstreamRequestId = null;
  h.useRealGateway = false;
  mockedAdmission.mockReset();
  mockedCompletion.mockReset();
  mockedAdmission.mockImplementation(async (context) => ({
    id: "route-execution",
    claim: {
      organization_id: String(context.organizationId),
      product: "grida-ai",
      operation: context.feature,
      model: context.model_id,
      unit: "cost_mills",
      policy_version: "shared-ai-v1",
      authorized_mills: "1000",
      expense_bound_mills: "1000",
      tariff_revision: "a".repeat(64),
      request_digest: context.requestDigest,
      admission_observed_at: "2026-10-06T00:00:00Z",
      admission_expires_at: "2026-10-06T00:01:00Z",
    },
  }));
  mockedCompletion.mockImplementation(async ({ claim }, quantity) => ({
    organization_id: claim.organization_id,
    product: claim.product,
    operation: claim.operation,
    model: claim.model,
    unit: claim.unit,
    policy_version: claim.policy_version,
    outcome: "succeeded",
    quantity: String(quantity),
    occurred_at: "2026-10-06T00:00:01Z",
    evidence_digest: "b".repeat(64),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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
  it.each([
    ["timeout", "req_native", "pending", "TimeoutError"],
    ["cancelled", "req_native", "pending", "AbortError"],
    ["unavailable", "req_native", "pending", undefined],
    ["settled", "req_native", "settled", undefined],
    ["missing identity", null, undefined, undefined],
    ["invalid identity", "req_invalid.id", undefined, undefined],
  ])(
    "finishes the opted-in native Gateway stream when billing is %s",
    async (observation, requestId, expectedBilling, abortName) => {
      h.useRealGateway = true;
      const origin = "http://127.0.0.1:8080";
      const workloadToken = "a".repeat(43);
      vi.stubEnv("GRIDA_AI_GATEWAY_ORIGIN", origin);
      vi.stubEnv("GRIDA_AI_GATEWAY_ALLOW_LOCAL", "1");
      vi.stubEnv("GRIDA_AI_GATEWAY_KEY_ID", "product-test");
      vi.stubEnv("GRIDA_AI_GATEWAY_TOKEN", workloadToken);
      const request = new AbortController();
      let posted = 0;
      const observed: {
        url: string;
        method: string;
        organization: string | null;
      }[] = [];
      let observedAbort: string | undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
          const headers = new Headers(init.headers);
          expect(headers.get("authorization")).toBe(`Bearer ${workloadToken}`);
          expect(headers.get("x-grida-organization-id")).toBe(String(ORG));
          if (url === `${origin}/internal/grida/v1/chat/completions`) {
            posted++;
            expect(init.method).toBe("POST");
            expect(JSON.parse(String(init.body))).not.toHaveProperty(
              "nativeChatBillingReceipt"
            );
            const frames = [
              { choices: [{ index: 0, delta: { content: "Finished." } }] },
              { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
              {
                choices: [],
                usage: {
                  prompt_tokens: 8,
                  completion_tokens: 2,
                  total_tokens: 10,
                },
              },
            ];
            return new Response(
              frames
                .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
                .join("") + "data: [DONE]\n\n",
              {
                headers: {
                  "content-type": "text/event-stream",
                  ...(requestId && { "x-request-id": requestId }),
                },
              }
            );
          }
          observed.push({
            url,
            method: init.method ?? "GET",
            organization: headers.get("x-grida-organization-id"),
          });
          if (observation === "unavailable")
            return new Response(null, { status: 503 });
          if (observation === "settled")
            return Response.json({
              id: requestId,
              request_id: requestId,
              result_status: "unavailable",
              billing: { status: "settled", charged_mills: "0" },
            });
          const { signal } = init;
          if (!signal) throw new Error("Missing billing read signal");
          const held = new Promise<Response>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                observedAbort = signal.reason?.name;
                reject(signal.reason);
              },
              { once: true }
            );
          });
          if (observation === "cancelled") request.abort();
          return held;
        })
      );
      const response = await POST(
        new Request("http://grida.test/api/v1/ai/chat/completions", {
          method: "POST",
          signal: request.signal,
          headers: {
            authorization: `Bearer ${await mintedToken()}`,
            "content-type": "application/json",
            "x-grida-billing-receipt": "1",
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: "fixture" }],
            stream: true,
            stream_options: { include_usage: true },
          }),
        })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe(
        expectedBilling ? requestId : null
      );
      const stream = await response.text();
      expect(stream).toContain("Finished.");
      expect(stream.endsWith("data: [DONE]\n\n")).toBe(true);
      const frames = stream
        .split("\n\n")
        .filter((part) => part.startsWith("data: {"))
        .map((part) => JSON.parse(part.slice(6)));
      expect(frames.find((frame) => frame.usage)?.usage).toMatchObject({
        prompt_tokens: 8,
        completion_tokens: 2,
      });
      const finish = frames.find(
        (frame) => frame.choices[0]?.finish_reason === "stop"
      );
      expect(finish).toBeDefined();
      expect(finish.grida_billing).toEqual(
        expectedBilling
          ? {
              version: 1,
              request_id: requestId,
              status: expectedBilling,
              charged_mills: expectedBilling === "settled" ? "0" : null,
            }
          : undefined
      );
      expect(observed).toEqual(
        expectedBilling
          ? [
              {
                url: `${origin}/internal/grida/v1/jobs/${requestId}`,
                method: "GET",
                organization: String(ORG),
              },
            ]
          : []
      );
      expect(posted).toBe(1);
      expect(observedAbort).toBe(abortName);
    }
  );

  it.each([
    {
      optIn: true,
      id: "req_chat",
      status: "settled",
      amount: "0.125",
      expected: "settled",
    },
    {
      optIn: true,
      id: "req_chat",
      status: "unrecognized",
      amount: "0",
      expected: "pending",
    },
    {
      optIn: true,
      id: "req_other",
      status: "settled",
      amount: "0.125",
      expected: undefined,
    },
    {
      optIn: false,
      id: "req_chat",
      status: "settled",
      amount: "0.125",
      expected: undefined,
    },
  ])(
    "projects only opted-in, correlated Gateway billing evidence (%j)",
    async ({ optIn, id, status, amount, expected }) => {
      h.upstreamRequestId = "req_chat";
      h.parts = [
        {
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: USAGE,
          providerMetadata: {
            gg: { requestId: id, billingStatus: status, chargedMills: amount },
          },
        },
      ] satisfies LanguageModelV3StreamPart[];
      const response = await POST(
        new Request("http://grida.test/api/v1/ai/chat/completions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${await mintedToken()}`,
            "content-type": "application/json",
            ...(optIn && { "x-grida-billing-receipt": "1" }),
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: "fixture" }],
            stream: true,
            stream_options: { include_usage: true },
          }),
        })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe(
        optIn ? "req_chat" : null
      );
      const stream = await response.text();
      expect(stream.endsWith("data: [DONE]\n\n")).toBe(true);
      const frames = stream
        .split("\n\n")
        .filter((part) => part.startsWith("data: {"))
        .map((part) => JSON.parse(part.slice(6)));
      expect(frames.find((frame) => frame.usage)?.usage.prompt_tokens).toBe(
        100
      );
      expect(
        frames.find((frame) => frame.choices[0]?.finish_reason === "stop")
          ?.grida_billing
      ).toEqual(
        expected
          ? {
              version: 1,
              request_id: "req_chat",
              status: expected,
              charged_mills: expected === "settled" ? amount : null,
            }
          : undefined
      );
    }
  );

  it("separates the pre-dispatch throttle from a downstream 429", async () => {
    const token = await mintedToken();
    const request = (body: string) =>
      POST(
        new Request("http://grida.test/api/v1/ai/chat/completions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body,
        })
      );
    h.retryAfter = 2;
    const early = await request("unparsed");
    expect(early.status).toBe(429);
    expect(early.headers.get("retry-after")).toBe("2");
    expect(await early.json()).toMatchObject({
      error: { code: "rate_limit_exceeded", type: "rate_limit_error" },
    });
    expect(h.lastCallOptions).toBeNull();
    expect(mockedAdmission).not.toHaveBeenCalled();

    h.retryAfter = null;
    h.downstreamLimit = true;
    const downstream = await request(
      JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [{ role: "user", content: "Hello." }],
      })
    );
    expect(downstream.status).toBe(429);
    expect(downstream.headers.get("retry-after")).toBeNull();
    expect(await downstream.json()).toMatchObject({
      error: { code: "rate_limit_exceeded", type: "server_error" },
    });
    expect(h.lastCallOptions).not.toBeNull();
  });

  it("non-stream: roundtrips the prompt, returns content + usage, does not issue a native receipt", async () => {
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

    expect(mockedAdmission).not.toHaveBeenCalled();
    expect(mockedCompletion).not.toHaveBeenCalled();
  });

  it("stream: tool-call arguments reassemble byte-for-byte; usage arrives; native billing stays idle", async () => {
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

    expect(mockedAdmission).not.toHaveBeenCalled();
    expect(mockedCompletion).not.toHaveBeenCalled();
  });

  it("402: a blocked org fails clean, pre-stream, with insufficient_credits", async () => {
    h.denied = true;
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
    expect(mockedCompletion).not.toHaveBeenCalled();
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
    expect(mockedAdmission).not.toHaveBeenCalled();
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
    expect(mockedAdmission).not.toHaveBeenCalled();
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
