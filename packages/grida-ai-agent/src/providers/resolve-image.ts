/**
 * GRIDA-SEC-004 — image-model provider resolver (in-package providers layer).
 *
 * The image counterpart of {@link ./index.ts}'s `resolveProvider`. Given a
 * canonical image-model id, it picks a provider the user has a key for and
 * which serves that model, then builds the runnable `ImageModelV3`. Like the
 * language resolver this is node-only and in-process: it reads the
 * package-owned `SecretsStore` (credentials never cross IPC) and never calls
 * the model — only constructs the factory.
 *
 * Precedence mirrors `resolveProvider`: `BYOK_PROVIDER_METADATA` order,
 * intersected with (a) providers this card binds and (b) providers with a
 * stored key. Because the curated list is **universal** (every `listed` card
 * binds every provider — enforced by a catalog invariant test), one connected
 * key serves the whole list. Non-`listed` cards are not part of the v1 BYOK
 * surface and are rejected.
 */

import { models } from "@grida/ai-models";
import type { ImageModelV3 } from "@ai-sdk/provider";
import type { SecretsStore } from "../secrets";
import { byokProvidersFor } from "../protocol/provider-ids";
import { makeImageModelFor } from "./image-byok";

type ImageProvider = models.image.ImageProvider;

const IMAGE_PROVIDERS: readonly ImageProvider[] = [
  "vercel",
  "fal",
  "openrouter",
];

function isImageProvider(id: string): id is ImageProvider {
  return (IMAGE_PROVIDERS as readonly string[]).includes(id);
}

export type ResolvedImageModel = {
  provider_id: ImageProvider;
  /** Canonical catalog id (our key). */
  model_id: string;
  /** Provider-specific call id actually handed to the SDK. */
  binding_id: string;
  model: ImageModelV3;
};

/**
 * One error class for both "unknown / not-listed model" and "you picked
 * provider X but it isn't available". The route maps `provider_id` being
 * present to a 4xx that surfaces the picked id.
 */
export class ImageModelUnavailableError extends Error {
  readonly code = "image_model_unavailable" as const;
  constructor(
    public readonly model_id: string,
    public readonly provider_id?: string
  ) {
    super(
      provider_id
        ? `[agent-host-images] explicit provider not available: ${provider_id} for ${model_id}`
        : `[agent-host-images] no provider available for ${model_id}`
    );
    this.name = "ImageModelUnavailableError";
  }
}

export type ResolveImageDeps = {
  secrets: SecretsStore;
};

export type ResolveImageOptions = {
  /** Caller override. If set, precedence is skipped and only this provider is checked. */
  explicit?: ImageProvider;
};

export async function resolveImageModel(
  deps: ResolveImageDeps,
  modelId: string,
  options: ResolveImageOptions = {}
): Promise<ResolvedImageModel> {
  const card = models.image.models[modelId];
  // Unknown id, or a non-curated card (legacy / not universal) — not part of
  // the v1 BYOK image surface.
  if (!card || !card.listed) {
    throw new ImageModelUnavailableError(modelId, options.explicit);
  }

  const order: ImageProvider[] = options.explicit
    ? [options.explicit]
    : byokProvidersFor("image")
        .map((p) => p.id)
        .filter(isImageProvider);

  for (const provider of order) {
    const binding = models.image.binding(card, provider);
    if (!binding) continue;
    const key = await deps.secrets._getKey(provider);
    if (!key) continue;
    return {
      provider_id: provider,
      model_id: modelId,
      binding_id: binding.id,
      model: makeImageModelFor(provider, key.trim(), binding.id),
    };
  }

  throw new ImageModelUnavailableError(modelId, options.explicit);
}
