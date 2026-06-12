/**
 * Custom OpenAI-compatible endpoint providers (issue #806 — local LLMs).
 *
 * Client-safe identity + config contract for user-configured endpoints.
 * Local **Ollama** is the flagship preset; any OpenAI-compatible gateway
 * (LiteLLM, vLLM, an Azure-compatible proxy, …) fits the same shape. This
 * is the package's ONE generalized endpoint-provider type — presets
 * instantiate it; we deliberately do not grow an opencode-style
 * config-declared provider registry (anti-goal: not a general
 * model-provider router).
 *
 * An endpoint config is **plain config, not a secret**: a base URL plus
 * the models the user registered for it. When a gateway needs an API key,
 * the key lives in the `SecretsStore` under the endpoint's id (same
 * presence/set/delete-only discipline as BYOK keys, GRIDA-SEC-003/004) —
 * never inside this config, so the config can ride readable storage,
 * routes, and the renderer bridge.
 */

import type { models } from "@grida/ai-models";
import { BYOK_PROVIDER_IDS } from "./provider-ids";

/** A model registered on an endpoint — `@grida/ai-models`' open-registry
 *  custom spec (cost optional, capability flags explicit). */
export type EndpointModelSpec = models.text.registry.CustomModelSpec;

/**
 * A user-configured OpenAI-compatible endpoint provider.
 *
 * Resolvable (usable for a run) only when `models` is non-empty — an
 * endpoint saved with just a base URL is valid config but not a provider
 * the resolver will pick.
 */
export type EndpointProviderConfig = {
  /** Stable id (`ollama`, `litellm`, …). See {@link ENDPOINT_PROVIDER_ID_PATTERN}. */
  id: string;
  /** Display label. Falls back to the id. */
  label?: string;
  /** OpenAI-compatible base URL, e.g. `http://localhost:11434/v1`. */
  base_url: string;
  /** Models this endpoint serves, as registered by the user. */
  models: EndpointModelSpec[];
  /**
   * The model every tier resolves to when a run doesn't pick an explicit
   * model (the agent's tier→catalog map is meaningless to a local
   * endpoint — background subagents like the titler/compactor must land
   * on a model this endpoint actually serves). Defaults to `models[0]`.
   */
  default_model_id?: string;
};

/**
 * The Ollama preset — the "no signup, no key" path. `ollama serve`
 * exposes an OpenAI-compatible API at this base URL; no API key exists
 * or is sent.
 */
export const OLLAMA_ENDPOINT_PRESET = {
  id: "ollama",
  label: "Ollama",
  base_url: "http://localhost:11434/v1",
} as const;

/**
 * A model discovered by probing an endpoint (issue #806 — `POST
 * /providers/endpoints/probe`). Carries only what the endpoint actually
 * REPORTS: Ollama's `/api/tags` exposes ids + capability tags; a generic
 * OpenAI-compatible `/models` exposes ids only. Deliberately NO
 * `contextWindow`: Ollama reports a model's architectural maximum, not
 * the window the server actually serves — auto-filling the max would
 * overflow sessions, so that field stays user-set with a safe default.
 */
export type ProbedEndpointModel = {
  id: string;
  /** Whether the endpoint reports native tool-calling support. Absent
   *  when the endpoint doesn't expose capabilities. */
  tool_call?: boolean;
};

/**
 * Endpoint ids: short lowercase slugs. Must not collide with the BYOK
 * provider ids — both share the provider-id namespace on sessions,
 * run options, and the secrets store.
 */
export const ENDPOINT_PROVIDER_ID_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export function isValidEndpointProviderId(id: string): boolean {
  return (
    ENDPOINT_PROVIDER_ID_PATTERN.test(id) &&
    !(BYOK_PROVIDER_IDS as readonly string[]).includes(id)
  );
}

/** Bounds that keep a config a config (not an unbounded blob). */
const MAX_MODELS = 64;
const MAX_MODEL_ID_LEN = 128;
const MAX_LABEL_LEN = 64;
const MAX_BASE_URL_LEN = 2048;
const MAX_TOKEN_LIMIT = 100_000_000;

export type EndpointConfigValidation =
  | { ok: true; config: EndpointProviderConfig }
  | { ok: false; error: string };

