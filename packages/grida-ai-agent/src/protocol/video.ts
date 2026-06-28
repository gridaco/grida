/**
 * Video-generation wire protocol (#908). Client-safe: request/result shapes
 * for the `/video/generate` route, no provider SDK imports.
 */

import type { models } from "@grida/ai-models";

/** A BYOK video provider (mirrors {@link models.video.VideoProvider}). */
export type VideoGenProvider = models.video.VideoProvider;

export type VideoGenerateRequest = {
  /** Canonical catalog id (a curated `listed` video model). */
  model_id: string;
  prompt: string;
  /** Optional explicit provider override; otherwise the resolver picks. */
  provider?: VideoGenProvider;
  aspect_ratio?: string;
  /** `"{width}x{height}"`. */
  resolution?: string;
  /** Output duration in seconds. */
  duration?: number;
  fps?: number;
  seed?: number;
  /** Optional start-frame URL for image-to-video. */
  image_url?: string;
};

export type GeneratedVideo = {
  /**
   * Base64-encoded video bytes. The route always returns bytes (the sidecar
   * downloads provider CDN/authed URLs) so the renderer can play a `data:` URL
   * under the desktop CSP without reaching an external origin.
   */
  base64?: string;
  /** Reserved: a directly-playable URL, if a future path returns one. */
  url?: string;
  media_type: string;
};

export type VideoGenerateResult = {
  model_id: string;
  provider_id: VideoGenProvider;
  videos: GeneratedVideo[];
};
