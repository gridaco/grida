// GRIDA-SEC-008 — authorization URL origin, query, and attempt correlation.
import { describe, expect, it } from "vitest";
import {
  CHATGPT_AUTHORIZE_URL,
  CHATGPT_CALLBACK_PATH,
  CHATGPT_CALLBACK_PORTS,
  CHATGPT_CALLBACK_URIS,
  CHATGPT_SUBSCRIPTION_CONFIG,
  validateChatGptAuthorizationUrl,
} from "./chatgpt-configuration";

const EXPECTATION = {
  expected_state: "state",
  expected_redirect_uri: CHATGPT_CALLBACK_URIS[0],
} as const;

function authorizationUrl(overrides: Record<string, string> = {}): string {
  const url = new URL(CHATGPT_AUTHORIZE_URL);
  const params = {
    client_id: CHATGPT_SUBSCRIPTION_CONFIG.oauth.client_id,
    redirect_uri: CHATGPT_CALLBACK_URIS[0],
    response_type: "code",
    scope: CHATGPT_SUBSCRIPTION_CONFIG.oauth.scopes.join(" "),
    code_challenge_method: "S256",
    code_challenge: "c".repeat(43),
    state: "state",
    ...overrides,
  };
  for (const [key, value] of Object.entries(
    CHATGPT_SUBSCRIPTION_CONFIG.oauth.authorization_parameters ?? {}
  )) {
    url.searchParams.set(key, value);
  }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

describe("validateChatGptAuthorizationUrl", () => {
  it("derives every registered callback from the port and path contract", () => {
    expect(CHATGPT_CALLBACK_URIS).toEqual(
      CHATGPT_CALLBACK_PORTS.map(
        (port) => `http://localhost:${port}${CHATGPT_CALLBACK_PATH}`
      )
    );
  });

  it("accepts the fixed OpenAI authority and an approved callback", () => {
    expect(
      validateChatGptAuthorizationUrl(authorizationUrl(), EXPECTATION).origin
    ).toBe("https://auth.openai.com");
  });

  it("rejects a lookalike authority before Electron opens it", () => {
    const url = new URL(authorizationUrl());
    url.hostname = "auth.openai.com.example.test";
    expect(() =>
      validateChatGptAuthorizationUrl(url.toString(), EXPECTATION)
    ).toThrow("unexpected authorization URL");
  });

  it("rejects an unregistered callback or OAuth client", () => {
    expect(() =>
      validateChatGptAuthorizationUrl(
        authorizationUrl({ redirect_uri: "http://localhost:1666/callback" }),
        EXPECTATION
      )
    ).toThrow("unexpected callback URL");
    expect(() =>
      validateChatGptAuthorizationUrl(
        authorizationUrl({ client_id: "another-client" }),
        EXPECTATION
      )
    ).toThrow("unexpected OAuth client");
  });

  it("requires state and S256 PKCE", () => {
    expect(() =>
      validateChatGptAuthorizationUrl(
        authorizationUrl({ state: "" }),
        EXPECTATION
      )
    ).toThrow("incomplete authorization URL");
    expect(() =>
      validateChatGptAuthorizationUrl(
        authorizationUrl({ code_challenge_method: "plain" }),
        EXPECTATION
      )
    ).toThrow("did not enable PKCE");
  });

  it("requires Grida's fixed OAuth originator", () => {
    expect(() =>
      validateChatGptAuthorizationUrl(
        authorizationUrl({ originator: "another-app" }),
        EXPECTATION
      )
    ).toThrow("unexpected authorization parameter");
  });

  it("rejects a different active callback, state, or duplicate parameter", () => {
    expect(() =>
      validateChatGptAuthorizationUrl(
        authorizationUrl({ redirect_uri: CHATGPT_CALLBACK_URIS[1] }),
        EXPECTATION
      )
    ).toThrow("unexpected callback URL");
    expect(() =>
      validateChatGptAuthorizationUrl(
        authorizationUrl({ state: "another-state" }),
        EXPECTATION
      )
    ).toThrow("incomplete authorization URL");

    const duplicate = new URL(authorizationUrl());
    duplicate.searchParams.append("state", "state");
    expect(() =>
      validateChatGptAuthorizationUrl(duplicate.toString(), EXPECTATION)
    ).toThrow("unexpected authorization parameter");
  });
});
