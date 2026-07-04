// GRIDA-GG: provider — the `gg` video-provider arm (docs/wg/platform/hosted-ai.md)
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
import type { SecretsStore } from "@grida/daemon/server";
import { byokProvidersFor, GG_PROVIDER_ID } from "../protocol/provider-ids";
import { makeVideoModelFor } from "./video-byok";
import { GridaGatewayVideoModel } from "./gg-media";
import { liveGgMediaDeps, type GridaGatewaySessionStore } from "./gg-session";

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
  /** A BYOK video provider, or the hosted `grida` provider (GRIDA-SEC-006). */
  provider_id: VideoProvider | typeof GG_PROVIDER_ID;
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
  /** Grida Cloud session (GRIDA-SEC-006) — optional; absent or token-less
   *  ⇒ the hosted provider never resolves. */
  gg?: GridaGatewaySessionStore;
  /** Origin of the hosted endpoints; absent ⇒ hosted provider disabled. */
  gg_base_url?: string;
};

export type ResolveVideoOptions = {
  explicit?: VideoProvider | typeof GG_PROVIDER_ID;
  /**
   * Image-to-video: the request carries a start frame. The hosted `gg`
   * provider is text-to-video only and would drop the frame, so it is
   * skipped (implicit) or rejected (explicit) here — the request falls back
   * to a BYOK route that can honor the image instead of silently becoming
   * text-to-video. Mirrors the image resolver's `references` guard.
   */
  image?: boolean;
};

/**
 * Build the resolved hosted video model — shared by the explicit-pick and
 * post-BYOK fallback arms, which produce the identical descriptor.
 */
function resolvedGgVideo(
  modelId: string,
  card: models.video.VideoModelCard,
  hosted: { session: GridaGatewaySessionStore; base_url: string }
): ResolvedVideoModel {
  return {
    provider_id: GG_PROVIDER_ID,
    model_id: modelId,
    binding_id: card.id,
    model: new GridaGatewayVideoModel(hosted.session, hosted.base_url, card.id),
  };
}

export async function resolveVideoModel(
  deps: ResolveVideoDeps,
  modelId: string,
  options: ResolveVideoOptions = {}
): Promise<ResolvedVideoModel> {
  const card = models.video.models[modelId];
  if (!card || !card.listed) {
    throw new VideoModelUnavailableError(modelId, options.explicit);
  }

  // Explicit hosted pick (GRIDA-SEC-006). Hosted video is
  // text-to-video only in v1 — the route rejects image_url server-side.
  if (options.explicit === GG_PROVIDER_ID) {
    // t2v only — an image-to-video pick can't ride the hosted provider.
    const hosted = !options.image && liveGgMediaDeps(deps);
    if (!hosted || !models.video.binding(card, "vercel")) {
      throw new VideoModelUnavailableError(modelId, GG_PROVIDER_ID);
    }
    return resolvedGgVideo(modelId, card, hosted);
  }

  const order: VideoProvider[] = options.explicit
    ? [options.explicit as VideoProvider]
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
      model: makeVideoModelFor(provider, key.trim(), binding.id),
    };
  }

  // Grida hosted (GRIDA-SEC-006) — after BYOK, before giving up. Serves
  // cards the hosted gateway can (a vercel binding).
  if (!options.explicit && !options.image) {
    const hosted = liveGgMediaDeps(deps);
    if (hosted && models.video.binding(card, "vercel")) {
      return resolvedGgVideo(modelId, card, hosted);
    }
  }

  throw new VideoModelUnavailableError(modelId, options.explicit);
}
