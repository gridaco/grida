// GRIDA-GG: provider — agent auto selection over the shared video operation.
// GRIDA-SEC-004 / GRIDA-SEC-006 — host credentials and transport stay inside the operation.
import { VideoClient, ProviderHttp } from "@grida/ai";
import type { SecretsStore } from "@grida/daemon/server";
import type { GridaGatewaySessionStore } from "./gg-session";
import { ModelCatalogStore } from "./model-catalog";

export type ResolvedVideoModel = VideoClient.Resolved;
export type ResolveVideoDeps = {
  secrets: SecretsStore;
  catalog?: ModelCatalogStore;
  provider_http?: ProviderHttp;
  gg?: GridaGatewaySessionStore;
  gg_base_url?: string;
};
export type ResolveVideoOptions = {
  explicit?: VideoClient.Provider;
  /** Select a route that accepts the request's starting image. */
  image?: boolean;
};

export class VideoModelUnavailableError extends Error {
  readonly code = "video_model_unavailable" as const;
  constructor(
    public readonly model_id: string,
    public readonly provider_id?: string
  ) {
    super(
      provider_id
        ? `[agent-host-video] explicit provider not available: ${provider_id} for ${model_id}`
        : `[agent-host-video] no provider available for ${model_id}`
    );
    this.name = "VideoModelUnavailableError";
  }
}

/** The agent deliberately retains its existing BYOK-then-GG automatic choice. */
export async function resolveVideoModel(
  deps: ResolveVideoDeps,
  modelId: string,
  options: ResolveVideoOptions = {}
): Promise<ResolvedVideoModel> {
  const videos = new VideoClient({
    keys: { get: (provider) => deps.secrets._getKey(provider) },
    // Explicit legacy host choice: standalone requests may use ambient fetch;
    // remote downloads still require a supplied host transport.
    http: deps.provider_http ?? new ProviderHttp(),
    catalog: deps.catalog ?? new ModelCatalogStore(),
    gg: deps.gg,
    gg_base_url: deps.gg_base_url,
  });
  try {
    return await videos.resolve({
      model_id: modelId,
      provider: options.explicit ?? "auto",
      image: options.image,
    });
  } catch (error) {
    if (
      error instanceof VideoClient.Failure &&
      (error.code === "model_unavailable" ||
        error.code === "provider_unavailable" ||
        error.code === "input_unsupported" ||
        error.code === "gg_token_expired")
    ) {
      throw new VideoModelUnavailableError(modelId, options.explicit);
    }
    throw error;
  }
}
