/**
 * Centralized text/chat model definitions for the Grida editor.
 *
 * ## Design
 *
 * Models are organized by **tier** (nano → mini → pro → max) instead of being
 * configured via environment variables.  This makes model selection:
 * - trackable in version control,
 * - mixable per feature (e.g. "nano" for title generation, "pro" for the main
 *   agent), and
 * - auditable in code review when bumping models.
 *
 * All model IDs use the Vercel AI Gateway `creator/model-name` format so they
 * work with `gateway()` from the `ai` package.  When running locally without
 * the gateway you can swap in a direct provider (e.g. `openai()`) — the IDs
 * are still plain model strings.
 *
 * ## Updating models
 *
 * To bump a model, change the `id` in the corresponding tier entry and open a
 * PR.  The tier descriptions and `multimodal` flags document the contract each
 * consumer relies on.
 *
 * @module
 */

import { gateway } from "ai";

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

/**
 * Model tier — determines capability and cost bracket.
 *
 * | Tier   | Audience            | Typical use                                    |
 * |--------|---------------------|------------------------------------------------|
 * | `nano` | free users / misc   | title gen, summarise, lightweight extraction   |
 * | `mini` | free users          | main agent, sub-agent, multimodal required     |
 * | `pro`  | paid users only     | main agent, multimodal required                |
 * | `max`  | paid users only     | main agent, heaviest tasks, multimodal required|
 */
export type ModelTier = "nano" | "mini" | "pro" | "max";

export interface ModelSpec {
  /** Vercel AI Gateway model ID (`creator/model-name`). */
  id: string;
  /** Human-readable label for UI / logs. */
  label: string;
  /** Whether the model accepts image/file inputs. */
  multimodal: boolean;
}

// ---------------------------------------------------------------------------
// Current model assignments — edit here when bumping models
// ---------------------------------------------------------------------------

const specs = {
  nano: {
    id: "openai/gpt-5-nano",
    label: "GPT-5 Nano",
    multimodal: true,
  },
  mini: {
    id: "openai/gpt-5-mini",
    label: "GPT-5 Mini",
    multimodal: true,
  },
  pro: {
    id: "anthropic/claude-sonnet-4",
    label: "Claude Sonnet 4",
    multimodal: true,
  },
  max: {
    id: "anthropic/claude-opus-4",
    label: "Claude Opus 4",
    multimodal: true,
  },
} as const satisfies Record<ModelTier, ModelSpec>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read-only map of tier → model spec. */
export const models: Record<ModelTier, ModelSpec> = specs;

/**
 * Return a `LanguageModelV3` instance for the given tier, ready to pass into
 * `streamText()`, `generateText()`, `streamObject()`, etc.
 *
 * Uses the Vercel AI Gateway provider so the same code works across OpenAI,
 * Anthropic, and any other supported backend.
 *
 * @example
 * ```ts
 * import { streamText } from "ai";
 * import { model } from "@/lib/ai/models";
 *
 * const result = streamText({
 *   model: model("mini"),
 *   prompt: "Hello",
 * });
 * ```
 */
export function model(tier: ModelTier) {
  return gateway(specs[tier].id);
}
