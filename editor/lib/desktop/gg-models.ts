"use client";

// GRIDA-SEC-004 — renderer reads the host's secret-free, bounded GG snapshot.
import { useEffect, useState } from "react";
import type { GGModelsView } from "@grida/ai-host";
import { providers, useDesktopBridge } from "./bridge";

export type CurrentGGModel = GGModelsView["models"][number];

/** null means a released binary predating discovery; [] means no current offering.
 * New hosts never restore bundled GG rows after an empty/failed/expired read. */
export function useGGModels(): readonly CurrentGGModel[] | null {
  const bridge = useDesktopBridge();
  const [snapshot, setSnapshot] = useState<GGModelsView | null>(null);
  useEffect(() => {
    let active = true;
    let pending = false;
    setSnapshot(null);
    if (!bridge || typeof bridge.providers?.gg_models !== "function") return;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await providers.ggModels();
        if (active) setSnapshot(next);
      } catch {
        // The host enforces last-good age; failed refresh must not extend it.
        if (active)
          setSnapshot((previous) =>
            previous && previous.expires_at > Date.now() ? previous : null
          );
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 30_000);
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [bridge]);
  // Expiry also gets a timer: background/quiet clients must withdraw stale rows.
  useEffect(() => {
    if (!snapshot) return;
    const timer = setTimeout(
      () => setSnapshot((current) => (current === snapshot ? null : current)),
      Math.max(0, snapshot.expires_at - Date.now())
    );
    return () => clearTimeout(timer);
  }, [snapshot]);
  if (bridge && typeof bridge.providers?.gg_models !== "function") return null;
  return snapshot?.models ?? EMPTY_MODELS;
}
const EMPTY_MODELS: readonly CurrentGGModel[] = Object.freeze([]);

/** Bundled rows describe BYOK adapters; live rows describe GG's current offering. */
export function mediaModelChoices(
  bundled: readonly { id: string; label: string; deprecated?: boolean }[],
  current: readonly CurrentGGModel[] | null,
  kind: "image" | "video" | "music"
): { id: string; label: string; deprecated?: boolean }[] {
  const iface =
    kind === "image"
      ? "images.generations"
      : kind === "video"
        ? "videos"
        : "endpoints";
  const choices = new Map(bundled.map((model) => [model.id, model]));
  for (const model of current ?? []) {
    if (model.kind === kind && model.interfaces.includes(iface))
      choices.set(model.id, { id: model.id, label: model.label });
  }
  return [...choices.values()];
}
