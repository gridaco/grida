/**
 * Registered (endpoint) models in the desktop renderer — issue #806.
 *
 * One fetch surface + pure resolution helpers shared by the model
 * picker, exact model capability gates, and the context
 * meter, so every consumer resolves a model id the same way: static
 * catalog ∪ user-registered endpoint models via
 * `models.text.registry.resolve`.
 */

"use client";

import { useEffect, useState } from "react";
import _models from "@grida/ai-models";
import { resolveEndpointModels } from "@grida/agent";
import {
  providers,
  type EndpointModelSpec,
  type EndpointProviderConfig,
} from "@/lib/desktop/bridge";

export namespace registered_models {
  /** Flatten endpoint configs into the registry's custom-spec list —
   *  OVERRIDE-RESOLVED, mirroring the host's `registeredModels()`. */
  export function specs(
    endpoints: readonly EndpointProviderConfig[]
  ): EndpointModelSpec[] {
    return endpoints.flatMap((endpoint) => resolveEndpointModels(endpoint));
  }

  /** Resolve a model id over catalog ∪ registered (normalized defaults). */
  export function resolve(
    modelId: string,
    endpoints: readonly EndpointProviderConfig[]
  ): _models.text.registry.ResolvedModelSpec | undefined {
    // A registered endpoint wins the same id collision because sends pin that
    // endpoint through `providerIdForModel` below. Resolving the static catalog
    // first would pair endpoint execution with unrelated catalog capabilities.
    const custom = specs(endpoints).find((spec) => spec.id === modelId);
    return custom
      ? _models.text.registry.normalize(custom)
      : _models.text.registry.resolve(modelId, []);
  }

  /**
   * The endpoint provider id serving `modelId`, or `undefined` for
   * catalog models. Rides each send as `provider_id` so an explicit
   * local-model pick can't be swallowed by the BYOK-first cascade (a
   * stored OpenRouter key cannot serve `llama3.1:8b`).
   */
  export function providerIdForModel(
    modelId: string,
    endpoints: readonly EndpointProviderConfig[]
  ): string | undefined {
    return endpoints.find((endpoint) =>
      endpoint.models.some((m) => m.id === modelId)
    )?.id;
  }
}

/**
 * The configured endpoint providers, fetched once per mount. `[]` while
 * loading, outside the desktop renderer, or on an old binary without the
 * bridge surface — every consumer degrades to catalog-only behavior.
 */
export function useEndpointProviders(): EndpointProviderConfig[] {
  const [endpoints, setEndpoints] = useState<EndpointProviderConfig[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!providers.isSupported()) return;
    providers
      .listEndpoints()
      .then((list) => {
        if (!cancelled) setEndpoints(list);
      })
      .catch(() => {
        // Endpoint config is additive — a failed fetch degrades to
        // catalog-only models, never blocks the chat.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return endpoints;
}
