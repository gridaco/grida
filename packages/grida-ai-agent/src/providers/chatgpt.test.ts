// GRIDA-SEC-008 — exact wire shape, tool loop, refresh, and error-body pins.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateText, stepCountIs, streamText, tool } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AuthStore, type OAuthEntry } from "@grida/daemon/server";
import {
  CHATGPT_PROVIDER_ID,
  CHATGPT_SUBSCRIPTION_MODEL_IDS,
  isChatGptSubscriptionModelId,
} from "../protocol/chatgpt";
import { ChatGptCredentialManager } from "./chatgpt-credentials";
import { ChatGptProvider, type ChatGptProviderConfig } from "./chatgpt";
import { ProviderHttp } from "./http";

const RESPONSES_URL =
  "https://chatgpt.example.test/backend-api/agent/responses";
const TOKEN_URL = "https://auth.example.test/oauth/token";
const CONFIG: ChatGptProviderConfig = {
  oauth: {
    authorize_url: "https://auth.example.test/oauth/authorize",
    token_url: TOKEN_URL,
    client_id: "grida-test-client",
    redirect_uris: ["http://localhost:1455/auth/callback"],
    scopes: ["openid", "offline_access"],
  },
  responses_url: RESPONSES_URL,
  originator: "grida-test",
  default_model_id: "openai/gpt-5.6-terra",
  tier_model_ids: {
    nano: "openai/gpt-5.4-mini",
    pro: "openai/gpt-5.6-terra",
    max: "openai/gpt-5.6-sol",
  },
};

let baseDir: string;
let auth: AuthStore;

beforeEach(async () => {
  baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-chatgpt-model-"));
  auth = new AuthStore(baseDir);
  await auth.set(CHATGPT_PROVIDER_ID, {
    type: "oauth",
    access: "access-one",
    refresh: "refresh-one",
    expires: Math.floor(Date.now() / 1000) + 3600,
    account_id: "account-123",
  });
});

afterEach(async () => {
  await fs.rm(baseDir, { recursive: true, force: true });
});

