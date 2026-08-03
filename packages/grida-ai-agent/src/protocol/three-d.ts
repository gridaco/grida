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

export type FalTextToThreeDModelId = models.three_d.TextToThreeDModelId;
export type FalImageToThreeDModelId = models.three_d.ImageToThreeDModelId;

export type ThreeDInputImage = {
  /** Base64-encoded image bytes, without a `data:` prefix. */
  base64: string;
  media_type: "image/png" | "image/jpeg" | "image/webp";
};

/**
 * The exact fal endpoint decides the admissible input. This discriminated
 * union prevents transport callers from constructing prompt/image mixtures
 * that the provider route would reject.
 */
export type ThreeDGenerateRequest =
  | {
      model_id: FalTextToThreeDModelId;
      prompt: string;
      image?: never;
    }
  | {
      model_id: FalImageToThreeDModelId;
      image: ThreeDInputImage;
      prompt?: never;
    };

export type ThreeDGeneratedGlb = {
  /** Base64-encoded GLB bytes, without a `data:` prefix. */
  base64: string;
  media_type: "model/gltf-binary";
  file_name: string;
};

export type ThreeDGenerateResult = {
  model_id: models.three_d.ThreeDModelId;
  provider_id: "fal";
  /** Portable primary output guaranteed by the catalogue. */
  glb: ThreeDGeneratedGlb;
  /** Present only when the optional host media store accepted the output. */
  stored_media?: MediaItem;
};
