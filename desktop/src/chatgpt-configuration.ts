/**
 * GRIDA-SEC-008 — fixed native-provider identity and browser-open contract.
 *
 * Experimental ChatGPT-subscription provider configuration.
 *
 * This is the native Grida provider path: Grida still owns the agent loop,
 * sessions, tools, and approvals. It does not launch Codex app-server and it
 * is not an ACP provider.
 *
 * The OAuth client id is public (OAuth native apps cannot keep a client
 * secret). The experimental default is the public Codex native client used by
 * the reference implementations; it is not proof of third-party support. The
 * environment override is the replacement seam for a Grida registration.
 */

import type { ChatGptProviderConfig } from "@grida/agent/server";

export const CHATGPT_CALLBACK_PATH = "/auth/callback" as const;
export const CHATGPT_CALLBACK_PORTS = [1455, 1457] as const;

function chatGptCallbackUri(port: (typeof CHATGPT_CALLBACK_PORTS)[number]) {
  return `http://localhost:${port}${CHATGPT_CALLBACK_PATH}` as const;
}

export const CHATGPT_CALLBACK_URIS = [
  chatGptCallbackUri(CHATGPT_CALLBACK_PORTS[0]),
  chatGptCallbackUri(CHATGPT_CALLBACK_PORTS[1]),
] as const;

export const CHATGPT_AUTHORIZE_URL =
  "https://auth.openai.com/oauth/authorize" as const;
export const CHATGPT_TOKEN_URL = "https://auth.openai.com/oauth/token" as const;
export const CHATGPT_RESPONSES_URL =
  "https://chatgpt.com/backend-api/codex/responses" as const;

const CHATGPT_CODEX_CLIENT_ID =
  process.env.GRIDA_CHATGPT_OAUTH_CLIENT_ID?.trim() ||
  "app_EMoamEEZ73f0CkXaXp7hrann";

export const CHATGPT_SUBSCRIPTION_CONFIG: ChatGptProviderConfig = {
  oauth: {
    authorize_url: CHATGPT_AUTHORIZE_URL,
    token_url: CHATGPT_TOKEN_URL,
    client_id: CHATGPT_CODEX_CLIENT_ID,
    redirect_uris: CHATGPT_CALLBACK_URIS,
    scopes: ["openid", "profile", "email", "offline_access"],
    authorization_parameters: {
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "grida",
    },
  },
  responses_url: CHATGPT_RESPONSES_URL,
  originator: "grida",
  default_model_id: "openai/gpt-5.6-terra",
  tier_model_ids: {
    nano: "openai/gpt-5.4-mini",
    mini: "openai/gpt-5.6-luna",
    pro: "openai/gpt-5.6-terra",
    max: "openai/gpt-5.6-sol",
  },
};

export type ChatGptAuthorizationExpectation = Readonly<{
  expected_state: string;
  expected_redirect_uri: string;
}>;

/**
 * Fail-closed validation before Electron opens the provider-generated URL.
 * Query values that are secret or one-shot (PKCE state/challenge) remain
 * opaque; the main process only verifies the fixed authority and registration
 * fields it owns.
 */
export function validateChatGptAuthorizationUrl(
  raw: string,
  expectation: ChatGptAuthorizationExpectation
): URL {
  const url = new URL(raw);
  const config = CHATGPT_SUBSCRIPTION_CONFIG;
  if (
    url.origin !== new URL(config.oauth.authorize_url).origin ||
    url.pathname !== new URL(config.oauth.authorize_url).pathname
  ) {
    throw new Error("ChatGPT sign-in returned an unexpected authorization URL");
  }
  if (url.username || url.password || url.hash) {
    throw new Error("ChatGPT sign-in returned an invalid authorization URL");
  }
  const fixedParameters = new Set([
    "client_id",
    "redirect_uri",
    "response_type",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
    ...Object.keys(config.oauth.authorization_parameters ?? {}),
  ]);
  if (
    [...url.searchParams.keys()].some((name) => !fixedParameters.has(name)) ||
    [...fixedParameters].some(
      (name) => url.searchParams.getAll(name).length !== 1
    )
  ) {
    throw new Error(
      "ChatGPT sign-in returned unexpected authorization parameters"
    );
  }
  if (url.searchParams.get("client_id") !== config.oauth.client_id) {
    throw new Error("ChatGPT sign-in returned an unexpected OAuth client");
  }
  if (
    url.searchParams.get("redirect_uri") !==
      expectation.expected_redirect_uri ||
    !config.oauth.redirect_uris.includes(
      url.searchParams.get("redirect_uri") ?? ""
    )
  ) {
    throw new Error("ChatGPT sign-in returned an unexpected callback URL");
  }
  if (url.searchParams.get("response_type") !== "code") {
    throw new Error("ChatGPT sign-in returned an unexpected response type");
  }
  if (
    url.searchParams.get("scope") !== config.oauth.scopes.join(" ") ||
    Object.entries(config.oauth.authorization_parameters ?? {}).some(
      ([name, value]) => url.searchParams.get(name) !== value
    )
  ) {
    throw new Error(
      "ChatGPT sign-in returned unexpected authorization parameters"
    );
  }
  if (url.searchParams.get("code_challenge_method") !== "S256") {
    throw new Error("ChatGPT sign-in did not enable PKCE");
  }
  if (
    url.searchParams.get("state") !== expectation.expected_state ||
    !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("code_challenge") ?? "")
  ) {
    throw new Error("ChatGPT sign-in returned an incomplete authorization URL");
  }
  return url;
}
