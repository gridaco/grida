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
import { isByokProviderId } from "./provider-ids";

/** A model spec consumable by the open registry — `@grida/ai-models`'
 *  custom spec (cost optional, capability flags explicit). This is the
 *  RESOLVED shape; the stored shape is {@link EndpointModelEntry}. */
export type EndpointModelSpec = models.text.registry.CustomModelSpec;

/**
 * Sticky human corrections for a model entry. Detection refresh NEVER
 * writes these — they exist for the "the endpoint reports a wrong value"
 * case and are set by hand-editing `endpoints.json` (or by the settings
 * inputs shown when detection has nothing). Resolution order:
 * override → detected → registry default.
 */
export type EndpointModelOverrides = Pick<
  EndpointModelSpec,
  "contextWindow" | "tool_call" | "multimodal"
>;

/**
 * A model as STORED on an endpoint config. The top-level capability
 * fields (`tool_call`, `contextWindow`, `multimodal`) are
 * detection-owned: probe refresh overwrites them freely. Human
 * corrections live in {@link EndpointModelOverrides} so a refresh can
 * never clobber them. Resolve with {@link resolveEndpointModel} before
 * feeding the registry.
 */
export type EndpointModelEntry = EndpointModelSpec & {
  overrides?: EndpointModelOverrides;
};

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
  /** Models this endpoint serves. */
  models: EndpointModelEntry[];
  /**
   * The model every tier resolves to when a run doesn't pick an explicit
   * model (the agent's tier→catalog map is meaningless to a local
   * endpoint — background subagents like the titler/compactor must land
   * on a model this endpoint actually serves). Defaults to `models[0]`.
   */
  default_model_id?: string;
};

/** Apply {@link EndpointModelOverrides} onto the detected fields —
 *  override → detected (→ registry default downstream). */
export function resolveEndpointModel(
  entry: EndpointModelEntry
): EndpointModelSpec {
  const { overrides, ...detected } = entry;
  return {
    ...detected,
    contextWindow: overrides?.contextWindow ?? detected.contextWindow,
    tool_call: overrides?.tool_call ?? detected.tool_call,
    multimodal: overrides?.multimodal ?? detected.multimodal,
  };
}

/** All of an endpoint's models, override-resolved — the custom half of
 *  the model-registry seam. */
export function resolveEndpointModels(
  config: EndpointProviderConfig
): EndpointModelSpec[] {
  return config.models.map(resolveEndpointModel);
}

/**
 * The model a model_id-less run on this endpoint executes — explicit
 * `default_model_id`, falling back to the first registered model. THE
 * one source of the default-model rule: the provider factory and the
 * runtime's limits resolution must agree on it, or compaction limits get
 * computed for a different model than the one that actually runs.
 * `undefined` ⇔ the endpoint has no models and is not resolvable.
 */
export function endpointDefaultModelId(
  config: EndpointProviderConfig
): string | undefined {
  return config.default_model_id ?? config.models[0]?.id;
}

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
 * REPORTS: Ollama's `/api/tags` exposes ids + capability tags,
 * `/api/ps` / `/api/show` expose the context window; a generic
 * OpenAI-compatible `/models` exposes ids only.
 */
export type ProbedEndpointModel = {
  id: string;
  /** Whether the endpoint reports native tool-calling support. Absent
   *  when the endpoint doesn't expose capabilities. */
  tool_call?: boolean;
  /**
   * Context window in tokens, when the endpoint reports one. For a
   * LOADED Ollama model this is the server's actual allocation
   * (`/api/ps` `context_length`); otherwise the model's maximum
   * (`/api/show` `model_info`). Absent when neither reports.
   */
  contextWindow?: number;
};

export type ProbeMergeResult = {
  models: EndpointModelEntry[];
  /** Count of models the probe found that the config didn't know
   *  (appended at the end, detection fields prefilled). */
  discovered: number;
  /** Count of existing entries whose detected fields changed. */
  updated: number;
};

/**
 * Apply a probe result onto an endpoint's stored models — the executable
 * form of the detection-owned contract on {@link EndpointModelEntry}:
 * probed values overwrite the top-level detected fields (a silent probe —
 * e.g. an ids-only gateway — keeps the previous detection), `overrides`
 * are NEVER written, and models the probe discovered are appended.
 * Pure; shared by every surface that refreshes detection.
 */
export function mergeProbedModels(
  models: readonly EndpointModelEntry[],
  probed: readonly ProbedEndpointModel[]
): ProbeMergeResult {
  const probedById = new Map(probed.map((m) => [m.id, m]));
  let updated = 0;
  const refreshed = models.map((m): EndpointModelEntry => {
    const p = probedById.get(m.id);
    if (!p) return m;
    const next: EndpointModelEntry = {
      ...m,
      tool_call: p.tool_call ?? m.tool_call,
      contextWindow: p.contextWindow ?? m.contextWindow,
    };
    if (
      next.contextWindow !== m.contextWindow ||
      next.tool_call !== m.tool_call
    ) {
      updated += 1;
    }
    return next;
  });
  const known = new Set(models.map((m) => m.id));
  const discovered = probed
    .filter((m) => !known.has(m.id))
    .map(
      (m): EndpointModelEntry => ({
        id: m.id,
        tool_call: m.tool_call,
        contextWindow: m.contextWindow,
      })
    );
  return {
    models: [...refreshed, ...discovered],
    discovered: discovered.length,
    updated,
  };
}

