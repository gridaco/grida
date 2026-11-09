/**
 * GRIDA-SEC-008 — exact native-provider request and sanitized-error boundary.
 *
 * Native ChatGPT subscription model provider.
 *
 * This is a normal `ModelFactory`: Grida owns the loop, tools, sessions, and
 * persistence, while the user's subscription supplies Responses inference.
 * It does not use ACP or Codex app-server.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createHash } from "node:crypto";
import type {
  JSONObject,
  LanguageModelV3CallOptions,
  LanguageModelV3Middleware,
} from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import type { ModelFactory } from "../agent";
import {
  CHATGPT_PROVIDER_ID,
  isChatGptSubscriptionModelId,
  type ChatGptSubscriptionModelId,
} from "../protocol/chatgpt";
import type { ModelTier } from "../tiers";
import {
  ChatGptCredentialError,
  type ChatGptAccessCredentials,
  type ChatGptCredentialManager,
  type ChatGptOAuthConfig,
} from "./chatgpt-credentials";
import { ProviderHttp } from "./http";

const RESPONSES_SUFFIX = "/responses";
const MAX_NATIVE_REQUEST_BYTES = 1024 * 1024;
const NATIVE_FIELDS = new Set([
  "model",
  "input",
  "instructions",
  "tools",
  "reasoning",
  "stream",
  "store",
  "include",
]);

export type ChatGptProviderConfig = Readonly<{
  oauth: ChatGptOAuthConfig;
  /** Exact configured Responses endpoint, including the `/responses` suffix. */
  responses_url: string;
  /** Host-configured product identity; the host owns the service contract. */
  originator: string;
  default_model_id: ChatGptSubscriptionModelId;
  tier_model_ids?: Partial<Record<ModelTier, ChatGptSubscriptionModelId>>;
}>;

export type ChatGptProviderRuntime = Readonly<{
  config: ChatGptProviderConfig;
  credentials: ChatGptCredentialManager;
}>;

export type NativeChatGptConnection = Readonly<{
  scope: string;
  target: string;
  model: ChatGptSubscriptionModelId;
  request(body: Uint8Array, signal: AbortSignal): Promise<Response | null>;
}>;

export type ChatGptProviderErrorCode =
  | "chatgpt_subscription_unavailable"
  | "chatgpt_rate_limited"
  | "chatgpt_model_not_available"
  | "chatgpt_request_rejected"
  | "chatgpt_service_unavailable"
  | "chatgpt_unexpected_endpoint";

/** Code-led, body-free inference failures safe to cross the daemon boundary. */
export class ChatGptProviderError extends Error {
  constructor(public readonly code: ChatGptProviderErrorCode) {
    super(`${code}: ${providerErrorDescription(code)}`);
    this.name = "ChatGptProviderError";
  }
}

/**
 * The subscription model a tier resolves to. The subscription serves its
 * own model set, so this is deliberately NOT the catalogue's
 * `TIER_MODEL_IDS` — the host configures a parallel table and a tier with
 * no entry falls back to the configured default.
 *
 * Single owner on purpose: the model factory picks the model to CALL and
 * the compactor needs the same answer to size the summarizer's input cap.
 * Two copies of this fallback chain would drift silently, and the tier
 * that drifts is `nano` — the one every background titler/compactor call
 * rides. See `summarizerInputCap` in `runtime/index.ts`.
 */
export function tierModelId(
  config: ChatGptProviderConfig,
  tier: ModelTier
): ChatGptSubscriptionModelId {
  return config.tier_model_ids?.[tier] ?? config.default_model_id;
}

export namespace ChatGptProvider {
  export function validate(config: ChatGptProviderConfig): void {
    const responseUrl = new URL(config.responses_url);
    if (
      responseUrl.protocol !== "https:" ||
      responseUrl.username !== "" ||
      responseUrl.password !== "" ||
      responseUrl.search !== "" ||
      responseUrl.hash !== "" ||
      !responseUrl.pathname.endsWith(RESPONSES_SUFFIX)
    ) {
      throw new TypeError(
        "chatgpt responses_url must be a credential-free HTTPS /responses endpoint"
      );
    }
    if (config.originator.trim().length === 0) {
      throw new TypeError("chatgpt originator must not be empty");
    }
    // Constructing Headers validates that the configured identity is legal on
    // the wire now, rather than failing during a user's first turn.
    new Headers({ originator: config.originator });
    if (!isChatGptSubscriptionModelId(config.default_model_id)) {
      throw new TypeError(
        "chatgpt default_model_id must be a supported subscription model"
      );
    }
    for (const modelId of Object.values(config.tier_model_ids ?? {})) {
      if (modelId !== undefined && !isChatGptSubscriptionModelId(modelId)) {
        throw new TypeError(
          "every chatgpt tier_model_ids value must be a supported subscription model"
        );
      }
    }
  }

  export function supportsModel(
    config: ChatGptProviderConfig,
    modelId: string | undefined
  ): boolean {
    return modelId === undefined || isChatGptSubscriptionModelId(modelId);
  }

