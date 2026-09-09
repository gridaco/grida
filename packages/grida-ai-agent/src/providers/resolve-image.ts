// GRIDA-GG: provider — agent defaults and legacy auto selection over the shared image operation.
// GRIDA-SEC-004 / GRIDA-SEC-006 — host credentials and transport stay inside the operation.
import { ImageClient, ProviderHttp } from "@grida/ai";
import { catalog as models } from "@app/ai-catalog";
import type { SecretsStore } from "@grida/daemon/server";
import { byokProvidersFor } from "../protocol/provider-ids";
import { liveGgMediaDeps, type GridaGatewaySessionStore } from "./gg-session";
import { ModelCatalogStore } from "./model-catalog";

export type ResolvedImageModel = ImageClient.Resolved;
export type ResolveImageDeps = {
  secrets: SecretsStore;
  catalog?: ModelCatalogStore;
  provider_http?: ProviderHttp;
  gg?: GridaGatewaySessionStore;
  gg_base_url?: string;
};
export type ResolveImageOptions = {
  explicit?: ImageClient.Provider;
  references?: boolean;
  background?: ImageClient.Background;
};

export class ImageModelUnavailableError extends Error {
  readonly code = "image_model_unavailable" as const;
  constructor(
    public readonly model_id: string,
    public readonly provider_id?: string,
    references = false,
    public readonly background?: "opaque" | "transparent"
  ) {
    super(
      background
        ? `[agent-host-images] no connected provider can generate ${model_id} with a ${background} background` +
            (references ? " and reference images" : "") +
            (provider_id ? ` using ${provider_id}` : "")
        : references
          ? `[agent-host-images] no connected provider can generate ${model_id} with reference images (image-to-image)`
          : provider_id
            ? `[agent-host-images] explicit provider not available: ${provider_id} for ${model_id}`
            : `[agent-host-images] no provider available for ${model_id}`
    );
    this.name = "ImageModelUnavailableError";
  }
}

/** Service recommendation from the effective view; explicit choices bypass it. */
export function defaultImageModelId(
  view: models.snapshot.View = models.snapshot.view()
): string | undefined {
  return view.image.default_id ?? view.image.listed()[0]?.id;
}

/**
 * Whether the user has a key for ANY image provider — the cheap presence gate
 * the host uses to decide whether to advertise the `generate_image` tool at all
 * (mirrors vision's `bytesReadable`: don't offer a capability that would refuse
 * every call). Reuses the same precedence source as {@link resolveImageModel}.
 */
export async function hasUsableImageProvider(
  deps: ResolveImageDeps
): Promise<boolean> {
  for (const p of byokProvidersFor("image")) {
    if (await deps.secrets._getKey(p.id)) return true;
  }
  // Grida hosted (GRIDA-SEC-006): a live session serves the curated list
  // too — a signed-in keyless user gets in-chat image generation.
  return liveGgMediaDeps(deps) !== null;
}

/** The agent deliberately retains its existing BYOK-then-GG automatic choice. */
export async function resolveImageModel(
  deps: ResolveImageDeps,
  modelId: string,
  options: ResolveImageOptions = {}
): Promise<ResolvedImageModel> {
  const images = new ImageClient({
    keys: { get: (provider) => deps.secrets._getKey(provider) },
    // Explicit legacy host choice: standalone requests may use ambient fetch;
    // remote downloads still require a supplied host transport.
    http: deps.provider_http ?? new ProviderHttp(),
    catalog: deps.catalog ?? new ModelCatalogStore(),
    gg: deps.gg,
    gg_base_url: deps.gg_base_url,
  });
  try {
    return await images.resolve({
      model_id: modelId,
      provider: options.explicit ?? "auto",
      references: options.references,
      background: options.background,
    });
  } catch (error) {
    if (
      error instanceof ImageClient.Failure &&
      (error.code === "model_unavailable" ||
        error.code === "provider_unavailable" ||
        error.code === "references_unsupported" ||
        error.code === "gg_token_expired")
    ) {
      throw new ImageModelUnavailableError(
        modelId,
        options.explicit,
        options.references,
        options.background === "auto" ? undefined : options.background
      );
    }
    throw error;
  }
}
