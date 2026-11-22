"use client";

// GRIDA-SEC-004 — renderer reads the host's secret-free, bounded GG snapshot.
import { useEffect, useState } from "react";
import type { VisualModels } from "@grida/ai/catalogue";
import type { GGModelsView, VisualModelCatalogueView } from "@grida/ai-host";
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

const EMPTY_VISUAL: VisualModelCatalogueView = {
  version: "",
  image: [],
  video: [],
};

/** A missing bridge denotes a released host with the bundled adapter contract. */
export function useVisualModels(): VisualModelCatalogueView | null {
  const bridge = useDesktopBridge();
  const read = bridge?.providers?.visual_models;
  const [snapshot, setSnapshot] = useState(EMPTY_VISUAL);
  useEffect(() => {
    if (!read) return;
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await read();
        if (active) setSnapshot(next);
      } catch {
        // Retain the last successful view while the sidecar is unavailable.
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [read]);
  return read ? snapshot : null;
}

/** One-shot playgrounds expose prompt operations. Other consumers can select image routes. */
export function promptModels(
  choices: readonly VisualModels.Choice[]
): VisualModels.Choice[] {
  return choices.flatMap((choice) => {
    const providers = Object.fromEntries(
      Object.entries(choice.providers).filter(([, route]) => route?.text)
    );
    return Object.keys(providers).length ? [{ ...choice, providers }] : [];
  });
}

export type MediaModelChoice = Readonly<{
  id: string;
  label: string;
  release?: { readonly date: string | null };
  release_date?: string;
  vendor?: string;
  short_description?: string;
  provider?: string;
  providers?: object;
  deprecated?: boolean;
}>;

/** Merge installed native bindings with current hosted choices by canonical ID. */
export function mediaModelChoices(
  bundled: readonly MediaModelChoice[],
  current: readonly CurrentGGModel[] | null,
  kind: "image" | "video" | "music"
): MediaModelChoice[] {
  const iface =
    kind === "image"
      ? "images.generations"
      : kind === "video"
        ? "videos"
        : "endpoints";
  const choices = new Map(bundled.map((model) => [model.id, model]));
  for (const model of current ?? []) {
    if (model.kind === kind && model.interfaces.includes(iface))
      choices.set(model.id, {
        ...choices.get(model.id),
        id: model.id,
        label: model.label,
        vendor: model.owned_by,
        ...(model.release_date && { release_date: model.release_date }),
        deprecated: undefined,
      });
  }
  return [...choices.values()];
}

/** Newest first. Models with no published date follow dated models. */
export function newestMediaModels<T extends MediaModelChoice>(
  models: readonly T[]
): T[] {
  const date = (model: T) => model.release_date ?? model.release?.date ?? "";
  return models.toSorted(
    (a, b) => date(b).localeCompare(date(a)) || a.id.localeCompare(b.id)
  );
}