  export async function isReady(
    runtime: ChatGptProviderRuntime
  ): Promise<boolean> {
    return runtime.credentials.supportsAccount();
  }

  export function makeFactory(
    runtime: ChatGptProviderRuntime,
    providerHttp: ProviderHttp = new ProviderHttp()
  ): ModelFactory {
    const providerFetch = makeFetch(runtime, providerHttp);
    const exactResponsesUrl = new URL(runtime.config.responses_url).toString();
    const baseUrl = exactResponsesUrl.slice(0, -RESPONSES_SUFFIX.length);
    const provider = createOpenAI({
      // Keep the SDK's provider-metadata namespace as `openai`: encrypted
      // reasoning emitted by one Responses step is parsed from that namespace
      // when the next tool step is serialized. The outer wrapped model still
      // advertises `chatgpt` as Grida's provider identity.
      name: "openai",
      baseURL: baseUrl,
      // Prevent ambient OPENAI_API_KEY lookup. This non-secret sentinel is
      // always overwritten by request-time OAuth injection below.
      apiKey: "oauth-managed-by-grida",
      fetch: providerFetch,
    });

    return (tier, modelId) => {
      const selected = modelId ?? tierModelId(runtime.config, tier);
      if (!isChatGptSubscriptionModelId(selected)) {
        throw new ChatGptProviderError("chatgpt_model_not_available");
      }
      return wrapLanguageModel({
        model: provider.responses(toWireModelId(selected)),
        middleware: CHATGPT_RESPONSES_MIDDLEWARE,
        providerId: CHATGPT_PROVIDER_ID,
        modelId: selected,
      });
    };
  }

  export function makeFetch(
    runtime: ChatGptProviderRuntime,
    providerHttp: ProviderHttp = new ProviderHttp()
  ): typeof fetch {
    validate(runtime.config);
    const exactResponsesUrl = new URL(runtime.config.responses_url).toString();
    return async (input, init) => {
      const requestUrl = requestUrlOf(input);
      if (requestUrl !== exactResponsesUrl) {
        throw new ChatGptProviderError("chatgpt_unexpected_endpoint");
      }
      const response = await requestWithRetry(
        runtime.credentials,
        () => runtime.credentials.getAccessCredentials(),
        (credential) =>
          requestWithCredential(
            providerHttp,
            input,
            init,
            runtime.config.originator,
            credential
          )
      );
      if (response.status === 403) {
        await discardBody(response);
        throw new ChatGptProviderError("chatgpt_subscription_unavailable");
      }
      if (response.status === 429) {
        await discardBody(response);
        throw new ChatGptProviderError("chatgpt_rate_limited");
      }
      if (!response.ok) {
        const code =
          response.status === 404
            ? "chatgpt_model_not_available"
            : response.status >= 400 && response.status < 500
              ? "chatgpt_request_rejected"
              : "chatgpt_service_unavailable";
        await discardBody(response);
        throw new ChatGptProviderError(code);
      }
      return response;
    };
  }

  /** Bind the native transport to one model and one durable OAuth connection. */
  export async function captureNative(
    runtime: ChatGptProviderRuntime,
    model: string,
    providerHttp: ProviderHttp
  ): Promise<NativeChatGptConnection> {
    validate(runtime.config);
    if (!isChatGptSubscriptionModelId(model))
      throw new ChatGptProviderError("chatgpt_model_not_available");
    const connection = await runtime.credentials.captureConnection();
    const target = new URL(runtime.config.responses_url).href;
    const originator = runtime.config.originator;
    const scope = createHash("sha256")
      .update(
        JSON.stringify([
          "grida-chatgpt-native-responses-v1",
          connection.scope,
          target,
          originator,
        ])
      )
      .digest("hex");
    const wireModel = toWireModelId(model);
    return Object.freeze({
      scope,
      target,
      model,
      async request(body: Uint8Array, signal: AbortSignal) {
        if (
          signal.aborted ||
          body.length === 0 ||
          body.length > MAX_NATIVE_REQUEST_BYTES
        )
          return null;
        const bytes = Uint8Array.from(body);
        if (!validNativeRequest(bytes, wireModel)) return null;
        const init: RequestInit = {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
          },
          body: bytes.buffer,
          signal,
          redirect: "manual",
        };
        try {
          const response = await requestWithRetry(
            runtime.credentials,
            connection.access,
            async (credential) => {
              await connection.validate();
              signal.throwIfAborted();
              return await requestWithCredential(
                providerHttp,
                target,
                init,
                originator,
                credential
              );
            }
          );
          if (response.ok) return response;
          await discardBody(response);
          return nativeErrorResponse(response);
        } catch (error) {
          if (!(error instanceof ChatGptCredentialError)) throw error;
          return new Response(null, {
            status: error.code === "chatgpt_token_refresh_failed" ? 503 : 401,
          });
        }
      },
    });
  }
}

const CHATGPT_WIRE_MODEL_BY_ID: Record<ChatGptSubscriptionModelId, string> = {
  "openai/gpt-5.6-sol": "gpt-5.6-sol",
  "openai/gpt-5.6-terra": "gpt-5.6-terra",
  "openai/gpt-5.6-luna": "gpt-5.6-luna",
  "openai/gpt-5.5": "gpt-5.5",
  "openai/gpt-5.4": "gpt-5.4",
};