/**
 * Narrow an untrusted value to an {@link EndpointProviderConfig}.
 *
 * Shared by the store (load-time hygiene) and the HTTP route (write-time
 * 400s), so a config that persisted always re-validates. Returns a fresh
 * object holding only known fields — unknown keys are dropped, never
 * round-tripped.
 */
export function validateEndpointProviderConfig(
  raw: unknown
): EndpointConfigValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "config must be an object" };
  }
  const c = raw as Record<string, unknown>;

  if (typeof c.id !== "string" || !isValidEndpointProviderId(c.id)) {
    return {
      ok: false,
      error:
        "id must be a short lowercase slug and must not collide with a BYOK provider id",
    };
  }

  if (
    c.label !== undefined &&
    (typeof c.label !== "string" || c.label.length > MAX_LABEL_LEN)
  ) {
    return { ok: false, error: `label must be a string ≤ ${MAX_LABEL_LEN}` };
  }

  if (typeof c.base_url !== "string" || c.base_url.length > MAX_BASE_URL_LEN) {
    return { ok: false, error: "base_url must be a string" };
  }
  let url: URL;
  try {
    url = new URL(c.base_url);
  } catch {
    return { ok: false, error: "base_url must be a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "base_url must be http(s)" };
  }

  if (!Array.isArray(c.models) || c.models.length > MAX_MODELS) {
    return { ok: false, error: `models must be an array of ≤ ${MAX_MODELS}` };
  }
  const modelSpecs: EndpointModelSpec[] = [];
  const seen = new Set<string>();
  for (const m of c.models) {
    const validated = validateModelSpec(m);
    if (!validated.ok) return validated;
    if (seen.has(validated.spec.id)) {
      return { ok: false, error: `duplicate model id: ${validated.spec.id}` };
    }
    seen.add(validated.spec.id);
    modelSpecs.push(validated.spec);
  }

  let defaultModelId: string | undefined;
  if (c.default_model_id !== undefined) {
    if (
      typeof c.default_model_id !== "string" ||
      !seen.has(c.default_model_id)
    ) {
      return {
        ok: false,
        error: "default_model_id must name one of the registered models",
      };
    }
    defaultModelId = c.default_model_id;
  }

  return {
    ok: true,
    config: {
      id: c.id,
      label: typeof c.label === "string" && c.label ? c.label : undefined,
      base_url: c.base_url,
      models: modelSpecs,
      default_model_id: defaultModelId,
    },
  };
}

type ModelSpecValidation =
  | { ok: true; spec: EndpointModelSpec }
  | { ok: false; error: string };

function validateModelSpec(raw: unknown): ModelSpecValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "model must be an object" };
  }
  const m = raw as Record<string, unknown>;
  if (
    typeof m.id !== "string" ||
    m.id.length === 0 ||
    m.id.length > MAX_MODEL_ID_LEN
  ) {
    return {
      ok: false,
      error: `model id must be a non-empty string ≤ ${MAX_MODEL_ID_LEN}`,
    };
  }
  if (
    m.label !== undefined &&
    (typeof m.label !== "string" || m.label.length > MAX_LABEL_LEN)
  ) {
    return {
      ok: false,
      error: `model label must be a string ≤ ${MAX_LABEL_LEN}`,
    };
  }
  for (const flag of ["multimodal", "tool_call"] as const) {
    if (m[flag] !== undefined && typeof m[flag] !== "boolean") {
      return { ok: false, error: `model ${flag} must be a boolean` };
    }
  }
  for (const limit of ["contextWindow", "outputLimit"] as const) {
    const value = m[limit];
    if (value === undefined) continue;
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value <= 0 ||
      value > MAX_TOKEN_LIMIT
    ) {
      return { ok: false, error: `model ${limit} must be a positive integer` };
    }
  }
  return {
    ok: true,
    spec: {
      id: m.id,
      label: typeof m.label === "string" && m.label ? m.label : undefined,
      multimodal: m.multimodal as boolean | undefined,
      tool_call: m.tool_call as boolean | undefined,
      contextWindow: m.contextWindow as number | undefined,
      outputLimit: m.outputLimit as number | undefined,
      // cost is intentionally not accepted from config input: a local/
      // self-hosted model is unmetered on this rail, and a user-supplied
      // price card would feed cost UI with invented numbers.
    },
  };
}