describe("ChatGptProvider", () => {
  it("pins the six-model namespaced allowlist mirrored from the reference client", () => {
    expect(CHATGPT_SUBSCRIPTION_MODEL_IDS).toEqual([
      "openai/gpt-5.6-sol",
      "openai/gpt-5.6-terra",
      "openai/gpt-5.6-luna",
      "openai/gpt-5.5",
      "openai/gpt-5.4",
      "openai/gpt-5.4-mini",
    ]);
    for (const id of CHATGPT_SUBSCRIPTION_MODEL_IDS) {
      expect(isChatGptSubscriptionModelId(id)).toBe(true);
    }
    expect(isChatGptSubscriptionModelId("anthropic/claude-sonnet-5")).toBe(
      false
    );
  });

  it("maps namespaced session model to bare wire model and hoists instructions", async () => {
    let requestUrl = "";
    let requestHeaders = new Headers();
    let requestBody: Record<string, unknown> = {};
    const request = vi.fn<typeof fetch>(async (input, init) => {
      requestUrl = input instanceof Request ? input.url : input.toString();
      requestHeaders = new Headers(init?.headers);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return completedResponse("gpt-5.6-terra");
    });
    const { factory } = runtime(request);
    const model = factory("pro", "openai/gpt-5.6-terra");
    expect((model as { provider: string }).provider).toBe(CHATGPT_PROVIDER_ID);

    const result = await generateText({
      model,
      system: "SYSTEM RULES",
      prompt: "Hello",
      maxOutputTokens: 512,
    });

    expect(result.text).toBe("done");
    expect(requestUrl).toBe(RESPONSES_URL);
    expect(requestHeaders.get("authorization")).toBe("Bearer access-one");
    expect(requestHeaders.get("chatgpt-account-id")).toBe("account-123");
    expect(requestHeaders.get("originator")).toBe("grida-test");
    expect(requestHeaders.get("openai-beta")).toBe("responses=experimental");
    expect(requestBody.model).toBe("gpt-5.6-terra");
    expect(requestBody.store).toBe(false);
    expect(requestBody.instructions).toBe("SYSTEM RULES");
    expect(requestBody).not.toHaveProperty("max_output_tokens");
    expect(requestBody.reasoning).toEqual({ effort: "medium" });
    expect(requestBody.include).toContain("reasoning.encrypted_content");
    expect(requestBody.input).toEqual([
      {
        role: "user",
        content: [{ type: "input_text", text: "Hello" }],
      },
    ]);
    expect(JSON.stringify(requestBody)).not.toContain("oauth-managed-by-grida");
  });

  it("preserves Request headers, applies init overrides, and owns credential headers", async () => {
    let requestHeaders = new Headers();
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      requestHeaders = new Headers(init?.headers);
      return completedResponse("gpt-5.6-terra");
    });
    const { providerFetch } = runtime(request);

    await providerFetch(
      new Request(RESPONSES_URL, {
        headers: {
          "x-request-header": "from-request",
          "x-overridden-header": "from-request",
          authorization: "Bearer caller-value",
          originator: "caller-value",
        },
      }),
      {
        headers: {
          "x-init-header": "from-init",
          "x-overridden-header": "from-init",
        },
      }
    );

    expect(requestHeaders.get("x-request-header")).toBe("from-request");
    expect(requestHeaders.get("x-init-header")).toBe("from-init");
    expect(requestHeaders.get("x-overridden-header")).toBe("from-init");
    expect(requestHeaders.get("authorization")).toBe("Bearer access-one");
    expect(requestHeaders.get("chatgpt-account-id")).toBe("account-123");
    expect(requestHeaders.get("originator")).toBe("grida-test");
  });

  it("always emits empty instructions for prompt-only auxiliary calls", async () => {
    let requestBody: Record<string, unknown> = {};
    const { factory } = runtime(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return completedResponse("gpt-5.4-mini");
    });

    await generateText({
      model: factory("nano"),
      prompt: "Write a title",
      maxOutputTokens: 128,
    });

    expect(requestBody.instructions).toBe("");
    expect(requestBody).not.toHaveProperty("max_output_tokens");
    expect(requestBody.reasoning).toEqual({ effort: "medium" });
    expect(requestBody.include).toContain("reasoning.encrypted_content");
  });

  it("streams a two-step tool turn and replays its tool result + encrypted reasoning", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const requestHeaders: Headers[] = [];
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      requestBodies.push(
        JSON.parse(String(init?.body)) as Record<string, unknown>
      );
      requestHeaders.push(new Headers(init?.headers));
      return requestBodies.length === 1
        ? streamingResponse([
            {
              type: "response.created",
              response: {
                id: "resp_tool",
                created_at: 1_800_000_000,
                model: "gpt-5.6-terra",
              },
            },
            {
              type: "response.output_item.added",
              output_index: 0,
              item: {
                type: "reasoning",
                id: "reasoning_1",
                encrypted_content: "opaque-reasoning-state",
              },
            },
            {
              type: "response.output_item.done",
              output_index: 0,
              item: {
                type: "reasoning",
                id: "reasoning_1",
                encrypted_content: "opaque-reasoning-state",
              },
            },
            {
              type: "response.output_item.added",
              output_index: 1,
              item: {
                type: "function_call",
                id: "function_1",
                call_id: "call_1",
                name: "lookup_weather",
                arguments: "",
              },
            },
            {
              type: "response.function_call_arguments.delta",
              item_id: "function_1",
              output_index: 1,
              delta: '{"city":"Seoul"}',
            },
            {
              type: "response.output_item.done",
              output_index: 1,
              item: {
                type: "function_call",
                id: "function_1",
                call_id: "call_1",
                name: "lookup_weather",
                arguments: '{"city":"Seoul"}',
                status: "completed",
              },
            },
            completedStreamEvent(),
          ])
        : streamingResponse([
            {
              type: "response.created",
              response: {
                id: "resp_text",
                created_at: 1_800_000_001,
                model: "gpt-5.6-terra",
              },
            },
            {
              type: "response.output_item.added",
              output_index: 0,
              item: { type: "message", id: "message_1" },
            },
            {
              type: "response.output_text.delta",
              item_id: "message_1",
              delta: "Sunny",
            },
            {
              type: "response.output_item.done",
              output_index: 0,
              item: { type: "message", id: "message_1" },
            },
            completedStreamEvent(),
          ]);
    });
    const execute = vi.fn<
      (input: { city: string }) => Promise<{ city: string; forecast: string }>
    >(async ({ city }) => ({
      city,
      forecast: "sunny",
    }));
    const { factory } = runtime(request);
    const result = streamText({
      model: factory("pro", "openai/gpt-5.6-terra"),
      system: "STREAM RULES",
      prompt: "What is the weather?",
      maxOutputTokens: 2048,
      tools: {
        lookup_weather: tool({
          description: "Look up weather",
          inputSchema: z.object({ city: z.string() }),
          execute,
        }),
      },
      stopWhen: stepCountIs(2),
    });
    const eventTypes: string[] = [];
    for await (const event of result.fullStream) {
      eventTypes.push(event.type);
    }

    expect(await result.text).toBe("Sunny");
    expect(execute).toHaveBeenCalledWith({ city: "Seoul" }, expect.any(Object));
    expect(eventTypes).toContain("tool-call");
    expect(eventTypes).toContain("tool-result");
    expect(eventTypes).toContain("text-delta");
    expect(requestBodies).toHaveLength(2);
    for (const body of requestBodies) {
      expect(body.store).toBe(false);
      expect(body.instructions).toBe("STREAM RULES");
      expect(body).not.toHaveProperty("max_output_tokens");
      expect(body.reasoning).toEqual({ effort: "medium" });
      expect(body.include).toContain("reasoning.encrypted_content");
      expect(body.stream).toBe(true);
    }
    expect(JSON.stringify(requestBodies[1])).toContain(
      "opaque-reasoning-state"
    );
    expect(requestBodies[1].input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "function_call",
          call_id: "call_1",
          name: "lookup_weather",
          arguments: '{"city":"Seoul"}',
        }),
        expect.objectContaining({
          type: "function_call_output",
          call_id: "call_1",
        }),
      ])
    );
    expect(JSON.stringify(requestBodies[1].input)).toContain("sunny");
    for (const headers of requestHeaders) {
      expect(headers.get("authorization")).toBe("Bearer access-one");
      expect(headers.get("chatgpt-account-id")).toBe("account-123");
      expect(headers.get("originator")).toBe("grida-test");
    }
  });

  it("refreshes once after inference 401 and retries with the persisted rotation", async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const request = vi.fn<typeof fetch>(async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      const authorization = new Headers(init?.headers).get("authorization");
      calls.push({ url, authorization });
      if (url === TOKEN_URL) {
        return Response.json({
          access_token: "access-two",
          refresh_token: "refresh-two",
          expires_in: 3600,
          account_id: "account-123",
        });
      }
      const inferenceCalls = calls.filter((call) => call.url === RESPONSES_URL);
      return inferenceCalls.length === 1
        ? new Response('{"token":"must-not-echo"}', { status: 401 })
        : completedResponse("gpt-5.6-terra");
    });
    const { factory } = runtime(request);

    await expect(
      generateText({
        model: factory("pro", "openai/gpt-5.6-terra"),
        prompt: "Hello",
      })
    ).resolves.toMatchObject({ text: "done" });
    expect(calls).toEqual([
      { url: RESPONSES_URL, authorization: "Bearer access-one" },
      { url: TOKEN_URL, authorization: null },
      { url: RESPONSES_URL, authorization: "Bearer access-two" },
    ]);
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toMatchObject({
      access: "access-two",
      refresh: "refresh-two",
    });
  });

  it("removes the exact credential when the inference retry is also unauthorized", async () => {
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url === TOKEN_URL) {
        return Response.json({
          access_token: "access-two",
          refresh_token: "refresh-two",
          expires_in: 3600,
          account_id: "account-123",
        });
      }
      return new Response('{"token":"must-not-echo"}', { status: 401 });
    });
    const { factory } = runtime(request);

    let error: unknown;
    try {
      await generateText({
        model: factory("pro", "openai/gpt-5.6-terra"),
        prompt: "Hello",
      });
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).toContain("chatgpt_reauthentication_required");
    expect(String(error)).not.toContain("must-not-echo");
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toBeUndefined();
  });

  it("preserves a newer account when a late inference retry is unauthorized", async () => {
    let inferenceCalls = 0;
    const newer: OAuthEntry = {
      type: "oauth",
      access: "account-b-access",
      refresh: "account-b-refresh",
      expires: Math.floor(Date.now() / 1000) + 7200,
      account_id: "account-b",
    };
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url === TOKEN_URL) {
        return Response.json({
          access_token: "account-a-refreshed-access",
          refresh_token: "account-a-refreshed-refresh",
          expires_in: 3600,
          account_id: "account-123",
        });
      }
      inferenceCalls += 1;
      if (inferenceCalls === 2) {
        await auth.set(CHATGPT_PROVIDER_ID, newer);
      }
      return new Response(null, { status: 401 });
    });
    const { factory } = runtime(request);

    await expect(
      generateText({
        model: factory("pro", "openai/gpt-5.6-terra"),
        prompt: "Hello",
      })
    ).rejects.toThrow(/chatgpt_reauthentication_required/);
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toEqual(newer);
  });

  it.each([
    [400, "chatgpt_request_rejected"],
    [403, "chatgpt_subscription_unavailable"],
    [404, "chatgpt_model_not_available"],
    [429, "chatgpt_rate_limited"],
    [500, "chatgpt_service_unavailable"],
  ])("maps HTTP %s without echoing the upstream body", async (status, code) => {
    const { factory } = runtime(
      async () => new Response('{"secret":"upstream-body"}', { status })
    );
    let error: unknown;
    try {
      await generateText({
        model: factory("pro", "openai/gpt-5.6-terra"),
        prompt: "Hello",
      });
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).toContain(code);
    expect(String(error)).not.toContain("upstream-body");
  });

  it("rejects a non-subscription model before provider I/O", () => {
    const request = vi.fn<typeof fetch>();
    const { factory } = runtime(request);
    expect(() => factory("pro", "anthropic/claude-sonnet-5")).toThrowError(
      /chatgpt_model_not_available/
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects an unexpected endpoint before credentials or upstream I/O", async () => {
    const request = vi.fn<typeof fetch>();
    const { credentials, providerFetch } = runtime(request);
    const readCredentials = vi.spyOn(credentials, "getAccessCredentials");

    await expect(
      providerFetch("https://chatgpt.example.test/unconfigured")
    ).rejects.toMatchObject({
      code: "chatgpt_unexpected_endpoint",
    });
    expect(readCredentials).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});

function runtime(request: typeof fetch) {
  const providerHttp = new ProviderHttp({ request, download: request });
  const credentials = new ChatGptCredentialManager(
    auth,
    providerHttp,
    CONFIG.oauth
  );
  const providerRuntime = { config: CONFIG, credentials };
  return {
    credentials,
    providerFetch: ChatGptProvider.makeFetch(providerRuntime, providerHttp),
    factory: ChatGptProvider.makeFactory(providerRuntime, providerHttp),
  };
}

function completedResponse(model: string): Response {
  return Response.json({
    id: "resp_1",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output: [
      {
        id: "msg_1",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "done",
            annotations: [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 1,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 1,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 2,
    },
  });
}

function streamingResponse(events: readonly unknown[]): Response {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } }
  );
}

function completedStreamEvent(): Record<string, unknown> {
  return {
    type: "response.completed",
    response: {
      usage: {
        input_tokens: 3,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
        output_tokens_details: { reasoning_tokens: 1 },
      },
    },
  };
}
