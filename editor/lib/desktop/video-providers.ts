"use client";
// GRIDA-SEC-004 — provider presence and hosted readiness only; no key material.

import { useCallback, useEffect, useState } from "react";
import { catalog } from "@grida/ai/catalogue";
import { useDesktopBridge, type DesktopBridge } from "./bridge";
import * as gridaGateway from "./gg-session";
import { MediaModelAvailability } from "@/scaffolds/desktop/shared/media-model-availability";

async function configuredProviders(bridge: DesktopBridge | null) {
  const keys = await Promise.all(
    catalog.video.providers.map(async (id) => ({
      id,
      connected: await bridge?.secrets.has(id).catch(() => false),
    }))
  );
  return keys.filter((key) => key.connected).map((key) => key.id);
}

/** Secret-free readiness; slow hosted sign-in never holds a connected BYOK route. */
export function useVideoProviders() {
  const bridge = useDesktopBridge();
  const [state, setState] = useState<MediaModelAvailability.VideoProviderState>(
    {
      loaded: false,
      configured: [],
      hosted: false,
    }
  );
  const refresh = useCallback(
    async (modelId: string) => {
      const session = gridaGateway
        .ensureFresh()
        .catch(() => ({ kind: "error" as const }));
      const keys = await configuredProviders(bridge);
      const native = { loaded: true, configured: keys, hosted: false };
      if (MediaModelAvailability.video(modelId, [], native).available)
        return native;
      return { ...native, hosted: (await session).kind === "active" };
    },
    [bridge]
  );
  useEffect(() => {
    let active = true;
    let generation = 0;
    setState({ loaded: false, configured: [], hosted: false });
    const load = () => {
      const request = ++generation;
      void configuredProviders(bridge).then((configured) => {
        if (active && request === generation)
          setState((current) => ({ ...current, loaded: true, configured }));
      });
      void gridaGateway
        .ensureFresh()
        .catch(() => ({ kind: "error" as const }))
        .then((session) => {
          if (active && request === generation)
            setState((current) => ({
              ...current,
              hosted: session.kind === "active",
            }));
        });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [bridge]);
  return { state, refresh };
}
