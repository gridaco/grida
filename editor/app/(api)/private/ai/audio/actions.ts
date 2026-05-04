"use server";

import { createLibraryClient } from "@/lib/supabase/server";
import { ai_budget_deduct } from "../ratelimit";
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

async function validateAuthAndRateLimit(
  cost_mills: number
): Promise<AuthRateLimitError | null> {
  if (Env.web.IS_LOCALDEV_SUPERUSER) {
    return null;
  }

  const client = await createLibraryClient();

  const { data: userdata } = await client.auth.getUser();
  if (!userdata.user) {
    return {
      success: false,
      message: "login required",
      status: 401,
    };
  }

  const rate = await ai_budget_deduct(cost_mills);
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

  return null;
}

export type GenerateAudioActionInput = {
  model: ai.audio.AudioModelId;
  prompt: string;
  image_inputs?: string[];
  language?: string;
  negative_prompt?: string;
  seed?: number;
};

export type GenerateAudioActionResult = {
  success: true;
  data: {
    url: string;
    modelId: ai.audio.AudioModelId;
    timestamp: string;
  };
};

export type GenerateAudioActionError = AuthRateLimitError;

export type GenerateAudioActionResponse =
  | GenerateAudioActionResult
  | GenerateAudioActionError;

export async function generateAudio(
  input: GenerateAudioActionInput
): Promise<GenerateAudioActionResponse> {
  if (!input.prompt || input.prompt.trim() === "") {
    return {
      success: false,
      message: "prompt is required",
      status: 400,
    };
  }

  if (!Object.hasOwn(ai.audio.models, input.model)) {
    return {
      success: false,
      message: "invalid model",
      status: 400,
    };
  }
  const card = ai.audio.models[input.model];

  const cost_mills = ai.toMills(card.avg_cost_usd);
  const authError = await validateAuthAndRateLimit(cost_mills);
  if (authError) {
    return authError;
  }

  try {
    const result = await ai.server.methods.generateAudio(input.model, {
      prompt: input.prompt,
      image_inputs: input.image_inputs,
      language: input.language,
      negative_prompt: input.negative_prompt,
      seed: input.seed,
    });

    return {
      success: true,
      data: {
        url: result.url,
        modelId: input.model,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[generateAudio] Error:", error);
    return {
      success: false,
      message: "something went wrong",
      status: 500,
    };
  }
}
