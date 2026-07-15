import { models, TIER_MODEL_IDS } from "@grida/ai-models";
import type { ChatModel, MessageUsage } from "./rows";

export function usageTokenTotal(usage: MessageUsage): number {
  return (
    (usage.input ?? 0) +
    (usage.output ?? 0) +
    (usage.reasoning ?? 0) +
    (usage.cache_read ?? 0) +
    (usage.cache_write ?? 0)
  );
}

/**
 * Estimate an assistant message at base catalogue rates.
 *
 * A message can aggregate several provider requests, so request-level pricing
 * bands cannot be reconstructed from this rollup. Authoritative hosted billing
 * is computed per request by the Grida Gateway billing seam.
 */
export function baseCostUsdFromMessageUsage(
  model: ChatModel | undefined,
  usage: MessageUsage
): number | undefined {
  const modelId =
    model?.model_id ?? (model?.tier ? TIER_MODEL_IDS[model.tier] : undefined);
  if (!modelId) return undefined;
  const spec = models.text.modelSpecById(modelId);
  if (!spec) return undefined;
  const rates = spec.cost;
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  const reasoning = usage.reasoning ?? 0;
  const cacheRead = usage.cache_read ?? 0;
  const cacheWrite = usage.cache_write ?? 0;
  return (
    (input * rates.input +
      output * rates.output +
      reasoning * rates.output +
      cacheRead * (rates.cacheRead ?? rates.input) +
      cacheWrite * (rates.cacheWrite ?? rates.input)) /
    1_000_000
  );
}
