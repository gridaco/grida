/**
 * GRIDA-SEC-004 — video-model provider resolver. The video counterpart of
 * {@link ./resolve-image.ts}.
 *
 * Given a canonical video-model id, picks a provider the user has a key for and
 * which serves that model, then builds the runnable `VideoModelV3`. Reads the
 * package-owned `SecretsStore` (credentials never cross IPC); never calls the
 * model.
 *
 * Precedence: `byokProvidersFor("video")` order (Vercel → fal), intersected
 * with providers this card binds and providers with a stored key. Unlike image,
 * video is NOT universal — a connected provider may not serve every listed
 * model, so resolution is genuinely per-model. Non-`listed` cards are rejected.
 */

import { models } from "@grida/ai-models";
import type { Experimental_VideoModelV3 as VideoModelV3 } from "@ai-sdk/provider";
import type { SecretsStore } from "../secrets";
import { byokProvidersFor } from "../protocol/provider-ids";
import { makeVideoModelFor } from "./video-byok";

type VideoProvider = models.video.VideoProvider;

const VIDEO_PROVIDERS: readonly VideoProvider[] = [
  "vercel",
  "fal",
  "openrouter",
];

function isVideoProvider(id: string): id is VideoProvider {
  return (VIDEO_PROVIDERS as readonly string[]).includes(id);
}

export type ResolvedVideoModel = {
  provider_id: VideoProvider;
  model_id: string;
  binding_id: string;
  model: VideoModelV3;
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

export type ResolveVideoDeps = {
  secrets: SecretsStore;
};

export type ResolveVideoOptions = {
  explicit?: VideoProvider;
};

export async function resolveVideoModel(
  deps: ResolveVideoDeps,
  modelId: string,
  options: ResolveVideoOptions = {}
): Promise<ResolvedVideoModel> {
  const card = models.video.models[modelId];
  if (!card || !card.listed) {
    throw new VideoModelUnavailableError(modelId, options.explicit);
  }

  const order: VideoProvider[] = options.explicit
    ? [options.explicit]
    : byokProvidersFor("video")
        .map((p) => p.id)
        .filter(isVideoProvider);

  for (const provider of order) {
    const binding = models.video.binding(card, provider);
    if (!binding) continue;
    const key = await deps.secrets._getKey(provider);
    if (!key) continue;
    return {
      provider_id: provider,
      model_id: modelId,
      binding_id: binding.id,
      model: makeVideoModelFor(provider, key, binding.id),
    };
  }

  throw new VideoModelUnavailableError(modelId, options.explicit);
}
