/**
 * GRIDA-SEC-004 — BYOK provider resolver (in-package providers layer).
 *
 * Picks the active provider for an agent run and returns a runnable
 * `ModelFactory`. Resolution is a node-only, in-process concern: it reads
 * the package-owned `SecretsStore` (credentials never cross IPC, per the
 * secrets threat model) and never calls the model itself — it only builds
 * the factory, so it's cheap on the hot path and easy to test.
 *
 * This is the providers layer, not a generic model-provider router. V1 is
 * BYOK-only: OpenRouter takes precedence over Vercel, and a missing
 * key throws `ProviderUnavailableError`.
 */

import { TIER_MODEL_IDS, type TierModelId } from "@grida/ai-models";
import type { ModelFactory } from "../agent";
import type { ModelTier } from "../tiers";
import type { SecretsStore } from "../secrets";
import {
  BYOK_PROVIDER_METADATA,
  type ByokProviderId,
} from "../protocol/provider-ids";
import { makeOpenRouterFactory, makeVercelFactory } from "./byok";

/** Canonical tier->catalog-model map. One table, sourced from @grida/ai-models. */
export const MODEL_BY_TIER: Record<ModelTier, TierModelId> = TIER_MODEL_IDS;

export type ResolvedProvider = {
  provider_id: ByokProviderId;
  kind: "byok";
  model_factory: ModelFactory;
};

/**
 * Single error class for both "no provider configured" and "you picked
 * provider X but no key is set" paths. The route maps `providerId` being
 * present to a 4xx with the picked-id surfaced in the body.
 */
export class ProviderUnavailableError extends Error {
  readonly code = "provider_down" as const;
  constructor(public readonly provider_id?: string) {
    super(
      provider_id
        ? `[agent-host-providers] explicit BYOK provider not available: ${provider_id}`
        : "[agent-host-providers] no BYOK provider available"
    );
    this.name = "ProviderUnavailableError";
  }
}

export type ResolveDeps = {
  secrets: SecretsStore;
};

export type ResolveOptions = {
  /**
   * Optional caller override. If set, precedence is skipped and only the
   * named BYOK provider is checked.
   */
  explicit?: ByokProviderId;
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
      return makeResolvedProvider(provider.id, key);
    }
  }

  throw new ProviderUnavailableError();
}

async function resolveExplicit(
  providerId: ByokProviderId,
  deps: ResolveDeps
): Promise<ResolvedProvider> {
  const key = await deps.secrets._getKey(providerId);
  if (!key) throw new ProviderUnavailableError(providerId);
  return makeResolvedProvider(providerId, key);
}

function makeResolvedProvider(
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
