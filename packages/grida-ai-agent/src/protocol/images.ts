// GRIDA-GG: provider — `gg` in the image provider union (docs/wg/platform/hosted-ai.md)
/**
 * Image-generation wire protocol (#908). Client-safe: request/result shapes
 * for the `/images/generate` route, no provider SDK imports.
 */

import type { models } from "@grida/ai-models";

/** A BYOK image provider (mirrors {@link models.image.ImageProvider}). */
export type ImageGenProvider = models.image.ImageProvider;

export type ImageGenerateRequest = {
  /** Canonical catalog id (a curated `listed` image model). */
  model_id: string;
  prompt: string;
  /** Optional explicit provider override; otherwise the resolver picks. */
  provider?: ImageGenProvider | "gg";
  width?: number;
  height?: number;
  aspect_ratio?: string;
  n?: number;
  seed?: number;
  /**
   * Quality tier (`high` | `medium` | `low`). Only meaningful for models that
   * expose quality tiers (per-image-tiered pricing, e.g. GPT Image). Forwarded
   * to the provider as a provider-option; ignored by models that don't support
   * it. Omit (or `auto`) to use the provider default.
   */
  quality?: string;
};

export type ImageGeneratedImage = {
  /** Base64-encoded image bytes (no data: prefix). */
  base64: string;
  /** MIME type, e.g. `image/png`. */
  media_type: string;
};

export type ImageGenerateResult = {
  model_id: string;
  /** The provider that actually served the request. */
  provider_id: ImageGenProvider | "gg";
  images: ImageGeneratedImage[];
};
