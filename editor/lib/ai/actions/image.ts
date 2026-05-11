"use server";

/**
 * AI image utility actions — upscale and background removal via
 * Replicate. Image *generation* (text → new pixels) lives in
 * `./image-generate.ts` because it owns its own storage upload pathway.
 */

import { methods, withAiAuth, type AiActionResult } from "@/lib/ai/server";
import ai from "@/lib/ai";

// ---------------------------------------------------------------------------
// Upscale
// ---------------------------------------------------------------------------

export type UpscaleImageInput = {
  /** Verified org id — server resolves via `requireOrganizationId`. */
  organizationId?: number;
  image: ai.server.methods.ImageData | string;
  scale?: number; // default: 4, max: 10
};

export type UpscaleImageResponse =
  AiActionResult<ai.server.methods.RealEsrganResult>;

export async function upscaleImage(
  input: UpscaleImageInput
): Promise<UpscaleImageResponse> {
  if (!input.image) {
    return {
      success: false,
      code: "bad_request",
      message: "image is required",
      status: 400,
    };
  }
  return withAiAuth("ai/image/upscale", input.organizationId, (orgId) =>
    methods.upscale(orgId, {
      image: ai.server.methods.toImageData(input.image),
      scale: input.scale,
    })
  );
}

// ---------------------------------------------------------------------------
// Remove background
// ---------------------------------------------------------------------------

export type RemoveBackgroundImageInput = {
  organizationId?: number;
  image: ai.server.methods.ImageData | string;
  // Note: format / background_type unused — recraft default doesn't
  // support them. Kept for backward compatibility.
  format?: string;
  background_type?: string;
};

export type RemoveBackgroundImageResponse =
  AiActionResult<ai.server.methods.BackgroundRemoverResult>;

export async function removeBackgroundImage(
  input: RemoveBackgroundImageInput
): Promise<RemoveBackgroundImageResponse> {
  if (!input.image) {
    return {
      success: false,
      code: "bad_request",
      message: "image is required",
      status: 400,
    };
  }
  return withAiAuth(
    "ai/image/remove-background",
    input.organizationId,
    (orgId) =>
      methods.removeBackground(
        orgId,
        input.image,
        ai.server.methods.MODEL_ID_RECRAFT_REMOVE_BACKGROUND
      )
  );
}
