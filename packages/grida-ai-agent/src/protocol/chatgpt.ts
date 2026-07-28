/**
 * GRIDA-SEC-008 — client-safe native-provider identity and status vocabulary.
 *
 * Client-safe identity and status vocabulary for the native ChatGPT
 * subscription provider.
 *
 * This provider is a model provider: Grida owns the loop, tools, sessions,
 * and persistence. It is deliberately unrelated to the external-agent/ACP
 * provider class.
 */

export const CHATGPT_PROVIDER_ID = "chatgpt" as const;

export const CHATGPT_PROVIDER_METADATA = {
  id: CHATGPT_PROVIDER_ID,
  label: "ChatGPT",
  modalities: ["text"],
} as const;

/**
 * The closed Grida catalog projection supported by the ChatGPT subscription
 * adapter. Session and picker ids stay namespaced; the server-only adapter
 * maps them to the backend's bare wire names.
 */
export const CHATGPT_SUBSCRIPTION_MODEL_IDS = [
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "openai/gpt-5.5",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
] as const;

export type ChatGptSubscriptionModelId =
  (typeof CHATGPT_SUBSCRIPTION_MODEL_IDS)[number];

/** Renderer-safe labels for the closed subscription model vocabulary. */
export const CHATGPT_SUBSCRIPTION_MODEL_METADATA = {
  "openai/gpt-5.6-sol": { label: "GPT-5.6 Sol" },
  "openai/gpt-5.6-terra": { label: "GPT-5.6 Terra" },
  "openai/gpt-5.6-luna": { label: "GPT-5.6 Luna" },
  "openai/gpt-5.5": { label: "GPT-5.5" },
  "openai/gpt-5.4": { label: "GPT-5.4" },
  "openai/gpt-5.4-mini": { label: "GPT-5.4 Mini" },
} as const satisfies Record<
  ChatGptSubscriptionModelId,
  Readonly<{ label: string }>
>;

export function isChatGptSubscriptionModelId(
  id: string
): id is ChatGptSubscriptionModelId {
  return (CHATGPT_SUBSCRIPTION_MODEL_IDS as readonly string[]).includes(id);
}

export function isChatGptProviderId(
  id: string
): id is typeof CHATGPT_PROVIDER_ID {
  return id === CHATGPT_PROVIDER_ID;
}

export type ChatGptSubscriptionAccount = {
  id?: string;
  email?: string;
  plan?: string;
};

/**
 * Secret-free status safe to return to a renderer.
 *
 * `signed_in` means a refreshable OAuth record exists. `ready` additionally
 * means it contains the account identity required by subscription inference.
 * No access token, refresh token, authorization code, or PKCE material can
 * appear in this shape.
 */
export type ChatGptSubscriptionStatus = {
  configured: boolean;
  signed_in: boolean;
  ready: boolean;
  signing_in: boolean;
  /** Access-token expiry as epoch milliseconds. */
  expires_at?: number;
  account?: ChatGptSubscriptionAccount;
};