/**
 * Endpoint ids: short lowercase slugs. Must not collide with the BYOK
 * provider ids — both share the provider-id namespace on sessions,
 * run options, and the secrets store.
 */
const ENDPOINT_PROVIDER_ID_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export function isValidEndpointProviderId(id: string): boolean {
  return ENDPOINT_PROVIDER_ID_PATTERN.test(id) && !isByokProviderId(id);
}

/** Narrow + pin an endpoint base URL: http(s) only. Shared by the config
 *  validator and the probe so the two boundaries can't drift. `base_url`
 *  is the TRIMMED input string (whitespace padding would survive `new
 *  URL` parsing yet break the string-concatenated request base later) —
 *  but never `url.href`, no other normalization surprises. */
export function parseEndpointBaseUrl(
  raw: unknown
): { ok: true; base_url: string; url: URL } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.length > MAX_BASE_URL_LEN) {
    return { ok: false, error: "base_url must be a string" };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "base_url must be a valid URL" };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "base_url must be a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "base_url must be http(s)" };
  }
  return { ok: true, base_url: trimmed, url };
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

  const baseUrl = parseEndpointBaseUrl(c.base_url);
  if (!baseUrl.ok) return baseUrl;

  if (!Array.isArray(c.models) || c.models.length > MAX_MODELS) {
    return { ok: false, error: `models must be an array of ≤ ${MAX_MODELS}` };
  }
  const modelSpecs: EndpointModelEntry[] = [];
  const seen = new Set<string>();
  for (const m of c.models) {
    const validated = validateModelEntry(m);
    if (!validated.ok) return validated;
    if (seen.has(validated.entry.id)) {
      return { ok: false, error: `duplicate model id: ${validated.entry.id}` };
    }
    seen.add(validated.entry.id);
    modelSpecs.push(validated.entry);
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
      base_url: baseUrl.base_url,
      models: modelSpecs,
      default_model_id: defaultModelId,
    },
  };
}

type ModelEntryValidation =
  | { ok: true; entry: EndpointModelEntry }
  | { ok: false; error: string };

function validateModelEntry(raw: unknown): ModelEntryValidation {
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
  const flags = validateCapabilityFields(m, "model");
  if (!flags.ok) return flags;

  let overrides: EndpointModelOverrides | undefined;
  if (m.overrides !== undefined) {
    if (
      !m.overrides ||
      typeof m.overrides !== "object" ||
      Array.isArray(m.overrides)
    ) {
      return { ok: false, error: "model overrides must be an object" };
    }
    const o = m.overrides as Record<string, unknown>;
    // Overrides carry only the detection-owned fields — no `outputLimit`.
    const oFlags = validateCapabilityFields(o, "model overrides", [
      "contextWindow",
    ]);
    if (!oFlags.ok) return oFlags;
    overrides = {
      multimodal: o.multimodal as boolean | undefined,
      tool_call: o.tool_call as boolean | undefined,
      contextWindow: o.contextWindow as number | undefined,
    };
    if (Object.values(overrides).every((v) => v === undefined)) {
      overrides = undefined;
    }
  }

  return {
    ok: true,
    entry: {
      id: m.id,
      label: typeof m.label === "string" && m.label ? m.label : undefined,
      multimodal: m.multimodal as boolean | undefined,
      tool_call: m.tool_call as boolean | undefined,
      contextWindow: m.contextWindow as number | undefined,
      outputLimit: m.outputLimit as number | undefined,
      overrides,
      // cost is intentionally not accepted from config input: a local/
      // self-hosted model is unmetered on this rail, and a user-supplied
      // price card would feed cost UI with invented numbers.
    },
  };
}

function validateCapabilityFields(
  source: Record<string, unknown>,
  scope: string,
  limits: readonly ("contextWindow" | "outputLimit")[] = [
    "contextWindow",
    "outputLimit",
  ]
): { ok: true } | { ok: false; error: string } {
  for (const flag of ["multimodal", "tool_call"] as const) {
    if (source[flag] !== undefined && typeof source[flag] !== "boolean") {
      return { ok: false, error: `${scope} ${flag} must be a boolean` };
    }
  }
  for (const limit of limits) {
    const value = source[limit];
    if (value === undefined) continue;
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value <= 0 ||
      value > MAX_TOKEN_LIMIT
    ) {
      return {
        ok: false,
        error: `${scope} ${limit} must be a positive integer`,
      };
    }
  }
  return { ok: true };
}
