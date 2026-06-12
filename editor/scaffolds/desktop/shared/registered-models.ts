/**
 * Registered (endpoint) models in the desktop renderer — issue #806.
 *
 * One fetch surface + pure resolution helpers shared by the model
 * picker, the capability gates (multimodal / tool_call), and the context
 * meter, so every consumer resolves a model id the same way: static
 * catalog ∪ user-registered endpoint models via
 * `models.text.registry.resolve`.
 */

"use client";

import { useEffect, useState } from "react";
import _models from "@grida/ai-models";
import {
  providers,
  type EndpointModelSpec,
  type EndpointProviderConfig,
} from "@/lib/desktop/bridge";

export namespace registered_models {
  /** Flatten endpoint configs into the registry's custom-spec list. */
  export function specs(
    endpoints: readonly EndpointProviderConfig[]
  ): EndpointModelSpec[] {
    return endpoints.flatMap((endpoint) => endpoint.models);
  }

  /** Resolve a model id over catalog ∪ registered (normalized defaults). */
  export function resolve(
    modelId: string,
    endpoints: readonly EndpointProviderConfig[]
  ): _models.text.registry.ResolvedModelSpec | undefined {
    return _models.text.registry.resolve(modelId, specs(endpoints));
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
