"use server";

import { createLibraryClient } from "@/lib/supabase/server";
import { ai_credit_limit } from "../ratelimit";
import { Env } from "@/env";
import ai from "@/lib/ai";

type AuthRateLimitError = {
  success: false;
  message: string;
  status: number;
  limit?: number;
  reset?: number;
  remaining?: number;
};

/**
 * Validates authentication and rate limits for AI image operations
 * @param credits - Number of credits required for the operation
 * @returns Error response if auth/rate limit fails, null if OK
 */
async function validateAuthAndRateLimit(
  credits: number
): Promise<AuthRateLimitError | null> {
  if (Env.web.IS_LOCALDEV_SUPERUSER) {
    return null; // Skip auth/rate limit for local dev superuser
  }

  const client = await createLibraryClient();

  // Check authentication
  const { data: userdata } = await client.auth.getUser();
  if (!userdata.user) {
    return {
      success: false,
      message: "login required",
      status: 401,
    };
  }

  // Check rate limit
  const rate = await ai_credit_limit(credits);
  if (!rate) {
    return {
      success: false,
      message: "something went wrong",
      status: 500,
    };
  }

  if (!rate.success) {
    return {
      success: false,
      message: "ratelimit exceeded",
      status: 429,
      limit: rate.limit,
      reset: rate.reset,
      remaining: rate.remaining,
    };
  }

  return null; // All checks passed
}

export type UpscaleImageActionInput = {
  image: ai.server.methods.ImageData | string; // ImageData or string (for backward compatibility)
  scale?: number; // optional, default: 4, max: 10
};

export type UpscaleImageActionResult = {
  success: true;
  data: ai.server.methods.RealEsrganResult;
};

export type UpscaleImageActionError = AuthRateLimitError;

export type UpscaleImageActionResponse =
  | UpscaleImageActionResult
  | UpscaleImageActionError;

export async function upscaleImage(
  input: UpscaleImageActionInput
): Promise<UpscaleImageActionResponse> {
  // Validate input
  if (!input.image) {
    return {
      success: false,
      message: "image is required",
      status: 400,
    };
  }

  // Validate auth & rate limit
  const credits = ai.image_tools.models["nightmareai/real-esrgan"].avg_credits;
  const authError = await validateAuthAndRateLimit(credits);
  if (authError) {
    return authError;
  }

  try {
    const result = await ai.server.methods.upscale({
      image: ai.server.methods.toImageData(input.image),
      scale: input.scale,
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("[upscaleImage] Error:", error);
    return {
      success: false,
      message: "something went wrong",
      status: 500,
    };
  }
}

export type RemoveBackgroundImageActionInput = {
  image: ai.server.methods.ImageData | string; // ImageData or string (for backward compatibility)
  // Note: format and background_type are no longer used (bria model doesn't support them)
  // Kept for backward compatibility but ignored
  format?: string;
  background_type?: string;
};

export type RemoveBackgroundImageActionResult = {
  success: true;
  data: ai.server.methods.BackgroundRemoverResult;
};

export type RemoveBackgroundImageActionError = AuthRateLimitError;

export type RemoveBackgroundImageActionResponse =
  | RemoveBackgroundImageActionResult
  | RemoveBackgroundImageActionError;

export async function removeBackgroundImage(
  input: RemoveBackgroundImageActionInput
): Promise<RemoveBackgroundImageActionResponse> {
  // Validate input
  if (!input.image) {
    return {
      success: false,
      message: "image is required",
      status: 400,
    };
  }

  // Validate auth & rate limit
  const modelId = ai.server.methods.MODEL_ID_RECRAFT_REMOVE_BACKGROUND;
  const credits = ai.image_tools.models[modelId].avg_credits;
  const authError = await validateAuthAndRateLimit(credits);
  if (authError) {
    return authError;
  }

  try {
    // Use recraft-ai/recraft-remove-background as the default model
    const result = await ai.server.methods.removeBackground(
      input.image,
      modelId
    );

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("[removeBackgroundImage] Error:", error);
    return {
      success: false,
      message: "something went wrong",
      status: 500,
    };
  }
}
