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
  CHATGPT_SUBSCRIPTION_WIRE_MODEL_BY_ID,
  isChatGptSubscriptionModelId,
  type ChatGptSubscriptionModelId,
  type ChatGptTurnCapabilities,
} from "../protocol/chatgpt";
import {
  ChatGptCredentialError,
  type ChatGptAccessCredentials,
  type ChatGptCredentialManager,
  type ChatGptOAuthConfig,
} from "./chatgpt-credentials";
import { ChatGptModels, noSubscriptionFeatures } from "./chatgpt-models";
import type { ProviderHttp } from "./http";

const RESPONSES_SUFFIX = "/responses";
const MAX_NATIVE_REQUEST_BYTES = 8 * 1024 * 1024;
const NATIVE_FIELDS = new Set([
  "model",
  "input",
  "instructions",
  "tools",
  "service_tier",
  "reasoning",
  "stream",
  "store",
  "include",
]);

export type ChatGptProviderConfig = Readonly<{
  oauth: ChatGptOAuthConfig;
  /** Exact configured Responses endpoint, including the `/responses` suffix. */
  responses_url: string;
  /** Host-owned discovery compatibility version. Absent disables optional features. */
  catalog_client_version?: string;
  /** Host-configured product identity; the host owns the service contract. */
  originator: string;
  default_model_id: ChatGptSubscriptionModelId;
}>;

export type ChatGptProviderRuntime = Readonly<{
  config: ChatGptProviderConfig;
  credentials: ChatGptCredentialManager;
  catalog?: ChatGptModels;
  /** Search permission is checked again before dispatch, including authentication retries. */
  turnPreferences?: () => Promise<Readonly<{ webSearchAllowed: boolean }>>;
}>;

export type NativeChatGptConnection = Readonly<{
  scope: string;
  target: string;
  model: ChatGptSubscriptionModelId;
  capabilities(): Promise<ChatGptTurnCapabilities>;
  isCurrent(): Promise<boolean>;
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
  export function modelsUrl(config: ChatGptProviderConfig): string | undefined {
    if (config.catalog_client_version === undefined) return;
    if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(config.catalog_client_version))
      throw new TypeError(
        "invalid subscription catalogue compatibility version"
      );
    const url = new URL("models", config.responses_url);
    url.searchParams.set("client_version", config.catalog_client_version);
    return url.href;
  }

  export function validate(config: ChatGptProviderConfig): void {
    modelsUrl(config);
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
    const wireModel = CHATGPT_SUBSCRIPTION_WIRE_MODEL_BY_ID[model];
    const catalogUrl = modelsUrl(runtime.config);
    const catalogOffer = async (): Promise<ChatGptTurnCapabilities> => {
      try {
        await connection.validate();
        if (!runtime.catalog || !catalogUrl)
          return noSubscriptionFeatures("unavailable");
        const result = await runtime.catalog.capabilities(
          scope,
          model,
          (signal) =>
            requestWithRetry(
              runtime.credentials,
              connection.access,
              async (credential) => {
                await connection.validate();
                signal.throwIfAborted();
                return requestWithCredential(
                  providerHttp,
                  catalogUrl,
                  {
                    method: "GET",
                    headers: { accept: "application/json" },
                    signal,
                    redirect: "manual",
                  },
                  originator,
                  credential
                );
              }
            ).catch((error: unknown) => {
              if (
                error instanceof ChatGptCredentialError &&
                error.code !== "chatgpt_token_refresh_failed"
              )
                return new Response(null, { status: 401 });
              throw error;
            })
        );
        await connection.validate();
        return result;
      } catch (error) {
        return noSubscriptionFeatures(
          error instanceof ChatGptCredentialError &&
            error.code !== "chatgpt_token_refresh_failed"
            ? "reauthenticationRequired"
            : "unavailable"
        );
      }
    };
    const searchAllowed = async (): Promise<boolean> => {
      if (!runtime.turnPreferences) return true;
      try {
        return (await runtime.turnPreferences()).webSearchAllowed === true;
      } catch {
        return false;
      }
    };
    const capabilities = async (): Promise<ChatGptTurnCapabilities> => {
      const webSearchAllowed = await searchAllowed();
      const offer = await catalogOffer();
      return webSearchAllowed ? offer : { ...offer, webSearch: false };
    };
    return Object.freeze({
      scope,
      target,
      model,
      capabilities,
      isCurrent: () =>
        connection.validate().then(
          () => true,
          () => false
        ),
      async request(body: Uint8Array, signal: AbortSignal) {
        if (
          signal.aborted ||
          body.length === 0 ||
          body.length > MAX_NATIVE_REQUEST_BYTES
        )
          return null;
        const bytes = Uint8Array.from(body);
        const options = nativeOptions(bytes, wireModel);
        if (!options) return null;
        if (options.speed || options.webSearch) {
          const offer = options.webSearch
            ? await capabilities()
            : await catalogOffer();
          if (
            offer.status !== "available" ||
            (options.speed && !offer.speeds.includes(options.speed)) ||
            (options.webSearch && !offer.webSearch)
          )
            return null;
        }
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
              signal.throwIfAborted();
              if (options.webSearch && !(await searchAllowed()))
                throw new Error("chat_turn_preference_changed");
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

function nativeOptions(
  bytes: Uint8Array,
  model: string
):
  | {
      speed?: "fast" | "ultrafast";
      webSearch: boolean;
    }
  | undefined {
  let body: Record<string, unknown>;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // The original bytes are forwarded. JSON.parse keeps the last duplicate
    // member; another decoder could select the first instead. Count parsed
    // members against structural colons, preserving whitespace and escapes.
    let parsedMembers = 0;
    body = JSON.parse(json, function (_key, value: unknown) {
      if (!Array.isArray(this)) parsedMembers++;
      return value;
    });
    let wireMembers = 0;
    let inString = false;
    for (let i = 0; i < json.length; i++) {
      const ch = json[i];
      if (ch === '"') inString = !inString;
      else if (inString && ch === "\\") i++;
      else if (!inString && ch === ":") wireMembers++;
    }
    // The reviver also receives the synthetic root member.
    if (wireMembers !== parsedMembers - 1) return;
  } catch {
    return;
  }
  if (
    !(
      !!body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      Object.keys(body).every((key) => NATIVE_FIELDS.has(key)) &&
      body.model === model &&
      body.stream === true &&
      body.store === false &&
      typeof body.instructions === "string" &&
      Array.isArray(body.input) &&
      (body.tools === undefined || Array.isArray(body.tools)) &&
      (body.service_tier === undefined ||
        body.service_tier === "priority" ||
        body.service_tier === "ultrafast") &&
      Array.isArray(body.include) &&
      body.include.length === 1 &&
      body.include[0] === "reasoning.encrypted_content"
    )
  )
    return;
  let webSearch = false;
  for (const tool of body.tools ?? []) {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) return;
    if (tool.type === "function") continue;
    if (
      tool.type !== "web_search" ||
      typeof tool.external_web_access !== "boolean" ||
      (tool.indexed_web_access !== undefined &&
        (tool.indexed_web_access !== true || !tool.external_web_access)) ||
      Object.keys(tool).length !== (tool.indexed_web_access === true ? 3 : 2) ||
      webSearch
    )
      return;
    // Retained native inputs can still carry an exact legacy search declaration.
    webSearch = true;
  }
  return {
    speed: body.service_tier === "priority" ? "fast" : body.service_tier,
    webSearch,
  };
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
