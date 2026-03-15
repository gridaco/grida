import { useMemo } from "react";
import type { LanguageModelUsage } from "ai";
import type { AgentMessageMetadata, AgentUIMessage } from "../types";

type ContextUsage = {
  /**
   * Estimated tokens in the current context window.
   * Based on the last step's inputTokens from the most recent response —
   * this is the actual conversation size the model last processed.
   */
  usedTokens: number;
  /** Maximum context window for the model (0 if unknown). */
  maxTokens: number;
  /**
   * Cumulative usage for cost display (summed totalUsage from all responses).
   */
  usage: LanguageModelUsage;
  /** Model ID from the most recent assistant response. */
  modelId: string | undefined;
};

/**
 * Computes context window usage and cumulative cost from assistant message
 * metadata across the conversation.
 *
 * **Context window** (`usedTokens` / `maxTokens`): uses the `lastStepUsage`
 * from the most recent assistant message. The last step's `inputTokens` is
 * the actual prompt size the model saw — the best proxy for how full the
 * context window is. `maxTokens` comes from the server-sent `contextWindow`
 * (sourced from `lib/ai/models.ts`, which tracks models.dev data).
 *
 * **Cost breakdown** (`usage`): sums `totalUsage` across all assistant
 * messages for an accurate billing view.
 */
export function useContextUsage(messages: AgentUIMessage[]): ContextUsage {
  return useMemo(() => {
    // -- Cumulative totals (for cost display) --
    let cumInput = 0;
    let cumOutput = 0;
    let cumReasoning = 0;
    let cumCacheRead = 0;
    let cumCacheWrite = 0;

    // -- Latest response values (for context window) --
    let latestModelId: string | undefined;
    let latestContextWindow = 0;
    let latestLastStepInput = 0;
    let latestLastStepOutput = 0;

    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const meta = msg.metadata as AgentMessageMetadata | undefined;
      if (!meta) continue;

      if (meta.modelId) {
        latestModelId = meta.modelId;
      }
      if (meta.contextWindow) {
        latestContextWindow = meta.contextWindow;
      }

      // Accumulate totalUsage for cost
      if (meta.totalUsage) {
        cumInput += meta.totalUsage.inputTokens ?? 0;
        cumOutput += meta.totalUsage.outputTokens ?? 0;
        cumReasoning +=
          meta.totalUsage.outputTokenDetails?.reasoningTokens ??
          meta.totalUsage.reasoningTokens ??
          0;
        cumCacheRead +=
          meta.totalUsage.inputTokenDetails?.cacheReadTokens ??
          meta.totalUsage.cachedInputTokens ??
          0;
        cumCacheWrite +=
          meta.totalUsage.inputTokenDetails?.cacheWriteTokens ?? 0;
      }

      // Track latest last-step usage (overwritten per message — only the
      // final assistant message's value matters).
      if (meta.lastStepUsage) {
        latestLastStepInput = meta.lastStepUsage.inputTokens ?? 0;
        latestLastStepOutput = meta.lastStepUsage.outputTokens ?? 0;
      }
    }

    // Context window = what the model saw on its last call + its output.
    // The next call will send all of this back as input.
    const usedTokens = latestLastStepInput + latestLastStepOutput;

    return {
      usedTokens,
      maxTokens: latestContextWindow,
      usage: {
        inputTokens: cumInput,
        outputTokens: cumOutput,
        totalTokens: cumInput + cumOutput,
        inputTokenDetails: {
          noCacheTokens: cumInput - cumCacheRead,
          cacheReadTokens: cumCacheRead || undefined,
          cacheWriteTokens: cumCacheWrite || undefined,
        },
        outputTokenDetails: {
          textTokens: cumOutput - cumReasoning,
          reasoningTokens: cumReasoning || undefined,
        },
        // Deprecated fields — populated for compat with <ContextReasoningUsage>
        // and <ContextCacheUsage> which still read them.
        reasoningTokens: cumReasoning || undefined,
        cachedInputTokens: cumCacheRead || undefined,
      } as LanguageModelUsage,
      modelId: latestModelId,
    };
  }, [messages]);
}
