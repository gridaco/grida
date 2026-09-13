import type { LanguageModelUsage, UIMessage } from "ai";
import type { ModelCostPerMillion } from "@/lib/ai/models";

/**
 * Metadata attached to each assistant message via the stream.
 *
 * Server writes this in the `messageMetadata` callback of
 * `createAgentUIStreamResponse`; client reads it from `message.metadata`.
 */
export type AgentMessageMetadata = {
  /**
   * Aggregated token usage for this response (summed across all steps).
   * Useful for cost/billing display.
   */
  totalUsage?: LanguageModelUsage;
  /**
   * Usage from the **last step** of this response.
   * `lastStepUsage.inputTokens` reflects the actual conversation size the
   * model saw, which is the correct proxy for context window consumption.
   */
  lastStepUsage?: LanguageModelUsage;
  /** The catalog model ID, or the upstream response ID when unrecognized. */
  modelId?: string;
  /** Maximum context window in tokens for this model. */
  contextWindow?: number;
  /** Cost per 1M tokens in USD for this model. */
  cost?: ModelCostPerMillion;
};

/** A UIMessage carrying our metadata shape. */
export type AgentUIMessage = UIMessage<AgentMessageMetadata>;
