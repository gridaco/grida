/**
 * GRIDA-SEC-008 — exact native-provider request and sanitized-error boundary.
 *
 * Native ChatGPT subscription transport.
 *
 * The native agent owns the loop, tools, sessions and persistence. This module
 * binds one durable OAuth connection to one subscription model and forwards
 * only exact, validated Responses requests. It does not use ACP or Codex
 * app-server.
 */

import { createHash } from "node:crypto";
import {
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
import type { ProviderHttp } from "./http";

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

export type ChatGptProviderErrorCode = "chatgpt_model_not_available";

/** Code-led, body-free inference failures safe to cross the daemon boundary. */
export class ChatGptProviderError extends Error {
  constructor(public readonly code: ChatGptProviderErrorCode) {
    super(`${code}: ${providerErrorDescription(code)}`);
    this.name = "ChatGptProviderError";
  }
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
    case "chatgpt_model_not_available":
      return "the selected model is not available through this subscription";
  }
}
