// GRIDA-GG: gateway — Grida's service catalog binding over the shared refresh owner.
import { ModelCatalogStore as SharedModelCatalogStore } from "@grida/ai";
import { catalogViewOnMiss as sharedViewOnMiss } from "@grida/ai/providers";
import { catalog } from "@app/ai-catalog";

export type { RefreshReason } from "@grida/ai/providers";

/** Public, credential-free service catalog endpoint. */
export const CATALOG_PATH = "/api/v1/models/catalog";

export type ModelCatalogStoreOptions = {
  base_url?: string;
  fetch?: typeof globalThis.fetch;
  /** Pins the host to this snapshot; no fetch or timer. */
  snapshot?: catalog.snapshot.Snapshot;
  on_change?: () => void;
  refresh_interval_ms?: number | null;
  now?: () => number;
};

/**
 * Grida owns the seed, wire codec and endpoint. The shared SDK owns bounded
 * fetching and refresh lifecycle; it never imports this service policy.
 */
export class ModelCatalogStore extends SharedModelCatalogStore<catalog.snapshot.View> {
  constructor(options: ModelCatalogStoreOptions = {}) {
    const url =
      options.snapshot === undefined && options.base_url
        ? catalogUrl(options.base_url)
        : null;
    super({
      seed: catalog.snapshot.view(options.snapshot),
      source: url
        ? {
            url,
            fetch: options.fetch,
            parse: (value) => {
              const snapshot = catalog.snapshot.parse(value);
              return snapshot ? catalog.snapshot.view(snapshot) : null;
            },
          }
        : undefined,
      on_change: options.on_change,
      refresh_interval_ms: options.refresh_interval_ms,
      now: options.now,
    });
  }
}

/** One effective view per decision; omitted stores retain the service seed. */
export function catalogView(store?: ModelCatalogStore): catalog.snapshot.View {
  return store?.view() ?? catalog.snapshot.view();
}

export async function catalogViewOnMiss(
  store: ModelCatalogStore | undefined,
  missed: (view: catalog.snapshot.View) => boolean
): Promise<catalog.snapshot.View> {
  return store ? sharedViewOnMiss(store, missed) : catalog.snapshot.view();
}

function catalogUrl(baseUrl: string): string | null {
  try {
    const url = new URL(CATALOG_PATH, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
