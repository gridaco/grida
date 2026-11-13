/**
 * Text-model availability for the welcome composer's model picker —
 * configured endpoint providers (issue #806) and BYOK key presence.
 */

"use client";

import { useEffect, useState } from "react";
import { byokProvidersFor, type ByokProviderId } from "@grida/agent";
import {
  providers,
  secrets,
  type EndpointProviderConfig,
} from "@/lib/desktop/bridge";

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
