/**
 * BYOK (bring-your-own-key) model factories — the third-party provider
 * adapters. These are the package's only `@ai-sdk/*` provider consumers,
 * isolated here so client-safe entries never pull provider SDKs. The
 * resolver wires one of these when the user has a matching key stored.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGateway } from "@ai-sdk/gateway";
import { TIER_MODEL_IDS, type TierModelId } from "@grida/ai-models";
import type { ModelFactory } from "../agent";
import type { ModelTier } from "../tiers";

const MODEL_BY_TIER: Record<ModelTier, TierModelId> = TIER_MODEL_IDS;

const OPENROUTER_HEADERS = {
  // TODO: temporarily disabled — re-enable to restore OpenRouter app attribution
  // "HTTP-Referer": "https://grida.co",
  // "X-Title": "Grida",
} as const;

export function makeOpenRouterFactory(apiKey: string): ModelFactory {
  const provider = createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    headers: OPENROUTER_HEADERS,
  });
  // Both OpenRouter and the catalog use Vercel-style `creator/model`
  // ids, so an explicit pick hands straight through; otherwise fall
  // back to the tier's canonical model.
  return (tier, modelId) => provider(modelId ?? MODEL_BY_TIER[tier]);
}

export function makeVercelFactory(apiKey: string): ModelFactory {
  const provider = createGateway({ apiKey });
  return (tier, modelId) => provider(modelId ?? MODEL_BY_TIER[tier]);
}
