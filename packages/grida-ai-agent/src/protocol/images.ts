// GRIDA-GG: provider — `gg` in the image provider union (docs/wg/platform/hosted-ai.md)
/**
 * Image-generation wire protocol (#908). Client-safe: request/result shapes
 * for the `/images/generate` route, no provider SDK imports.
 */

import type { models } from "@grida/ai-models";
import type { MediaItem } from "@grida/daemon";

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
   * Model-specific quality tier, including `xhigh` and `max` for GPT Image 2.5.
   * Forwarded as a provider-option; consult the card's quality choices for the
   * accepted values. Omit to use the provider default; `auto` is forwarded as
   * an explicit provider choice.
   */
  quality?: string;
};

export type ImageGeneratedImage = {
  /** Base64-encoded image bytes (no data: prefix). */
  base64: string;
  /** MIME type, e.g. `image/png`. */
  media_type: string;
  /** Present only when the optional host media store accepted this output. */
  stored_media?: MediaItem;
};

export type ImageGenerateResult = {
  model_id: string;
  /** The provider that actually served the request. */
  provider_id: ImageGenProvider | "gg";
  images: ImageGeneratedImage[];
};
