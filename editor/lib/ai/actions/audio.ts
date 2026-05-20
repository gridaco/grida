"use server";

/**
 * AI audio generation action — Lyria et al. via Replicate.
 */

import { methods, withAiAuth, type AiActionResult } from "@/lib/ai/server";
import ai from "@/lib/ai";

export type GenerateAudioInput = {
  /** Verified org id — server resolves via `requireOrganizationId`. */
  organizationId?: number;
  model: ai.audio.AudioModelId;
  prompt: string;
  image_inputs?: string[];
  language?: string;
  negative_prompt?: string;
  seed?: number;
};

export type GenerateAudioData = {
  url: string;
  modelId: ai.audio.AudioModelId;
  timestamp: string;
};

export type GenerateAudioResponse = AiActionResult<GenerateAudioData>;

export async function generateAudio(
  input: GenerateAudioInput
): Promise<GenerateAudioResponse> {
  if (!input.prompt || input.prompt.trim() === "") {
    return {
      success: false,
      code: "bad_request",
      message: "prompt is required",
      status: 400,
    };
  }
  if (!Object.hasOwn(ai.audio.models, input.model)) {
    return {
      success: false,
      code: "bad_request",
      message: "invalid model",
      status: 400,
    };
  }
  return withAiAuth(
    "ai/audio/generate",
    input.organizationId,
    async (orgId) => {
      const result = await methods.generateAudio(orgId, input.model, {
        prompt: input.prompt,
        image_inputs: input.image_inputs,
        language: input.language,
        negative_prompt: input.negative_prompt,
        seed: input.seed,
      });
      return {
        url: result.url,
        modelId: input.model,
        timestamp: new Date().toISOString(),
      } satisfies GenerateAudioData;
    }
  );
}
