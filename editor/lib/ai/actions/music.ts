"use server";

/** AI music generation action — Google Lyria via Replicate. */

import { methods, withAiAuth, type AiActionResult } from "@/lib/ai/server";
import ai from "@/lib/ai";

export type GenerateMusicInput = {
  /** Verified org id — server resolves via `requireOrganizationId`. */
  organizationId?: number;
  model: ai.audio.music.ModelId;
  prompt: string;
  images?: string[];
  seed?: number;
};

export type GenerateMusicData = {
  url: string;
  modelId: ai.audio.music.ModelId;
  timestamp: string;
};

export type GenerateMusicResponse = AiActionResult<GenerateMusicData>;

export async function generateMusic(
  input: GenerateMusicInput
): Promise<GenerateMusicResponse> {
  if (typeof input.prompt !== "string" || input.prompt.trim() === "") {
    return {
      success: false,
      code: "bad_request",
      message: "prompt is required",
      status: 400,
    };
  }
  if (!ai.audio.music.is_model_id(input.model)) {
    return {
      success: false,
      code: "bad_request",
      message: "invalid model",
      status: 400,
    };
  }
  const card = ai.audio.music.models[input.model];
  if (
    input.images !== undefined &&
    (!Array.isArray(input.images) ||
      input.images.some((image) => typeof image !== "string") ||
      input.images.length > (card.input.max_images ?? 0))
  ) {
    return {
      success: false,
      code: "bad_request",
      message: `images must contain at most ${card.input.max_images ?? 0} URLs`,
      status: 400,
    };
  }
  if (input.seed !== undefined && !Number.isSafeInteger(input.seed)) {
    return {
      success: false,
      code: "bad_request",
      message: "seed must be an integer",
      status: 400,
    };
  }
  return withAiAuth(
    "ai/music/generate",
    input.organizationId,
    async (orgId) => {
      const result = await methods.generateMusic(orgId, input.model, {
        prompt: input.prompt,
        images: input.images,
        seed: input.seed,
      });
      return {
        url: result.url,
        modelId: input.model,
        timestamp: new Date().toISOString(),
      } satisfies GenerateMusicData;
    }
  );
}