function toWireModelId(modelId: ChatGptSubscriptionModelId): string {
  return CHATGPT_WIRE_MODEL_BY_ID[modelId];
}

const CHATGPT_RESPONSES_MIDDLEWARE: LanguageModelV3Middleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => responsesParams(params),
};

/**
 * The subscription Responses wire requires instructions at the top level and
 * rejects stored response state. AI SDK normally lowers system messages into
 * `input`; this middleware hoists them into OpenAI provider options instead.
 */
function responsesParams(
  params: LanguageModelV3CallOptions
): LanguageModelV3CallOptions {
  const instructions = params.prompt
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const existing = params.providerOptions?.openai ?? {};
  const openai: JSONObject = {
    ...existing,
    store: false,
    systemMessageMode: "remove",
    // Future Codex model ids are unknown to this AI SDK release. Force the
    // reasoning path so store:false requests include/replay opaque encrypted
    // reasoning across multi-step tool turns and omit unsupported sampling.
    forceReasoning: true,
    reasoningEffort: existing.reasoningEffort ?? "medium",
    // Codex Responses expects the field even for prompt-only auxiliary calls.
    instructions,
  };
  return {
    ...params,
    // The ChatGPT/Codex subscription backend rejects this public Responses
    // API setting. Titling and compaction set SDK output caps, so strip the
    // generic option before the provider serializes `max_output_tokens`.
    maxOutputTokens: undefined,
    prompt: params.prompt.filter((message) => message.role !== "system"),
    providerOptions: {
      ...params.providerOptions,
      openai,
    },
  };
}

function requestUrlOf(input: string | URL | Request): string {
  return new URL(
    input instanceof Request ? input.url : input.toString()
  ).toString();
}

async function requestWithRetry(
  manager: ChatGptCredentialManager,
  access: () => Promise<ChatGptAccessCredentials>,
  request: (credential: ChatGptAccessCredentials) => Promise<Response>
): Promise<Response> {
  let credential = await access();
  let response = await request(credential);
  if (response.status !== 401) return response;
  await discardBody(response);
  credential = await manager.refreshAfterUnauthorized(credential);
  response = await request(credential);
  if (response.status !== 401) return response;
  await discardBody(response);
  await manager.invalidateAfterUnauthorized(credential);
  throw new ChatGptCredentialError("chatgpt_reauthentication_required");
}

function validNativeRequest(bytes: Uint8Array, model: string): boolean {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return false;
  }
  return (
    !!body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).every((key) => NATIVE_FIELDS.has(key)) &&
    body.model === model &&
    body.stream === true &&
    body.store === false &&
    typeof body.instructions === "string" &&
    Array.isArray(body.input) &&
    (body.tools === undefined ||
      (Array.isArray(body.tools) &&
        body.tools.every(
          (tool: unknown) =>
            typeof tool === "object" &&
            tool !== null &&
            "type" in tool &&
            tool.type === "function"
        ))) &&
    Array.isArray(body.include) &&
    body.include.length === 1 &&
    body.include[0] === "reasoning.encrypted_content"
  );
}

function nativeErrorResponse(response: Response): Response {
  const headers = new Headers();
  const requestId = response.headers.get("x-request-id");
  if (requestId && /^[a-z0-9_.:-]{1,128}$/i.test(requestId))
    headers.set("x-request-id", requestId);
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d{1,12}$/.test(retryAfter))
    headers.set("retry-after", retryAfter);
  return new Response(null, { status: response.status, headers });
}

function requestWithCredential(
  providerHttp: ProviderHttp,
  input: string | URL | Request,
  init: RequestInit | undefined,
  originator: string,
  credential: { access_token: string; account_id: string }
): Promise<Response> {
  const headers = new Headers(
    input instanceof Request ? input.headers : undefined
  );
  if (init?.headers) {
    for (const [name, value] of new Headers(init.headers)) {
      headers.set(name, value);
    }
  }
  headers.set("authorization", `Bearer ${credential.access_token}`);
  headers.set("chatgpt-account-id", credential.account_id);
  headers.set("originator", originator);
  headers.set("openai-beta", "responses=experimental");
  return providerHttp.request(input, { ...init, headers });
}

async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}

function providerErrorDescription(code: ChatGptProviderErrorCode): string {
  switch (code) {
    case "chatgpt_subscription_unavailable":
      return "the signed-in account cannot use subscription inference";
    case "chatgpt_rate_limited":
      return "the ChatGPT subscription is temporarily rate limited";
    case "chatgpt_model_not_available":
      return "the selected model is not available through this subscription";
    case "chatgpt_request_rejected":
      return "the subscription backend rejected the model request";
    case "chatgpt_service_unavailable":
      return "the subscription backend is temporarily unavailable";
    case "chatgpt_unexpected_endpoint":
      return "the provider attempted an unconfigured endpoint";
  }
}
