/**
 * 3D-generation wire protocol.
 *
 * Client-safe request/result shapes for `POST /three-d/generate`. The request
 * names only a closed catalogue model and carries at most one renderer-owned
 * image. The route normalizes the provider result to the primary GLB bytes, so
 * no provider URL or credential crosses the renderer boundary (GRIDA-SEC-004).
 */

import type { models } from "@grida/ai-models";
import type { MediaItem } from "@grida/daemon";

export type ThreeDGenProvider = models.three_d.ThreeDProvider;

export type ThreeDInputImage = {
  /** Base64-encoded image bytes, without a `data:` prefix. */
  base64: string;
  media_type: "image/png" | "image/jpeg" | "image/webp";
};

export type ThreeDGenerateRequest = {
  /** Exact staged/listed 3D catalogue id. */
  model_id: models.three_d.ThreeDModelId;
  /** Required for a text-to-3D model; rejected for image-to-3D models. */
  prompt?: string;
  /** Required for an image-to-3D model; rejected for text-to-3D models. */
  image?: ThreeDInputImage;
};

export type ThreeDGeneratedGlb = {
  /** Base64-encoded GLB bytes, without a `data:` prefix. */
  base64: string;
  media_type: "model/gltf-binary";
  file_name: string;
};

export type ThreeDGenerateResult = {
  model_id: models.three_d.ThreeDModelId;
  provider_id: ThreeDGenProvider;
  /** Portable primary output guaranteed by the catalogue. */
  glb: ThreeDGeneratedGlb;
  /** Present only when the optional host media store accepted the output. */
  stored_media?: MediaItem;
};
