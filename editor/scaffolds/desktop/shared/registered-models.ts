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
import {
  byokProvidersFor,
  resolveEndpointModels,
  type ByokProviderId,
} from "@grida/agent";
import {
  providers,
  secrets,
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
    endpoints: readonly EndpointProviderConfig[],
    providerId?: string
  ): _models.text.registry.ResolvedModelSpec | undefined {
    // An explicit endpoint provider owns only its own registered metadata.
    // An explicit native/BYOK/Grida provider must never inherit capabilities
    // from an unrelated endpoint whose model id happens to collide.
    const endpoint = providerId
      ? endpoints.find((candidate) => candidate.id === providerId)
      : undefined;
    const custom = endpoint
      ? resolveEndpointModels(endpoint).find((spec) => spec.id === modelId)
      : providerId
        ? undefined
        : specs(endpoints).find((spec) => spec.id === modelId);
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
 * The configured endpoint providers. `[]` while loading, outside the desktop
 * renderer, or on an old binary without the bridge surface — every consumer
 * degrades to catalog-only behavior. Settings has a separate BrowserWindow,
 * so the list is refreshed when this window becomes active again.
 */
export function useEndpointProviders(): EndpointProviderConfig[] {
  const [endpoints, setEndpoints] = useState<EndpointProviderConfig[]>([]);
  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    if (!providers.isSupported()) return;
    const load = () => {
      const requestGeneration = ++generation;
      providers
        .listEndpoints()
        .then((list) => {
          if (!cancelled && requestGeneration === generation) {
            setEndpoints(list);
          }
        })
        .catch(() => {
          // Endpoint config is additive — a failed fetch keeps the last-known
          // list and never blocks the chat.
        });
    };
    const loadWhenVisible = () => {
      if (document.visibilityState === "visible") load();
    };

    load();
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", loadWhenVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", loadWhenVisible);
    };
  }, []);
  return endpoints;
}

/**
 * GRIDA-SEC-004 — renderer-safe BYOK availability for the text picker.
 * The bridge exposes only key presence, never key material. Upstream
 * reachability is intentionally not guessed here.
 */
export function useConfiguredTextByokProviderIds(): ByokProviderId[] {
  const [configured, setConfigured] = useState<ByokProviderId[]>([]);
  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    const textProviders = byokProvidersFor("text");
    const load = () => {
      const requestGeneration = ++generation;
      void Promise.all(
        textProviders.map(async (provider) => ({
          id: provider.id,
          configured: await secrets.hasKey(provider.id).catch(() => false),
        }))
      ).then((statuses) => {
        if (cancelled || requestGeneration !== generation) return;
        setConfigured(
          statuses
            .filter((status) => status.configured)
            .map((status) => status.id)
        );
      });
    };
    const loadWhenVisible = () => {
      if (document.visibilityState === "visible") load();
    };

    load();
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", loadWhenVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", loadWhenVisible);
    };
  }, []);
  return configured;
}
