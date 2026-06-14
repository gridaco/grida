/**
 * GRIDA-SEC-004 — provider resolver (in-package providers layer).
 *
 * Picks the active provider for an agent run and returns a runnable
 * `ModelFactory`. Resolution is a node-only, in-process concern: it reads
 * the package-owned `SecretsStore` (credentials never cross IPC, per the
 * secrets threat model) and never calls the model itself — it only builds
 * the factory, so it's cheap on the hot path and easy to test.
 *
 * This is the providers layer, not a generic model-provider router. Two
 * provider kinds exist:
 *
 *   - `byok` — the hardcoded third-party slots (OpenRouter, Vercel),
 *     keyed by a stored secret.
 *   - `endpoint` — ONE generalized OpenAI-compatible endpoint type
 *     (issue #806): user-configured `{base_url, models[]}` with an
 *     OPTIONAL key. Ollama is the preset; a missing key is not an error.
 *
 * Precedence: BYOK keys first (in metadata order), then configured
 * endpoints that have at least one registered model. A configured-but-
 * empty endpoint is not resolvable. Explicit picks skip precedence.
 */

import { TIER_MODEL_IDS, type TierModelId } from "@grida/ai-models";
import type { ModelFactory } from "../agent";
import type { ModelTier } from "../tiers";
import type { SecretsStore } from "../secrets";
import {
  BYOK_PROVIDER_METADATA,
  isByokProviderId,
  type ByokProviderId,
} from "../protocol/provider-ids";
import {
  endpointDefaultModelId,
  type EndpointProviderConfig,
} from "../protocol/endpoints";
import type { EndpointProvidersStore } from "./endpoints";
import {
  makeEndpointFactory,
  makeOpenRouterFactory,
  makeVercelFactory,
} from "./byok";

export { EndpointProvidersStore } from "./endpoints";

/** Canonical tier->catalog-model map. One table, sourced from @grida/ai-models. */
export const MODEL_BY_TIER: Record<ModelTier, TierModelId> = TIER_MODEL_IDS;

export type ResolvedProvider = {
  /** A BYOK provider id or a configured endpoint id. */
  provider_id: string;
  kind: "byok" | "endpoint";
  model_factory: ModelFactory;
};

/**
 * Single error class for both "no provider configured" and "you picked
 * provider X but it isn't available" paths. The route maps `providerId`
 * being present to a 4xx with the picked-id surfaced in the body.
 */
export class ProviderUnavailableError extends Error {
  readonly code = "provider_down" as const;
  constructor(public readonly provider_id?: string) {
    super(
      provider_id
        ? `[agent-host-providers] explicit provider not available: ${provider_id}`
        : "[agent-host-providers] no provider available"
    );
    this.name = "ProviderUnavailableError";
  }
}

export type ResolveDeps = {
  secrets: SecretsStore;
  /** Endpoint provider configs. Optional so key-only hosts/tests need not
   *  wire a store; absent ⇒ no endpoint providers resolve. */
  endpoints?: EndpointProvidersStore;
};

export type ResolveOptions = {
  /**
   * Optional caller override. If set, precedence is skipped and only the
   * named provider (BYOK or endpoint) is checked.
   */
  explicit?: string;
};

export async function resolveProvider(
  deps: ResolveDeps,
  options: ResolveOptions = {}
): Promise<ResolvedProvider> {
  if (options.explicit) {
    return await resolveExplicit(options.explicit, deps);
  }

  for (const provider of BYOK_PROVIDER_METADATA) {
    const key = await deps.secrets._getKey(provider.id);
    if (key) {
      return makeResolvedByok(provider.id, key);
    }
  }

  if (deps.endpoints) {
    for (const endpoint of await deps.endpoints.list()) {
      const resolved = await maybeResolveEndpoint(endpoint, deps);
      if (resolved) return resolved;
    }
  }

  throw new ProviderUnavailableError();
}

async function resolveExplicit(
  providerId: string,
  deps: ResolveDeps
): Promise<ResolvedProvider> {
  if (isByokProviderId(providerId)) {
    const key = await deps.secrets._getKey(providerId);
    if (!key) throw new ProviderUnavailableError(providerId);
    return makeResolvedByok(providerId, key);
  }
  const endpoint = await deps.endpoints?.get(providerId);
  const resolved = endpoint && (await maybeResolveEndpoint(endpoint, deps));
  if (!resolved) throw new ProviderUnavailableError(providerId);
  return resolved;
}

function makeResolvedByok(
  providerId: ByokProviderId,
  key: string
): ResolvedProvider {
  switch (providerId) {
    case "openrouter":
      return {
        provider_id: providerId,
        kind: "byok",
        model_factory: makeOpenRouterFactory(key.trim()),
      };
    case "vercel":
      return {
        provider_id: providerId,
        kind: "byok",
        model_factory: makeVercelFactory(key.trim()),
      };
  }
  const _exhaustive: never = providerId;
  throw new ProviderUnavailableError(_exhaustive);
}

/**
 * An endpoint resolves only when it has a model to run (the default
 * model: explicit `default_model_id` or the first registered). The key is
 * looked up under the endpoint's id and is optional by design — Ollama
 * has no key, a self-hosted gateway may.
 */
async function maybeResolveEndpoint(
  endpoint: EndpointProviderConfig,
  deps: ResolveDeps
): Promise<ResolvedProvider | null> {
  const defaultModelId = endpointDefaultModelId(endpoint);
  if (!defaultModelId) return null;
  const key = await deps.secrets._getKey(endpoint.id);
  return {
    provider_id: endpoint.id,
    kind: "endpoint",
    model_factory: makeEndpointFactory({
      id: endpoint.id,
      base_url: endpoint.base_url,
      api_key: key?.trim() || undefined,
      default_model_id: defaultModelId,
    }),
  };
}
