"use client";
// GRIDA-SEC-004 — provider presence and hosted readiness only; no key material.

import { useCallback, useEffect, useRef, useState } from "react";
import { catalog } from "@grida/ai/catalogue";
import { useDesktopBridge, type DesktopBridge } from "./bridge";
import * as gridaGateway from "./gg-session";
import { MediaModelAvailability } from "@/scaffolds/desktop/shared/media-model-availability";

type State = MediaModelAvailability.VideoProviderState;
const unavailable: State = { loaded: false, configured: [], hosted: false };

async function configuredProviders(bridge: DesktopBridge | null) {
  const keys = await Promise.all(
    catalog.video.providers.map(async (id) => ({
      id,
      connected: await Promise.resolve()
        .then(() => bridge?.secrets.has(id))
        .catch(() => false),
    }))
  );
  return keys.filter((key) => key.connected).map((key) => key.id);
}

/** Secret-free readiness; slow hosted sign-in never holds a connected BYOK route. */
export function useVideoProviders() {
  const bridge = useDesktopBridge();
  const [state, setState] = useState<State>(unavailable);
  const current = useRef(state);
  const mounted = useRef(false);
  const generation = useRef(0);
  const publish = useCallback((request: number, patch: Partial<State>) => {
    if (!mounted.current || request !== generation.current) return false;
    current.current = { ...current.current, ...patch };
    setState(current.current);
    return true;
  }, []);
  const refresh = useCallback(
    async (modelId: string) => {
      const request = ++generation.current;
      const session = gridaGateway
        .ensureFresh()
        .catch(() => ({ kind: "error" as const }))
        .then((next) => {
          publish(request, { hosted: next.kind === "active" });
        });
      const configured = await configuredProviders(bridge);
      if (!publish(request, { loaded: true, configured })) return unavailable;
      // Native readiness does not change the independently proven GG lane.
      // The pending session read updates it when ready, without blocking BYOK.
      if (
        MediaModelAvailability.video(modelId, [], {
          loaded: true,
          configured,
          hosted: false,
        }).available
      )
        return current.current;
      await session;
      return mounted.current && request === generation.current
        ? current.current
        : unavailable;
    },
    [bridge, publish]
  );
  useEffect(() => {
    mounted.current = true;
    current.current = unavailable;
    setState(unavailable);
    const load = () => {
      const request = ++generation.current;
      void configuredProviders(bridge).then((configured) => {
        publish(request, { loaded: true, configured });
      });
      void gridaGateway
        .ensureFresh()
        .catch(() => ({ kind: "error" as const }))
        .then((session) => {
          publish(request, { hosted: session.kind === "active" });
        });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      mounted.current = false;
      generation.current++;
      window.removeEventListener("focus", load);
    };
  }, [bridge, publish]);
  return { state, refresh };
}
