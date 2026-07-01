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
import { DEFAULT_IMAGE_MODEL_ID } from "./preferences";

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
  /**
   * Max reference images the resolved (provider, route) accepts, when resolved
   * for image-to-image (`options.references`). Absent for a text-to-image
   * resolution. The caller trims references to this cap.
   */
  references_max?: number;
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
    public readonly provider_id?: string,
    /** Set when the failed resolution was for image-to-image (references). The
     *  agent-visible message then names WHY (needs a reference-capable route)
     *  and, when known, which providers serve it — so the agent can tell the
     *  user which key to connect instead of a bare "unavailable". */
    references?: { capable_providers: readonly string[] }
  ) {
    super(
      references
        ? `[agent-host-images] no connected provider can generate ${model_id} with reference images (image-to-image)` +
            (references.capable_providers.length > 0
              ? ` — connect a key for: ${references.capable_providers.join(", ")}`
              : "")
        : provider_id
          ? `[agent-host-images] explicit provider not available: ${provider_id} for ${model_id}`
          : `[agent-host-images] no provider available for ${model_id}`
    );
    this.name = "ImageModelUnavailableError";
  }
}

/**
 * The providers whose binding serves the image-to-image (references) route for
 * `card` — the set a user could connect a key for to unlock i2i. Today only
 * OpenRouter carries `references` bindings (verified live 2026-07-01), but this
 * reads the catalog so the error message stays honest as bindings are added.
 */
function referenceCapableProviders(
  card: models.image.ImageModelCard
): ImageProvider[] {
  return IMAGE_PROVIDERS.filter(
    (p) => models.image.binding(card, p)?.references
  );
}

export type ResolveImageDeps = {
  secrets: SecretsStore;
};

export type ResolveImageOptions = {
  /** Caller override. If set, precedence is skipped and only this provider is checked. */
  explicit?: ImageProvider;
  /**
   * Resolve for image-to-image. When true, only providers whose binding has a
   * `references` capability are eligible, and the resolved `binding_id` is the
   * edit route (`binding.references.id`). A reference-bearing call therefore
   * never lands on a text-to-image-only route.
   */
  references?: boolean;
};

/**
 * The default image model for a caller that doesn't pick one (e.g. a bare
 * `generate_image({prompt})`). An EXPLICIT, tracked pin — {@link
 * DEFAULT_IMAGE_MODEL_ID} (see `./preferences`) — not "whatever the catalog
 * lists first". Because the curated list is universal (every `listed` card binds
 * every provider), one connected key serves it.
 *
 * Fallback to the first curated `listed` card guards catalog drift only: if the
 * pin were ever dropped/unlisted, a connected key can still serve *some* default
 * rather than 404. `undefined` only if the catalog ships no listed image card.
 */
export function defaultImageModelId(): string | undefined {
  if (models.image.models[DEFAULT_IMAGE_MODEL_ID]?.listed) {
    return DEFAULT_IMAGE_MODEL_ID;
  }
  return models.image.listed_models()[0]?.id;
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
    if (!isImageProvider(p.id)) continue;
    if (await deps.secrets._getKey(p.id)) return true;
  }
  return false;
}

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
    // For an image-to-image resolution, the provider must serve the edit route.
    // Skip t2i-only bindings so references never land where they're ignored.
    if (options.references && !binding.references) continue;
    const key = await deps.secrets._getKey(provider);
    if (!key) continue;
    const binding_id = options.references ? binding.references!.id : binding.id;
    return {
      provider_id: provider,
      model_id: modelId,
      binding_id,
      model: makeImageModelFor(provider, key.trim(), binding_id),
      ...(options.references
        ? { references_max: binding.references!.max }
        : {}),
    };
  }

  // No connected provider served the resolution. For an image-to-image call the
  // usual cause is that i2i rides a narrower set of providers than t2i (the tool
  // is offered on any image key, but references need a reference-capable route),
  // so name that set — otherwise the agent only learns "unavailable".
  throw new ImageModelUnavailableError(
    modelId,
    options.explicit,
    options.references
      ? { capable_providers: referenceCapableProviders(card) }
      : undefined
  );
}
