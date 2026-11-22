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

/** Native-host ceremony response; contains no access or refresh credential. */
export type ChatGptAuthStart = {
  attempt_id: string;
  state: string;
  authorization_url: string;
};

/**
 * Bundled ChatGPT subscription seed for clients without a newer snapshot.
 * Session IDs use the canonical model and execution uses the agent selector.
 */
/* generated:chatgpt-subscription:start */
// Bundled selectors from agents.json and canonical text cards: @grida/ai-models@2.20261121.1.
export const CHATGPT_SUBSCRIPTION_MODEL_IDS = [
  "openai/gpt-6.2-sol",
  "openai/gpt-5.6-luna",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-6-astra",
  "openai/gpt-6-luna",
  "openai/gpt-6-sol",
  "openai/gpt-6.1-sol",
  "openai/gpt-6.1-terra",
  "openai/gpt-6.2-astra",
] as const;
export const CHATGPT_SUBSCRIPTION_DEFAULT_MODEL_ID =
  "openai/gpt-6.2-sol" as const;
// Retained only for reading saved selections; these IDs grant no execution.
export const CHATGPT_SUBSCRIPTION_RETIRED_MODEL_IDS = [
  "openai/gpt-5.5",
  "openai/gpt-5.4",
] as const;
export const CHATGPT_SUBSCRIPTION_MODEL_METADATA = {
  "openai/gpt-5.6-luna": {
    label: "GPT-5.6 Luna",
    context_window: 1050000,
    image_input: true,
  },
  "openai/gpt-5.6-sol": {
    label: "GPT-5.6 Sol",
    context_window: 1050000,
    image_input: true,
  },
  "openai/gpt-5.6-terra": {
    label: "GPT-5.6 Terra",
    context_window: 1050000,
    image_input: true,
  },
  "openai/gpt-6-astra": {
    label: "GPT-6 Astra",
    context_window: 1050000,
    image_input: true,
  },
  "openai/gpt-6-luna": {
    label: "GPT-6 Luna",
    context_window: 1050000,
    image_input: true,
  },
  "openai/gpt-6-sol": {
    label: "GPT-6 Sol",
    context_window: 1050000,
    image_input: true,
  },
  "openai/gpt-6.1-sol": {
    label: "GPT-6.1 Sol",
    context_window: 1050000,
    image_input: true,
  },
  "openai/gpt-6.1-terra": {
    label: "GPT-6.1 Terra",
    context_window: 1050000,
    image_input: true,
  },
  "openai/gpt-6.2-astra": {
    label: "GPT-6.2 Astra",
    context_window: 1050000,
    image_input: true,
  },
  "openai/gpt-6.2-sol": {
    label: "GPT-6.2 Sol",
    context_window: 1050000,
    image_input: true,
  },
} as const;
export const CHATGPT_SUBSCRIPTION_WIRE_MODEL_BY_ID = {
  "openai/gpt-5.6-luna": "gpt-5.6-luna",
  "openai/gpt-5.6-sol": "gpt-5.6-sol",
  "openai/gpt-5.6-terra": "gpt-5.6-terra",
  "openai/gpt-6-astra": "gpt-6-astra",
  "openai/gpt-6-luna": "gpt-6-luna",
  "openai/gpt-6-sol": "gpt-6-sol",
  "openai/gpt-6.1-sol": "gpt-6.1-sol",
  "openai/gpt-6.1-terra": "gpt-6.1-terra",
  "openai/gpt-6.2-astra": "gpt-6.2-astra",
  "openai/gpt-6.2-sol": "gpt-6.2-sol",
} as const;
/* generated:chatgpt-subscription:end */

export type ChatGptSubscriptionModelId =
  (typeof CHATGPT_SUBSCRIPTION_MODEL_IDS)[number];

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

/** Current optional turn features on one captured subscription model. Standard
 * inference works independently of discovery. No account identity is exposed. */
export type ChatGptTurnCapabilities = Readonly<{
  status:
    | "available"
    | "unsupported"
    | "unavailable"
    | "reauthenticationRequired";
  speeds: readonly ("fast" | "ultrafast")[];
  webSearch: boolean;
}>;

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
